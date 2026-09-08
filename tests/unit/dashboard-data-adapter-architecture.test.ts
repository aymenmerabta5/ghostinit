import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { analyzeProjectReport } from "../../src/lib/architecture/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("generated dashboard data-adapter architecture", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        for (const api of [true, false]) {
          test(`${mode}/${framework}/${database}/api=${api} keeps remote identity reads in its query adapter`, async () => {
            const resolved = resolveCreateConfig({
              name: "dashboard-boundary",
              runtime: "bun",
              mode,
              framework,
              database,
              databaseWasExplicit: true,
              apps: ["web"],
              preset: "custom",
              cache: "none",
              deploy: "none",
              billing: [],
              features: [],
              withAuth: true,
              withApi: api,
            });
            if (!resolved.ok) throw new Error(resolved.message);
            const plan = buildProjectGenerationPlan(resolved.resolvedConfig, {
              desiredConfig: resolved.desiredConfig,
            });
            const root = createTemporaryWorkspace("ghostinit-dashboard-boundary-");
            roots.push(root);
            const transaction = new FsTransaction(root);
            for (const file of plan.files) await transaction.write(file.physicalPath, file.content);
            await transaction.commit();

            const report = await analyzeProjectReport(root);
            expect(report.complete, JSON.stringify(report.findings)).toBe(true);
            const dashboardRoot = `${mode === "monorepo" ? "apps/web/src" : "src"}/features/dashboard/`;
            const dashboardFindings = report.findings.filter(({ file }) =>
              file.replaceAll("\\", "/").startsWith(dashboardRoot),
            );
            expect(dashboardFindings, JSON.stringify(dashboardFindings)).toEqual([]);
            expect(
              plan.files.some(({ physicalPath }) => physicalPath === dashboardRoot + "queries.ts"),
            ).toBe(true);
          });
        }
      }
    }
  }
});
