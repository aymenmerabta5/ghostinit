import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type Mode = "single" | "monorepo";
type Deploy = "none" | "vercel" | "docker" | "fly" | "cloudflare";

function generate(
  mode: Mode,
  deploy: Deploy,
  i18n: boolean,
  database: "convex" | "none" = "convex",
  cache: "none" | "redis" = "none",
) {
  const resolution = resolveCreateConfig({
    name: "worker-cache-compatibility",
    runtime: "bun",
    mode,
    framework: "nextjs",
    database,
    databaseWasExplicit: true,
    billing: [],
    apps: ["web"],
    features: [],
    preset: "custom",
    cache,
    deploy,
    withAuth: database === "convex",
    withApi: true,
    withI18n: i18n,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  return buildProjectGenerationPlan(resolution.resolvedConfig, {
    desiredConfig: resolution.desiredConfig,
  });
}

function read(plan: ReturnType<typeof generate>, path: string): string {
  const file = plan.files.find((entry) => entry.physicalPath === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.content;
}

function evaluateConfig(source: string): { cacheComponents: boolean } {
  // Only external config wrappers are supplied; the emitted object and its
  // composition execute unchanged. Real adapters remain covered by Worker builds.
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const executable = javascript
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/export default ([\s\S]*?);\s*$/, "return $1;");
  return new Function("initOpenNextCloudflareForDev", "createNextIntlPlugin", executable)(
    () => {},
    () => (config: unknown) => config,
  ) as { cacheComponents: boolean };
}

describe("Cloudflare Next Cache Components compatibility", () => {
  for (const mode of ["single", "monorepo"] as const) {
    const configPath = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";

    for (const deploy of ["none", "vercel", "docker", "fly", "cloudflare"] as const) {
      for (const i18n of [false, true]) {
        test(`${mode}/${deploy}/i18n=${i18n} scopes the effective flag to the deployment target`, () => {
          const plan = generate(mode, deploy, i18n);
          const source = read(plan, configPath);
          expect(evaluateConfig(source).cacheComponents).toBe(deploy !== "cloudflare");
          expect(source.match(/cacheComponents:/g)).toHaveLength(1);
          expect(source).toContain("X-Content-Type-Options");
          expect(source).toContain("X-Frame-Options");
          expect(source).toContain("Content-Security-Policy");
          expect(source).toContain("convexConnectSources");
          if (deploy === "cloudflare") {
            expect(source).toContain("request-bound Suspense in workerd");
            const guide = read(plan, "docs/CLOUDFLARE_DEPLOYMENT.md");
            expect(guide).toContain("Next.js 16.3.3 with OpenNext Cloudflare 1.20.2");
            expect(guide).toContain("OpenNext generally supports SSR, PPR, and composable caching");
            expect(guide).toContain("application `--cache redis` capability");
          } else {
            expect(source).toContain("static shells and Partial Prerendering");
          }
        });
      }
    }

    test(`${mode} also disables the flag for the database-free Cloudflare profile`, () => {
      const plan = generate(mode, "cloudflare", false, "none");
      expect(evaluateConfig(read(plan, configPath)).cacheComponents).toBe(false);
    });

    test(`${mode} preserves the independent Redis application cache`, () => {
      const worker = generate(mode, "cloudflare", true, "convex", "redis");
      const standard = generate(mode, "none", true, "convex", "redis");
      const cachePath = mode === "monorepo" ? "packages/cache/src/index.ts" : "src/server/cache.ts";
      expect(read(worker, cachePath)).toContain('from "@upstash/redis"');
      expect(read(worker, cachePath)).toBe(read(standard, cachePath));
      const openNext = read(
        worker,
        mode === "monorepo" ? "apps/web/open-next.config.ts" : "open-next.config.ts",
      );
      expect(openNext).toContain("r2IncrementalCache");
      expect(openNext).toContain("doQueue");
      expect(openNext).toContain("doShardedTagCache");
    });
  }
});
