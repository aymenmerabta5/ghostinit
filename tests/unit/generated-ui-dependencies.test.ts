import { describe, expect, test } from "bun:test";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import * as versions from "../../packages/versions/src/index.js";

function config(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
): ProjectConfig {
  return {
    name: "ui-dependency-contract",
    runtime: "bun",
    version: "0.1.0",
    mode,
    billing: [],
    features: [],
    database: "postgres",
    framework,
    apps: ["web"],
    preset: "saas",
  };
}

describe("generated web UI dependency contract", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} declares the Sonner and Recharts 3 dependency closure`, () => {
        const files = generateProjectFiles(config(mode, framework), { dryRun: false });
        const manifestPath = mode === "monorepo" ? "apps/web/package.json" : "package.json";
        const manifest = JSON.parse(
          files.find(({ path }) => path === manifestPath)?.content ?? "{}",
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };

        expect(manifest.dependencies?.sonner).toBe(versions.ui.sonner);
        expect(manifest.dependencies?.recharts).toBe(versions.ui.recharts);
        expect(manifest.dependencies?.["react-is"]).toBe(versions.ui["react-is"]);
        expect(manifest.devDependencies?.["@types/react-is"]).toBe(versions.ui["@types/react-is"]);

        const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
        const toaster =
          files.find(({ path }) => path === `${sourceRoot}/components/ui/sonner.tsx`)?.content ??
          "";
        const chart =
          files.find(({ path }) => path === `${sourceRoot}/components/ui/chart.tsx`)?.content ?? "";

        expect(toaster).toContain(
          'import { Toaster as SonnerToaster, type ToasterProps as SonnerToasterProps } from "sonner"',
        );
        expect(toaster).toContain("export type ToasterProps = SonnerToasterProps");
        expect(toaster).toContain("theme={theme}");
        expect(toaster).toContain("toastOptions={{");
        expect(chart).toContain('data-slot="chart"');
      });
    }
  }
});
