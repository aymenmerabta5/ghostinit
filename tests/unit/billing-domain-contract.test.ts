import { describe, expect, test } from "bun:test";
import { posix } from "node:path";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { checkLayeredDependency } from "../../src/lib/architecture/rules/layered.js";
import type { ArchitectureFinding } from "../../src/lib/architecture/types.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { BILLING_PROVIDER_NAMES } from "../../src/templates/billing/domain/model.js";
import { BILLING_PROVIDER_NAMES as providerNames } from "../../src/templates/billing/providers/interface.js";
import { BILLING_PROVIDER_NAMES as splitProviderNames } from "../../src/templates/billing/providers/interface/types.js";

describe("domain-owned billing contracts", () => {
  test("existing provider entrypoints preserve the canonical provider values", () => {
    expect(providerNames).toBe(BILLING_PROVIDER_NAMES);
    expect(splitProviderNames).toBe(BILLING_PROVIDER_NAMES);
  });

  for (const globalProvider of ["stripe", "paddle", "polar"] as const)
    for (const mode of ["single", "monorepo"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          test(`${globalProvider}/${mode}/${framework}/${database} emits domain contracts without provider dependencies`, () => {
            const result = resolveCreateConfig({
              name: "billing-domain",
              runtime: "bun",
              mode,
              framework,
              database,
              databaseWasExplicit: true,
              preset: "saas",
              billing: ["chargily", globalProvider],
              apps: ["web"],
              features: [],
              cache: "none",
              deploy: "none",
            });
            if (!result.ok) throw new Error(result.message);
            const plan = buildProjectGenerationPlan(result.resolvedConfig, {
              desiredConfig: result.desiredConfig,
            });
            const base = mode === "single" ? "src/server/billing" : "packages/billing/src";
            const files = new Map(plan.files.map((file) => [file.physicalPath, file.content]));
            const findings: ArchitectureFinding[] = [];
            for (const name of ["model", "inputs", "ports", "types"]) {
              const path = `${base}/domain/${name}.ts`;
              const content = files.get(path);
              expect(content, path).toBeDefined();
              const parsed = parseFile(content!, "ts");
              expect(parsed.diagnostics).toEqual([]);
              for (const reference of parsed.importReferences) {
                const target = posix.normalize(
                  posix.join(posix.dirname(path), reference.specifier),
                );
                expect(target.startsWith(`${base}/domain/`), `${path} -> ${target}`).toBe(true);
                const sourceTarget = `${target.replace(/\.(?:js|ts)$/, "")}.ts`;
                expect(files.has(sourceTarget), target).toBe(true);
                checkLayeredDependency(findings, path, path, reference.specifier, target);
              }
            }
            expect(findings).toEqual([]);
            for (const name of ["types", "inputs", "ports"]) {
              const path = `${base}/providers/interface/${name}.ts`;
              const parsed = parseFile(files.get(path)!, "ts");
              expect(parsed.importReferences.length).toBeGreaterThan(0);
              for (const reference of parsed.importReferences) {
                expect(reference.specifier.startsWith("../../domain/")).toBe(true);
              }
            }
          });
        }
      }
    }
});
