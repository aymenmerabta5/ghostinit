import { describe, expect, test } from "bun:test";
import { posix } from "node:path";
import type { ProjectConfig } from "../../src/lib/config";
import { generateProjectFiles } from "../../src/templates/default";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

const MATRIX: ReadonlyArray<{ mode: Mode; framework: Framework }> = [
  { mode: "monorepo", framework: "nextjs" },
  { mode: "monorepo", framework: "tanstack-start" },
  { mode: "single", framework: "nextjs" },
  { mode: "single", framework: "tanstack-start" },
];

function config(mode: Mode, framework: Framework): ProjectConfig {
  return {
    name: "billing-routing",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    billing: ["stripe"],
    features: [],
    apps: ["web"],
  } as ProjectConfig;
}

function noBillingConfig(mode: Mode, framework: Framework): ProjectConfig {
  return {
    name: "billing-off-routing",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    preset: "custom",
    database: "postgres",
    auth: true,
    api: true,
    email: true,
    analytics: true,
    billing: [],
    messaging: true,
    features: [],
    apps: ["web"],
  } as ProjectConfig;
}

function importSpecifiers(source: string): string[] {
  const staticImports = source.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
  );
  const dynamicImports = source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g);
  return [...staticImports, ...dynamicImports].map((match) => match[1] ?? "");
}

function generatedImportCandidates(path: string, specifier: string, sourceRoot: string): string[] {
  const unresolved = specifier.startsWith("@/")
    ? `${sourceRoot}/${specifier.slice(2)}`
    : posix.normalize(posix.join(posix.dirname(path), specifier));
  const withoutJs = unresolved.replace(/\.js$/, "");
  return [
    unresolved,
    withoutJs,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${withoutJs}/index.ts`,
    `${withoutJs}/index.tsx`,
  ];
}

function formattedLineCount(path: string, source: string): number {
  const result = Bun.spawnSync([process.execPath, "x", "oxfmt", "--stdin-filepath", path], {
    stdin: new TextEncoder().encode(source),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  return new TextDecoder().decode(result.stdout).split(/\r?\n/).length;
}

describe("generated billing framework routing", () => {
  for (const { mode, framework } of MATRIX) {
    test(`${mode}/${framework} emits only its framework billing surface`, () => {
      const generated = generateProjectFiles(config(mode, framework), { dryRun: true });
      const byPath = new Map(generated.map((entry) => [entry.path, entry.content]));
      const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
      const nextPage = `${sourceRoot}/app/billing/page.tsx`;
      const tanstackPage = `${sourceRoot}/routes/billing.tsx`;
      const legacyRestBillingRoutes = generated
        .map(({ path }) => path)
        .filter(
          (path) =>
            path.startsWith(`${sourceRoot}/app/api/billing/`) ||
            path.startsWith(`${sourceRoot}/routes/api/billing/`),
        );
      expect(legacyRestBillingRoutes).toEqual([]);

      if (framework === "nextjs") {
        expect(byPath.has(nextPage)).toBe(true);
        expect(byPath.has(tanstackPage)).toBe(false);
        expect(byPath.get(nextPage)).toContain("export default function BillingPage");
        return;
      }

      const leakedNextBillingFiles = generated
        .map((entry) => entry.path)
        .filter((path) => path.startsWith(`${sourceRoot}/app/billing/`));
      expect(leakedNextBillingFiles).toEqual([]);
      expect(byPath.has(nextPage)).toBe(false);

      const route = byPath.get(tanstackPage);
      expect(route).toMatch(/createFileRoute\(["']\/billing["']\)/);
      expect(route).toContain("beforeLoad:");
      expect(route).toContain("loader:");
      expect(route).toContain("component: BillingPage");
      expect(route).toContain('import { BillingPage } from "@/features/billing/billing-page"');
      expect(byPath.has(`${sourceRoot}/features/billing/billing-page.tsx`)).toBe(true);

      const billingCode = generated.filter(
        ({ path }) =>
          path.startsWith(`${sourceRoot}/routes/billing`) ||
          path.startsWith(`${sourceRoot}/features/billing/`),
      );
      expect(billingCode.length).toBeGreaterThan(1);
      expect(
        billingCode.flatMap(({ path, content }) =>
          importSpecifiers(content)
            .filter((specifier) => specifier === "next" || specifier.startsWith("next/"))
            .map((specifier) => `${path} -> ${specifier}`),
        ),
      ).toEqual([]);

      const unresolvedImports = billingCode.flatMap(({ path, content }) =>
        importSpecifiers(content)
          .filter(
            (specifier) =>
              specifier.startsWith("./") ||
              specifier.startsWith("../") ||
              specifier.startsWith("@/"),
          )
          .filter(
            (specifier) =>
              !generatedImportCandidates(path, specifier, sourceRoot).some((candidate) =>
                byPath.has(candidate),
              ),
          )
          .map((specifier) => `${path} -> ${specifier}`),
      );
      expect(unresolvedImports).toEqual([]);
    });
  }

  test("monorepo TanStack keeps route orchestration and billing presentation below policy", () => {
    const generated = generateProjectFiles(config("monorepo", "tanstack-start"), { dryRun: true });
    for (const path of [
      "apps/web/src/routes/billing.tsx",
      "apps/web/src/features/billing/billing-empty-state.tsx",
      "apps/web/src/features/billing/billing-page.tsx",
    ]) {
      const source = generated.find((entry) => entry.path === path)?.content;
      expect(source, `${path} was not generated`).toBeDefined();
      expect(formattedLineCount(path, source ?? ""), path).toBeLessThanOrEqual(150);
    }
  });

  for (const { mode, framework } of MATRIX) {
    test(`${mode}/${framework} billing-off emits no billing runtime surface`, () => {
      const generated = generateProjectFiles(noBillingConfig(mode, framework), { dryRun: true });
      const runtimeLeaks = generated
        .filter(({ path }) => /\.[cm]?[jt]sx?$/.test(path))
        .filter(({ path, content }) => {
          const normalized = `/${path.replaceAll("\\", "/")}`;
          const billingPath =
            normalized.includes("/features/billing/") ||
            normalized.includes("/app/billing/") ||
            normalized.includes("/server/billing/") ||
            normalized.startsWith("/packages/billing/") ||
            /\/routes\/billing\.[cm]?[jt]sx?$/.test(normalized) ||
            /\/hooks\/use-billing\.[cm]?[jt]sx?$/.test(normalized);
          const billingImport = /from\s+["'](?:@repo\/billing|@\/server\/billing)(?:["'/]|$)/.test(
            content,
          );
          return billingPath || billingImport;
        })
        .map(({ path }) => path);

      expect(runtimeLeaks).toEqual([]);

      const billingNavigationLeaks = generated
        .filter(
          ({ path }) => /\.[cm]?[jt]sx$/.test(path) || /(?:^|\/)sitemap(?:\.xml|\.ts)$/.test(path),
        )
        .filter(({ content }) => content.includes('"/billing"') || content.includes("'/billing'"))
        .map(({ path }) => path);
      expect(billingNavigationLeaks).toEqual([]);
    });
  }
});
