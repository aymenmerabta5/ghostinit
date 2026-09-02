import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSync } from "oxc-parser";
import { getGlobalEnvKeys } from "../../src/lib/env-manifest.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { cacheComposerFiles } from "../../src/templates/modes/monorepo/cache-composer.js";
import { singleCacheFiles } from "../../src/templates/modes/single/cache.js";
import type { TemplateFile } from "../../src/templates/shared.js";
import * as versions from "../../src/templates/versions.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";
type App = "web" | "mobile" | "desktop";

const temporaryDirectories: string[] = [];
const originalCacheUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalCacheToken = process.env.UPSTASH_REDIS_REST_TOKEN;

afterEach(() => {
  if (originalCacheUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalCacheUrl;
  if (originalCacheToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalCacheToken;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function config(
  mode: Mode,
  framework: Framework,
  app: App,
  cache: "redis" | "none" = "redis",
): ProjectConfig {
  return projectConfigSchema.parse({
    name: `audience-${mode}-${framework}-${app}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    apps: [app],
    preset: "custom",
    cache,
    deploy: "none",
    auth: true,
    api: true,
    email: false,
    analytics: true,
    eve: false,
    i18n: false,
    pdf: false,
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
    billing: ["stripe"],
    features: [],
  });
}

function render(input: ProjectConfig): TemplateFile[] {
  return generateProjectFiles(input, { dryRun: true });
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((entry) => entry.path === path);
  if (!found) throw new Error(`Missing generated file: ${path}`);
  return found.content;
}

function expectAudience(content: string, app: App, framework: Framework): void {
  const expectedWebPrefix = framework === "tanstack-start" ? "VITE_" : "NEXT_PUBLIC_";
  if (app === "web") {
    expect(content).toContain(expectedWebPrefix);
    expect(content).not.toContain("EXPO_PUBLIC_");
    expect(content).not.toContain("DESKTOP_");
    expect(content).not.toContain(framework === "tanstack-start" ? "NEXT_PUBLIC_" : "VITE_");
    return;
  }
  expect(content).not.toContain("NEXT_PUBLIC_");
  if (app === "mobile") {
    expect(content).toContain("EXPO_PUBLIC_");
    expect(content).not.toContain("VITE_");
    expect(content).not.toContain("DESKTOP_");
    return;
  }
  expect(content).toContain("VITE_");
  expect(content).toContain("DESKTOP_");
  expect(content).not.toContain("EXPO_PUBLIC_");
}

describe("generated app-audience environment matrix", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`monorepo/${framework}/web+mobile+desktop keeps the web prefix authoritative`, () => {
      const files = render(
        projectConfigSchema.parse({
          ...config("monorepo", framework, "web", "none"),
          name: `mixed-${framework}`,
          apps: ["web", "mobile", "desktop"],
        }),
      );
      const server = read(files, "packages/config/src/server.ts");
      const root = read(files, "packages/config/src/index.ts");
      const next = read(files, "packages/config/src/next.ts");
      const vite = read(files, "packages/config/src/vite.ts");
      const expo = read(files, "packages/config/src/expo.ts");

      expect(root).toContain("CONFIG_ENTRYPOINTS");
      expect(root).not.toContain("export { env");
      expect(server).not.toMatch(/NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_/);
      expect(next).toContain('from "@t3-oss/env-nextjs"');
      expect(next).toContain("NEXT_PUBLIC_POSTHOG_HOST");
      expect(next).not.toMatch(/\b(?:VITE_|EXPO_PUBLIC_|POSTHOG_API_KEY)\w*/);
      expect(vite).toContain('clientPrefix: "VITE_"');
      expect(vite).toContain("viteEnv.VITE_POSTHOG_HOST");
      expect(vite).not.toMatch(/\b(?:NEXT_PUBLIC_|EXPO_PUBLIC_|POSTHOG_API_KEY)\w*/);
      expect(expo).toContain('clientPrefix: "EXPO_PUBLIC_"');
      expect(expo).toContain("EXPO_PUBLIC_POSTHOG_HOST");
      expect(expo).not.toMatch(/\b(?:NEXT_PUBLIC_|VITE_|POSTHOG_API_KEY)\w*/);

      if (framework === "nextjs") {
        const proxy = read(files, "apps/web/src/app/api/ingest/route.ts");
        expect(proxy).toContain('from "@repo/config/server"');
        expect(proxy).toContain('return env.POSTHOG_HOST ?? ""');
      } else {
        expect(files.some(({ path }) => path.includes("/src/app/api/ingest/"))).toBe(false);
      }
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const app of ["web", "mobile", "desktop"] as const) {
        test(`${mode}/${framework}/${app} emits only consumed public env families`, () => {
          const files = render(config(mode, framework, app));
          expectAudience(read(files, ".env.example"), app, framework);
          expectAudience(read(files, ".env.local"), app, framework);

          if (mode === "monorepo") {
            const server = read(files, "packages/config/src/server.ts");
            expect(server).not.toMatch(/NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_/);
            const selectedEntry =
              app === "mobile"
                ? "expo"
                : app === "desktop" || framework === "tanstack-start"
                  ? "vite"
                  : "next";
            const selected = read(files, `packages/config/src/${selectedEntry}.ts`);
            const expectedPrefix =
              selectedEntry === "expo"
                ? "EXPO_PUBLIC_"
                : selectedEntry === "vite"
                  ? "VITE_"
                  : "NEXT_PUBLIC_";
            expect(selected).toContain(expectedPrefix);

            const globalEnv = (
              JSON.parse(read(files, "turbo.json")) as {
                globalEnv: string[];
              }
            ).globalEnv.join("\n");
            expectAudience(globalEnv, app, framework);
          } else {
            const server = read(files, "src/lib/env/server.ts");
            expect(server).not.toMatch(/NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_/);
            const selectedEntry =
              app === "mobile"
                ? "expo"
                : app === "desktop" || framework === "tanstack-start"
                  ? "vite"
                  : "next";
            const selected = read(files, `src/lib/env/${selectedEntry}.ts`);
            expect(selected).toContain(
              selectedEntry === "expo"
                ? "EXPO_PUBLIC_"
                : selectedEntry === "vite"
                  ? "VITE_"
                  : "NEXT_PUBLIC_",
            );
            const manifest = JSON.parse(read(files, "package.json")) as {
              dependencies: Record<string, string>;
            };
            expect(manifest.dependencies["@t3-oss/env-core"]).toBeDefined();
            expect(manifest.dependencies["@t3-oss/env-nextjs"]).toBeDefined();
          }
        });
      }
    }
  }

  test("host manifest stays exhaustive while generated audiences are filtered", () => {
    const host = getGlobalEnvKeys("bun");
    expect(host).toContain("NEXT_PUBLIC_*");
    expect(host).toContain("VITE_*");
    expect(host).toContain("EXPO_PUBLIC_*");
    expect(host).toContain("DESKTOP_*");

    const mobile = getGlobalEnvKeys("bun", {
      framework: "nextjs",
      hasWeb: false,
      hasMobile: true,
      hasDesktop: false,
    });
    expect(mobile.some((key) => key.startsWith("NEXT_PUBLIC_"))).toBe(false);
    expect(mobile.some((key) => key.startsWith("VITE_"))).toBe(false);
    expect(mobile).toContain("EXPO_PUBLIC_*");
  });
});

describe("monorepo Redis cache generation", () => {
  test("shares the fail-closed implementation without a process-local fallback", () => {
    const files = cacheComposerFiles("bun");
    const source = read(files, "packages/cache/src/index.ts");
    const singleSource = singleCacheFiles()[0]?.content;

    expect(singleSource).toBeDefined();
    expect(source).toBe(singleSource);
    expect(parseSync("packages/cache/src/index.ts", source).errors).toEqual([]);
    expect(source).toContain("throw new CacheProviderError");
    expect(source).toContain("must be configured when cache=redis");
    expect(source).not.toContain("memoryGet");
    expect(source).not.toContain("catch {}");
    expect(files.some(({ path }) => path.endsWith("/memory.ts"))).toBe(false);
  });
});

describe("single-mode Redis cache generation", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const app of ["web", "mobile", "desktop"] as const) {
      test(`${framework}/${app} emits one flat fail-closed cache with declared dependencies`, () => {
        const files = render(config("single", framework, app));
        const paths = files.map((entry) => entry.path);
        expect(paths).toContain("src/server/cache.ts");
        expect(paths.some((path) => path.startsWith("packages/"))).toBe(false);

        const manifest = JSON.parse(read(files, "package.json")) as {
          dependencies: Record<string, string>;
        };
        expect(manifest.dependencies["@upstash/redis"]).toBe(
          `^${versions.cache["@upstash/redis"]}`,
        );

        const source = read(files, "src/server/cache.ts");
        expect(parseSync("src/server/cache.ts", source).errors).toEqual([]);
        expect(source).toContain('from "@upstash/redis"');
        expect(source).toContain("throw new CacheProviderError");
        expect(source).toContain("must be configured when cache=redis");
        expect(source).not.toContain("memoryGet");
        expect(source).not.toContain("catch {}");
        expect(source).not.toContain("return null;\n  }");
        expect(read(files, ".env.example")).toContain("UPSTASH_REDIS_REST_URL=");
        const schema = read(files, "src/lib/env/server-schema.ts");
        expect(schema).toContain("UPSTASH_REDIS_REST_URL: z.string().max(2_048).url()");
        expect(schema).toContain("UPSTASH_REDIS_REST_TOKEN: z.string().min(1).max(4_096)");
      });

      test(`${framework}/${app} removes the cache implementation and dependency when disabled`, () => {
        const files = render(config("single", framework, app, "none"));
        expect(files.some((entry) => entry.path.includes("cache"))).toBe(false);
        const manifest = JSON.parse(read(files, "package.json")) as {
          dependencies: Record<string, string>;
        };
        expect(manifest.dependencies["@upstash/redis"]).toBeUndefined();
      });
    }
  }

  test("configuration and provider failures reject instead of fabricating success", async () => {
    const generated = singleCacheFiles()[0]?.content;
    if (!generated) throw new Error("Single cache template was not emitted");
    const fakeProvider = `class Redis {
  constructor(_options: unknown) {}
  async get<T>(_key: string): Promise<T | null> { throw new Error("provider unavailable"); }
  async set(): Promise<void> { throw new Error("provider unavailable"); }
  async del(): Promise<number> { throw new Error("provider unavailable"); }
  async scan(): Promise<[number, string[]]> { throw new Error("provider unavailable"); }
}`;
    const executable = generated.replace('import { Redis } from "@upstash/redis";', fakeProvider);
    const directory = mkdtempSync(join(tmpdir(), "ghostinit-cache-test-"));
    temporaryDirectories.push(directory);
    const modulePath = join(directory, "cache.ts");
    writeFileSync(modulePath, executable);
    const imported = (await import(`${pathToFileURL(modulePath).href}?case=${Date.now()}`)) as {
      cache: { get<T>(key: string): Promise<T | null> };
    };

    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    await expect(imported.cache.get("missing-config")).rejects.toMatchObject({
      name: "CacheConfigurationError",
    });

    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    await expect(imported.cache.get("provider-error")).rejects.toMatchObject({
      name: "CacheProviderError",
      message: "Redis cache operation failed: get",
    });
  });
});
