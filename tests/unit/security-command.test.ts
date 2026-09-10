import { describe, expect, test } from "bun:test";
import { securityCommand } from "../../src/commands/security.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import {
  projectConfigToDesired,
  resolveDesiredProjectConfig,
} from "../../src/lib/project-config.js";
import { Logger } from "../../src/lib/logger.js";
import { ExitCode, ValidationError } from "../../src/lib/errors.js";
import type { GlobalOptions } from "../../src/commands/types.js";
import type { DependencySecurityResult } from "../../src/domain/dependency-security/types.js";
import type { DependencySecurityRunOptions } from "../../src/lib/dependency-security/runtime-types.js";

const config = projectConfigSchema.parse({
  name: "security-command",
  version: "0.1.0",
  mode: "single",
  runtime: "bun",
  framework: "nextjs",
  database: "none",
  billing: [],
  features: [],
  apps: ["web"],
  preset: "frontend",
});
const desired = projectConfigToDesired(config);
const resolved = resolveDesiredProjectConfig(desired);
const defaults: DependencySecurityResult = {
  status: "clean",
  dryRun: false,
  applied: false,
  installedVerified: false,
  changes: [],
  remaining: [],
  verifiedPatchAdvisories: [],
};
function options(dryRun = false): GlobalOptions {
  return {
    cwd: process.cwd(),
    json: true,
    yes: true,
    dryRun,
    force: false,
    noInstall: false,
    runtime: "bun",
    logger: new Logger({ quiet: true }),
  };
}
async function invoke(args: string[], result: DependencySecurityResult = defaults, dryRun = false) {
  const calls: DependencySecurityRunOptions[] = [];
  const outputs: unknown[] = [];
  const code = await securityCommand(args, options(dryRun), {
    loadProject: async () => ({ desired, resolved, exists: true }),
    run: async (input) => {
      calls.push(input);
      return result;
    },
    print: (value) => {
      outputs.push(value);
    },
  });
  return { code, calls, outputs };
}

describe("security command boundary", () => {
  test("default audit uses the read-only runtime action without installation verification", async () => {
    const result = await invoke([]);
    expect(result.code).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({ mode: "audit", dryRun: false, verifyProject: false });
    expect(result.outputs).toEqual([
      expect.objectContaining({
        success: true,
        exitCode: 0,
        data: expect.objectContaining({ action: "audit", installedVerified: false }),
      }),
    ]);
  });
  test("explicit repair requests project verification and propagates dry-run", async () => {
    const result = await invoke(["fix"], { ...defaults, status: "fixed", dryRun: true }, true);
    expect(result.calls[0]).toMatchObject({ mode: "fix", dryRun: true, verifyProject: true });
    expect(result.outputs[0]).toMatchObject({
      data: { action: "fix", dryRun: true, applied: false },
    });
  });
  test("bad actions fail before reading a project or invoking package tools", async () => {
    let touched = false;
    const dependencies = {
      loadProject: async () => {
        touched = true;
        return { desired, resolved, exists: true };
      },
      run: async () => {
        touched = true;
        return defaults;
      },
    };
    await expect(securityCommand(["unknown"], options(), dependencies)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(securityCommand(["fix", "extra"], options(), dependencies)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(touched).toBe(false);
  });
  for (const status of ["partial", "blocked"] as const) {
    test(status + " remains actionable rather than a successful envelope", async () => {
      const result = await invoke(["fix"], {
        ...defaults,
        status,
        message: "A declaration needs review",
      });
      expect(result.code).toBe(ExitCode.DRIFT);
      expect(result.outputs[0]).toMatchObject({
        success: false,
        exitCode: ExitCode.DRIFT,
        error: { code: "DRIFT" },
        data: { status },
      });
    });
  }
  test("operational failure reports recovery without claiming completion", async () => {
    const result = await invoke(["fix"], {
      ...defaults,
      status: "failed",
      applied: true,
      recoveryRequired: true,
      message: "Installation must be recovered",
    });
    expect(result.code).toBe(ExitCode.GENERAL_ERROR);
    expect(result.outputs[0]).toMatchObject({
      success: false,
      data: { applied: true, installedVerified: false, recoveryRequired: true },
    });
  });
  test("public projection excludes internal source bytes and future private fields", async () => {
    const response = {
      ...defaults,
      status: "fixed" as const,
      installedVerified: true,
      internalFiles: [{ before: "private-source-marker" }],
      changes: [
        {
          package: "fixture-dependency",
          from: "1.0.0",
          to: "1.0.1",
          manifests: ["package.json"],
          beforeContent: "private-change-marker",
        },
      ],
    };
    const result = await invoke(["fix"], response);
    expect(result.code).toBe(0);
    const serialized = JSON.stringify(result.outputs);
    expect(serialized).not.toContain("private-source-marker");
    expect(serialized).not.toContain("private-change-marker");
    expect(result.outputs[0]).toMatchObject({
      data: {
        changes: [
          {
            package: "fixture-dependency",
            from: "1.0.0",
            to: "1.0.1",
            manifests: ["package.json"],
          },
        ],
      },
    });
  });
});
