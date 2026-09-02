import { describe, expect, test } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator.js";

const PROVIDERS = ["stripe", "chargily", "paddle", "polar"] as const;
type Provider = (typeof PROVIDERS)[number];

function providerSelections(): Provider[][] {
  return Array.from({ length: 1 << PROVIDERS.length }, (_, mask) =>
    PROVIDERS.filter((_, index) => (mask & (1 << index)) !== 0),
  );
}

function addonsFor(
  selected: readonly Provider[],
  framework: "nextjs" | "tanstack-start",
  database: "postgres" | "convex" = "postgres",
) {
  return {
    billing: { inUse: selected.length > 0 },
    convex: { inUse: database === "convex" },
    nextjs: { inUse: framework === "nextjs" },
    "tanstack-start": { inUse: framework === "tanstack-start" },
    ...Object.fromEntries(
      PROVIDERS.map((provider) => [provider, { inUse: selected.includes(provider) }]),
    ),
  };
}

describe("generated billing provider registry closure", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} wires every provider selection with literal lazy imports`, () => {
          for (const selected of providerSelections()) {
            const files = billingFiles({
              mode,
              addons: addonsFor(selected, framework, database) as never,
            });
            const indexPath =
              mode === "monorepo" ? "packages/billing/src/index.ts" : "src/server/billing/index.ts";
            const index = files.find((file) => file.path === indexPath)?.content;

            if (selected.length === 0) {
              expect(index).toBeUndefined();
              expect(files.some((file) => file.path.includes("/billing/providers/"))).toBe(false);
              continue;
            }

            if (!index) throw new Error(`missing ${mode} billing index for ${selected.join(",")}`);
            const imported = Array.from(
              index.matchAll(/import\("\.\/providers\/(stripe|chargily|paddle|polar)"\)/g),
              (match) => match[1] as Provider,
            );
            expect(imported).toEqual(selected);
            expect(new Set(imported).size).toBe(selected.length);
            expect(index).not.toContain("import(`./providers/${provider}.js`)");
            expect(index).not.toMatch(
              /import\("\.\/providers\/(stripe|chargily|paddle|polar)\.js"\)/,
            );
            expect(index).not.toMatch(/import\([^"'][^)]*provider/);
            expect(index).toContain("export async function loadBillingRegistry");
            expect(index).toContain("export async function getBillingProvider");
            expect(index).toContain("export function createBillingProviderRegistry");
            expect(index).toContain("export const ALL_BILLING_PROVIDERS");

            const providerBase =
              mode === "monorepo"
                ? "packages/billing/src/providers/"
                : "src/server/billing/providers/";
            const emittedProviderEntries = files
              .filter((file) =>
                PROVIDERS.some((provider) => file.path === `${providerBase}${provider}.ts`),
              )
              .map((file) => file.path.slice(providerBase.length, -3) as Provider);
            expect(emittedProviderEntries.sort()).toEqual([...selected].sort());

            for (const provider of PROVIDERS) {
              const selectedProvider = selected.includes(provider);
              expect(index.includes(`./providers/${provider}"`)).toBe(selectedProvider);
              expect(
                files.some(
                  (file) =>
                    file.path === `${providerBase}${provider}.ts` ||
                    file.path.startsWith(`${providerBase}${provider}/`),
                ),
              ).toBe(selectedProvider);
            }
          }
        });
      }
    }
  }

  test("provider barrels expose only the exact extensionless local lazy-import closure", () => {
    const selected = [...PROVIDERS];
    const files = billingFiles({
      mode: "monorepo",
      addons: addonsFor(selected, "nextjs") as never,
    });
    const providerBase = "packages/billing/src/providers/";
    const expectedLocalImports: Record<Provider, string[]> = {
      stripe: [],
      chargily: [
        "./chargily/customer",
        "./chargily/operations",
        "./chargily/payment-link",
        "./chargily/product",
      ],
      paddle: [],
      polar: [],
    };

    for (const provider of PROVIDERS) {
      const providerFile = files.find((file) => file.path === `${providerBase}${provider}.ts`);
      if (!providerFile) throw new Error(`missing ${provider} provider barrel`);
      const localImports = Array.from(
        providerFile.content.matchAll(/import\("(\.\/[^"\n]+)"\)/g),
        (match) => match[1],
      );
      const uniqueLocalImports = [...new Set(localImports)].sort();
      expect(uniqueLocalImports).toEqual(expectedLocalImports[provider]);
      expect(localImports.some((specifier) => specifier.endsWith(".js"))).toBe(false);
      expect(providerFile.content).not.toMatch(/import\(`\.\/[^`]*\$\{/);
      for (const specifier of uniqueLocalImports) {
        expect(files.some((file) => file.path === `${providerBase}${specifier.slice(2)}.ts`)).toBe(
          true,
        );
      }
    }
  });
});
