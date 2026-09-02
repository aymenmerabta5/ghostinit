/**
 * Snapshot / golden tests for generated projects.
 *
 * Complements generation-matrix which checks structural invariants across 12 corners.
 * This file checks content stability for 2 stable corners (monorepo/next and single/next)
 * and ensures deploy / env / template-validation integration.
 */

import { describe, it, expect } from "bun:test";
import { auth as authVersions, runtime } from "../../packages/versions/src/index.ts";
import { generateProjectFiles } from "../../src/templates/default.ts";
import type { ProjectConfig } from "../../src/lib/config.ts";
import { validateGeneratedFiles } from "../../src/lib/template-validator.ts";

function cfg(partial: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
    ...partial,
  } as ProjectConfig;
}

describe("generation snapshots", () => {
  it("monorepo/next/postgres default emits expected core files and parses", () => {
    const files = generateProjectFiles(cfg({}));
    const paths = files.map((f) => f.path).sort();
    // Core files must exist
    expect(paths).toContain("package.json");
    expect(paths).toContain("turbo.json");
    expect(paths).toContain(".env.example");
    expect(paths).toContain(".env.local");
    expect(paths).toContain("apps/web/src/app/page.tsx");
    expect(paths).toContain("apps/web/src/proxy.ts");
    expect(paths).not.toContain("apps/web/src/middleware.ts");
    const webManifest = JSON.parse(
      files.find((file) => file.path === "apps/web/package.json")?.content ?? "{}",
    );
    expect(webManifest.dependencies?.["better-auth"]).toBe(authVersions["better-auth"]);
    // No deploy files by default (deploy=none)
    expect(paths).not.toContain("Dockerfile");
    expect(paths).not.toContain("scripts/require-bun-lock.mjs");
    expect(paths).not.toContain("fly.toml");
    expect(paths).not.toContain("vercel.json");
    // Template validation: all TS/TSX must parse
    const result = validateGeneratedFiles(files);
    expect(result.valid).toBe(true);
    if (!result.valid) console.error(result.errors.slice(0, 5));
  });

  it("single/next/postgres emits flat structure", () => {
    const files = generateProjectFiles(cfg({ mode: "single" as const }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).not.toContain("apps/web/package.json");
    expect(paths).toContain("src/proxy.ts");
    expect(paths).not.toContain("src/middleware.ts");
    const result = validateGeneratedFiles(files);
    expect(result.valid).toBe(true);
  });

  it("deploy=docker emits the production container and Compose contract", () => {
    const files = generateProjectFiles(cfg({ deploy: "docker" as never }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain(".dockerignore");
    expect(paths).toContain("compose.production.yml");
    expect(paths).toContain("docs/DOCKER_DEPLOYMENT.md");
    expect(paths).toContain("scripts/build-deployment.mjs");
    expect(paths).toContain("scripts/require-bun-lock.mjs");
    expect(paths).not.toContain("bun.lock");
    expect(paths).not.toContain("fly.toml");
    const df = files.find((f) => f.path === "Dockerfile")!;
    expect(df.content).toContain(`FROM oven/bun:${runtime.bun}`);
    expect(df.content).toContain("COPY . .");
    expect(df.content).toContain("bunfig.toml");
    expect(df.content).not.toContain("COPY --parents");
    expect(df.content).toContain("ENV STORAGE_DRIVER=s3");
    expect(df.content).toContain("EXPOSE 3000");
    expect(df.content).toContain("HEALTHCHECK");
    expect(df.content).toContain("/api/health");
    expect(df.content).toContain("--mount=type=secret,id=ghostinit_env");
    expect(df.content).toContain("COPY --from=base --chown=1000:1000 /app ./");
    const ignore = files.find((f) => f.path === ".dockerignore")!;
    expect(ignore.content).toContain(".env*");
    expect(ignore.content).toContain(".ghostinit-staging");
    expect(ignore.content).not.toContain("convex/_generated");
  });

  it("deploy=fly emits the health-checked image and Fly contract", () => {
    const files = generateProjectFiles(cfg({ deploy: "fly" as never }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain("fly.toml");
    expect(paths).toContain("docs/FLY_DEPLOYMENT.md");
    expect(paths).toContain("scripts/require-bun-lock.mjs");
    const fly = files.find((f) => f.path === "fly.toml")!;
    expect(fly.content).toContain('app = "demo"');
    expect(fly.content).toContain("internal_port = 3000");
    expect(fly.content).toContain("[http_service.concurrency]");
    expect(fly.content).toContain("[[http_service.checks]]");
    expect(fly.content).toContain('path = "/api/health"');
    expect(fly.content).toContain('kill_timeout = "30s"');
    expect(fly.content).not.toContain("[[services]]");
    expect(fly.content).toContain('STORAGE_DRIVER = "s3"');
    expect(() => Bun.TOML.parse(fly.content)).not.toThrow();
  });

  it("deploy=vercel emits vercel.json", () => {
    const files = generateProjectFiles(cfg({ deploy: "vercel" as never }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("vercel.json");
    expect(paths).toContain("scripts/require-bun-lock.mjs");
    const v = files.find((f) => f.path === "vercel.json")!;
    const parsed = JSON.parse(v.content);
    expect(parsed.framework).toBe("nextjs");
    expect(parsed.bunVersion).toBe(`${runtime.bun.split(".").slice(0, 2).join(".")}.x`);
    expect(parsed.installCommand).toBe(
      `bunx bun@${runtime.bun} scripts/require-bun-lock.mjs && bunx bun@${runtime.bun} install --frozen-lockfile`,
    );
    expect(parsed.buildCommand).toBe(
      `bunx bun@${runtime.bun} scripts/require-bun-lock.mjs && bunx bun@${runtime.bun} scripts/build-deployment.mjs`,
    );
  });

  it("single mode deploy=docker emits the same deploy files (flat layout)", () => {
    const files = generateProjectFiles(cfg({ mode: "single" as const, deploy: "docker" as never }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain(".dockerignore");
  });

  it("maintenance mode: page exists and env vars are declared", () => {
    const files = generateProjectFiles(cfg({}));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("apps/web/src/app/maintenance/page.tsx");
    const proxy = files.find((f) => f.path === "apps/web/src/proxy.ts")!;
    const maintenanceAccess = files.find(
      (f) => f.path === "apps/web/src/lib/maintenance-access.ts",
    )!;
    const maintenanceRoute = files.find(
      (f) => f.path === "apps/web/src/app/maintenance/access/route.ts",
    )!;
    const maintenancePage = files.find((f) => f.path === "apps/web/src/app/maintenance/page.tsx")!;
    expect(proxy.content).toContain("MAINTENANCE_MODE");
    expect(proxy.content).toContain("checkMaintenanceStatus");
    expect(maintenanceAccess.content).toContain('crypto.subtle.sign("HMAC"');
    expect(maintenanceAccess.content).toMatch(/crypto\.subtle\.verify\(\s*"HMAC"/);
    expect(maintenanceAccess.content).toContain("secret.length >= 32");
    expect(maintenanceRoute.content).toContain("readAccessToken(request)");
    expect(maintenanceRoute.content).toContain('secure: process.env.NODE_ENV === "production"');
    expect(maintenanceRoute.content).toContain("maxAge: MAINTENANCE_COOKIE_TTL_SECONDS");
    expect(maintenanceRoute.content).toContain('"Cache-Control", "no-store"');
    expect(maintenancePage.content).toContain('method="post"');
    expect(maintenancePage.content).toContain('action="/maintenance/access"');
    expect(files.map(({ content }) => content).join("\n")).not.toContain("?maintenance_bypass=");
    const env = files.find((f) => f.path === ".env.example")!;
    expect(env.content).toContain("MAINTENANCE_MODE=false");
    // Cookie-selected locales intentionally preserve the standard route tree.
    const i18nFiles = generateProjectFiles(cfg({ i18n: true }));
    const i18nPaths = i18nFiles.map((f) => f.path);
    expect(i18nPaths).toContain("apps/web/src/app/maintenance/page.tsx");
    expect(i18nPaths).not.toContain("apps/web/src/app/[locale]/maintenance/page.tsx");
    expect(i18nPaths).toContain("apps/web/src/proxy.ts");
    expect(i18nPaths).not.toContain("apps/web/src/middleware.ts");
    expect(i18nPaths).not.toContain("apps/web/middleware.ts");
    const i18nProxy = i18nFiles.find((file) => file.path === "apps/web/src/proxy.ts");
    expect(i18nProxy?.content).not.toContain("next-intl/middleware");
    expect(i18nProxy?.content).not.toContain("[locale]");
    expect(i18nProxy?.content).toContain('new URL("/sign-in", request.url)');
    const i18nReadme = i18nFiles.find((file) => file.path === "apps/web/src/i18n/README.md");
    expect(i18nReadme?.content).toContain("normal, non-prefixed application paths");
    expect(i18nReadme?.content).toContain("Locale routing middleware is not required");

    const singleI18nFiles = generateProjectFiles(cfg({ mode: "single", i18n: true }));
    const singleI18nPaths = singleI18nFiles.map((file) => file.path);
    expect(singleI18nPaths).toContain("src/proxy.ts");
    expect(singleI18nPaths).not.toContain("src/middleware.ts");
    expect(singleI18nPaths).not.toContain("middleware.ts");
    const singleI18nProxy = singleI18nFiles.find((file) => file.path === "src/proxy.ts");
    expect(singleI18nProxy?.content).not.toContain("next-intl/middleware");
    expect(singleI18nProxy?.content).not.toContain("[locale]");
    expect(singleI18nProxy?.content).toContain('new URL("/sign-in", request.url)');
  });

  it("generated turbo.json passes runtime binding controls to the start task", () => {
    const files = generateProjectFiles(cfg({}));
    const turbo = JSON.parse(files.find((f) => f.path === "turbo.json")!.content);
    expect(turbo.tasks.start).toBeDefined();
    expect(turbo.tasks.start.persistent).toBe(true);
    expect(turbo.tasks.start.passThroughEnv).toEqual(["HOST", "NITRO_HOST", "PORT"]);
    for (const runtimeBinding of turbo.tasks.start.passThroughEnv) {
      expect(turbo.globalEnv).not.toContain(runtimeBinding);
    }
  });

  it("generated root lint uses oxlint, not the unshipped biome binary", () => {
    const files = generateProjectFiles(cfg({}));
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content);
    expect(pkg.scripts.lint.startsWith("oxlint --deny-warnings .")).toBe(true);
    expect(JSON.stringify(pkg.scripts)).not.toContain("biome lint");
  });

  it(".env.example contains placeholders not minted secrets", () => {
    const files = generateProjectFiles(cfg({ billing: ["stripe"] as never }));
    const env = files.find((f) => f.path === ".env.example")!;
    expect(env.content).toContain("REPLACE_WITH_STRIPE_SECRET_KEY");
    expect(env.content).not.toContain("sk_live_");
    // PostHog placeholder
    expect(env.content).toContain("REPLACE_WITH");
  });

  it("turbo.json globalEnv matches the manifest filtered to generated app audiences", async () => {
    const { getGlobalEnvKeys } = await import("../../src/lib/env-manifest.ts");
    const files = generateProjectFiles(cfg({}));
    const turbo = files.find((f) => f.path === "turbo.json")!;
    const parsed = JSON.parse(turbo.content);
    const expected = getGlobalEnvKeys("bun", {
      framework: "nextjs",
      hasWeb: true,
      hasMobile: false,
      hasDesktop: false,
    });
    // Generated turbo.json keeps server keys exhaustive while dropping public
    // prefix families that no selected application can consume.
    expect(parsed.globalEnv).toEqual(expected);
  });
});
