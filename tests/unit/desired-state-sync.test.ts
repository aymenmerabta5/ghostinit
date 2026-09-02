// @allow-long 414: desired-state lifecycle, secrets, collisions, and recovery cases share one fixture
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
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
