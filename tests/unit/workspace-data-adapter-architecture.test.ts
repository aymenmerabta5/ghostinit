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

describe("generated workspace data-adapter ownership", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} keeps all remote reads in queries.ts`, async () => {
          const resolved = resolveCreateConfig({
            name: "workspace-query-boundary",
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
            withApi: true,
          });
          if (!resolved.ok) throw new Error(resolved.message);
          const plan = buildProjectGenerationPlan(resolved.resolvedConfig, {
            desiredConfig: resolved.desiredConfig,
          });
          const root = createTemporaryWorkspace("ghostinit-workspace-query-boundary-");
          roots.push(root);
          const transaction = new FsTransaction(root);
          for (const file of plan.files) await transaction.write(file.physicalPath, file.content);
          await transaction.commit();

          const report = await analyzeProjectReport(root);
          expect(report.complete, JSON.stringify(report.findings)).toBe(true);
          const feature = `${mode === "single" ? "src" : "apps/web/src"}/features/identity-workspace/`;
          const findings = report.findings.filter((finding) =>
            finding.file.replaceAll("\\", "/").startsWith(feature),
          );
          expect(findings, JSON.stringify(findings)).toEqual([]);
          const files = new Map(plan.files.map((file) => [file.physicalPath, file.content]));
          const queries = files.get(feature + "queries.ts")!;
          expect(queries).toContain('from "@tanstack/react-query"');
          expect(queries).toContain("orpc.identity.organizations.hasPermission.queryOptions");
          expect(queries).toContain("permissions.canReadInvitations");
          expect(files.get(feature + "permissions.ts")).not.toMatch(
            /@tanstack\/react-query|@\/lib\/orpc|useQueries?\(|refetch|Promise\.all/,
          );
          expect(files.has(feature + "load-initial-workspace.ts")).toBe(false);
          if (framework === "tanstack-start") {
            expect(queries).toContain('from "@/lib/server-functions"');
            expect(queries).toContain("return await getInitialIdentityWorkspace()");
          }
        });
      }
    }
  }
});
