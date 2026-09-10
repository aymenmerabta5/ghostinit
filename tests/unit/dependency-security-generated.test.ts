import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { runInNewContext } from "node:vm";
import { runtime, supplyChain } from "../../packages/versions/src/index.js";
import { FsTransaction } from "../../src/lib/fs.js";
import {
  buildInstallEnv,
  resolveCanonicalBunExecutable,
} from "../../src/lib/process-supervisor.js";
import type { DependencySecurityRunOptions } from "../../src/lib/dependency-security/runtime-types.js";
import {
  DEPENDENCY_SECURITY_RUNTIME,
  DEPENDENCY_SECURITY_RUNTIME_SHA256,
} from "../../src/generation/embedded-dependency-security-runtime.js";
import { dependencySecurityPolicy } from "../../src/templates/tooling/dependency-security-policy.js";
import {
  dependencySecurityFiles,
  dependencySecurityLauncherContent,
} from "../../src/templates/tooling/dependency-security.js";
import {
  dependencyAuditScriptContent,
  dependencyAuditFiles,
  IMAGE_SIZE_PATCH_ADVISORIES,
  integrateDependencyAuditManifest,
} from "../../src/templates/tooling/dependency-audit.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(resolve(tmpdir()), resolve(root));
    if (!child || child === ".." || child.startsWith(".." + sep) || isAbsolute(child)) {
      throw new Error("Refusing unsafe security fixture cleanup");
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function runLauncher(
  args: string[],
  status = "clean",
  installedVerified = true,
  failure?: unknown,
) {
  const options: DependencySecurityRunOptions[] = [];
  const imports: string[] = [];
  const output: string[] = [];
  const processMock = {
    argv: ["bun", "security-dependencies.cjs", ...args],
    cwd: () => "/fixture",
    exitCode: 0,
  };
  const result = {
    status,
    dryRun: args.includes("--dry-run"),
    applied: status === "fixed",
    installedVerified,
    changes: [],
    remaining: [],
    verifiedPatchAdvisories: [],
  };
  let finish!: () => void;
  const complete = new Promise<void>((done) => {
    finish = done;
  });
  runInNewContext(dependencySecurityLauncherContent(dependencySecurityPolicy(true, true)), {
    process: processMock,
    console: {
      log(value: unknown) {
        output.push(String(value));
        finish();
      },
    },
    require(specifier: string) {
      imports.push(specifier);
      if (specifier !== "./lib/dependency-security-integrity.cjs")
        throw new Error("Unexpected package import");
      return {
        loadDependencySecurityRuntime() {
          return {
            async runDependencySecurity(input: DependencySecurityRunOptions) {
              options.push(input);
              if (failure !== undefined) throw failure;
              return result;
            },
          };
        },
      };
    },
  });
  await complete;
  return { options, imports, output, exitCode: processMock.exitCode };
}

describe("standalone generated dependency security", () => {
  test("the policy shares exact auditor bytes, patch trust roots, and release-age catalog", () => {
    for (const mobile of [false, true]) {
      for (const openNext of [false, true]) {
        const policy = dependencySecurityPolicy(mobile, openNext);
        expect(policy.expectedBunVersion).toBe(runtime.bun);
        expect(policy.minimumReleaseAgeSeconds).toBe(supplyChain.minimumReleaseAgeSeconds);
        expect(policy.auditScriptContent).toBe(dependencyAuditScriptContent(mobile, openNext));
        expect(policy.patchedAdvisories.map(({ id }) => id)).toEqual(
          mobile ? [...IMAGE_SIZE_PATCH_ADVISORIES] : [],
        );
        expect(Object.keys(policy.protectedPackageVersions ?? {}).sort()).toEqual(
          [...(mobile ? ["image-size"] : []), ...(openNext ? ["@opennextjs/aws"] : [])].sort(),
        );
      }
    }
  });

  test("install entrypoints use one runner and retain read-only audit leaves", () => {
    const manifest = JSON.parse(
      integrateDependencyAuditManifest(
        {
          path: "package.json",
          content: JSON.stringify({ name: "fixture", scripts: { "install:cmd": "bun install" } }),
        },
        false,
      ).content,
    );
    expect(manifest.scripts["security:audit"]).toBe("bun scripts/security-dependencies.cjs audit");
    expect(manifest.scripts["security:fix"]).toBe("bun scripts/security-dependencies.cjs fix");
    expect(manifest.scripts["install:verified"]).toBe(
      "bun scripts/security-dependencies.cjs install",
    );
    expect(manifest.scripts["install:bootstrap"]).toBe(
      "bun scripts/security-dependencies.cjs install --bootstrap",
    );
    expect(manifest.scripts["install:cmd"]).toBe("bun run install:verified");
    expect(manifest.scripts.preinstall).toBe("bun scripts/audit-dependencies.ts --lock-only");
    expect(manifest.scripts["audit:dependencies"]).toBe("bun scripts/audit-dependencies.ts");
    const emitted = new Map(dependencyAuditFiles(false).map((file) => [file.path, file.content]));
    expect(emitted.get("scripts/security-dependencies.cjs")).not.toContain("install:verified");
    expect(emitted.get("scripts/security-dependencies.cjs")).not.toContain("install:bootstrap");
    expect(emitted.get("scripts/lib/dependency-security.cjs")).toBe(DEPENDENCY_SECURITY_RUNTIME);
  });

  test("actions and dry-run flags reach the independent runtime exactly once", async () => {
    for (const mode of ["audit", "fix", "install"] as const) {
      const flags = [mode, "--json", "--dry-run", ...(mode === "install" ? ["--bootstrap"] : [])];
      const observed = await runLauncher(flags);
      expect(observed.imports).toEqual(["./lib/dependency-security-integrity.cjs"]);
      expect(observed.options).toHaveLength(1);
      expect(observed.options[0]).toMatchObject({
        mode,
        dryRun: true,
        bootstrap: mode === "install",
        verifyProject: mode === "fix",
        cwd: "/fixture",
      });
      expect(observed.options[0]?.policy.auditScriptContent).toBe(
        dependencyAuditScriptContent(true, true),
      );
      expect(JSON.parse(observed.output[0] ?? "{}").status).toBe("clean");
      expect(observed.exitCode).toBe(0);
    }
  });

  test("invalid flags never load or invoke the runtime", async () => {
    for (const args of [
      ["fix", "--latest"],
      ["fix", "--bootstrap"],
      ["install", "--force"],
      ["audit", "--json", "--json"],
      ["unknown"],
      [],
    ]) {
      const observed = await runLauncher([...args, ...(args.includes("--json") ? [] : ["--json"])]);
      expect(observed.imports).toEqual([]);
      expect(observed.options).toEqual([]);
      expect(observed.exitCode).toBe(1);
      expect(JSON.parse(observed.output[0] ?? "{}").message).toContain("Usage:");
    }
  });

  test("thrown runtime failures report an unknown outcome without inventing publication or recovery facts", async () => {
    for (const mode of ["audit", "fix", "install"]) {
      const failure = Object.assign(new Error("cleanup verification failed"), {
        cleanupVerified: false,
      });
      const observed = await runLauncher([mode, "--json"], "clean", false, failure);
      expect(observed.options).toHaveLength(1);
      expect(observed.exitCode).toBe(1);
      const report = JSON.parse(observed.output[0] ?? "{}");
      expect(report).toMatchObject({ status: "failed", outcomeUnknown: true });
      expect(report.message).toContain("cleanup verification failed");
      for (const field of [
        "applied",
        "installedVerified",
        "changes",
        "remaining",
        "recoveryRequired",
      ]) {
        expect(Object.hasOwn(report, field)).toBe(false);
      }
    }
    const rejected = await runLauncher(["fix", "--latest", "--json"]);
    const known = JSON.parse(rejected.output[0] ?? "{}");
    expect(known.applied).toBe(false);
    expect(Object.hasOwn(known, "outcomeUnknown")).toBe(false);
  });

  test("partial findings remain actionable except a verified install below the blocking severity", async () => {
    for (const mode of ["audit", "fix"]) {
      expect((await runLauncher([mode, "--json"], "partial")).exitCode).toBe(8);
    }
    expect((await runLauncher(["install", "--json"], "partial", true)).exitCode).toBe(0);
    expect((await runLauncher(["install", "--json"], "partial", false)).exitCode).toBe(8);
    for (const status of ["blocked", "failed"]) {
      expect((await runLauncher(["install", "--json"], status)).exitCode).toBe(1);
    }
  });

  test("the emitted real CJS runtime loads in Node and pinned Bun without node_modules or GhostInit", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-security-standalone-"));
    roots.push(root);
    const transaction = new FsTransaction(root);
    for (const file of dependencySecurityFiles(false))
      await transaction.write(file.path, file.content);
    await transaction.write(
      "probe.cjs",
      'const { loadDependencySecurityRuntime } = require("./scripts/lib/dependency-security-integrity.cjs"); const { runDependencySecurity } = loadDependencySecurityRuntime(); if (typeof runDependencySecurity !== "function") throw new Error("Missing runtime entrypoint"); process.stdout.write("standalone-ready");\n',
    );
    expect(
      transaction
        .getStagedFiles()
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "probe.cjs",
      "scripts/lib/dependency-security-integrity.cjs",
      "scripts/lib/dependency-security.cjs",
      "scripts/security-dependencies.cjs",
    ]);
    await transaction.commit();
    const node = Bun.which("node");
    if (!node) throw new Error("Standalone dependency security verification requires Node");
    for (const executable of [node, resolveCanonicalBunExecutable(runtime.bun)]) {
      const observed = spawnSync(executable, ["probe.cjs"], {
        cwd: root,
        env: buildInstallEnv(root),
        encoding: "utf8",
        timeout: 15_000,
        windowsHide: true,
      });
      expect(observed.error).toBeUndefined();
      expect(observed.status, observed.stderr).toBe(0);
      expect(observed.stdout).toBe("standalone-ready");
    }
    expect(existsSync(join(root, "node_modules"))).toBe(false);
    expect(createHash("sha256").update(DEPENDENCY_SECURITY_RUNTIME).digest("hex")).toBe(
      DEPENDENCY_SECURITY_RUNTIME_SHA256,
    );
  });
});
