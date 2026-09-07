import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorCommand } from "../../src/commands/doctor/index.js";
import { loadEnvMap } from "../../src/commands/doctor/env.js";
import { syncCommand } from "../../src/commands/sync.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import {
  acquireEnvironmentLifecycleLease,
  listEnvironmentLifecyclePaths,
} from "../../src/lib/environment-lifecycle.js";
import { Logger } from "../../src/lib/logger.js";
import {
  projectConfigToDesired,
  serializeDesiredProjectConfig,
} from "../../src/lib/project-config.js";
import { applyReconcilePlan, buildReconcilePlan } from "../../src/lib/reconcile.js";
import { createManagedFileState, loadState, saveState } from "../../src/lib/state.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const roots: string[] = [];
const lockName = ".dev.vars.ghostinit-build-lock";
const recoveryName = ".DEV.VARS.GHOSTINIT-PROCESS-RECOVERY-review";
const tempName = ".dev.vars.ghostinit-convex-999999-00000000-0000-4000-8000-000000000000";
const config = projectConfigSchema.parse({
  name: "cli-lifecycle-review",
  runtime: "bun",
  version: "0.1.0",
  mode: "monorepo",
  framework: "nextjs",
  database: "convex",
  billing: [],
  features: [],
  apps: ["web"],
  preset: "custom",
  cache: "none",
  deploy: "cloudflare",
  auth: true,
  api: true,
  email: false,
  analytics: false,
  eve: false,
  i18n: false,
  pdf: false,
  messaging: false,
  storage: false,
  notifications: false,
  featureFlags: "none",
  jobs: false,
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-cli-lifecycle-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(join(tmpdir(), "ghostinit-cli-lifecycle-")))
      throw new Error("Unexpected fixture root");
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

async function project(): Promise<string> {
  const root = temporaryRoot();
  const desired = projectConfigToDesired(config);
  const files = [
    ...generateProjectFiles(config, { dryRun: true }),
    {
      path: "ghostinit.config.json",
      content: serializeDesiredProjectConfig(desired),
    },
  ];
  for (const file of files) {
    mkdirSync(join(root, file.path, ".."), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
  }
  await saveState(root, config, [], [], [], {
    desiredConfig: desired,
    managedFiles: files.map((file) => createManagedFileState(file.path, file.content)),
    acceptConfigChanges: true,
  });
  return root;
}

function observedFiles(root: string): string[] {
  return [
    ".dev.vars",
    "apps/web/.dev.vars",
    ".env.local",
    "apps/web/.env.local",
    "turbo.json",
    "ghostinit.config.json",
    ".ghostinit/state.json",
  ].map((path) =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "<absent>",
  );
}

function options(root: string, dryRun = false) {
  return {
    cwd: root,
    json: false,
    yes: true,
    force: true,
    dryRun,
    noInstall: true,
    runtime: "bun" as const,
    logger: new Logger({ quiet: true }),
  };
}

describe("CLI environment lifecycle admission", () => {
  test("doctor reads only the selected deployment's runtime environment", async () => {
    const root = temporaryRoot();
    writeFileSync(join(root, ".env.local"), "APP_NAME=node-environment\n");
    writeFileSync(join(root, ".dev.vars"), "APP_NAME=worker-environment\n");
    expect((await loadEnvMap(root, { cloudflare: false })).APP_NAME).toBe("node-environment");
    expect((await loadEnvMap(root, { cloudflare: true })).APP_NAME).toBe("worker-environment");
  });

  for (const name of [recoveryName, tempName, "apps/web/.DEV.VARS.GHOSTINIT-BUILD-HIDDEN"]) {
    test(`${name} blocks planning, doctor fixes, and dry-run sync without altering user files`, async () => {
      const root = await project();
      writeFileSync(join(root, name), "retained operator recovery evidence");
      const before = observedFiles(root);
      const state = (await loadState(root))!;
      const plan = await buildReconcilePlan(root, state, {
        operation: "sync",
        formatGenerationPlan: async (value) => value,
      });
      expect(
        plan.conflicts.some((conflict) => conflict.reason === "environment-lifecycle-in-progress"),
      ).toBe(true);
      expect(plan.environmentMerges).toEqual([]);
      expect(plan.secretOperations).toEqual([]);
      expect(await doctorCommand([], { ...options(root), fix: true })).not.toBe(0);
      expect(await syncCommand([], options(root, true))).not.toBe(0);
      expect(observedFiles(root)).toEqual(before);
      expect(readFileSync(join(root, name), "utf8")).toBe("retained operator recovery evidence");
      expect(existsSync(join(root, lockName))).toBe(false);
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    test(`leaving Cloudflare for ${mode} cannot bypass an old hidden environment`, async () => {
      const root = await project();
      for (const path of [".dev.vars", "apps/web/.dev.vars"]) {
        renameSync(join(root, path), join(root, `${path}.ghostinit-build-hidden`));
      }
      writeFileSync(join(root, lockName), "other wrapper ownership");
      const desired = projectConfigToDesired({ ...config, mode, deploy: "none" } as ProjectConfig);
      writeFileSync(join(root, "ghostinit.config.json"), serializeDesiredProjectConfig(desired));
      const before = observedFiles(root);
      const plan = await buildReconcilePlan(root, (await loadState(root))!, {
        operation: "sync",
        formatGenerationPlan: async (value) => value,
      });
      expect(
        plan.conflicts.filter(
          (conflict) => conflict.reason === "environment-lifecycle-in-progress",
        ),
      ).toHaveLength(3);
      expect(plan.environmentMerges).toEqual([]);
      expect(await doctorCommand([], { ...options(root), fix: true })).not.toBe(0);
      expect(observedFiles(root)).toEqual(before);
      expect(readFileSync(join(root, lockName), "utf8")).toBe("other wrapper ownership");
    });
  }

  test("a marker appearing after planning blocks apply before state writes or entropy", async () => {
    const root = await project();
    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, {
      operation: "sync",
      formatGenerationPlan: async (value) => value,
    });
    expect(plan.conflicts).toEqual([]);
    const before = observedFiles(root);
    writeFileSync(join(root, recoveryName), "retain");
    let entropyCalls = 0;
    await expect(
      applyReconcilePlan(root, state, plan, "sync", {
        entropy: () => {
          entropyCalls += 1;
          return "unused";
        },
      }),
    ).rejects.toThrow("lifecycle");
    expect(entropyCalls).toBe(0);
    expect(observedFiles(root)).toEqual(before);
    expect(existsSync(join(root, lockName))).toBe(false);
  });

  test("environment materialization owns the same exclusive lock as the generated wrappers", async () => {
    const root = await project();
    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, {
      operation: "sync",
      formatGenerationPlan: async (value) => value,
    });
    let lockObserved = false;
    await applyReconcilePlan(root, state, plan, "sync", {
      entropy: () => {
        const owner = JSON.parse(readFileSync(join(root, lockName), "utf8"));
        lockObserved = owner.pid === process.pid && typeof owner.owner === "string";
        expect(() =>
          writeFileSync(join(root, lockName), "competing wrapper", { flag: "wx" }),
        ).toThrow();
        return "test-only-strong-local-secret-for-both-mirrors";
      },
    });
    expect(lockObserved).toBe(true);
    expect(existsSync(join(root, lockName))).toBe(false);
  });

  test("lease release preserves an identical-content replacement and never adopts another owner", () => {
    const root = temporaryRoot();
    const lease = acquireEnvironmentLifecycleLease(root);
    const original = readFileSync(join(root, lockName), "utf8");
    expect(() => acquireEnvironmentLifecycleLease(root)).toThrow("lifecycle");
    renameSync(join(root, lockName), join(root, "original-owner"));
    writeFileSync(join(root, lockName), original);
    expect(() => lease.release()).toThrow("identity changed");
    expect(readFileSync(join(root, lockName), "utf8")).toBe(original);
    expect(readFileSync(join(root, "original-owner"), "utf8")).toBe(original);
    expect(listEnvironmentLifecyclePaths(root)).toEqual([lockName]);
  });
});
