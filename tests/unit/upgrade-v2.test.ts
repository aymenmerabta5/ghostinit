// @allow-long 213: V1 migration, secret materialization, conflicts, locking, and V2 assertions share one fixture
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { upgradeCommand } from "../../src/commands/upgrade";
import { applyReconcilePlan, buildReconcilePlan } from "../../src/lib/reconcile";
import { hashContent } from "../../src/lib/checksum";
import { loadState } from "../../src/lib/state";
import { Logger } from "../../src/lib/logger";
import { acquireLock } from "../../src/lib/lock";
import { ConflictError, LockError } from "../../src/lib/errors";
import { generateProjectFiles } from "../../src/templates/default";
import type { GlobalOptions } from "../../src/commands/types";

function options(root: string, dryRun: boolean): GlobalOptions {
  return {
    cwd: root,
    json: false,
    yes: true,
    force: true,
    dryRun,
    noInstall: true,
    runtime: "bun",
    check: false,
    logger: new Logger({ quiet: true }),
  };
}

function treeHash(root: string): string {
  const hash = createHash("sha256");
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).toSorted()) {
      const absolute = join(directory, name);
      const stat = statSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else {
        hash.update(relative(root, absolute).replaceAll("\\", "/"));
        hash.update(readFileSync(absolute));
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

function writeV1(root: string): void {
  mkdirSync(join(root, ".ghostinit"), { recursive: true });
  copyFileSync(
    join(import.meta.dir, "..", "fixtures", "compatibility", "v1-state.json"),
    join(root, ".ghostinit", "state.json"),
  );
  const tracked = join(root, "packages", "modules", "src", "index.ts");
  mkdirSync(join(tracked, ".."), { recursive: true });
  writeFileSync(tracked, "");
}

describe("V1 to V2 upgrade", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-upgrade-v2-"));
    writeV1(root);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("dry-run reports the exact plan without creating config, lock, or state changes", async () => {
    const before = treeHash(root);
    expect(await upgradeCommand([], options(root, true))).toBe(0);
    expect(treeHash(root)).toBe(before);
    expect(existsSync(join(root, "ghostinit.config.json"))).toBe(false);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);

    const state = await loadState(root);
    const plan = await buildReconcilePlan(root, state!, { operation: "upgrade" });
    expect(plan.sourceStateVersion).toBe(1);
    expect(plan.creates.some((change) => change.path === "ghostinit.config.json")).toBe(true);
    expect(plan.rewrites.some((change) => change.path.endsWith("modules/src/index.ts"))).toBe(true);
  });

  test("actual upgrade writes separated V2 state without raw file or environment content", async () => {
    expect(await upgradeCommand([], options(root, false))).toBe(0);
    const persistedText = readFileSync(join(root, ".ghostinit", "state.json"), "utf8");
    const persisted = JSON.parse(persistedText);
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted.project).toBeUndefined();
    expect(persisted.checksums).toBeUndefined();
    expect(persisted.pendingOperation).toBeNull();
    expect(persisted.migrationHistory.at(-1)).toEqual(
      expect.objectContaining({ kind: "upgrade", fromVersion: 1, status: "completed" }),
    );
    expect(persistedText).not.toContain('"content"');
    expect(persistedText).not.toContain("DATABASE_URL=");
    expect(
      JSON.parse(readFileSync(join(root, "ghostinit.config.json"), "utf8")).schemaVersion,
    ).toBe(2);
    const localEnvironment = readFileSync(join(root, ".env.local"), "utf8");
    const authSecret = /^BETTER_AUTH_SECRET=(.+)$/m.exec(localEnvironment)?.[1];
    const postgresPassword = /^POSTGRES_PASSWORD=(.+)$/m.exec(localEnvironment)?.[1];
    expect(authSecret).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(postgresPassword).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(localEnvironment).toContain("RESEND_API_KEY=REPLACE_WITH_RESEND_API_KEY");
    expect(persistedText).not.toContain(authSecret!);
    expect(persistedText).not.toContain(postgresPassword!);
  });

  test("modified tracked content is a conflict even with force", async () => {
    const tracked = join(root, "packages", "modules", "src", "index.ts");
    writeFileSync(tracked, "// user edit\n");
    const before = treeHash(root);
    expect(await upgradeCommand([], options(root, true))).toBe(18);
    expect(treeHash(root)).toBe(before);
    await expect(upgradeCommand([], options(root, false))).rejects.toBeInstanceOf(ConflictError);
    expect(existsSync(join(root, "ghostinit.config.json"))).toBe(false);
  });

  test("apply rejects tracked content edited after upgrade planning", async () => {
    const state = await loadState(root);
    const plan = await buildReconcilePlan(root, state!, { operation: "upgrade" });
    const tracked = join(root, "packages", "modules", "src", "index.ts");
    expect(plan.rewrites.some((change) => change.path === "packages/modules/src/index.ts")).toBe(
      true,
    );
    writeFileSync(tracked, "// concurrent user edit\n");

    await expect(applyReconcilePlan(root, state!, plan, "upgrade")).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(readFileSync(tracked, "utf8")).toBe("// concurrent user edit\n");
    expect(existsSync(join(root, "ghostinit.config.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, ".ghostinit", "state.json"), "utf8")).version).toBe(
      1,
    );
  });

  test("an untracked target collision blocks while unrelated untracked files do not", async () => {
    const collision = join(root, "packages", "api", "src", "contract.ts");
    mkdirSync(join(collision, ".."), { recursive: true });
    writeFileSync(collision, "export const foreign = true;\n");
    writeFileSync(join(root, "notes.txt"), "unrelated\n");
    const state = await loadState(root);
    const plan = await buildReconcilePlan(root, state!, { operation: "upgrade" });
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "packages/api/src/contract.ts",
          reason: "untracked-collision",
        }),
      ]),
    );
    expect(plan.conflicts.some((conflict) => conflict.path === "notes.txt")).toBe(false);
  });

  test("preview distinguishes moves and deletions by exact stored hashes", async () => {
    const statePath = join(root, ".ghostinit", "state.json");
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    const state = await loadState(root);
    const target = generateProjectFiles(state!.project, { dryRun: true }).find(
      (file) => file.path === ".gitignore",
    )!;
    const movedFrom = "obsolete/old-gitignore";
    const deleted = "obsolete/delete-me.ts";
    for (const [path, content] of [
      [movedFrom, target.content],
      [deleted, "obsolete\n"],
    ] as const) {
      const absolute = join(root, ...path.split("/"));
      mkdirSync(join(absolute, ".."), { recursive: true });
      writeFileSync(absolute, content);
      raw.checksums[path] = {
        algorithm: "sha256",
        hash: hashContent(content),
        size: Buffer.byteLength(content),
        path,
      };
    }
    writeFileSync(statePath, `${JSON.stringify(raw, null, 2)}\n`);
    const plan = await buildReconcilePlan(root, (await loadState(root))!, {
      operation: "upgrade",
    });
    expect(plan.moves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ".gitignore", fromPath: movedFrom }),
      ]),
    );
    expect(plan.deletions).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: deleted })]),
    );
  });

  test("actual upgrade respects an existing lock", async () => {
    const held = await acquireLock(root, new Logger({ quiet: true }));
    try {
      await expect(
        upgradeCommand([], { ...options(root, false), force: false }),
      ).rejects.toBeInstanceOf(LockError);
    } finally {
      await held.release();
    }
  });
});
