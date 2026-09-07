import { describe, expect, test } from "bun:test";
import {
  tanstackSettingsFeatureFiles,
  tanstackSettingsPageContent,
} from "../../src/templates/apps/fragments/settings/tanstack-page.js";
import { tanstackPageFiles } from "../../src/templates/apps/tanstack-pages.js";
import { tanstackCoreFiles } from "../../src/templates/apps/tanstack-core.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import {
  singleNitroConfigTanstackContent,
  singleViteConfigTanstackContent,
} from "../../src/templates/modes/single/tanstack/core.js";

async function evaluateGeneratedTanstackCsp(
  nitroConfig: string,
  nodeEnv: "development" | "production" | "test",
): Promise<string> {
  const declaration = nitroConfig.match(
    /function contentSecurityPolicy\(\): string \{[\s\S]*?\n\}/,
  )?.[0];
  if (!declaration) throw new Error("Generated Nitro config is missing its CSP declaration");

  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `${declaration.replace("(): string", "()")}\nprocess.stdout.write(contentSecurityPolicy());`,
    ],
    {
      env: { ...process.env, NODE_ENV: nodeEnv },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode, stderr).toBe(0);
  return stdout;
}

describe("generated TanStack route contracts", () => {
  test("keeps eval and broad HMR sockets development-only in both modes", async () => {
    const monorepoNitro = tanstackCoreFiles("bun", false, true, {
      i18n: { inUse: true },
      postgres: { inUse: true },
    } as never).find(({ path }) => path === "apps/web/nitro.config.ts")?.content;
    const configs = [
      ["single", singleNitroConfigTanstackContent(true)],
      ["monorepo", monorepoNitro],
    ] as const;

    for (const [mode, nitro] of configs) {
      expect(nitro, `${mode} Nitro config`).toBeString();
      const [developmentCsp, testServerCsp, productionCsp] = await Promise.all([
        evaluateGeneratedTanstackCsp(nitro ?? "", "development"),
        evaluateGeneratedTanstackCsp(nitro ?? "", "test"),
        evaluateGeneratedTanstackCsp(nitro ?? "", "production"),
      ]);

      expect(developmentCsp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(developmentCsp).toContain("connect-src 'self' https://us.i.posthog.com ws: wss:");
      expect(testServerCsp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(testServerCsp).toContain("connect-src 'self' https://us.i.posthog.com ws: wss:");
      expect(productionCsp).toContain("script-src 'self' 'unsafe-inline'");
      expect(productionCsp).not.toContain("'unsafe-eval'");
      expect(productionCsp).not.toContain(" ws:");
      expect(productionCsp).not.toContain(" wss:");
      expect(productionCsp).toContain("object-src 'none'");
      expect(nitro).not.toContain("includeSubDomains; preload");
    }
  });

  test("keeps runtime configuration in Nitro rather than unsupported Vite options", () => {
    const vite = singleViteConfigTanstackContent();
    const nitro = singleNitroConfigTanstackContent(true);
    expect(vite).toContain("nitro()");
    expect(vite.indexOf("viteReact()")).toBeLessThan(vite.indexOf("[nitro()]"));
    expect(vite).toContain("command === 'build' || includeNitroInDev");
    expect(vite).toContain("'server-only': '@tanstack/react-start/server-only'");
    expect(vite).not.toContain("importProtection");
    expect(vite).not.toContain("ghostinit:server-only-boundary");
    expect(vite).not.toContain("function serverOnlyBoundary");
    expect(vite).toContain("ssr: { external: ['pg'] }");
    expect(singleViteConfigTanstackContent(true)).toContain("includeNitroInDev = true");
    expect(singleViteConfigTanstackContent(false, false)).not.toContain(
      "ssr: { external: ['pg'] }",
    );
    const monorepoDefault = tanstackCoreFiles("bun", false, false, {
      postgres: { inUse: true },
    } as never).find(({ path }) => path.endsWith("vite.config.ts"))?.content;
    const monorepoMessaging = tanstackCoreFiles("bun", false, false, {
      postgres: { inUse: true },
      messaging: { inUse: true },
    } as never).find(({ path }) => path.endsWith("vite.config.ts"))?.content;
    expect(monorepoDefault).toContain("includeNitroInDev = false");
    expect(monorepoDefault).toContain("import { fileURLToPath } from 'node:url'");
    expect(monorepoDefault).toContain("'@': fileURLToPath(new URL('./src', import.meta.url))");
    expect(monorepoDefault).toContain("'server-only': '@tanstack/react-start/server-only'");
    expect(monorepoDefault).not.toContain("importProtection");
    expect(monorepoDefault).not.toContain("ghostinit:server-only-boundary");
    expect(monorepoDefault).toContain("ssr: { external: ['pg'] }");
    expect(monorepoMessaging).toContain("includeNitroInDev = true");
    expect(vite).not.toContain("tsconfigPaths");
    expect(vite).not.toContain("preset: 'bun'");
    expect(nitro).toContain("preset: 'bun'");
    expect(nitro).toContain("serverDir: 'server'");
    expect(nitro).not.toContain("externals:");
    expect(nitro).not.toContain("noExternals");
    expect(nitro).toContain("experimental: { websocket: true }");
    expect(nitro).toContain("routeRules");
  });

  test("monorepo Vite aliases resolve every emitted @/ import for Postgres and Convex", () => {
    for (const database of ["postgres", "convex"] as const) {
      const config = {
        name: `tanstack-alias-${database}`,
        runtime: "bun",
        version: "0.1.0",
        mode: "monorepo",
        billing: [],
        features: [],
        database,
        framework: "tanstack-start",
        apps: ["web"],
        preset: "saas",
      } as ProjectConfig;
      const files = generateProjectFiles(config, { dryRun: false });
      const byPath = new Set(files.map((file) => file.path));
      const vite = files.find((file) => file.path === "apps/web/vite.config.ts")?.content ?? "";
      expect(vite, database).toContain("import { fileURLToPath } from 'node:url'");
      expect(vite, database).toContain("'@': fileURLToPath(new URL('./src', import.meta.url))");
      expect(vite, database).toContain("'server-only': '@tanstack/react-start/server-only'");
      expect(vite, database).not.toContain("ghostinit:server-only-boundary");

      const unresolved: string[] = [];
      const aliasEdges: string[] = [];
      for (const file of files) {
        if (!file.path.startsWith("apps/web/") || !/\.tsx?$/.test(file.path)) continue;
        const extension = file.path.endsWith(".tsx") ? ".tsx" : ".ts";
        for (const reference of parseFile(file.content, extension).importReferences) {
          if (!reference.specifier.startsWith("@/")) continue;
          const specifier = reference.specifier.split("?")[0];
          const target = `apps/web/src/${specifier.slice(2)}`;
          const candidates = [
            target,
            `${target}.ts`,
            `${target}.tsx`,
            `${target}.css`,
            `${target}/index.ts`,
            `${target}/index.tsx`,
            target.replace(/\.js$/, ".ts"),
            target.replace(/\.js$/, ".tsx"),
          ];
          aliasEdges.push(`${file.path} -> ${reference.specifier}`);
          if (!candidates.some((candidate) => byPath.has(candidate))) {
            unresolved.push(`${file.path} -> ${reference.specifier}`);
          }
        }
      }
      expect(aliasEdges, `${database} emitted no @/ imports`).not.toEqual([]);
      expect(aliasEdges).toContain("apps/web/src/routes/forbidden.tsx -> @/components/ui/button");
      expect(byPath.has("apps/web/src/components/ui/button.tsx")).toBe(true);
      expect(unresolved).toEqual([]);
    }
  });

  test("emits metadata outside the route tree", () => {
    const pageFiles = tanstackPageFiles();
    const byPath = new Map(pageFiles.map((file) => [file.path, file.content]));
    expect(byPath.has("apps/web/public/sitemap.xml")).toBe(true);
    expect(byPath.has("apps/web/public/robots.txt")).toBe(true);
    expect(byPath.has("apps/web/public/manifest.webmanifest")).toBe(true);
    expect(byPath.get("apps/web/public/sitemap.xml")).toMatch(/^<\?xml/);
    expect(byPath.get("apps/web/public/robots.txt")).toContain("User-agent: *");
    expect(() =>
      JSON.parse(byPath.get("apps/web/public/manifest.webmanifest") ?? ""),
    ).not.toThrow();

    const invalidPseudoRoutes = [
      "apps/web/src/routes/sitemap.ts",
      "apps/web/src/routes/robots.ts",
      "apps/web/src/routes/manifest.ts",
      "apps/web/src/routes/viewport.ts",
      "apps/web/src/routes/dashboard/loading.tsx",
    ];
    for (const path of invalidPseudoRoutes) expect(byPath.has(path), path).toBe(false);
    expect(pageFiles.map((file) => file.content).join("\n")).not.toContain(
      'import type { Sitemap } from "vite"',
    );

    for (const isConvex of [false, true]) {
      const settings = tanstackSettingsPageContent(isConvex);
      const combined = [
        settings,
        ...tanstackSettingsFeatureFiles("monorepo", true).map(({ content }) => content),
      ].join("\n");
      expect(combined).toContain("createRequiredPasswordSchema");
      expect(combined).toContain("orpc.identity.sessions.list.queryOptions");
      expect(combined).toContain("orpc.identity.sessions.revoke.mutationOptions");
      expect(combined).toContain("orpc.identity.sessions.revokeOthers.mutationOptions");
      expect(combined).toContain("invalidateIdentitySessions(queryClient)");
      expect(combined).not.toContain("authClient.revokeSession");
      expect(combined).not.toContain("authClient.revokeOtherSessions");
      expect(combined).not.toContain("errorMap");
      expect(combined).not.toContain("as unknown as");
    }
  });
});
