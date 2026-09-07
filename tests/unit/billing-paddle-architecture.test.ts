import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { analyzeProjectReport } from "../../src/lib/architecture/index.js";
import { getLayerFromFilePath } from "../../src/lib/architecture/rules/layer-policy.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    const target = resolve(root);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("ghostinit-paddle-architecture-")
    )
      throw new Error("Unsafe architecture fixture cleanup");
    rmSync(target, { recursive: true, force: true });
  }
});

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-paddle-architecture-"));
  roots.push(root);
  return root;
}

describe("Paddle application-owned adapter architecture", () => {
  for (const mode of ["single", "monorepo"] as const)
    for (const framework of ["nextjs", "tanstack-start"] as const)
      for (const profile of [
        { database: "postgres", deploy: "none" },
        { database: "convex", deploy: "cloudflare" },
      ] as const) {
        test(`${mode}/${framework}/${profile.database} generated source passes the real architecture analyzer`, async () => {
          const result = resolveCreateConfig({
            name: "paddle-architecture",
            runtime: "bun",
            mode,
            framework,
            database: profile.database,
            databaseWasExplicit: true,
            preset: "saas",
            billing: ["paddle"],
            apps: ["web"],
            features: [],
            cache: "none",
            deploy: profile.deploy,
          });
          if (!result.ok) throw new Error(result.message);
          const plan = buildProjectGenerationPlan(result.resolvedConfig, {
            desiredConfig: result.desiredConfig,
          });
          const base = mode === "monorepo" ? "apps/web/" : "";
          const paths = new Set(plan.files.map((file) => file.physicalPath));
          expect(paths.has(`${base}src/adapters/billing/paddle.ts`)).toBe(true);
          expect(paths.has(`${base}src/contracts/billing.ts`)).toBe(true);
          expect(paths.has(`${base}src/server/billing/paddle-checkout.ts`)).toBe(true);
          expect(paths.has(`${base}src/features/billing/paddle-checkout-client.ts`)).toBe(false);
          expect(paths.has(`${base}src/features/billing/paddle-checkout.server.ts`)).toBe(false);
          expect(paths.has(`${base}src/features/billing/paddle-checkout-functions.ts`)).toBe(false);
          const contracts = plan.files.find(
            (file) => file.physicalPath === `${base}src/contracts/billing.ts`,
          )!.content;
          expect(contracts).not.toMatch(/@paddle|process\.|server-only/);
          const root = createRoot();
          const transaction = new FsTransaction(root);
          for (const file of plan.files) await transaction.write(file.physicalPath, file.content);
          await transaction.commit();
          const report = await analyzeProjectReport(root);
          expect(report.complete, JSON.stringify(report.findings, null, 2)).toBe(true);
          expect(
            report.findings.filter(
              (finding) => finding.severity === "HIGH" || finding.severity === "BLOCKER",
            ),
            JSON.stringify(report.findings, null, 2),
          ).toEqual([]);
        });
      }

  test("classifies the exact browser seam and neutral contracts without relaxing feature placement", () => {
    for (const base of ["", "apps/web/"]) {
      expect(getLayerFromFilePath(`${base}src/adapters/billing/paddle.ts`)?.name).toBe("Transport");
      expect(getLayerFromFilePath(`${base}src/contracts/billing.ts`)?.name).toBe("Supporting");
      expect(getLayerFromFilePath(`${base}src/features/billing/paddle.ts`)?.name).toBe("UI");
    }
  });

  for (const mode of ["single", "monorepo"] as const) {
    test(`${mode} retains direct-feature, Paddle Node SDK, and server-helper leak rejection`, async () => {
      const root = createRoot();
      const transaction = new FsTransaction(root);
      const base = mode === "monorepo" ? "apps/web/" : "";
      await transaction.write(
        `${base}package.json`,
        JSON.stringify({
          name: "web",
          private: true,
          dependencies: {
            "@paddle/paddle-js": "1.6.5",
            "@paddle/paddle-node-sdk": "3.10.0",
            "server-only": "0.0.1",
          },
        }),
      );
      await transaction.write(
        `${base}tsconfig.json`,
        JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
      );
      await transaction.write(
        `${base}src/features/billing/direct-sdk.ts`,
        '"use client"; import { initializePaddle } from "@paddle/paddle-js"; export const open = initializePaddle;',
      );
      await transaction.write(
        `${base}src/adapters/billing/paddle.ts`,
        '"use client"; import { Paddle } from "@paddle/paddle-node-sdk"; export const unsafe = Paddle;',
      );
      await transaction.write(
        `${base}src/server/billing/paddle-checkout.ts`,
        'import "server-only"; export const privateConfig = "server-owned";',
      );
      await transaction.write(
        `${base}src/features/billing/server-leak.ts`,
        '"use client"; import { privateConfig } from "@/server/billing/paddle-checkout"; export const unsafe = privateConfig;',
      );
      await transaction.commit();
      const report = await analyzeProjectReport(root);
      const high = report.findings.filter((finding) => finding.severity === "HIGH");
      expect(
        high.some(
          (finding) =>
            finding.file.endsWith("features/billing/direct-sdk.ts") &&
            finding.rule === "vendor-isolation",
        ),
      ).toBe(true);
      expect(
        high.some(
          (finding) =>
            finding.file.endsWith("adapters/billing/paddle.ts") &&
            finding.id === "client-imports-server-only",
        ),
      ).toBe(true);
      expect(
        high.some(
          (finding) =>
            finding.file.endsWith("features/billing/server-leak.ts") &&
            finding.id === "client-transitive-server-import",
        ),
      ).toBe(true);
    });
  }
});
