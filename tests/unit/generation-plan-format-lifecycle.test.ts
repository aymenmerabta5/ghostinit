// @allow-long 320: create, reconcile, conflict, and formatter rollback share one cross-mode matrix
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProjectInstall } from "../../src/commands/create/installer.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import type { ProjectMode } from "../../src/lib/addons.js";
import type { GlobalOptions } from "../../src/commands/types.js";
import { Logger } from "../../src/lib/logger.js";
import { buildReconcilePlan } from "../../src/lib/reconcile.js";
import { loadState } from "../../src/lib/state.js";

type WebFramework = "nextjs" | "tanstack-start";

interface MatrixCase {
  readonly framework: WebFramework;
  readonly mode: ProjectMode;
}

const CASES: readonly MatrixCase[] = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start"] as const).map((framework) => ({ mode, framework })),
);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(testCase: MatrixCase, name: string) {
  const resolution = resolveCreateConfig({
    name,
    runtime: "bun",
    mode: testCase.mode,
    framework: testCase.framework,
    billing: [],
    features: [],
    database: "none",
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "frontend",
    cache: "none",
    deploy: "none",
  });
  if (!resolution.ok) throw new Error(resolution.message);
  return resolution;
}

function options(parent: string, noInstall: boolean): GlobalOptions {
  return {
    cwd: parent,
    json: false,
    yes: true,
    force: false,
    dryRun: false,
    noInstall,
    runtime: "bun",
    check: false,
    logger: new Logger({ quiet: true }),
  };
}

function probePath(testCase: MatrixCase): string {
  const root = testCase.mode === "monorepo" ? "apps/web/" : "";
  return `${root}${testCase.framework === "nextjs" ? "next.config.ts" : "vite.config.ts"}`;
}

function expectNoMutations(plan: Awaited<ReturnType<typeof buildReconcilePlan>>): void {
  expect({
    creates: plan.creates.length,
    moves: plan.moves.length,
    rewrites: plan.rewrites.length,
    deletions: plan.deletions.length,
    retired: plan.retired.length,
    conflicts: plan.conflicts.length,
    environmentMerges: plan.environmentMerges.length,
    secretOperations: plan.secretOperations.length,
  }).toEqual({
    creates: 0,
    moves: 0,
    rewrites: 0,
    deletions: 0,
    retired: 0,
    conflicts: 0,
    environmentMerges: 0,
    secretOperations: 0,
  });
}

describe("canonical generation-plan formatting lifecycle", () => {
  for (const testCase of CASES) {
    test(`${testCase.mode}/${testCase.framework} create is an immediate sync and upgrade no-op`, async () => {
      const parent = mkdtempSync(join(tmpdir(), "ghostinit-plan-format-noop-"));
      roots.push(parent);
      const projectRoot = join(parent, "format-noop");
      const resolved = fixture(testCase, "format-noop");

      const created = await runProjectInstall({
        projectName: resolved.config.name,
        projectRoot,
        config: resolved.config,
        desiredConfig: resolved.desiredConfig,
        resolvedConfig: resolved.resolvedConfig,
        options: options(parent, true),
        noInstall: true,
        requireAbsentTarget: true,
      });
      const state = await loadState(projectRoot);
      expect(state).toBeDefined();
      expect(state?.generationPlan?.planHash).toBe(created.plan.planHash);
      const actualProbe = readFileSync(
        join(projectRoot, ...probePath(testCase).split("/")),
        "utf8",
      );
      expect(
        created.plan.files.find(({ physicalPath }) => physicalPath === probePath(testCase))
          ?.content,
      ).toBe(actualProbe);

      for (const operation of ["sync", "upgrade"] as const) {
        const plan = await buildReconcilePlan(projectRoot, state!, { operation });
        expectNoMutations(plan);
        expect(plan.generationPlan.planHash).toBe(state?.generationPlan?.planHash);
      }
    });

    test(`${testCase.mode}/${testCase.framework} retains modified-file conflicts`, async () => {
      const parent = mkdtempSync(join(tmpdir(), "ghostinit-plan-format-conflict-"));
      roots.push(parent);
      const projectRoot = join(parent, "format-conflict");
      const resolved = fixture(testCase, "format-conflict");
      await runProjectInstall({
        projectName: resolved.config.name,
        projectRoot,
        config: resolved.config,
        desiredConfig: resolved.desiredConfig,
        resolvedConfig: resolved.resolvedConfig,
        options: options(parent, true),
        noInstall: true,
        requireAbsentTarget: true,
      });
      const state = await loadState(projectRoot);
      expect(state).toBeDefined();
      const relativeProbe = probePath(testCase);
      const absoluteProbe = join(projectRoot, ...relativeProbe.split("/"));
      writeFileSync(absoluteProbe, `${readFileSync(absoluteProbe, "utf8")}\n// user edit\n`);

      const plan = await buildReconcilePlan(projectRoot, state!, { operation: "upgrade" });
      expect(plan.rewrites.some(({ path }) => path === relativeProbe)).toBe(false);
      expect(plan.conflicts).toContainEqual(
        expect.objectContaining({ path: relativeProbe, reason: "content-hash-mismatch" }),
      );
    });

    test(`${testCase.mode}/${testCase.framework} formatter failure precedes every effect`, async () => {
      const parent = mkdtempSync(join(tmpdir(), "ghostinit-plan-format-failure-"));
      roots.push(parent);
      const projectRoot = join(parent, "format-failure");
      const resolved = fixture(testCase, "format-failure");
      const effects: string[] = [];
      const formatterError = new Error("formatter unavailable");

      await expect(
        runProjectInstall(
          {
            projectName: resolved.config.name,
            projectRoot,
            config: resolved.config,
            desiredConfig: resolved.desiredConfig,
            resolvedConfig: resolved.resolvedConfig,
            options: options(parent, true),
            noInstall: true,
            requireAbsentTarget: true,
          },
          {
            formatGenerationPlan: async () => {
              throw formatterError;
            },
            createTransaction: () => {
              effects.push("transaction");
              throw new Error("transaction must not be constructed");
            },
            acquireLock: async () => {
              effects.push("lock");
              throw new Error("lock must not be acquired");
            },
          },
        ),
      ).rejects.toBe(formatterError);
      expect(effects).toEqual([]);
      expect(existsSync(projectRoot)).toBe(false);
    });

    test(`${testCase.mode}/${testCase.framework} rejects post-plan formatter divergence and rolls back`, async () => {
      const parent = mkdtempSync(join(tmpdir(), "ghostinit-plan-format-divergence-"));
      roots.push(parent);
      const projectRoot = join(parent, "format-divergence");
      const resolved = fixture(testCase, "format-divergence");

      await expect(
        runProjectInstall(
          {
            projectName: resolved.config.name,
            projectRoot,
            config: resolved.config,
            desiredConfig: resolved.desiredConfig,
            resolvedConfig: resolved.resolvedConfig,
            options: options(parent, false),
            noInstall: false,
            requireAbsentTarget: true,
          },
          {
            runInstall: async () => undefined,
            runFormat: async (candidate) => {
              const path = join(candidate, ...probePath(testCase).split("/"));
              writeFileSync(path, `${readFileSync(path, "utf8")}\n// formatter divergence\n`);
            },
            runVerification: async () => undefined,
          },
        ),
      ).rejects.toThrow("Installed formatter output diverged from the canonical generation plan");
      expect(existsSync(projectRoot)).toBe(false);
    });
  }
});
