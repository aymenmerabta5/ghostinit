import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { runProjectInstall } from "../../src/commands/create/installer.js";
import { buildAddonInstallerMap } from "../../src/lib/addons.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { Logger } from "../../src/lib/logger.js";
import { applyReconcilePlan, buildReconcilePlan } from "../../src/lib/reconcile.js";
import { loadState } from "../../src/lib/state.js";
import { componentFiles } from "../../src/templates/apps/components.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type Mode = "single" | "monorepo";
type Database = "postgres" | "convex";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (
      dirname(root) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith("ghostinit-manual-renderer-")
    ) {
      throw new Error("Refusing unowned manual renderer fixture cleanup");
    }
    rmSync(root, { recursive: true, force: true });
  }
});

function resolveManual(
  mode: Mode,
  database: Database,
  framework: "nextjs" | "tanstack-start" = "nextjs",
  mixed = false,
) {
  const result = resolveCreateConfig({
    name: "manual-renderer",
    runtime: "bun",
    mode,
    framework,
    database,
    databaseWasExplicit: true,
    apps: ["web"],
    billing: mixed ? ["manual", "chargily", "stripe"] : ["manual"],
    features: [],
    preset: "custom",
    cache: "none",
    deploy: "none",
  });
  if (!result.ok) throw new Error(result.message);
  return result;
}

function recipientConfigPath(mode: Mode, database: Database): string {
  return database === "convex"
    ? "convex/manualPaymentConfig.ts"
    : `${mode === "monorepo" ? "packages/billing/src" : "src/server/billing"}/manual-payment-config.ts`;
}

describe("manual billing renderer integration", () => {
  test("manual-only Next navigation exposes billing without a generic billing addon marker", () => {
    const addons = buildAddonInstallerMap({
      billing: ["manual"],
      features: [],
      database: "postgres",
      mode: "monorepo",
      preset: "custom",
    });
    expect(addons.billing?.inUse).not.toBe(true);
    const files = componentFiles(addons);
    expect(files.find(({ path }) => path.endsWith("/navigation-model.ts"))?.content).toContain(
      'path: "/billing"',
    );
    expect(files.find(({ path }) => path.endsWith("/header-user-menu.tsx"))?.content).toContain(
      'onNavigate("/billing")',
    );
  });

  for (const mode of ["single", "monorepo"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} attributes manual-only and mixed output without vendor leakage`, () => {
        for (const framework of ["nextjs", "tanstack-start"] as const) {
          for (const mixed of [false, true]) {
            const result = resolveManual(mode, database, framework, mixed);
            const plan = buildProjectGenerationPlan(result.resolvedConfig, {
              desiredConfig: result.desiredConfig,
            });
            const config = plan.files.find(
              ({ physicalPath }) => physicalPath === recipientConfigPath(mode, database),
            );
            expect(config?.lifecycle).toBe("seed-once");
            expect(config?.provenance.capability).toBe("billing");
            for (const file of plan.files.filter(({ physicalPath }) =>
              /(?:manual-payments?|^convex\/manualPayment)/.test(physicalPath),
            )) {
              expect(file.provenance.capability, file.physicalPath).toBe("billing");
            }
            expect(
              plan.files.some(({ physicalPath }) =>
                /(?:providers|webhooks)\/manual(?:\/|\.)/.test(physicalPath),
              ),
            ).toBe(false);
            const dependencies = new Set(
              plan.files
                .filter(({ physicalPath }) => physicalPath.endsWith("package.json"))
                .flatMap(({ content }) =>
                  Object.keys(
                    (JSON.parse(content) as { dependencies?: Record<string, string> })
                      .dependencies ?? {},
                  ),
                ),
            );
            expect(dependencies.has("stripe")).toBe(mixed);
            expect(dependencies.has("@chargily/chargily-pay")).toBe(mixed);
            for (const vendor of [
              "@paddle/paddle-node-sdk",
              "@paddle/paddle-js",
              "@polar-sh/sdk",
              "manual",
            ])
              expect(dependencies.has(vendor), vendor).toBe(false);
            if (database === "postgres") {
              const schemaPath =
                mode === "monorepo"
                  ? "packages/database/src/schema/index.ts"
                  : "src/server/db/schema/index.ts";
              expect(
                plan.files.find(({ physicalPath }) => physicalPath === schemaPath)?.content,
              ).toContain("manual-payments");
            }
          }
        }
      });
    }
  }

  for (const [mode, database] of [
    ["monorepo", "postgres"],
    ["single", "postgres"],
    ["monorepo", "convex"],
  ] as const) {
    test(`${mode}/${database} sync and upgrade preserve configured recipient instructions`, async () => {
      const parent = mkdtempSync(join(realpathSync.native(tmpdir()), "ghostinit-manual-renderer-"));
      roots.push(parent);
      const root = join(parent, "manual-renderer");
      const result = resolveManual(mode, database);
      await runProjectInstall({
        projectName: "manual-renderer",
        projectRoot: root,
        desiredConfig: result.desiredConfig,
        resolvedConfig: result.resolvedConfig,
        noInstall: true,
        requireAbsentTarget: true,
        options: {
          cwd: parent,
          yes: true,
          noInstall: true,
          dryRun: false,
          force: false,
          json: false,
          runtime: "bun",
          check: false,
          logger: new Logger({ quiet: true }),
        },
      });
      const path = recipientConfigPath(mode, database);
      const original = readFileSync(join(root, path), "utf8");
      const edited = original
        .replace("enabled: false", "enabled: true")
        .replace(
          'receiverInstructions: ""',
          'receiverInstructions: "Send to our configured business account"',
        );
      expect(edited).not.toBe(original);
      const transaction = new FsTransaction(root);
      await transaction.writeIfUnchanged(path, edited, original);
      await transaction.commit();
      for (const operation of ["sync", "upgrade"] as const) {
        const state = await loadState(root);
        if (!state) throw new Error("Generated manual fixture state missing");
        const plan = await buildReconcilePlan(root, state, { operation });
        expect(plan.conflicts.filter((conflict) => conflict.path === path)).toEqual([]);
        expect(plan.preserved).toContain(path);
        await applyReconcilePlan(root, state, plan, operation);
        expect(readFileSync(join(root, path), "utf8")).toBe(edited);
        expect((await loadState(root))?.files[path]?.lifecycle).toBe("seed-once");
      }
    });
  }
});
