import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addCommand } from "../../src/commands/add.js";
import { runProjectInstall } from "../../src/commands/create/installer.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { syncCommand } from "../../src/commands/sync.js";
import type { GlobalOptions } from "../../src/commands/types.js";
import { Logger } from "../../src/lib/logger.js";
import { buildReconcilePlan } from "../../src/lib/reconcile.js";
import { loadState, stageState } from "../../src/lib/state.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(join(tmpdir(), "ghostinit-add-sync-")))
      throw new Error("Unexpected fixture root");
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

function options(root: string): GlobalOptions {
  return {
    cwd: root,
    json: false,
    yes: true,
    force: true,
    dryRun: false,
    noInstall: true,
    runtime: "bun",
    check: false,
    logger: new Logger({ quiet: true }),
  };
}

async function createProject(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  database: "none" | "postgres" = "none",
) {
  const parent = mkdtempSync(join(tmpdir(), "ghostinit-add-sync-"));
  roots.push(parent);
  const root = join(parent, "project");
  const resolution = resolveCreateConfig({
    name: "registry-fixture",
    runtime: "bun",
    mode,
    framework,
    database,
    databaseWasExplicit: true,
    billing: [],
    features: [],
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: database === "none" ? "cloudflare" : "none",
    withAuth: database === "postgres",
    withApi: true,
    withEmail: false,
    withAnalytics: false,
    withEve: false,
    withI18n: false,
    withPdf: false,
    withMessaging: false,
    withStorage: false,
    withNotifications: false,
    featureFlags: "none",
    withJobs: false,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  const created = await runProjectInstall({
    projectName: "registry-fixture",
    projectRoot: root,
    config: resolution.config,
    desiredConfig: resolution.desiredConfig,
    resolvedConfig: resolution.resolvedConfig,
    options: options(root),
    noInstall: true,
    requireAbsentTarget: true,
  });
  expect(created.installFailed).toBe(false);
  expect((await loadState(root))!.modules).not.toContain("index.ts");
  return {
    root,
    moduleRoot: mode === "monorepo" ? "packages/modules/src" : "src/server/modules",
    apiRoot: mode === "monorepo" ? "packages/api/src" : "src/server/api",
    workerScript:
      mode === "monorepo" ? "apps/web/scripts/cloudflare.mjs" : "scripts/cloudflare.mjs",
  };
}

function snapshot(root: string, paths: string[]): Array<string | null> {
  return paths.map((path) =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null,
  );
}

describe("Cloudflare create/add/sync registry ownership", () => {
  for (const [mode, framework] of [
    ["monorepo", "nextjs"],
    ["single", "tanstack-start"],
  ] as const) {
    test(`${mode}/${framework} retains added module and procedure exports across check and apply`, async () => {
      const { root, moduleRoot, apiRoot } = await createProject(mode, framework);
      const settings = options(root);
      expect(await syncCommand([], settings)).toBe(0);
      expect(await syncCommand([], { ...settings, check: true })).toBe(0);
      expect(await addCommand(["module", "orders"], settings)).toBe(0);
      expect(await addCommand(["module", "inventory"], settings)).toBe(0);
      expect(await addCommand(["use-case", "orders", "checkout"], settings)).toBe(0);
      expect(await addCommand(["procedure", "orders", "checkout"], settings)).toBe(0);
      const paths = [
        `${moduleRoot}/index.ts`,
        `${apiRoot}/contract.ts`,
        `${apiRoot}/router.ts`,
        `${moduleRoot}/orders/index.ts`,
      ];
      const before = snapshot(root, paths);
      expect(before[0]).toContain('export * as orders from "./orders/index";');
      expect(before[0]).toContain('export * as inventory from "./inventory/index";');
      expect(before[1]).toContain("checkoutContract");
      expect(before[2]).toContain("checkout");
      expect(await syncCommand([], { ...settings, check: true })).toBe(0);
      expect(await syncCommand([], settings)).toBe(0);
      expect(await syncCommand([], { ...settings, check: true })).toBe(0);
      expect(snapshot(root, paths)).toEqual(before);
      const plan = await buildReconcilePlan(root, (await loadState(root))!, { operation: "sync" });
      expect(plan.rewrites.filter((change) => paths.includes(change.path))).toEqual([]);
    });
  }

  test("a failed later add publishes no prior registry, state, or environment changes", async () => {
    const { root, moduleRoot, apiRoot } = await createProject("monorepo", "nextjs");
    const settings = options(root);
    expect(await syncCommand([], settings)).toBe(0);
    expect(await addCommand(["module", "orders"], settings)).toBe(0);
    expect(await addCommand(["module", "inventory"], settings)).toBe(0);
    const paths = [
      `${moduleRoot}/index.ts`,
      `${apiRoot}/contract.ts`,
      `${apiRoot}/router.ts`,
      ".ghostinit/state.json",
      ".dev.vars",
      "apps/web/.dev.vars",
    ];
    const before = snapshot(root, paths);
    let stateStagingReached = false;
    await expect(
      addCommand(["module", "shipments"], settings, {
        stageState: async (...args: Parameters<typeof stageState>) => {
          stateStagingReached = true;
          await stageState(...args);
          throw new Error("injected outer state failure");
        },
      }),
    ).rejects.toThrow("injected outer state failure");
    expect(stateStagingReached).toBe(true);
    expect(snapshot(root, paths)).toEqual(before);
    expect(existsSync(join(root, moduleRoot, "shipments"))).toBe(false);
    expect((await loadState(root))!.modules).toContain("orders");
    expect((await loadState(root))!.modules).toContain("inventory");
    expect(await syncCommand([], { ...settings, check: true })).toBe(0);
  });

  test("older creation state listing the root barrel as a module remains maintainable", async () => {
    const { root, moduleRoot } = await createProject("monorepo", "nextjs");
    const path = join(root, ".ghostinit/state.json");
    const previous = JSON.parse(readFileSync(path, "utf8"));
    previous.modules = ["index.ts"];
    writeFileSync(path, JSON.stringify(previous, null, 2) + "\n");
    const settings = options(root);
    expect(await syncCommand([], { ...settings, check: true })).toBe(0);
    expect(await addCommand(["module", "orders"], settings)).toBe(0);
    expect((await loadState(root))!.modules).toEqual(["orders"]);
    expect(readFileSync(join(root, moduleRoot, "index.ts"), "utf8")).toContain(
      'export * as orders from "./orders/index";',
    );
    expect(await syncCommand([], { ...settings, check: true })).toBe(0);
  });

  test("deferred add refuses real infrastructure or env reconciliation while standalone sync repairs it", async () => {
    const { root, moduleRoot, workerScript } = await createProject("monorepo", "nextjs");
    const settings = options(root);
    expect(await syncCommand([], settings)).toBe(0);
    expect(await addCommand(["module", "orders"], settings)).toBe(0);
    const registry = readFileSync(join(root, moduleRoot, "index.ts"), "utf8");
    unlinkSync(join(root, workerScript));
    for (const path of [".dev.vars", "apps/web/.dev.vars"]) {
      const content = readFileSync(join(root, path), "utf8");
      const missingField = content.replace(/^APP_NAME=.*\r?\n/m, "");
      expect(missingField).not.toBe(content);
      writeFileSync(join(root, path), missingField);
    }
    const paths = [
      `${moduleRoot}/index.ts`,
      ".ghostinit/state.json",
      ".dev.vars",
      "apps/web/.dev.vars",
      workerScript,
    ];
    const before = snapshot(root, paths);
    expect(await syncCommand([], { ...settings, check: true })).not.toBe(0);
    await expect(addCommand(["module", "shipments"], settings)).rejects.toThrow(
      "Run ghostinit sync first",
    );
    expect(snapshot(root, paths)).toEqual(before);
    expect(existsSync(join(root, moduleRoot, "shipments"))).toBe(false);
    expect(await syncCommand([], settings)).toBe(0);
    expect(existsSync(join(root, workerScript))).toBe(true);
    expect(readFileSync(join(root, ".dev.vars"), "utf8")).toContain("APP_NAME=");
    expect(readFileSync(join(root, moduleRoot, "index.ts"), "utf8")).toBe(registry);
    expect(await syncCommand([], { ...settings, check: true })).toBe(0);
    writeFileSync(join(root, ".DEV.VARS.GHOSTINIT-PROCESS-RECOVERY-test"), "retain");
    expect(await syncCommand([], { ...settings, check: true })).not.toBe(0);
  });

  test("a capability transition retains additive PostgreSQL schema registrations", async () => {
    const { root, moduleRoot } = await createProject("monorepo", "nextjs", "postgres");
    const settings = options(root);
    expect(await addCommand(["module", "orders"], settings)).toBe(0);
    const configPath = join(root, "ghostinit.config.json");
    const desired = JSON.parse(readFileSync(configPath, "utf8"));
    desired.capabilities.featureFlags = { provider: "posthog" };
    writeFileSync(configPath, JSON.stringify(desired, null, 2) + "\n");
    expect(await syncCommand([], settings)).toBe(0);
    expect(readFileSync(join(root, "packages/database/src/schema/index.ts"), "utf8")).toContain(
      'from "./orders"',
    );
    expect(readFileSync(join(root, moduleRoot, "index.ts"), "utf8")).toContain(
      'export * as orders from "./orders/index";',
    );
    expect(await syncCommand([], { ...settings, check: true })).toBe(0);
  });
});
