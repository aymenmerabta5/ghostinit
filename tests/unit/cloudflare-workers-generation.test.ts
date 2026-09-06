import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import {
  cloudflare as cloudflareVersions,
  runtime as runtimeVersions,
  tanstackStart as tanstackVersions,
} from "../../packages/versions/src/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import type { GenerationPlan } from "../../src/domain/generation/index.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { testEnvironment } from "../helpers/cloudflare-runtime-fixture.js";

type CreateInput = Parameters<typeof resolveCreateConfig>[0];
type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";

function cloudflarePlan(
  mode: Mode,
  framework: Framework,
  database: "convex" | "none" = "none",
  overrides: Partial<CreateInput> = {},
): GenerationPlan {
  const resolution = resolveCreateConfig({
    name: `cloudflare-${mode}-${framework === "nextjs" ? "next" : "tanstack"}`,
    runtime: "bun",
    mode,
    framework,
    billing: [],
    features: [],
    database,
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "cloudflare",
    withAuth: false,
    withApi: false,
    withEmail: false,
    withAnalytics: false,
    withEve: false,
    withI18n: true,
    withPdf: false,
    withMessaging: false,
    withStorage: false,
    withNotifications: false,
    featureFlags: "none",
    withJobs: false,
    ...overrides,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  return buildProjectGenerationPlan(resolution.resolvedConfig, {
    desiredConfig: resolution.desiredConfig,
  });
}

function content(plan: GenerationPlan, path: string): string {
  const file = plan.files.find(({ physicalPath }) => physicalPath === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.content;
}

function manifest(plan: GenerationPlan, path: string): Record<string, Record<string, string>> {
  return JSON.parse(content(plan, path)) as Record<string, Record<string, string>>;
}

function unresolvedPhysicalRelativeImports(plan: GenerationPlan, path: string): string[] {
  const paths = new Set(plan.files.map(({ physicalPath }) => physicalPath));
  const source = content(plan, path);
  const unresolved: string[] = [];
  for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier?.startsWith(".")) continue;
    const target = posix.normalize(posix.join(posix.dirname(path), specifier));
    if (target.includes("convex/_generated/")) continue;
    const candidates = [
      target,
      `${target}.ts`,
      `${target}.tsx`,
      `${target}/index.ts`,
      `${target}/index.tsx`,
    ];
    if (!candidates.some((candidate) => paths.has(candidate))) unresolved.push(specifier);
  }
  return unresolved;
}

describe("Cloudflare Workers generated deployment contract", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} emits safe Worker files, scripts, and dependencies`, () => {
        const plan = cloudflarePlan(mode, framework);
        const appRoot = mode === "monorepo" ? "apps/web/" : "";
        const paths = new Set(plan.files.map(({ physicalPath }) => physicalPath));
        const runtimeManifest = manifest(plan, `${appRoot}package.json`);
        const scripts = runtimeManifest.scripts ?? {};
        const dependencies = runtimeManifest.dependencies ?? {};
        const devDependencies = runtimeManifest.devDependencies ?? {};

        expect(paths).toContain(`${appRoot}wrangler.jsonc`);
        expect(paths).toContain(`${appRoot}scripts/cloudflare.mjs`);
        expect(paths).toContain("docs/CLOUDFLARE_DEPLOYMENT.md");
        expect(paths).toContain("scripts/require-bun-lock.mjs");
        expect(paths).toContain(".github/workflows/ci.yml");
        expect([...paths].filter((path) => path.endsWith("/.env.local"))).toEqual([]);
        expect(paths.has(".env.local")).toBe(false);
        expect(plan.files.filter(({ content }) => content.includes(".env.local"))).toEqual([]);
        expect(paths).toContain(".dev.vars");
        if (mode === "monorepo") expect(paths).toContain("apps/web/.dev.vars");
        expect(content(plan, ".gitignore")).toContain(".dev.vars");

        expect(scripts.dev).toContain("--env-file=.dev.vars");
        expect(scripts.build).toBe("bun scripts/cloudflare.mjs build");
        expect(scripts.start).toBe("bun run preview");
        expect(scripts.preview).toContain("--env-file=.dev.vars");
        for (const name of ["build:worker", "deploy", "cloudflare:dry-run", "cf-typegen"])
          expect(scripts[name], name).toBeDefined();
        expect(scripts["build:worker"]).not.toContain("--env-file");
        expect(scripts.deploy).not.toContain("--env-file");
        if (mode === "monorepo") {
          const rootScripts = manifest(plan, "package.json").scripts ?? {};
          expect(rootScripts.build).toBe("bun run build:worker");
          expect(rootScripts.start).toBe("bun run preview");
          for (const name of ["build:worker", "preview", "deploy", "cloudflare:dry-run"])
            expect(rootScripts[name], name).toContain("--cwd apps/web");
        }
        expect(content(plan, ".github/workflows/ci.yml")).toContain("run: bun run build");
        const contributorGuide = content(plan, "AGENTS.md");
        expect(contributorGuide).toContain("Cloudflare production is a Worker deployment");
        expect(contributorGuide).toContain("bun run cloudflare:dry-run");
        expect(contributorGuide).not.toContain(
          "Use `bun run start` for the generated production web process",
        );

        const buildWrapper = content(plan, `${appRoot}scripts/cloudflare.mjs`);
        expect(buildWrapper).toContain("function isRuntimeDotenvFileName(name)");
        expect(buildWrapper).toContain('normalized === ".env.template"');
        expect(buildWrapper).toContain("(?:example|template)");
        expect(buildWrapper).toContain("Refusing Worker build because runtime .env files");
        expect(buildWrapper).toContain("function secretValues(");
        expect(buildWrapper).toContain('bytes.includes(Buffer.from(value, "utf8"))');
        expect(buildWrapper).toContain('"wrangler", "deploy", "--dry-run"');
        expect(buildWrapper).toContain('"--keep-vars"');
        expect(buildWrapper).toContain('"SITE_URL"');
        expect(buildWrapper).toContain(
          framework === "nextjs" ? '"NEXT_PUBLIC_APP_URL"' : '"VITE_APP_URL"',
        );
        expect(buildWrapper).toContain(
          "Cloudflare production origin must be a non-loopback HTTPS origin",
        );
        expect(buildWrapper).toContain(
          'run(["run", "audit:dependencies"], WORKSPACE_ROOT, toolEnvironment)',
        );
        expect(manifest(plan, "package.json").devDependencies?.dotenv).toBe(
          cloudflareVersions.dotenv,
        );

        const wrangler = JSON.parse(content(plan, `${appRoot}wrangler.jsonc`)) as Record<
          string,
          unknown
        >;
        expect("vars" in wrangler).toBe(false);
        expect("secrets" in wrangler).toBe(false);
        expect(JSON.stringify(wrangler)).not.toContain("REPLACE_WITH");
        expect(wrangler.observability).toEqual({ enabled: true });

        if (framework === "nextjs") {
          expect(scripts["build:framework"]).toContain("next");
          expect(scripts["build:framework"]).not.toContain("cloudflare.mjs");
          expect(paths).toContain("patches/@opennextjs+aws@4.1.0.patch");
          expect(content(plan, ".gitattributes")).toContain("patches/*.patch text eol=lf");
          expect(manifest(plan, "package.json").patchedDependencies).toEqual({
            "@opennextjs/aws@4.1.0": "patches/@opennextjs+aws@4.1.0.patch",
          });
          expect(content(plan, "scripts/audit-dependencies.ts")).toContain(
            "const HAS_OPENNEXT_PATCH = true",
          );
          expect(paths).toContain(`${appRoot}open-next.config.ts`);
          expect(paths).toContain(`${appRoot}src/middleware.ts`);
          expect(paths).not.toContain(`${appRoot}src/proxy.ts`);
          expect(content(plan, `${appRoot}src/middleware.ts`)).toContain(
            "export async function middleware",
          );
          expect(content(plan, `${appRoot}next.config.ts`)).toContain(
            "initOpenNextCloudflareForDev();",
          );
          expect(devDependencies["@opennextjs/cloudflare"]).toBe(
            cloudflareVersions["@opennextjs/cloudflare"],
          );
          expect(devDependencies.wrangler).toBe(cloudflareVersions.wrangler);
          expect(wrangler.main).toBe(".open-next/worker.js");
        } else {
          expect(paths).toContain(`${appRoot}src/cloudflare-worker.ts`);
          expect(paths).not.toContain(`${appRoot}nitro.config.ts`);
          expect(paths).not.toContain(`${appRoot}open-next.config.ts`);
          const vite = content(plan, `${appRoot}vite.config.ts`);
          expect(vite).toContain("@cloudflare/vite-plugin");
          expect(vite).toContain("vite-tsconfig-paths");
          expect(vite).toContain("@tanstack/react-start/server-only");
          expect(vite).not.toContain("nitro/vite");
          expect(devDependencies["@cloudflare/vite-plugin"]).toBe(
            cloudflareVersions["@cloudflare/vite-plugin"],
          );
          expect(devDependencies["vite-tsconfig-paths"]).toBe(
            tanstackVersions["vite-tsconfig-paths"],
          );
          expect(devDependencies.wrangler).toBe(cloudflareVersions.wrangler);
          expect(devDependencies.nitro).toBeUndefined();
          expect(dependencies["server-only"]).toBe(runtimeVersions["server-only"]);
          expect(wrangler.main).toBe("src/cloudflare-worker.ts");
        }
      });
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode}/Next configures OpenNext persistent R2 and Durable Object cache`, () => {
      const plan = cloudflarePlan(mode, "nextjs");
      const appRoot = mode === "monorepo" ? "apps/web/" : "";
      const wrangler = JSON.parse(content(plan, `${appRoot}wrangler.jsonc`)) as {
        assets: unknown;
        r2_buckets: unknown;
        durable_objects: unknown;
        migrations: unknown;
      };
      expect(wrangler.assets).toEqual({ directory: ".open-next/assets", binding: "ASSETS" });
      expect(wrangler.r2_buckets).toEqual([
        expect.objectContaining({ binding: "NEXT_INC_CACHE_R2_BUCKET" }),
      ]);
      expect(wrangler.durable_objects).toEqual({
        bindings: [
          { name: "NEXT_CACHE_DO_QUEUE", class_name: "DOQueueHandler" },
          { name: "NEXT_TAG_CACHE_DO_SHARDED", class_name: "DOShardedTagCache" },
        ],
      });
      expect(wrangler.migrations).toEqual([
        { tag: "v1", new_sqlite_classes: ["DOQueueHandler"] },
        { tag: "v2", new_sqlite_classes: ["DOShardedTagCache"] },
      ]);
      const openNext = content(plan, `${appRoot}open-next.config.ts`);
      expect(openNext).toContain('buildCommand: "bun run build:framework"');
      expect(openNext).toContain("const config: OpenNextConfig");
      expect(openNext).toContain("export default config");
      expect(openNext).toContain("r2-incremental-cache");
      expect(openNext).toContain("do-queue");
      expect(openNext).toContain("do-sharded-tag-cache");
      expect(openNext).toContain("incrementalCache: r2IncrementalCache");
      expect(openNext).toContain("queue: doQueue");
      expect(openNext).toContain("tagCache: doShardedTagCache({ baseShardSize: 12 })");
    });
  }

  test("records Cloudflare files and local variables in the canonical plan lifecycle", () => {
    const plan = cloudflarePlan("monorepo", "nextjs", "convex", {
      withAuth: true,
      withApi: true,
    });
    const expected = [
      "apps/web/wrangler.jsonc",
      "apps/web/scripts/cloudflare.mjs",
      "apps/web/open-next.config.ts",
      "apps/web/src/middleware.ts",
      "docs/CLOUDFLARE_DEPLOYMENT.md",
    ];
    for (const path of expected) {
      const file = plan.files.find(({ physicalPath }) => physicalPath === path);
      expect(file, path).toBeDefined();
      expect(file?.lifecycle, path).toBe("generator-owned");
      expect(file?.provenance.renderer, path).toBe("resolved-template-compiler.v2");
      expect(file?.provenance.acceptance, path).toContain("project.render.v2");
      expect(file?.provenance.contribution, path).toContain("legacy.core.v2");
    }
    for (const path of [".dev.vars", "apps/web/.dev.vars"]) {
      const file = plan.files.find(({ physicalPath }) => physicalPath === path);
      expect(file?.lifecycle, path).toBe("seed-once");
      expect(file?.provenance.renderer, path).toBe("resolved-template-compiler.v2");
    }
    expect(
      plan.secrets.flatMap(({ destinations }) =>
        destinations.map(({ physicalPath }) => physicalPath),
      ),
    ).not.toContainEqual(expect.stringMatching(/(?:^|\/)\.env\.local$/));
  });

  test("monorepo Worker commands preserve selected native development and build surfaces", () => {
    const plan = cloudflarePlan("monorepo", "nextjs", "convex", {
      apps: ["web", "mobile", "desktop"],
      withAuth: true,
      withApi: true,
    });
    const rootScripts = manifest(plan, "package.json").scripts ?? {};
    expect(rootScripts.dev).toBe("bun scripts/cloudflare-workspace.mjs dev");
    expect(rootScripts.build).toBe("bun run build:worker && bun run build:native");
    expect(rootScripts["build:native"]).toBe("bun scripts/cloudflare-workspace.mjs build");
    expect(rootScripts["build:worker"]).toContain("--cwd apps/web");
    expect(plan.files.map(({ physicalPath }) => physicalPath)).toContain(
      "scripts/cloudflare-workspace.mjs",
    );
    const nativeWrapper = content(plan, "scripts/cloudflare-workspace.mjs");
    expect(nativeWrapper).toContain('turboArgs.push("--filter=!web")');
    expect(nativeWrapper).toContain('HAS_MOBILE && key.startsWith("EXPO_PUBLIC_")');
    expect(nativeWrapper).toContain('HAS_DESKTOP && (key.startsWith("VITE_")');
    expect(nativeWrapper).toContain("environment[key] === undefined");
    expect(nativeWrapper).toContain(
      "Root and web .dev.vars must either both exist or both be absent",
    );
    expect(nativeWrapper).toContain("Root and web .dev.vars files diverged");
    for (const key of [
      "DESKTOP_API_URL",
      "VITE_APP_URL",
      "VITE_API_URL",
      "VITE_CONVEX_URL",
      "VITE_WS_URL",
    ]) {
      expect(nativeWrapper, key).toContain(key);
    }
    expect(nativeWrapper).not.toContain("BETTER_AUTH_SECRET");
    expect(manifest(plan, "apps/mobile/package.json").scripts?.build).toBeDefined();
    expect(manifest(plan, "apps/desktop/package.json").scripts?.build).toBeDefined();
    const localEnvironment = content(plan, ".dev.vars");
    expect(localEnvironment).toContain("EXPO_PUBLIC_APP_URL=");
    expect(localEnvironment).toContain("DESKTOP_API_URL=");
    expect(localEnvironment).toContain("Local Worker development keeps TRUSTED_PROXY=false");
    expect(content(plan, "apps/desktop/PACKAGING.md")).not.toContain(".env.production.local");
    expect(content(plan, "apps/desktop/PACKAGING.md")).toContain(".dev.vars");
  });

  test("native production origin validation rejects broad loopback and malformed values without disclosure", () => {
    const plan = cloudflarePlan("monorepo", "nextjs", "none", {
      apps: ["web", "desktop"],
    });
    const root = mkdtempSync(join(process.cwd(), ".ghostinit-native-origin-"));
    try {
      const dotenvRoot = join(root, "node_modules", "dotenv");
      mkdirSync(dotenvRoot, { recursive: true });
      writeFileSync(
        join(dotenvRoot, "package.json"),
        `${JSON.stringify({ name: "dotenv", type: "module", exports: "./index.js" })}\n`,
        "utf8",
      );
      writeFileSync(
        join(dotenvRoot, "index.js"),
        'export function parse(input) { return Object.fromEntries(input.toString().split(/\\r?\\n/).filter(Boolean).map((line) => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; })); }\n',
      );
      const scriptPath = join(root, "cloudflare-workspace.mjs");
      writeFileSync(scriptPath, content(plan, "scripts/cloudflare-workspace.mjs"), "utf8");
      for (const rejected of [
        "https://127.0.0.2",
        "https://service.localhost",
        "https://[::]",
        "https://[::ffff:127.0.0.1]",
      ]) {
        const result = spawnSync(process.execPath, [scriptPath, "build"], {
          cwd: root,
          encoding: "utf8",
          env: testEnvironment({ DESKTOP_API_URL: rejected, VITE_APP_URL: rejected }),
          windowsHide: true,
        });
        expect(result.status, rejected).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`, rejected).toContain("DESKTOP_API_URL");
      }

      const malformed = "https://native-user:native-password@[::invalid";
      const result = spawnSync(process.execPath, [scriptPath, "build"], {
        cwd: root,
        encoding: "utf8",
        env: testEnvironment({ DESKTOP_API_URL: malformed, VITE_APP_URL: malformed }),
        windowsHide: true,
      });
      const combined = `${result.stdout}${result.stderr}`;
      expect(result.status).not.toBe(0);
      expect(combined).toContain("Invalid native build variable: DESKTOP_API_URL");
      expect(combined).not.toContain("native-password");
      expect(combined).not.toContain(malformed);

      mkdirSync(join(root, "apps", "web"), { recursive: true });
      writeFileSync(join(root, ".dev.vars"), "VITE_APP_URL=http://localhost:3000\n");
      writeFileSync(join(root, "apps", "web", ".dev.vars"), "VITE_APP_URL=http://localhost:3001\n");
      const diverged = spawnSync(process.execPath, [scriptPath, "dev"], {
        cwd: root,
        encoding: "utf8",
        env: testEnvironment(),
        windowsHide: true,
      });
      expect(diverged.status).not.toBe(0);
      expect(`${diverged.stdout}${diverged.stderr}`).toContain(
        "Root and web .dev.vars files diverged",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} capability-heavy composition resolves and requires exact build inputs`, () => {
      const plan = cloudflarePlan("monorepo", framework, "convex", {
        billing: ["stripe"],
        cache: "redis",
        withAuth: true,
        withApi: true,
        withEmail: true,
        withMessaging: true,
        withNotifications: true,
        featureFlags: "posthog",
        withJobs: true,
      });
      const compositionPath = "packages/services/src/application/composition/admin.ts";
      expect(content(plan, compositionPath)).toContain('from "../../admin/index"');
      expect(unresolvedPhysicalRelativeImports(plan, compositionPath)).toEqual([]);
      expect(
        plan.files.some(({ physicalPath }) => physicalPath.includes("/api/webhooks/stripe")),
      ).toBe(true);
      const buildWrapper = content(plan, "apps/web/scripts/cloudflare.mjs");
      expect(buildWrapper).toContain('"NOTIFICATION_TOKEN_ENCRYPTION_KEY"');
      expect(buildWrapper).toContain('"UPSTASH_REDIS_REST_URL"');
      expect(buildWrapper).toContain('"UPSTASH_REDIS_REST_TOKEN"');
      expect(buildWrapper).not.toContain('"TRUSTED_PROXY"');
      expect(buildWrapper).toContain(
        "BETTER_AUTH_URL must match the Cloudflare application origin",
      );
      expect(buildWrapper).toContain("The public Convex URL must match CONVEX_URL exactly");
      expect(buildWrapper).toContain("CONVEX_SITE_URL must match the CONVEX_URL tenant exactly");
      const guide = content(plan, "docs/CLOUDFLARE_DEPLOYMENT.md");
      expect(guide).toContain(
        "The Worker/build environment and Convex function environment are separate",
      );
      expect(guide).toContain("BETTER_AUTH_SECRET");
      expect(guide).toContain("RESEND_API_KEY");
      expect(guide).toContain("NOTIFICATION_TOKEN_ENCRYPTION_KEY");
      expect(guide).toContain("Generated Convex billing bridge actions");
      expect(guide).toContain("convex env set NAME");
      expect(guide).toContain("never put the value in argv");
      expect(guide).toContain("Every non-local production `BETTER_AUTH_URL`");
      expect(guide).toContain("Cloudflare generation emits an explicit trusted-runtime policy");
      expect(guide).toContain("Non-Cloudflare output never trusts Cloudflare headers");
      const convexAuth = content(plan, "convex/auth.ts");
      expect(convexAuth).toContain("target Convex deployment environment or dashboard");
      expect(convexAuth).not.toContain("Convex dashboard or .env.local");
      expect(convexAuth).toContain("https://app.example.test");
      expect(convexAuth).not.toContain("e.g. https://example.com");
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework}/Convex CSP preserves data and generated font sources`, () => {
        const plan = cloudflarePlan(mode, framework, "convex");
        const appRoot = mode === "monorepo" ? "apps/web/" : "";
        const csp = content(
          plan,
          framework === "nextjs"
            ? `${appRoot}next.config.ts`
            : `${appRoot}src/cloudflare-worker.ts`,
        );
        for (const source of [
          framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL",
          framework === "nextjs" ? "publicConvexOrigin.origin" : "convexUrl.origin",
          '" wss://"',
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
        ]) {
          expect(csp, source).toContain(source);
        }
        expect(csp).not.toContain("*.convex.cloud");
      });
    }
  }
});
