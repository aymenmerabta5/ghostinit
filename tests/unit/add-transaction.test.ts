import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addCommand } from "../../src/commands/add";
import type { GlobalOptions } from "../../src/commands/types";
import { Logger } from "../../src/lib/logger";
import { FsTransaction } from "../../src/lib/fs";
import { buildReconcilePlan } from "../../src/lib/reconcile";
import { loadState, saveState, stageState } from "../../src/lib/state";
import { ghostinitVersion } from "../../packages/versions";

function options(root: string, dryRun = false): GlobalOptions {
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

function writeFixture(root: string): void {
  mkdirSync(join(root, ".ghostinit"), { recursive: true });
  const generatedAt = "2026-01-01T00:00:00.000Z";
  writeFileSync(
    join(root, ".ghostinit", "state.json"),
    `${JSON.stringify(
      {
        version: 1,
        project: {
          name: "add-transaction",
          runtime: "bun",
          version: "0.1.0",
          generatedAt,
        },
        checksums: {},
        generatedBy: ghostinitVersion,
        generatedAt,
        modules: [],
        procedures: [],
      },
      null,
      2,
    )}\n`,
  );
  for (const [path, content] of [
    ["packages/modules/src/index.ts", "// modules before\n"],
    ["packages/api/src/contract.ts", "export const appContract = {};\n"],
    ["packages/api/src/router.ts", "export const appRouter = {};\n"],
  ] as const) {
    const absolute = join(root, ...path.split("/"));
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content);
  }
}

describe("add transaction orchestration", () => {
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-add-transaction-"));
    writeFixture(root);
    const legacy = (await loadState(root))!;
    await saveState(root, legacy.project, [], [], [], {
      migrateV1: true,
      desiredConfig: legacy.desiredConfig,
      resolvedConfig: legacy.resolvedConfig,
      replaceFiles: {},
      acceptConfigChanges: true,
      existingState: legacy,
    });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("commits artifact, registry, and state as one locked operation", async () => {
    let commits = 0;
    class CountingTransaction extends FsTransaction {
      override async commit(): Promise<{ written: string[] }> {
        commits += 1;
        return super.commit();
      }
    }
    expect(
      await addCommand(["module", "orders"], options(root), {
        createTransaction: (transactionRoot) => new CountingTransaction(transactionRoot),
      }),
    ).toBe(0);
    expect(commits).toBe(1);
    expect(existsSync(join(root, "packages/modules/src/orders/domain/types.ts"))).toBe(true);
    expect(readFileSync(join(root, "packages/modules/src/index.ts"), "utf8")).toContain(
      'export * as orders from "./orders/index";',
    );
    const state = await loadState(root);
    expect(state?.modules).toEqual(["orders"]);
    expect(state?.files["packages/modules/src/orders/domain/types.ts"]?.provenance.renderer).toBe(
      "ghostinit-add.v2",
    );
    const desiredPlan = await buildReconcilePlan(root, state!, { operation: "sync" });
    expect(
      desiredPlan.deletions.some(({ path }) => path.startsWith("packages/modules/src/orders/")),
    ).toBe(false);
    expect(desiredPlan.preserved).toContain("packages/modules/src/orders/domain/types.ts");
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  test("publishes nothing when final state staging fails", async () => {
    const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    const registryBefore = readFileSync(join(root, "packages/modules/src/index.ts"), "utf8");
    await expect(
      addCommand(["module", "orders"], options(root), {
        stageState: async (...args: Parameters<typeof stageState>) => {
          await stageState(...args);
          throw new Error("injected state failure");
        },
      }),
    ).rejects.toThrow("injected state failure");

    expect(existsSync(join(root, "packages/modules/src/orders"))).toBe(false);
    expect(readFileSync(join(root, "packages/modules/src/index.ts"), "utf8")).toBe(registryBefore);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  test("does not publish a staged artifact when registry composition fails", async () => {
    const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    await expect(
      addCommand(["module", "orders"], options(root), {
        rebuildRegistries: async () => {
          throw new Error("injected registry failure");
        },
      }),
    ).rejects.toThrow("injected registry failure");

    expect(existsSync(join(root, "packages/modules/src/orders"))).toBe(false);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  test("dry-run leaves artifacts, registries, state, and locks byte-identical", async () => {
    const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
    const registryBefore = readFileSync(join(root, "packages/modules/src/index.ts"), "utf8");
    let effectAdapterCalled = false;
    expect(
      await addCommand(["module", "orders"], options(root, true), {
        createTransaction: () => {
          effectAdapterCalled = true;
          throw new Error("dry-run invoked transaction effect adapter");
        },
      }),
    ).toBe(0);
    expect(effectAdapterCalled).toBe(false);
    expect(existsSync(join(root, "packages/modules/src/orders"))).toBe(false);
    expect(readFileSync(join(root, "packages/modules/src/index.ts"), "utf8")).toBe(registryBefore);
    expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });
});
