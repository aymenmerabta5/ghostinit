import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProjectInstall } from "../../src/commands/create/installer.js";
import { InstallerProcessTreeError } from "../../src/lib/process-supervisor.js";
import type { GlobalOptions } from "../../src/commands/types.js";
import { canonicalizeGenerationPlan } from "../../src/generation/plan-formatter.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { Logger } from "../../src/lib/logger.js";
import { loadState } from "../../src/lib/state.js";
import { hashContent } from "../../src/lib/checksum.js";
import {
  installationPlan,
  installationSecurityResolution,
  stageInstallationSecurity,
} from "../helpers/security-installation-fixture.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const base = installationPlan();

function options(cwd: string, overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    cwd,
    json: false,
    yes: true,
    force: false,
    dryRun: false,
    noInstall: false,
    runtime: "bun",
    check: false,
    logger: new Logger({ quiet: true }),
    ...overrides,
  };
}

async function input(existing = false) {
  const parent = mkdtempSync(join(tmpdir(), "ghostinit-create-security-"));
  roots.push(parent);
  const projectRoot = existing ? parent : join(parent, "project");
  const before = await base;
  return {
    parent,
    before,
    value: {
      projectName: before.desired.name,
      projectRoot,
      desiredConfig: before.desired,
      resolvedConfig: before.resolved,
      noInstall: false,
      requireAbsentTarget: !existing,
      options: options(parent),
    },
  };
}

describe("create security installation boundary", () => {
  test("retains the candidate and caller lease when dependency process cleanup is unknown", async () => {
    const { value } = await input();
    let candidate = "";
    let releases = 0;
    const failure = new InstallerProcessTreeError("Injected unknown descendant cleanup");
    await expect(
      runProjectInstall(value, {
        acquireLock: async (cwd) => {
          const owner = {
            pid: process.pid,
            startTime: new Date().toISOString(),
            host: "fixture",
            token: "00000000-0000-4000-8000-000000000001",
          };
          const content = JSON.stringify(owner);
          const tx = new FsTransaction(cwd);
          await tx.write(".ghostinit.lock", content);
          await tx.commit();
          return {
            owner,
            release: async () => {
              releases += 1;
              const release = new FsTransaction(cwd);
              await release.deleteIfUnchanged(".ghostinit.lock", content);
              await release.commit();
            },
          };
        },
        runInstall: async (cwd) => {
          candidate = cwd;
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(releases).toBe(0);
    expect(existsSync(join(candidate, ".ghostinit.lock"))).toBe(true);
    expect(existsSync(join(candidate, "package.json"))).toBe(true);
    expect(existsSync(value.projectRoot)).toBe(false);
  });

  test("attests a second explicit plan and state after an injected verified compatible repair", async () => {
    const { value, before } = await input();
    const resolution = installationSecurityResolution();
    let formats = 0;
    let verified = false;
    const result = await runProjectInstall(value, {
      formatGenerationPlan: async (plan) => {
        formats += 1;
        return await canonicalizeGenerationPlan(plan);
      },
      runInstall: async (cwd, _runtime, _fallback, context) => {
        expect(context?.leaseOwner).toBeDefined();
        expect(JSON.parse(readFileSync(join(cwd, ".ghostinit.lock"), "utf8")).token).toBe(
          context?.leaseOwner?.token,
        );
        const tx = new FsTransaction(cwd);
        await stageInstallationSecurity(tx, before.plan, before.desired, resolution);
        await tx.commit();
        context!.onTransactionCommitted(tx);
      },
      runFormat: async () => undefined,
      runVerification: async (cwd) => {
        verified = true;
        expect(JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).dependencies.react).toBe(
          resolution.version,
        );
      },
    });
    expect(result.installFailed).toBe(false);
    expect(verified).toBe(true);
    expect(formats).toBe(2);
    expect(result.plan.planHash).not.toBe(before.plan.planHash);
    const state = (await loadState(value.projectRoot))!;
    expect(state.desiredConfig.dependencySecurity?.resolutions).toEqual([resolution]);
    expect(state.generationPlan?.planHash).toBe(result.plan.planHash);
    expect(state.configHash).toBe(result.plan.projectConfigHash);
    expect(result.resolvedProjectConfig).toEqual(state.resolvedConfig);
    expect(result.resolvedProjectConfig.configHash).toBe(result.plan.projectConfigHash);
    expect(result.resolvedProjectConfig.configHash).not.toBe(before.resolved.configHash);
    expect(result.resolvedProjectConfig.dependencySecurity?.resolutions).toEqual([resolution]);
    expect(state.files["package.json"].contentHash).toBe(
      hashContent(readFileSync(join(value.projectRoot, "package.json"), "utf8")),
    );
  });

  for (const kind of ["generated-file", "manifest-field"] as const) {
    test(`rejects installed ${kind} tampering outside the compiled security change`, async () => {
      const { value, before } = await input();
      await expect(
        runProjectInstall(value, {
          runInstall: async (cwd, _runtime, _fallback, context) => {
            const tx = new FsTransaction(cwd);
            await stageInstallationSecurity(tx, before.plan, before.desired);
            if (kind === "generated-file") {
              await tx.write(".gitignore", "unrelated rewritten content\n");
            } else {
              const manifest = JSON.parse((await tx.readText("package.json"))!);
              manifest.scripts.dev = "unrelated-command";
              await tx.write("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
            }
            await tx.commit();
            context!.onTransactionCommitted(tx);
          },
          runFormat: async () => undefined,
          runVerification: async () => undefined,
        }),
      ).rejects.toThrow(/diverged from the canonical generation plan/);
      expect(existsSync(value.projectRoot)).toBe(false);
    });
  }

  test("compensates registered security transactions before undoing the original candidate", async () => {
    const { value, before } = await input(true);
    let restoredOriginal = false;
    const original = before.plan.files.find(
      ({ physicalPath }) => physicalPath === "package.json",
    )!.content;
    const result = await runProjectInstall(value, {
      runInstall: async (cwd, _runtime, _fallback, context) => {
        const tx = new FsTransaction(cwd);
        await stageInstallationSecurity(tx, before.plan, before.desired);
        await tx.commit();
        const rollback = tx.rollback.bind(tx);
        tx.rollback = async () => {
          const result = await rollback();
          expect(readFileSync(join(cwd, "package.json"), "utf8")).toBe(original);
          restoredOriginal = true;
          return result;
        };
        context!.onTransactionCommitted(tx);
      },
      runFormat: async () => undefined,
      runVerification: async () => {
        throw new Error("injected verification failure");
      },
    });
    expect(result.installFailed).toBe(true);
    expect(restoredOriginal).toBe(true);
    expect(readdirSync(value.projectRoot)).toEqual([]);
  });

  test("a failed forced init leaves every original user byte outside its private candidate", async () => {
    const { value, before } = await input(true);
    const originalManifest = '{"name":"user-owned","scripts":{"dev":"custom-command"}}\r\n';
    const originalProduct = "export   const userOwned = true\r\n";
    const seed = new FsTransaction(value.projectRoot);
    await seed.write("package.json", originalManifest);
    await seed.write("user-owned.ts", originalProduct);
    await seed.commit();
    let candidate = "";
    const result = await runProjectInstall(
      { ...value, options: options(value.projectRoot, { force: true }) },
      {
        runInstall: async (cwd, _runtime, _fallback, context) => {
          candidate = cwd;
          expect(cwd).not.toBe(value.projectRoot);
          expect(existsSync(join(cwd, "user-owned.ts"))).toBe(false);
          const tx = new FsTransaction(cwd);
          await stageInstallationSecurity(tx, before.plan, before.desired);
          await tx.commit();
          context!.onTransactionCommitted(tx);
        },
        runFormat: async () => undefined,
        runVerification: async () => {
          throw new Error("injected verification failure");
        },
      },
    );
    expect(result.installFailed).toBe(true);
    expect(existsSync(candidate)).toBe(false);
    expect(readFileSync(join(value.projectRoot, "package.json"), "utf8")).toBe(originalManifest);
    expect(readFileSync(join(value.projectRoot, "user-owned.ts"), "utf8")).toBe(originalProduct);
    expect(readdirSync(value.projectRoot).sort()).toEqual(["package.json", "user-owned.ts"]);
  });

  for (const mode of ["dry-run", "no-install"] as const) {
    test(`${mode} skips security installation and its second-plan phase`, async () => {
      const { value } = await input();
      let runs = 0;
      let formats = 0;
      const result = await runProjectInstall(
        {
          ...value,
          noInstall: mode === "no-install",
          options: options(value.options.cwd!, {
            dryRun: mode === "dry-run",
            noInstall: mode === "no-install",
          }),
        },
        {
          runInstall: async () => {
            runs += 1;
            throw new Error("must not install");
          },
          formatGenerationPlan: async (plan) => {
            formats += 1;
            return await canonicalizeGenerationPlan(plan);
          },
        },
      );
      expect(result.installFailed).toBe(false);
      expect(runs).toBe(0);
      expect(formats).toBe(1);
      expect(result.resolvedProjectConfig).toBe(value.resolvedConfig);
      expect(result.resolvedProjectConfig.configHash).toBe(result.plan.projectConfigHash);
      if (mode === "dry-run") expect(existsSync(value.projectRoot)).toBe(false);
    });
  }
});
