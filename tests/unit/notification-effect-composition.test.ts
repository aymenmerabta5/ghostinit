import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { analyzeProjectReport } from "../../src/lib/architecture/index.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

describe("shared notification effect guard composition", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const withBilling of [false, true]) {
        test(`${mode}/${framework}/billing-${withBilling} emits one shared hook per app`, async () => {
          const result = resolveCreateConfig({
            name: "notification-owner",
            runtime: "bun",
            mode,
            framework,
            database: "postgres",
            databaseWasExplicit: true,
            preset: "saas",
            billing: withBilling ? ["stripe"] : [],
            apps: mode === "single" ? ["web"] : ["web", "mobile", "desktop"],
            features: [],
            cache: "none",
            deploy: "none",
            withNotifications: true,
          });
          if (!result.ok) throw new Error(result.message);
          const plan = buildProjectGenerationPlan(result.resolvedConfig, {
            desiredConfig: result.desiredConfig,
          });
          const roots =
            mode === "single"
              ? ["src"]
              : ["apps/web/src", "apps/mobile/src", "apps/desktop/src/renderer"];
          for (const sourceRoot of roots) {
            const guards = plan.files.filter(
              (file) => file.physicalPath === `${sourceRoot}/hooks/use-auth-owned-effect.ts`,
            );
            expect(guards).toHaveLength(1);
            expect(guards[0]!.provenance.capability).not.toBe("billing");
            expect(
              plan.files.some((file) => file.physicalPath === `${sourceRoot}/lib/query-client.ts`),
            ).toBe(true);
            expect(
              plan.files.find(
                (file) => file.physicalPath === `${sourceRoot}/features/notifications/page.tsx`,
              )?.content,
            ).toContain('from "./use-notification-workspace"');
            expect(
              plan.files.find(
                (file) =>
                  file.physicalPath ===
                  `${sourceRoot}/features/notifications/use-notification-workspace.ts`,
              )?.content,
            ).toContain('from "@/hooks/use-auth-owned-mutation"');
            const mutationGuards = plan.files.filter(
              (file) => file.physicalPath === `${sourceRoot}/hooks/use-auth-owned-mutation.ts`,
            );
            expect(mutationGuards).toHaveLength(1);
            expect(mutationGuards[0]!.content).toContain('from "./use-auth-owned-effect"');
          }
          if (withBilling) return;
          const root = mkdtempSync(join(tmpdir(), "ghostinit-notification-effects-"));
          const target = resolve(root);
          if (
            dirname(target) !== resolve(tmpdir()) ||
            !basename(target).startsWith("ghostinit-notification-effects-")
          )
            throw new Error("Unsafe notification fixture cleanup");
          try {
            const transaction = new FsTransaction(root);
            for (const file of plan.files) await transaction.write(file.physicalPath, file.content);
            await transaction.commit();
            const report = await analyzeProjectReport(root);
            expect(report.complete).toBe(true);
            expect(
              report.findings.filter(
                (finding) => finding.severity === "HIGH" || finding.severity === "BLOCKER",
              ),
              JSON.stringify(report.findings, null, 2),
            ).toEqual([]);
          } finally {
            rmSync(target, { recursive: true, force: true });
          }
        });
      }
    }
  }
});
