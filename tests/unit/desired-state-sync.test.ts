// @allow-long 750: desired-state lifecycle, secrets, collisions, and recovery cases share one fixture
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProjectFiles } from "../../src/templates/default";
import { createManagedFileState, loadState, saveState, saveStateV2 } from "../../src/lib/state";
import {
  projectConfigToDesired,
  serializeDesiredProjectConfig,
} from "../../src/lib/project-config";
import { syncCommand } from "../../src/commands/sync";
import { Logger } from "../../src/lib/logger";
import { ConflictError, IncompatibleSchemaError, LockError } from "../../src/lib/errors";
import { acquireLock } from "../../src/lib/lock";
import {
  applyReconcilePlan,
  buildReconcilePlan,
  publicReconcilePlan,
} from "../../src/lib/reconcile";
import type { ProjectConfig } from "../../src/lib/config";
import type { GlobalOptions } from "../../src/commands/types";
import {
  CLOUDFLARE_ENVIRONMENT_LOCK_FILE,
  CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE,
  dotenvFieldsEqual,
  MAX_DOTENV_FILE_BYTES,
} from "../../src/lib/dotenv";

const notificationPath = "packages/services/src/notifications/service.ts";

function config(enabled: boolean): ProjectConfig {
  return {
    name: "desired-sync",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    preset: "custom",
    cache: "none",
    deploy: "none",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    messaging: false,
    notifications: enabled,
    featureFlags: enabled ? "posthog" : "none",
    jobs: enabled,
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
  };
}

function cloudflareConfig(deploy: "none" | "cloudflare"): ProjectConfig {
  return {
    ...config(false),
    preset: "frontend",
    database: "none",
    deploy,
    auth: false,
    api: false,
  };
}

function cloudflareConvexAuthConfig(deploy: "none" | "cloudflare"): ProjectConfig {
  return {
    ...cloudflareConfig(deploy),
    preset: "custom",
    database: "convex",
    auth: true,
    api: true,
  };
}

function writeDesiredConfig(root: string, project: ProjectConfig): void {
  writeFileSync(
    join(root, "ghostinit.config.json"),
    serializeDesiredProjectConfig(projectConfigToDesired(project)),
  );
}

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

async function writeGenerated(root: string, project: ProjectConfig): Promise<void> {
  const desired = projectConfigToDesired(project);
  const files = [
    ...generateProjectFiles(project, { dryRun: true }),
    { path: "ghostinit.config.json", content: serializeDesiredProjectConfig(desired) },
  ];
  for (const file of files) {
    const absolute = join(root, ...file.path.split("/"));
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, file.content);
  }
  await saveState(root, project, [], [], [], {
    desiredConfig: desired,
    managedFiles: files.map((file) => createManagedFileState(file.path, file.content)),
    acceptConfigChanges: true,
  });
}

function updateCapabilities(root: string, enabled: boolean): void {
  const path = join(root, "ghostinit.config.json");
  const desired = JSON.parse(readFileSync(path, "utf8"));
  desired.capabilities.notifications = enabled;
  desired.capabilities.featureFlags = enabled ? { provider: "posthog" } : false;
  desired.capabilities.jobs = enabled ? { userFacingApi: false } : false;
  writeFileSync(path, `${JSON.stringify(desired, null, 2)}\n`);
}

describe("V2 desired-state sync", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-desired-sync-"));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("disable removes unchanged generator-owned slices and preserves unrelated dirty files", async () => {
    await writeGenerated(root, config(true));
    expect(existsSync(join(root, ...notificationPath.split("/")))).toBe(true);
    writeFileSync(join(root, "untracked-notes.txt"), "keep me\n");
    updateCapabilities(root, false);

    expect(await syncCommand([], options(root))).toBe(0);
    expect(existsSync(join(root, ...notificationPath.split("/")))).toBe(false);
    expect(readFileSync(join(root, "untracked-notes.txt"), "utf8")).toBe("keep me\n");
    const state = await loadState(root);
    expect(state?.configChanged).toBe(false);
    expect(state?.files[notificationPath]).toBeUndefined();
    expect(state?.project.notifications).toBe(false);
    expect(state?.project.featureFlags).toBe("none");
    expect(state?.project.jobs).toBe(false);
  });

  test("desired-state dry-run performs no lock, deletion, or state/config write", async () => {
    await writeGenerated(root, config(true));
    updateCapabilities(root, false);
    const stateBefore = readFileSync(join(root, ".ghostinit", "state.json"), "utf8");
    const configBefore = readFileSync(join(root, "ghostinit.config.json"), "utf8");
    expect(await syncCommand([], { ...options(root), dryRun: true })).toBe(0);
    expect(readFileSync(join(root, ".ghostinit", "state.json"), "utf8")).toBe(stateBefore);
    expect(readFileSync(join(root, "ghostinit.config.json"), "utf8")).toBe(configBefore);
    expect(existsSync(join(root, ...notificationPath.split("/")))).toBe(true);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  test("direct V2 sync implies storage for messaging and persists non-null provenance", async () => {
    await writeGenerated(root, config(false));
    const configPath = join(root, "ghostinit.config.json");
    const direct = JSON.parse(readFileSync(configPath, "utf8")) as {
      capabilities: Record<string, unknown>;
    };
    direct.capabilities.messaging = true;
    delete direct.capabilities.storage;
    writeFileSync(configPath, `${JSON.stringify(direct, null, 2)}\n`);

    expect(await syncCommand([], options(root))).toBe(0);
    const state = await loadState(root);
    expect(state?.resolvedConfig.capabilities.messaging).toBe(true);
    expect(state?.resolvedConfig.capabilities.storage).toBe(true);
    expect(state?.resolvedConfig.enabledCapabilities).toContain("storage");
    const storagePaths = [
      "packages/services/src/storage/policy.ts",
      "packages/api/src/storage/contract.ts",
      "packages/api/src/adapters/storage/postgres.ts",
      "packages/database/src/schema/storage.ts",
      "packages/storage/src/index.ts",
      "apps/web/src/features/storage/mutations.ts",
      "apps/web/src/app/storage/page.tsx",
    ];
    for (const path of storagePaths) {
      expect(existsSync(join(root, ...path.split("/"))), path).toBe(true);
      expect(state?.files[path]?.provenance.capability, path).toBe("storage");
    }
  });

  test("direct V2 sync rejects messaging with explicitly disabled storage without leakage", async () => {
    await writeGenerated(root, config(false));
    const configPath = join(root, "ghostinit.config.json");
    const direct = JSON.parse(readFileSync(configPath, "utf8")) as {
      capabilities: Record<string, unknown>;
    };
    direct.capabilities.messaging = true;
    direct.capabilities.storage = false;
    writeFileSync(configPath, `${JSON.stringify(direct, null, 2)}\n`);

    const storagePath = "packages/services/src/storage/policy.ts";
    const stateBefore = readFileSync(join(root, ".ghostinit", "state.json"), "utf8");
    expect(existsSync(join(root, ...storagePath.split("/")))).toBe(false);
    await expect(syncCommand([], options(root))).rejects.toBeInstanceOf(IncompatibleSchemaError);
    expect(existsSync(join(root, ...storagePath.split("/")))).toBe(false);
    expect(readFileSync(join(root, ".ghostinit", "state.json"), "utf8")).toBe(stateBefore);
  });

  test("deploy transitions fail closed until local environment files are explicitly migrated", async () => {
    await writeGenerated(root, cloudflareConfig("none"));
    const configPath = join(root, "ghostinit.config.json");
    const desired = JSON.parse(readFileSync(configPath, "utf8")) as {
      apps: Array<{ deploy: string }>;
    };
    desired.apps[0]!.deploy = "cloudflare";
    writeFileSync(configPath, `${JSON.stringify(desired, null, 2)}\n`);

    let state = await loadState(root);
    if (!state) throw new Error("expected project state");
    const blocked = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(blocked.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "environment-path-migration-required",
          path: ".dev.vars",
          sourcePath: ".env.local",
        }),
        expect.objectContaining({
          reason: "environment-path-migration-required",
          path: "apps/web/.dev.vars",
          sourcePath: "apps/web/.env.local",
        }),
      ]),
    );
    await expect(syncCommand([], options(root))).rejects.toBeInstanceOf(ConflictError);

    renameSync(join(root, ".env.local"), join(root, ".dev.vars"));
    renameSync(join(root, "apps", "web", ".env.local"), join(root, "apps", "web", ".dev.vars"));
    expect(await syncCommand([], options(root))).toBe(0);
    state = await loadState(root);
    expect(state?.files[".env.local"]).toBeUndefined();
    expect(state?.files["apps/web/.env.local"]).toBeUndefined();
    expect(state?.files[".dev.vars"]).toBeDefined();
    expect(state?.files["apps/web/.dev.vars"]).toBeDefined();
  });

  test("stable Cloudflare sync rejects every runtime dotenv authority without reading or mutating it", async () => {
    await writeGenerated(root, cloudflareConvexAuthConfig("cloudflare"));
    const rootRuntimePath = join(root, ".env.production");
    const linkedRuntimePath = join(root, "apps/web/.env.staging");
    const linkedLegacyPath = join(root, "apps/web/.env.local");
    const linkedSecretSource = join(root, "operator-owned-linked-secret");
    const rootOperatorSecret = "root-production-secret-must-remain-untouched";
    const linkedOperatorSecret = "linked-production-secret-must-remain-untouched";
    writeFileSync(rootRuntimePath, `SERVER_SECRET=${rootOperatorSecret}\n`);
    writeFileSync(linkedSecretSource, `SERVER_SECRET=${linkedOperatorSecret}\n`);
    symlinkSync(linkedSecretSource, linkedRuntimePath, "file");
    symlinkSync(linkedSecretSource, linkedLegacyPath, "file");

    const rootLocalBefore = readFileSync(join(root, ".dev.vars"), "utf8");
    const webLocalBefore = readFileSync(join(root, "apps/web/.dev.vars"), "utf8");
    const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });

    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "environment-runtime-file-forbidden",
          path: ".dev.vars",
          sourcePath: ".env.production",
        }),
        expect.objectContaining({
          reason: "environment-runtime-file-forbidden",
          path: "apps/web/.dev.vars",
          sourcePath: "apps/web/.env.staging",
        }),
        expect.objectContaining({
          reason: "environment-path-migration-required",
          path: "apps/web/.dev.vars",
          sourcePath: "apps/web/.env.local",
        }),
      ]),
    );
    expect(plan.environmentMerges).toEqual([]);
    expect(plan.secretOperations).toEqual([]);
    expect(JSON.stringify(publicReconcilePlan(plan))).not.toContain(rootOperatorSecret);
    expect(JSON.stringify(publicReconcilePlan(plan))).not.toContain(linkedOperatorSecret);

    let entropyCalls = 0;
    await expect(
      applyReconcilePlan(root, state, plan, "sync", {
        entropy: () => {
          entropyCalls += 1;
          return "must-not-be-minted";
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(entropyCalls).toBe(0);
    await expect(syncCommand([], options(root))).rejects.toBeInstanceOf(ConflictError);

    expect(readFileSync(rootRuntimePath, "utf8")).toBe(`SERVER_SECRET=${rootOperatorSecret}\n`);
    expect(readFileSync(linkedSecretSource, "utf8")).toBe(
      `SERVER_SECRET=${linkedOperatorSecret}\n`,
    );
    expect(readFileSync(join(root, ".dev.vars"), "utf8")).toBe(rootLocalBefore);
    expect(readFileSync(join(root, "apps/web/.dev.vars"), "utf8")).toBe(webLocalBefore);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);
  });

  test("deploy plus auth and Convex transition preserves semantically equal reordered environment mirrors", async () => {
    await writeGenerated(root, cloudflareConfig("none"));
    const persistentAuthSecret = "persistent-auth-secret-value-that-must-not-rotate";
    const customPrivateValue = "operator-owned-private-value";
    const rootEnvironment = readFileSync(join(root, ".env.local"), "utf8")
      .replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${persistentAuthSecret}`)
      .concat(
        [
          "CONVEX_DEPLOYMENT=dev:existing-worker",
          "CONVEX_URL=https://existing-worker.convex.cloud",
          "CONVEX_SITE_URL=https://existing-worker.convex.site",
          "NEXT_PUBLIC_CONVEX_URL=https://existing-worker.convex.cloud",
          `CUSTOM_PRIVATE_VALUE=${customPrivateValue}`,
          "",
        ].join("\n"),
      );
    const reorderedWebEnvironment = `${rootEnvironment
      .trimEnd()
      .split(/\r?\n/)
      .reverse()
      .join("\n")}\n`;
    writeFileSync(join(root, ".env.local"), rootEnvironment);
    writeFileSync(join(root, "apps/web/.env.local"), reorderedWebEnvironment);
    writeDesiredConfig(root, cloudflareConvexAuthConfig("cloudflare"));

    renameSync(join(root, ".env.local"), join(root, ".dev.vars"));
    renameSync(join(root, "apps/web/.env.local"), join(root, "apps/web/.dev.vars"));
    const state = await loadState(root);
    if (!state) throw new Error("expected project state");
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(plan.conflicts.map(({ reason }) => reason)).not.toContain("environment-mirror-diverged");
    expect(plan.secretOperations.map(({ reference }) => reference)).not.toContain(
      "auth.session-secret",
    );

    let entropyCalls = 0;
    await applyReconcilePlan(root, state, plan, "sync", {
      entropy: () => {
        entropyCalls += 1;
        return "unexpected-secret-rotation";
      },
    });

    const reconciledEnvironment: string[] = [];
    for (const path of [".dev.vars", "apps/web/.dev.vars"]) {
      const content = readFileSync(join(root, ...path.split("/")), "utf8");
      reconciledEnvironment.push(content);
      expect(content).toContain(`BETTER_AUTH_SECRET=${persistentAuthSecret}`);
      expect(content).toContain(`CUSTOM_PRIVATE_VALUE=${customPrivateValue}`);
      expect(content).toContain("CONVEX_DEPLOYMENT=dev:existing-worker");
      expect(content).toContain("CONVEX_URL=https://existing-worker.convex.cloud");
    }
    expect(dotenvFieldsEqual(reconciledEnvironment[0]!, reconciledEnvironment[1]!)).toBe(true);
    expect(entropyCalls).toBe(0);
    const persistedState = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    expect(persistedState).not.toContain(persistentAuthSecret);
    expect(persistedState).not.toContain(customPrivateValue);
  });

  test("divergent legacy environment mirrors block transition until explicitly reconciled", async () => {
    await writeGenerated(root, cloudflareConfig("none"));
    const rootSecret = "root-secret-value-that-remains-authoritative";
    const webSecret = "different-web-secret-that-must-not-be-guessed";
    const rootPath = join(root, ".env.local");
    const webPath = join(root, "apps/web/.env.local");
    writeFileSync(
      rootPath,
      readFileSync(rootPath, "utf8").replace(
        /^BETTER_AUTH_SECRET=.*$/m,
        `BETTER_AUTH_SECRET=${rootSecret}`,
      ),
    );
    writeFileSync(
      webPath,
      readFileSync(webPath, "utf8").replace(
        /^BETTER_AUTH_SECRET=.*$/m,
        `BETTER_AUTH_SECRET=${webSecret}`,
      ),
    );
    writeDesiredConfig(root, cloudflareConvexAuthConfig("cloudflare"));
    renameSync(rootPath, join(root, ".dev.vars"));
    renameSync(webPath, join(root, "apps/web/.dev.vars"));

    let state = await loadState(root);
    if (!state) throw new Error("expected project state");
    const blocked = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(blocked.conflicts).toContainEqual(
      expect.objectContaining({
        path: ".dev.vars",
        sourcePath: "apps/web/.dev.vars",
        reason: "environment-mirror-diverged",
      }),
    );
    expect(JSON.stringify(publicReconcilePlan(blocked))).not.toContain(rootSecret);
    expect(JSON.stringify(publicReconcilePlan(blocked))).not.toContain(webSecret);
    const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    await expect(applyReconcilePlan(root, state, blocked, "sync")).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(readFileSync(join(root, ".dev.vars"), "utf8")).toContain(rootSecret);
    expect(readFileSync(join(root, "apps/web/.dev.vars"), "utf8")).toContain(webSecret);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);

    writeFileSync(
      join(root, "apps/web/.dev.vars"),
      readFileSync(join(root, "apps/web/.dev.vars"), "utf8").replace(webSecret, rootSecret),
    );
    state = await loadState(root);
    const reconciled = await buildReconcilePlan(root, state!, { operation: "sync" });
    expect(reconciled.conflicts.map(({ reason }) => reason)).not.toContain(
      "environment-mirror-diverged",
    );
    await applyReconcilePlan(root, state!, reconciled, "sync", {
      entropy: () => {
        throw new Error("existing secret must not rotate after explicit reconciliation");
      },
    });
    expect(readFileSync(join(root, ".dev.vars"), "utf8")).toContain(rootSecret);
    expect(readFileSync(join(root, "apps/web/.dev.vars"), "utf8")).toContain(rootSecret);
  });

  test("a single missing Cloudflare mirror blocks instead of dropping operator-owned values", async () => {
    await writeGenerated(root, cloudflareConvexAuthConfig("cloudflare"));
    const rootPath = join(root, ".dev.vars");
    const webPath = join(root, "apps/web/.dev.vars");
    const operatorValue = "operator-owned-value-that-target-placeholders-cannot-recover";
    const original = `${readFileSync(rootPath, "utf8")}CUSTOM_PRIVATE_VALUE=${operatorValue}\n`;
    writeFileSync(rootPath, original);
    rmSync(webPath);

    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        path: "apps/web/.dev.vars",
        sourcePath: ".dev.vars",
        reason: "environment-mirror-missing",
      }),
    );
    expect(JSON.stringify(publicReconcilePlan(plan))).not.toContain(operatorValue);
    await expect(applyReconcilePlan(root, state, plan, "sync")).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(readFileSync(rootPath, "utf8")).toBe(original);
    expect(existsSync(webPath)).toBe(false);
  });

  test("two absent Cloudflare mirrors are created together with one materialized secret set", async () => {
    await writeGenerated(root, cloudflareConvexAuthConfig("cloudflare"));
    const rootPath = join(root, ".dev.vars");
    const webPath = join(root, "apps/web/.dev.vars");
    rmSync(rootPath);
    rmSync(webPath);

    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(plan.conflicts.map(({ reason }) => reason)).not.toContain("environment-mirror-missing");
    let entropyCalls = 0;
    await applyReconcilePlan(root, state, plan, "sync", {
      entropy: () => {
        entropyCalls += 1;
        return "one-shared-secret-value-for-both-cloudflare-mirrors";
      },
    });

    const rootContent = readFileSync(rootPath, "utf8");
    const webContent = readFileSync(webPath, "utf8");
    expect(dotenvFieldsEqual(rootContent, webContent)).toBe(true);
    expect(rootContent).toContain(
      "BETTER_AUTH_SECRET=one-shared-secret-value-for-both-cloudflare-mirrors",
    );
    expect(entropyCalls).toBe(1);
  });

  test("apply rejects a runtime dotenv symlink introduced after Cloudflare planning", async () => {
    await writeGenerated(root, cloudflareConvexAuthConfig("cloudflare"));
    const rootPath = join(root, ".dev.vars");
    const webPath = join(root, "apps/web/.dev.vars");
    rmSync(rootPath);
    rmSync(webPath);
    const stateText = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(plan.environmentMerges.map(({ path }) => path)).toEqual([
      ".dev.vars",
      "apps/web/.dev.vars",
    ]);

    const secretSource = join(root, "late-operator-secret-source");
    const runtimeLink = join(root, ".env.production");
    const operatorSecret = "late-linked-secret-must-not-be-read-or-replaced";
    writeFileSync(secretSource, `SERVER_SECRET=${operatorSecret}\n`);
    symlinkSync(secretSource, runtimeLink, "file");
    let entropyCalls = 0;
    await expect(
      applyReconcilePlan(root, state, plan, "sync", {
        entropy: () => {
          entropyCalls += 1;
          return "must-not-be-minted";
        },
      }),
    ).rejects.toThrow("appeared after reconciliation planning");

    expect(entropyCalls).toBe(0);
    expect(existsSync(rootPath)).toBe(false);
    expect(existsSync(webPath)).toBe(false);
    expect(readFileSync(secretSource, "utf8")).toBe(`SERVER_SECRET=${operatorSecret}\n`);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateText);
  });

  test("Cloudflare reconciliation refuses oversized local mirrors without secret planning", async () => {
    await writeGenerated(root, cloudflareConvexAuthConfig("cloudflare"));
    const rootPath = join(root, ".dev.vars");
    const webPath = join(root, "apps/web/.dev.vars");
    const oversized = Buffer.alloc(MAX_DOTENV_FILE_BYTES + 1, "s");
    writeFileSync(rootPath, oversized);
    const webBefore = readFileSync(webPath, "utf8");
    const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");

    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        path: ".dev.vars",
        reason: "environment-local-file-unsafe",
        actualHash: null,
      }),
    );
    expect(plan.environmentMerges).toEqual([]);
    expect(plan.secretOperations).toEqual([]);
    await expect(syncCommand([], options(root))).rejects.toBeInstanceOf(ConflictError);
    expect(readFileSync(rootPath).byteLength).toBe(oversized.byteLength);
    expect(readFileSync(webPath, "utf8")).toBe(webBefore);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);
  });

  test("sync never creates split mirrors while the Cloudflare wrapper hides local values", async () => {
    await writeGenerated(root, cloudflareConvexAuthConfig("cloudflare"));
    const rootPath = join(root, ".dev.vars");
    const webPath = join(root, "apps/web/.dev.vars");
    const rootHidden = join(root, CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE);
    const webHidden = join(root, "apps/web", CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE);
    const rootBefore = readFileSync(rootPath, "utf8");
    const webBefore = readFileSync(webPath, "utf8");
    renameSync(rootPath, rootHidden);
    renameSync(webPath, webHidden);
    writeFileSync(
      join(root, CLOUDFLARE_ENVIRONMENT_LOCK_FILE),
      JSON.stringify({ version: 1, pid: process.pid, owner: "deterministic-overlap" }) + "\n",
    );
    const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");

    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: CLOUDFLARE_ENVIRONMENT_LOCK_FILE,
          reason: "environment-lifecycle-in-progress",
        }),
        expect.objectContaining({
          path: CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE,
          reason: "environment-lifecycle-in-progress",
        }),
        expect.objectContaining({
          path: `apps/web/${CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE}`,
          reason: "environment-lifecycle-in-progress",
        }),
      ]),
    );
    expect(plan.environmentMerges).toEqual([]);
    expect(plan.secretOperations).toEqual([]);
    await expect(syncCommand([], options(root))).rejects.toBeInstanceOf(ConflictError);

    expect(existsSync(rootPath)).toBe(false);
    expect(existsSync(webPath)).toBe(false);
    expect(readFileSync(rootHidden, "utf8")).toBe(rootBefore);
    expect(readFileSync(webHidden, "utf8")).toBe(webBefore);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);
  });

  test("Convex and auth transition entropy failure publishes neither environment mirror", async () => {
    await writeGenerated(root, cloudflareConfig("none"));
    const rootLegacyPath = join(root, ".env.local");
    const webLegacyPath = join(root, "apps/web/.env.local");
    const rootEnvironment = `${readFileSync(rootLegacyPath, "utf8")}CONVEX_DEPLOYMENT=dev:existing-worker\nCONVEX_URL=https://existing-worker.convex.cloud\nCONVEX_SITE_URL=https://existing-worker.convex.site\nNEXT_PUBLIC_CONVEX_URL=https://existing-worker.convex.cloud\n`;
    const webEnvironment = `${rootEnvironment.trimEnd().split(/\r?\n/).reverse().join("\n")}\n`;
    writeFileSync(rootLegacyPath, rootEnvironment);
    writeFileSync(webLegacyPath, webEnvironment);
    writeDesiredConfig(root, cloudflareConvexAuthConfig("cloudflare"));
    const rootPath = join(root, ".dev.vars");
    const webPath = join(root, "apps/web/.dev.vars");
    renameSync(rootLegacyPath, rootPath);
    renameSync(webLegacyPath, webPath);
    const stateText = readFileSync(join(root, ".ghostinit/state.json"), "utf8");

    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(plan.secretOperations.map(({ reference }) => reference)).toContain(
      "auth.session-secret",
    );
    await expect(
      applyReconcilePlan(root, state, plan, "sync", {
        entropy: () => {
          throw new Error("injected mirrored environment entropy failure");
        },
      }),
    ).rejects.toThrow("injected mirrored environment entropy failure");

    expect(readFileSync(rootPath, "utf8")).toBe(rootEnvironment);
    expect(readFileSync(webPath, "utf8")).toBe(webEnvironment);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateText);
  });

  test("disable fails closed when a managed capability file was edited", async () => {
    await writeGenerated(root, config(true));
    updateCapabilities(root, false);
    const absolute = join(root, ...notificationPath.split("/"));
    writeFileSync(absolute, `${readFileSync(absolute, "utf8")}\n// user edit\n`);

    await expect(syncCommand([], options(root))).rejects.toBeInstanceOf(ConflictError);
    expect(existsSync(absolute)).toBe(true);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  test("enable rejects an untracked target collision but ignores unrelated untracked files", async () => {
    await writeGenerated(root, config(false));
    updateCapabilities(root, true);
    const collision = join(root, ...notificationPath.split("/"));
    mkdirSync(join(collision, ".."), { recursive: true });
    writeFileSync(collision, "export const foreign = true;\n");
    writeFileSync(join(root, "unrelated.txt"), "safe\n");

    await expect(syncCommand([], options(root))).rejects.toBeInstanceOf(ConflictError);
    expect(readFileSync(collision, "utf8")).toContain("foreign");
    expect(readFileSync(join(root, "unrelated.txt"), "utf8")).toBe("safe\n");
  });

  test("actual sync respects the project lock", async () => {
    await writeGenerated(root, config(false));
    updateCapabilities(root, true);
    const held = await acquireLock(root, new Logger({ quiet: true }));
    try {
      await expect(syncCommand([], { ...options(root), force: false })).rejects.toBeInstanceOf(
        LockError,
      );
    } finally {
      await held.release();
    }
  });

  test("resumes a pending hash-safe operation after a partial deletion", async () => {
    await writeGenerated(root, config(true));
    updateCapabilities(root, false);
    const state = await loadState(root);
    expect(state).toBeDefined();
    const plan = await buildReconcilePlan(root, state!, { operation: "sync" });
    const firstDelete = plan.deletions.find((change) => change.path === notificationPath)!;
    const startedAt = new Date().toISOString();
    await saveStateV2(root, state!, {
      desiredConfig: state!.desiredConfig,
      replaceFiles: state!.files,
      pendingOperation: {
        id: "recovery-fixture",
        kind: "sync",
        startedAt,
        configHash: plan.configHash,
        planHash: plan.planHash,
        changes: [...plan.creates, ...plan.moves, ...plan.rewrites, ...plan.deletions].map(
          (change) => ({
            action: change.action,
            path: change.path,
            ...(change.fromPath ? { fromPath: change.fromPath } : {}),
            beforeHash: change.beforeHash,
            afterHash: change.afterHash,
          }),
        ),
      },
    });
    rmSync(join(root, ...firstDelete.path.split("/")));

    expect(await syncCommand([], options(root))).toBe(0);
    const recovered = await loadState(root);
    expect(recovered?.pendingOperation).toBeNull();
    expect(recovered?.migrationHistory.at(-1)?.id).toBe("recovery-fixture");
    expect(existsSync(join(root, ...notificationPath.split("/")))).toBe(false);
  });

  test("apply rejects a managed file edited after deletion planning", async () => {
    await writeGenerated(root, config(true));
    updateCapabilities(root, false);
    const state = await loadState(root);
    expect(state).toBeDefined();
    const plan = await buildReconcilePlan(root, state!, { operation: "sync" });
    expect(plan.deletions.some((change) => change.path === notificationPath)).toBe(true);

    const absolute = join(root, ...notificationPath.split("/"));
    writeFileSync(absolute, `${readFileSync(absolute, "utf8")}\n// concurrent user edit\n`);
    await expect(applyReconcilePlan(root, state!, plan, "sync")).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect(readFileSync(absolute, "utf8")).toContain("concurrent user edit");
    const unchangedState = await loadState(root);
    expect(unchangedState?.pendingOperation).toBeNull();
    expect(unchangedState?.migrationHistory).toEqual(state?.migrationHistory);
  });

  test("apply rejects an untracked destination created after create planning", async () => {
    await writeGenerated(root, config(false));
    updateCapabilities(root, true);
    const state = await loadState(root);
    expect(state).toBeDefined();
    const plan = await buildReconcilePlan(root, state!, { operation: "sync" });
    expect(plan.creates.some((change) => change.path === notificationPath)).toBe(true);

    const absolute = join(root, ...notificationPath.split("/"));
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, "export const concurrentOwner = true;\n");
    await expect(applyReconcilePlan(root, state!, plan, "sync")).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect(readFileSync(absolute, "utf8")).toContain("concurrentOwner");
    expect((await loadState(root))?.pendingOperation).toBeNull();
  });

  test("sync materializes only newly required self-issued secrets and preserves vendor values", async () => {
    const project = config(false);
    await writeGenerated(root, project);
    const envFiles = generateProjectFiles(project, { dryRun: true })
      .filter(({ path }) => path === ".env.local" || path.endsWith("/.env.local"))
      .map(({ path }) => path);
    const existingAuth = "A".repeat(64);
    const existingPostgres = "P".repeat(64);
    const vendorBefore = new Map<string, Map<string, string>>();
    for (const path of envFiles) {
      const absolute = join(root, ...path.split("/"));
      if (!existsSync(absolute)) continue;
      const updated = readFileSync(absolute, "utf8")
        .replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${existingAuth}`)
        .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${existingPostgres}`);
      writeFileSync(absolute, updated);
      vendorBefore.set(
        path,
        new Map(
          [...updated.matchAll(/^([A-Z][A-Z0-9_]*)=(REPLACE_WITH_[A-Z0-9_]+)$/gm)]
            .map((match) => [match[1]!, match[2]!])
            .filter(
              ([field]) =>
                field !== "BETTER_AUTH_SECRET" &&
                field !== "POSTGRES_PASSWORD" &&
                field !== "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
            ),
        ),
      );
    }
    updateCapabilities(root, true);
    const state = await loadState(root);
    const plan = await buildReconcilePlan(root, state!, { operation: "sync" });
    expect(plan.secretOperations.map(({ reference }) => reference)).toContain(
      "notifications.token-encryption-key",
    );
    expect(JSON.stringify(publicReconcilePlan(plan))).not.toContain(existingAuth);

    const generatedNotificationKey = "N".repeat(43);
    await applyReconcilePlan(root, state!, plan, "sync", {
      entropy: (bytes) => (bytes === 32 ? generatedNotificationKey : "S".repeat(64)),
    });

    for (const path of envFiles) {
      const absolute = join(root, ...path.split("/"));
      if (!existsSync(absolute)) continue;
      const content = readFileSync(absolute, "utf8");
      expect(content).toContain(`BETTER_AUTH_SECRET=${existingAuth}`);
      expect(content).toContain(`POSTGRES_PASSWORD=${existingPostgres}`);
      if (path === ".env.local") {
        expect(content).toContain(`NOTIFICATION_TOKEN_ENCRYPTION_KEY=${generatedNotificationKey}`);
      }
      for (const [field, placeholder] of vendorBefore.get(path) ?? []) {
        expect(content).toContain(`${field}=${placeholder}`);
      }
    }
    const persisted = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    expect(persisted).not.toContain(existingAuth);
    expect(persisted).not.toContain(generatedNotificationKey);
  });

  test("secret materialization failure publishes neither desired files nor state", async () => {
    await writeGenerated(root, config(false));
    updateCapabilities(root, true);
    const stateText = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    const environmentText = readFileSync(join(root, ".env.local"), "utf8");
    const state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    await expect(
      applyReconcilePlan(root, state, plan, "sync", {
        entropy: () => {
          throw new Error("injected entropy failure");
        },
      }),
    ).rejects.toThrow("injected entropy failure");
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateText);
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe(environmentText);
    expect(existsSync(join(root, ...notificationPath.split("/")))).toBe(false);
  });

  test("migrates untouched Next API routes from seed-once to managed rewrites", async () => {
    await writeGenerated(root, config(true));
    let state = (await loadState(root))!;
    const initialPlan = await buildReconcilePlan(root, state, { operation: "sync" });
    const route = Object.values(initialPlan.targets).find(({ path }) =>
      /apps\/web\/src\/app\/api\/.*\/route\.ts$/.test(path),
    );
    expect(route?.lifecycle).toBe("generator-owned");
    const oldContent = "// old generated transport route\n";
    writeFileSync(join(root, ...route!.path.split("/")), oldContent);
    await saveStateV2(root, state, {
      replaceFiles: {
        ...state.files,
        [route!.path]: createManagedFileState(route!.path, oldContent, {
          ...route,
          lifecycle: "seed-once",
        }),
      },
      desiredConfigAlreadyWritten: true,
    });
    state = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, state, { operation: "sync" });
    expect(plan.rewrites.map(({ path }) => path)).toContain(route!.path);
    await applyReconcilePlan(root, state, plan, "sync");
    expect(readFileSync(join(root, ...route!.path.split("/")), "utf8")).toBe(route!.content);
  });

  test("reports unsafe structured removals instead of deleting them", async () => {
    await writeGenerated(root, config(false));
    const path = "obsolete/package.json";
    const content = '{"private":true}\n';
    mkdirSync(join(root, "obsolete"), { recursive: true });
    writeFileSync(join(root, ...path.split("/")), content);
    const state = (await loadState(root))!;
    await saveStateV2(root, state, {
      replaceFiles: {
        ...state.files,
        [path]: createManagedFileState(path, content, {
          lifecycle: "structured-merge",
          provenance: {
            renderer: "legacy-template-adapter.v2",
            source: "src/templates",
            capability: null,
            acceptance: ["project.render.v2"],
            contribution: ["legacy.core.v2"],
          },
        }),
      },
      desiredConfigAlreadyWritten: true,
    });
    const plan = await buildReconcilePlan(root, (await loadState(root))!, { operation: "sync" });
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({ path, reason: "unsafe-removal", proposedHash: null }),
    );
    expect(readFileSync(join(root, ...path.split("/")), "utf8")).toBe(content);
  });

  test("retires removed seed files without deleting user-owned content", async () => {
    await writeGenerated(root, config(false));
    const path = "apps/web/src/app/retired/page.tsx";
    const content = "export default function Retired() { return null; }\n";
    const absolute = join(root, ...path.split("/"));
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content);
    const state = (await loadState(root))!;
    await saveStateV2(root, state, {
      replaceFiles: {
        ...state.files,
        [path]: createManagedFileState(path, content, {
          lifecycle: "seed-once",
          provenance: {
            renderer: "legacy-template-adapter.v2",
            source: "src/templates",
            capability: null,
            acceptance: ["project.render.v2"],
            contribution: ["legacy.core.v2"],
          },
        }),
      },
      desiredConfigAlreadyWritten: true,
    });
    const hydrated = (await loadState(root))!;
    const plan = await buildReconcilePlan(root, hydrated, { operation: "sync" });
    expect(plan.retired).toContain(path);
    await applyReconcilePlan(root, hydrated, plan, "sync");
    expect(readFileSync(absolute, "utf8")).toBe(content);
    expect((await loadState(root))?.files[path]).toBeUndefined();
  });
});
