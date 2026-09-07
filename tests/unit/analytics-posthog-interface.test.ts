import { describe, expect, test } from "bun:test";
import { analytics as analyticsVersions } from "../../packages/versions/src/index.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

function config(mode: Mode, framework: Framework, apps: ProjectConfig["apps"]): ProjectConfig {
  return projectConfigSchema.parse({
    name: "posthog-interface",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    apps,
    billing: [],
    features: [],
    analytics: true,
  });
}

function content(files: ReturnType<typeof generateProjectFiles>, path: string): string {
  const source = files.find((file) => file.path === path)?.content;
  if (source === undefined) throw new Error(`Missing generated analytics source: ${path}`);
  return source;
}

describe("generated PostHog public client contract", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const appSets: Array<Array<"web" | "mobile" | "desktop">> =
        mode === "monorepo" ? [["web"], ["mobile"], ["web", "mobile", "desktop"]] : [["web"]];
      for (const apps of appSets) {
        test(`${mode}/${framework}/${apps.join(",")} uses PostHogInterface across client state`, () => {
          const files = generateProjectFiles(config(mode, framework, [...apps]));
          const paths =
            mode === "monorepo"
              ? [
                  "packages/analytics/src/client/posthog-client.ts",
                  "packages/analytics/src/client/context.tsx",
                  "packages/analytics/src/client/provider.tsx",
                ]
              : [
                  "src/lib/analytics.ts",
                  "src/components/analytics/posthog-context.tsx",
                  "src/components/analytics/posthog-provider.tsx",
                ];
          const sources = paths.map((path) => content(files, path));
          const combined = sources.join("\n");
          const clientConfigPath =
            mode === "monorepo"
              ? "packages/analytics/src/client/config.ts"
              : "src/lib/analytics-config.ts";
          const clientConfig = content(files, clientConfigPath);
          const scopedConfigPath =
            mode === "monorepo"
              ? `packages/config/src/${framework === "nextjs" ? "next" : "vite"}.ts`
              : `src/lib/env/${framework === "nextjs" ? "next" : "vite"}.ts`;
          const scopedConfig = content(files, scopedConfigPath);
          const manifestPath =
            mode === "monorepo" ? "packages/analytics/package.json" : "package.json";
          const manifest = JSON.parse(content(files, manifestPath)) as {
            dependencies?: Record<string, string>;
          };

          expect(manifest.dependencies?.["posthog-js"]).toBe(analyticsVersions["posthog-js"]);
          expect(combined).toContain("PostHogInterface");
          expect(combined).not.toContain('type { PostHog } from "posthog-js"');
          expect(combined).not.toMatch(/\bPostHog\s*\|\s*null\b/);
          expect(combined).not.toContain("as PostHogInterface");
          expect(combined).not.toMatch(/\bas\s+any\b/);
          expect(sources[0]).toContain("window.posthog = ph");
          expect(sources[0]).toContain("posthog?: PostHogInterface");
          expect(clientConfig).toContain(
            framework === "nextjs"
              ? mode === "monorepo"
                ? 'from "@repo/config/next"'
                : 'from "@/lib/env/next"'
              : mode === "monorepo"
                ? 'from "@repo/config/vite"'
                : 'from "@/lib/env/vite"',
          );
          expect(clientConfig).toContain("import { env, isDevelopment }");
          expect(clientConfig).toContain("const isDev = isDevelopment;");
          expect(clientConfig).not.toContain("import.meta.env");
          expect(clientConfig).not.toContain("process.env");
          expect(scopedConfig).toContain("export const isDevelopment =");
          if (framework === "tanstack-start") {
            expect(scopedConfig).toContain("readonly DEV?: boolean;");
            expect(scopedConfig).toContain("viteEnv.DEV === true");
          }
          if (mode === "monorepo" && apps.includes("mobile")) {
            expect(content(files, "packages/config/src/expo.ts")).toContain(
              'export const isDevelopment = process.env.NODE_ENV !== "production";',
            );
          }
        });
      }
    }
  }
});
