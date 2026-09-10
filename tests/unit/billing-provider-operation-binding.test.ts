import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import {
  SUPPORT_CATALOG,
  billingProvidersForClientOperation,
  getEffectiveCapabilityClientBinding,
} from "../../src/domain/capabilities/index.js";
import { assertClientSurfaceCoverage } from "../../src/domain/generation/surface-validation.js";
import { GenerationPlanError } from "../../src/domain/generation/plan-validation.js";
import { BILLING_PROVIDERS, ONLINE_BILLING_PROVIDERS } from "../../src/domain/project/choices.js";
import { billingClientProviderOptions } from "../../src/templates/apps/fragments/billing/client-capabilities.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import { realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

describe.each(["stripe", "paddle", "polar"] as const)("%s billing selection", (globalProvider) => {
  describe("provider-specific billing operation promises", () => {
    for (const mode of ["monorepo", "single"] as const) {
      test(`${mode} generated provider metadata typechecks every advertised operation`, async () => {
        const resolution = resolveCreateConfig({
          name: "billing-metadata-types",
          runtime: "bun",
          mode,
          framework: "tanstack-start",
          database: "convex",
          databaseWasExplicit: true,
          apps: ["web"],
          billing: ["chargily", globalProvider],
          features: [],
          preset: "saas",
          cache: "none",
          deploy: "cloudflare",
        });
        if (!resolution.ok) throw new Error(resolution.message);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
          desiredConfig: resolution.desiredConfig,
        });
        const metadata = plan.files.find((file) =>
          file.physicalPath.endsWith("src/features/billing/provider-options.ts"),
        );
        const model = plan.files.find((file) =>
          file.physicalPath.endsWith("src/features/billing/model.ts"),
        );
        expect(metadata).toBeDefined();
        expect(model).toBeDefined();
        const root = createTemporaryWorkspace("ghostinit-billing-options-");
        let failure: unknown;
        try {
          const transaction = new FsTransaction(root);
          // Compile the emitted metadata with its actual pure model dependency.
          await transaction.write("provider-options.ts", metadata!.content);
          await transaction.write("model.ts", model!.content);
          await transaction.write(
            "tsconfig.json",
            JSON.stringify({
              compilerOptions: {
                target: "ES2022",
                module: "ESNext",
                moduleResolution: "bundler",
                noEmit: true,
                strict: true,
                types: [],
              },
              include: ["*.ts"],
            }),
          );
          await transaction.commit();
          const node = Bun.which("node");
          if (!node) throw new Error("Node is required for generated TypeScript acceptance");
          const result = Bun.spawnSync(
            [
              node,
              resolve(import.meta.dir, "../../node_modules/typescript/bin/tsc"),
              "--pretty",
              "false",
            ],
            { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
          );
          expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(0);
        } catch (error) {
          failure = error;
        }
        try {
          if (
            dirname(root) !== realpathSync.native(tmpdir()) ||
            !basename(root).startsWith("ghostinit-billing-options-")
          ) {
            throw new Error("Refusing unowned billing metadata fixture cleanup");
          }
          rmSync(root, { recursive: true, force: true });
        } catch (error) {
          failure ??= error;
        }
        if (failure !== undefined) throw failure;
      });
    }

    test("domain support and emitted UI controls agree for each provider", () => {
      expect(SUPPORT_CATALOG.billingProviderClientBindings.map(({ provider }) => provider)).toEqual(
        [...BILLING_PROVIDERS],
      );
      expect(billingProvidersForClientOperation("billing.portal.v1")).toEqual([
        "stripe",
        "paddle",
        "polar",
      ]);
      expect(billingProvidersForClientOperation("billing.payment-link.v1")).toEqual(["chargily"]);
      expect(billingProvidersForClientOperation("billing.unknown.v1")).toEqual([]);
      for (const option of billingClientProviderOptions(ONLINE_BILLING_PROVIDERS)) {
        for (const target of ["nextjs", "tanstack-start", "expo", "electron"] as const) {
          const binding = getEffectiveCapabilityClientBinding({
            capability: "billing",
            target,
            database: "postgres",
            billingProviders: [option.id],
          });
          expect(binding.requiredOperationIds.includes("billing.portal.v1")).toBe(option.portal);
          expect(binding.requiredOperationIds.includes("billing.payment-link.v1")).toBe(
            option.paymentLink,
          );
          expect(binding.requiredOperationIds).toContain("billing.checkout.v1");
        }
      }
    });

    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const provider of ["stripe", "chargily"] as const) {
        test(`${framework}/${provider} requires its real operations across all app targets`, () => {
          const resolution = resolveCreateConfig({
            name: "billing-provider-binding",
            runtime: "bun",
            mode: "monorepo",
            framework,
            database: "postgres",
            databaseWasExplicit: true,
            apps: ["web", "mobile", "desktop"],
            billing: [provider],
            features: [],
            preset: "custom",
            cache: "none",
            deploy: "none",
            withAuth: true,
            withApi: true,
            withAnalytics: false,
            withEmail: false,
          });
          if (!resolution.ok) throw new Error(resolution.message);
          const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
            desiredConfig: resolution.desiredConfig,
          });
          const required = provider === "stripe" ? "billing.portal.v1" : "billing.payment-link.v1";
          const unavailable =
            provider === "stripe" ? "billing.payment-link.v1" : "billing.portal.v1";
          const billingFiles = plan.files.filter(
            ({ provenance }) => provenance.capability === "billing",
          );
          for (const app of resolution.resolvedConfig.apps) {
            const operations = billingFiles
              .filter(({ provenance }) => provenance.appId === app.id)
              .flatMap(({ provenance }) => provenance.acceptance);
            expect(operations).toContain(required);
            expect(operations).not.toContain(unavailable);
          }
          expect(() => assertClientSurfaceCoverage(resolution.resolvedConfig, plan)).not.toThrow();
          const incomplete = {
            ...plan,
            files: plan.files.map((file) => ({
              ...file,
              provenance: {
                ...file.provenance,
                acceptance: file.provenance.acceptance.filter(
                  (operation) => operation !== required,
                ),
              },
            })),
          };
          try {
            assertClientSurfaceCoverage(resolution.resolvedConfig, incomplete);
            throw new Error("Missing selected-provider operation was accepted");
          } catch (error) {
            expect(error).toBeInstanceOf(GenerationPlanError);
            expect(error).toMatchObject({
              code: "missing-client-surface-artifact",
              details: { capability: "billing", missingOperations: required },
            });
          }
        });
      }
    }

    test("mixed providers retain both merchant links and customer portals", () => {
      const binding = getEffectiveCapabilityClientBinding({
        capability: "billing",
        target: "nextjs",
        database: "convex",
        billingProviders: ["stripe", "chargily"],
      });
      expect(binding.requiredOperationIds).toContain("billing.portal.v1");
      expect(binding.requiredOperationIds).toContain("billing.payment-link.v1");
    });
  });
});
