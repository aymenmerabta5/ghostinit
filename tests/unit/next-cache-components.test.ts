import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";
import * as v from "../../src/templates/versions.js";

type Mode = "monorepo" | "single";

function config(
  mode: Mode,
  framework: "nextjs" | "tanstack-start" = "nextjs",
  database: "postgres" | "convex" = "postgres",
): ProjectConfig {
  return {
    name: `cache-components-${mode}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    preset: "custom",
    cache: "redis",
    deploy: "none",
    auth: true,
    api: true,
    email: true,
    analytics: true,
    eve: true,
    i18n: true,
    pdf: true,
    messaging: true,
    storage: true,
    notifications: true,
    featureFlags: "posthog",
    jobs: true,
    jobsUserFacingApi: true,
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: ["eve", "i18n"],
    database,
    framework,
    apps: ["web"],
  } as ProjectConfig;
}

function generated(input: ProjectConfig): TemplateFile[] {
  return generateProjectFiles(input, { dryRun: true });
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((file) => file.path === path);
  if (!found) throw new Error(`Missing generated file: ${path}`);
  return found.content;
}

function manifest(
  files: readonly TemplateFile[],
  path: string,
): {
  devDependencies: Record<string, string>;
} {
  return JSON.parse(read(files, path)) as { devDependencies: Record<string, string> };
}

async function evaluateGeneratedCsp(
  nextConfig: string,
  nodeEnv: "development" | "production" | "test",
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ghostinit-next-csp-"));
  const configPath = join(root, "next.config.ts");
  const inspectPath = join(root, "inspect.mjs");
  try {
    await writeFile(configPath, nextConfig, "utf8");
    await writeFile(
      inspectPath,
      `const { default: config } = await import(${JSON.stringify(pathToFileURL(configPath).href)});
const rules = await config.headers();
const csp = rules.flatMap((rule) => rule.headers).find((header) => header.key === "Content-Security-Policy")?.value;
if (typeof csp !== "string") throw new Error("Generated Next config did not emit a CSP header");
process.stdout.write(csp);
`,
      "utf8",
    );
    const child = Bun.spawn([process.execPath, inspectPath], {
      env: { ...process.env, NODE_ENV: nodeEnv },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode, stderr).toBe(0);
    return stdout;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("Next 16.3 TypeScript 7 and Cache Components", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const eve of [false, true]) {
      for (const i18n of [false, true]) {
        test(`${mode} composes cacheComponents through eve=${eve}/i18n=${i18n}`, () => {
          const files = generated({
            ...config(mode),
            eve,
            i18n,
            features: [...(eve ? (["eve"] as const) : []), ...(i18n ? (["i18n"] as const) : [])],
          });
          const configPath = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
          const nextConfig = read(files, configPath);
          expect(nextConfig.match(/cacheComponents:\s*true/g)).toHaveLength(1);
          expect(nextConfig).not.toContain("useTypeScriptCli");
          expect(nextConfig).toContain("--cache redis");
          expect(nextConfig).toContain("does not configure Next.js");
          expect(nextConfig).not.toMatch(/^\s*cacheHandler(?:s)?:/m);
          expect(nextConfig).not.toMatch(/^\s*cacheMaxMemorySize:/m);
        });
      }
    }
  }

  test("keeps unsafe-eval development-only without disabling inline Next hydration", async () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generated({
        ...config(mode),
        eve: false,
        i18n: false,
        features: [],
      });
      const configPath = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
      const nextConfig = read(files, configPath);
      const [developmentCsp, testServerCsp, productionCsp] = await Promise.all([
        evaluateGeneratedCsp(nextConfig, "development"),
        evaluateGeneratedCsp(nextConfig, "test"),
        evaluateGeneratedCsp(nextConfig, "production"),
      ]);

      expect(developmentCsp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(testServerCsp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(productionCsp).toContain("script-src 'self' 'unsafe-inline'");
      expect(productionCsp).not.toContain("'unsafe-eval'");
      expect(productionCsp).toContain("object-src 'none'");
    }
  });

  test("uses the project-local TS7 CLI only for Next apps", () => {
    const monorepoNext = generated(config("monorepo"));
    const singleNext = generated(config("single"));
    const monorepoTanstack = generated(config("monorepo", "tanstack-start"));
    const singleTanstack = generated(config("single", "tanstack-start"));

    expect(manifest(monorepoNext, "apps/web/package.json").devDependencies.typescript).toBe(
      v.typescript.typescriptNext,
    );
    expect(manifest(monorepoNext, "package.json").devDependencies.typescript).toBe(
      v.typescript.typescript,
    );
    expect(manifest(singleNext, "package.json").devDependencies.typescript).toBe(
      v.typescript.typescriptNext,
    );
    expect(manifest(monorepoTanstack, "apps/web/package.json").devDependencies.typescript).toBe(
      v.typescript.typescript,
    );
    expect(manifest(singleTanstack, "package.json").devDependencies.typescript).toBe(
      v.typescript.typescript,
    );

    for (const files of [monorepoNext, singleNext]) {
      const configPath = files.some(({ path }) => path === "apps/web/next.config.ts")
        ? "apps/web/next.config.ts"
        : "next.config.ts";
      const nextConfig = read(files, configPath);
      expect(nextConfig).toContain("cacheComponents: true");
      expect(nextConfig).not.toContain("useTypeScriptCli");
      expect(read(files, "scripts/lib/oxc.cjs")).toContain('require("oxc-parser")');
      expect(files.map(({ content }) => content).join("\n")).not.toMatch(
        /require\(["']typescript["']\)/,
      );
    }
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} removes legacy segment config and keeps GET boundaries explicit`, () => {
        const files = generated(config(mode, "nextjs", database));
        const appRoot = mode === "monorepo" ? "apps/web/src/app" : "src/app";
        const routeFiles = files.filter(
          ({ path }) => path.startsWith(`${appRoot}/`) && path.endsWith("/route.ts"),
        );
        for (const route of routeFiles) {
          expect(route.content, route.path).not.toMatch(
            /export const (?:dynamic|revalidate|fetchCache|runtime)\s*=/,
          );
        }

        const health = read(files, `${appRoot}/api/health/route.ts`);
        expect(health).toContain("await connection()");
        expect(health).toContain("new Date().toISOString()");
        const openapi = read(files, `${appRoot}/api/openapi/route.ts`);
        expect(openapi).toContain("await connection()");

        for (const path of [
          `${appRoot}/api/auth/[...all]/route.ts`,
          `${appRoot}/api/rpc/[...path]/route.ts`,
        ]) {
          const requestScoped = read(files, path);
          expect(requestScoped).toMatch(/request\.(?:headers|method|url)|new URL\(request\.url\)/);
          expect(requestScoped).not.toContain('"use cache"');
          expect(requestScoped).not.toContain("'use cache'");
        }
      });
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} puts session and request-locale work behind intentional boundaries`, () => {
      const files = generated(config(mode));
      const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
      const appRoot = `${sourceRoot}/app`;
      const adminLayout = read(files, `${appRoot}/admin/layout.tsx`);
      expect(adminLayout).toContain("<Suspense");
      expect(adminLayout).toContain("<AuthorizedAdminLayout>{children}</AuthorizedAdminLayout>");
      expect(adminLayout).not.toContain('"use cache"');

      const dashboard = read(files, `${appRoot}/dashboard/page.tsx`);
      expect(dashboard).toContain("<Suspense");
      expect(dashboard).not.toContain('"use cache"');

      const rootLayout = read(files, `${appRoot}/layout.tsx`);
      const localizedStart = rootLayout.indexOf("async function LocalizedApp");
      const rootStart = rootLayout.indexOf("export default function RootLayout");
      expect(localizedStart).toBeGreaterThanOrEqual(0);
      expect(rootStart).toBeGreaterThan(localizedStart);
      const localizedBoundary = rootLayout.slice(localizedStart, rootStart);
      const staticRoot = rootLayout.slice(rootStart);
      expect(localizedBoundary).toContain("await connection()");
      expect(localizedBoundary).toContain("await getLocale()");
      expect(localizedBoundary).toContain("await getMessages()");
      expect(staticRoot).toContain("<React.Suspense");
      expect(staticRoot).toContain("<LocalizedApp>{children}</LocalizedApp>");
      expect(staticRoot).not.toContain("await connection()");
      expect(staticRoot).not.toContain("await getLocale()");
      expect(staticRoot).not.toContain("await getMessages()");
      expect(rootLayout).toContain('id="locale-bootstrap"');
      expect(rootLayout).toContain("document.documentElement.lang");
      expect(rootLayout).toContain('if(locale!=="en"&&locale!=="fr"&&locale!=="ar")locale="en"');
      expect(rootLayout).toContain(
        'JSON.stringify(locale) + ";document.documentElement.dir=" + JSON.stringify(localeDirection[locale])',
      );
      expect(rootLayout).not.toContain("dangerouslySetInnerHTML={{ __html: locale }}");
      expect(rootLayout).not.toContain("instant = false");

      const nextConfigPath = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
      const nextConfig = read(files, nextConfigPath);
      expect(nextConfig).toContain("script-src 'self' 'unsafe-inline'");

      const translations = read(files, `${sourceRoot}/lib/translations.server.ts`);
      expect(translations).toContain('import { connection } from "next/server"');
      expect(translations).toContain("await connection()");

      const resetPassword = read(files, `${appRoot}/reset-password/page.tsx`);
      expect(resetPassword).toContain("<RequestLocalizedMetadataBoundary />");
      expect(read(files, `${appRoot}/reset-password/page.client.tsx`)).toContain("<Suspense");
      expect(read(files, `${appRoot}/maintenance/page.tsx`)).toContain("<Suspense");
      expect(read(files, `${appRoot}/not-found.tsx`)).toContain("<Suspense");
      if (mode === "monorepo") {
        const marketing = read(files, `${appRoot}/page.tsx`);
        expect(marketing.match(/<Suspense/g)).toHaveLength(4);
        for (const specialPage of ["unauthorized.tsx", "forbidden.tsx"]) {
          expect(read(files, `${appRoot}/${specialPage}`)).toContain("<Suspense");
        }
      }
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} keeps locale runtime work streamed across Eve and analytics combinations`, () => {
      for (const eve of [false, true]) {
        for (const analytics of [false, true]) {
          const files = generated({
            ...config(mode),
            analytics,
            eve,
            features: ["i18n", ...(eve ? (["eve"] as const) : [])],
          });
          const appRoot = mode === "monorepo" ? "apps/web/src/app" : "src/app";
          const rootLayout = read(files, `${appRoot}/layout.tsx`);
          expect(rootLayout, `${mode}/eve=${eve}/analytics=${analytics}`).toContain(
            "async function LocalizedApp",
          );
          expect(rootLayout).toContain("<React.Suspense");
          expect(rootLayout).not.toContain("export default async function RootLayout");
          expect(rootLayout).not.toContain("instant = false");
        }
      }
    });
  }

  test("keeps static metadata deterministic instead of freezing request-time clocks", () => {
    const files = generated(config("monorepo"));
    const sitemap = read(files, "apps/web/src/app/sitemap.ts");
    const image = read(files, "apps/web/src/app/opengraph-image.tsx");
    expect(sitemap).not.toContain("new Date(");
    expect(image).toContain("export default function Image(): ImageResponse");
    expect(image).not.toContain("async function Image");
  });

  test("keeps the non-i18n root layout prerenderable", () => {
    const files = generated({
      ...config("monorepo"),
      i18n: false,
      features: ["eve"],
    });
    const rootLayout = read(files, "apps/web/src/app/layout.tsx");
    expect(rootLayout).not.toContain("connection()");
    expect(rootLayout).toContain('lang="en"');
    expect(rootLayout).toContain("export const metadata");
  });
});
