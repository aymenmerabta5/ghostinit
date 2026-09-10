import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runProjectInstall,
  type InstallerDependencies,
} from "../../src/commands/create/installer.js";
import {
  InstallerInterruptedError,
  InstallerProcessTreeError,
  type SupervisedCommandResult,
} from "../../src/lib/process-supervisor.js";
import { runDependencySecurityWithDependencies } from "../../src/lib/dependency-security/runtime.js";
import { SECURITY_JOURNAL_PATH } from "../../src/lib/dependency-security/workspace.js";
import { Logger } from "../../src/lib/logger.js";
import { loadState } from "../../src/lib/state.js";
import { resolveDesiredProjectConfig } from "../../src/lib/project-config.js";
import type { DesiredProjectConfig } from "../../src/domain/project/config.js";
import {
  fixedSecurityLock,
  securityProcessFixture,
  securityTestPolicy,
  writeSecurityTestFile,
} from "../helpers/dependency-security-runtime.js";
import { installationDesired } from "../helpers/security-installation-fixture.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const receipt = (exitCode = 0, cleanupVerified = true, error?: Error): SupervisedCommandResult => ({
  exitCode,
  signal: null,
  timedOut: false,
  cleanupVerified,
  ...(error ? { error } : {}),
});
type Scenario =
  | "before-native"
  | "success"
  | "failed-install"
  | "safe-interruption"
  | "unsafe-interruption"
  | "foreign-native"
  | "unexpected-output"
  | "state-failure";

async function execute(scenario: Scenario) {
  const parent = await mkdtemp(join(tmpdir(), "ghostinit-empty-native-"));
  roots.push(parent);
  const root = join(parent, "project");
  await mkdir(root);
  const initialRoot = await lstat(root);
  const desired: DesiredProjectConfig = {
    ...installationDesired(),
    mode: "monorepo",
    backend: { hostApp: "web", executionRuntime: "bun", database: "postgres" },
    capabilities: { auth: true },
  };
  const process = securityProcessFixture();
  const claimed = new Map<string, { dev: number; ino: number }>();
  let nativeReached = false;
  process.beforeCommand = async (input, argv) => {
    if (
      argv[0] === "install" &&
      argv.includes("--lockfile-only") &&
      !existsSync(join(input.cwd, "bun.lock"))
    ) {
      if (scenario === "before-native")
        return receipt(1, true, new Error("injected pre-native bootstrap failure"));
      await writeSecurityTestFile(input.cwd, "bun.lock", fixedSecurityLock);
    }
    if (
      input.cwd === root &&
      argv[0] === "install" &&
      argv.includes("--frozen-lockfile") &&
      !argv.includes("--ignore-scripts")
    ) {
      nativeReached = true;
      const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      const workspacePaths = [root];
      for (const family of ["apps", "packages", "tooling"]) {
        if (!manifest.workspaces.includes(`${family}/*`) || !existsSync(join(root, family)))
          continue;
        for (const entry of await readdir(join(root, family), { withFileTypes: true })) {
          if (entry.isDirectory() && existsSync(join(root, family, entry.name, "package.json")))
            workspacePaths.push(join(root, family, entry.name));
        }
      }
      for (const workspace of workspacePaths) {
        const path = join(workspace, "node_modules");
        // These writes model native package-manager effects, outside the
        // registered source/publication compensation transactions.
        await writeSecurityTestFile(
          workspace,
          "node_modules/fixture-native-output/marker",
          "native-output-surrogate\n",
        );
        const identity = await lstat(path);
        claimed.set(path, { dev: identity.dev, ino: identity.ino });
      }
      expect(claimed.size).toBeGreaterThan(1);
      if (scenario === "foreign-native") {
        await rename(join(root, "node_modules"), join(parent, "captured-before-replacement"));
        await mkdir(join(root, "node_modules"));
        await writeSecurityTestFile(root, "node_modules/foreign-marker", "preserve-foreign\n");
      }
      if (scenario === "safe-interruption")
        return receipt(1, true, new InstallerInterruptedError("SIGINT"));
      if (scenario === "unsafe-interruption")
        return receipt(1, false, new InstallerInterruptedError("SIGINT"));
      if (scenario === "failed-install" || scenario === "foreign-native")
        return receipt(1, true, new Error("injected native install failure"));
    }
    return undefined;
  };
  const dependencies: Partial<InstallerDependencies> = {
    runInstall: async (cwd, _runtime, fallback, context) => {
      const result = await runDependencySecurityWithDependencies(
        {
          cwd,
          mode: "install",
          bootstrap: true,
          policy: securityTestPolicy,
          logger: context?.logger,
          leaseOwner: context?.leaseOwner,
          onTransactionCommitted: context?.onTransactionCommitted,
          createLifecycle: context?.createLifecycle,
          onContainmentFallback: fallback,
          verifyProject: false,
        },
        process.dependencies,
      );
      if (!result.installedVerified || result.status === "failed" || result.status === "blocked")
        throw new Error(result.message ?? "Injected installed verification failed");
    },
    runFormat: async () => undefined,
    runVerification: async (cwd) => {
      expect(existsSync(join(cwd, SECURITY_JOURNAL_PATH))).toBe(true);
      if (scenario === "unexpected-output") {
        await writeSecurityTestFile(
          cwd,
          "unknown-native-output.txt",
          "preserve-unclaimed-output\n",
        );
        throw new Error("injected late verification failure");
      }
    },
    ...(scenario === "state-failure"
      ? {
          saveState: async () => {
            throw new Error("injected state persistence failure");
          },
        }
      : {}),
  };
  const task = runProjectInstall(
    {
      projectName: desired.name,
      projectRoot: root,
      desiredConfig: desired,
      resolvedConfig: resolveDesiredProjectConfig(desired),
      noInstall: false,
      options: {
        cwd: root,
        json: false,
        yes: true,
        force: false,
        dryRun: false,
        noInstall: false,
        runtime: "bun",
        logger: new Logger({ quiet: true }),
      },
    },
    dependencies,
  );
  return { root, parent, initialRoot, task, claimed, nativeReached: () => nativeReached };
}

describe("empty-root init native recovery through production runtime callbacks", () => {
  test("source-only failure before native installation safely compensates", async () => {
    const fixture = await execute("before-native");
    expect((await fixture.task).installFailed).toBe(true);
    expect(fixture.nativeReached()).toBe(false);
    expect(await readdir(fixture.root)).toEqual([]);
  });

  test("keeps successful installed init ready with state, secrets and no pending journal", async () => {
    const fixture = await execute("success");
    const result = await fixture.task;
    expect(result.installFailed).toBe(false);
    expect(fixture.nativeReached()).toBe(true);
    const root = await lstat(fixture.root);
    expect([root.dev, root.ino]).toEqual([fixture.initialRoot.dev, fixture.initialRoot.ino]);
    for (const [path, identity] of fixture.claimed) {
      const final = await lstat(path);
      expect([final.dev, final.ino]).toEqual([identity.dev, identity.ino]);
      expect(existsSync(join(path, "fixture-native-output/marker"))).toBe(true);
    }
    const state = (await loadState(fixture.root))!;
    expect(state.generationPlan?.planHash).toBe(result.plan.planHash);
    expect(existsSync(join(fixture.root, SECURITY_JOURNAL_PATH))).toBe(false);
    expect(existsSync(join(fixture.root, ".ghostinit.lock"))).toBe(false);
    const env = await readFile(join(fixture.root, ".env.local"), "utf8");
    expect(/^BETTER_AUTH_SECRET=([A-Za-z0-9_-]{64})$/m.test(env)).toBe(true);
  });

  test("verified interruption retains the incomplete tree and preserves cancellation exit code", async () => {
    const fixture = await execute("safe-interruption");
    await expect(fixture.task).rejects.toMatchObject({
      name: "InstallerNativeRecoveryError",
      code: 130,
      details: { initialized: false, completed: false, retained: true },
    });
    expect(fixture.nativeReached()).toBe(true);
    expect(existsSync(join(fixture.root, "node_modules/fixture-native-output/marker"))).toBe(true);
    expect(
      JSON.parse(await readFile(join(fixture.root, SECURITY_JOURNAL_PATH), "utf8")).status,
    ).toBe("FAILED");
    expect(existsSync(join(fixture.root, ".ghostinit.lock"))).toBe(false);
  });

  for (const scenario of [
    "failed-install",
    "foreign-native",
    "unexpected-output",
    "state-failure",
  ] as const) {
    test(`${scenario} retains sources, native outputs and an accurate manual-recovery barrier`, async () => {
      const fixture = await execute(scenario);
      await expect(fixture.task).rejects.toMatchObject({
        name: "InstallerNativeRecoveryError",
        details: {
          initialized: false,
          completed: false,
          retained: true,
          recoveryRequired: true,
          installedStateRolledBack: false,
        },
      });
      expect(fixture.nativeReached()).toBe(true);
      for (const path of [
        "ghostinit.config.json",
        "package.json",
        "bun.lock",
        "dependency-lock-evidence.json",
        "node_modules",
      ])
        expect(existsSync(join(fixture.root, path))).toBe(true);
      const journal = JSON.parse(await readFile(join(fixture.root, SECURITY_JOURNAL_PATH), "utf8"));
      expect(journal.status).toBe("FAILED");
      expect(existsSync(join(fixture.root, ".ghostinit.lock"))).toBe(false);
      if (scenario === "foreign-native")
        expect(await readFile(join(fixture.root, "node_modules/foreign-marker"), "utf8")).toBe(
          "preserve-foreign\n",
        );
      if (scenario === "unexpected-output")
        expect(await readFile(join(fixture.root, "unknown-native-output.txt"), "utf8")).toBe(
          "preserve-unclaimed-output\n",
        );
    });
  }

  test("unverified interruption never deletes native output or releases the enclosing lease", async () => {
    const fixture = await execute("unsafe-interruption");
    await expect(fixture.task).rejects.toBeInstanceOf(InstallerProcessTreeError);
    expect(fixture.nativeReached()).toBe(true);
    expect(existsSync(join(fixture.root, "node_modules/fixture-native-output/marker"))).toBe(true);
    expect(existsSync(join(fixture.root, ".ghostinit.lock"))).toBe(true);
    const journal = JSON.parse(await readFile(join(fixture.root, SECURITY_JOURNAL_PATH), "utf8"));
    expect(journal.status).toBe("CLEANUP_UNVERIFIED");
    expect(journal.cleanupReason).toBe("process-tree");
  });
});
