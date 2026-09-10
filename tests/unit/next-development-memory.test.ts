import { describe, expect, test } from "bun:test";
import { typescript as typescriptVersions } from "../../packages/versions/src/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { nextMemoryExperimentalConfig } from "../../src/templates/tooling/next-memory.js";

describe.each(["stripe", "paddle", "polar"] as const)("%s billing selection", (globalProvider) => {
  interface Config {
    experimental?: Record<string, unknown>;
    typescript?: { ignoreBuildErrors?: boolean };
    cacheComponents?: boolean;
    headers?: unknown;
    rewrites?: unknown;
    serverExternalPackages?: string[];
    intl?: boolean;
    eve?: boolean;
  }

  async function evaluate(
    source: string,
    nodeEnv: string | undefined,
    ci: string | undefined,
  ): Promise<Config> {
    const javascript = new Bun.Transpiler({
      loader: "ts",
      define: { "process.env.NODE_ENV": JSON.stringify(nodeEnv ?? "") },
    }).transformSync(
      source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/^export default /m, "return "),
    );
    const exported = new Function(
      "process",
      "withEve",
      "createNextIntlPlugin",
      "initOpenNextCloudflareForDev",
      javascript,
    )(
      { env: { NODE_ENV: nodeEnv, CI: ci } },
      (config: Config) => async () => ({
        ...config,
        eve: true,
        experimental: { ...config.experimental, turbo: {}, pluginOption: "preserved" },
      }),
      () => (config: Config) => ({ ...config, intl: true }),
      () => undefined,
    ) as Config | (() => Promise<Config>);
    return typeof exported === "function" ? await exported() : exported;
  }

  const environments = [
    ["development", undefined, "full", 2],
    ["development", "", "full", 2],
    ["development", "true", "auto", undefined],
    ["development", "1", "auto", undefined],
    ["production", undefined, "auto", 2],
    ["production", "true", "auto", undefined],
    ["test", undefined, "auto", 2],
    [undefined, undefined, "auto", 2],
  ] as const;

  describe("generated Next local memory policy", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const eve of [false, true]) {
        for (const i18n of [false, true]) {
          test(`${mode}/eve-${eve}/i18n-${i18n} bounds local workers and development caches without changing CI or plugins`, async () => {
            const files = generateProjectFiles(
              projectConfigSchema.parse({
                name: "next-memory",
                mode,
                runtime: "node",
                framework: "nextjs",
                database: "postgres",
                preset: "custom",
                apps: ["web"],
                auth: true,
                api: true,
                billing: ["chargily", globalProvider],
                features: [...(eve ? ["eve"] : []), ...(i18n ? ["i18n"] : [])],
                cache: "none",
                deploy: "none",
              }),
              { dryRun: true },
            );
            const path = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
            const source = files.find((file) => file.path === path)?.content;
            if (!source) throw new Error(`Missing ${path}`);
            expect(source.match(/cpus:/g)).toHaveLength(1);
            expect(source.match(/turbopackMemoryEviction:/g)).toHaveLength(1);
            expect(source).not.toContain("memoryLimit");
            expect(source).not.toContain("turbopackFileSystemCacheForDev: false");
            for (const [nodeEnv, ci, expected, workers] of environments) {
              const config = await evaluate(source, nodeEnv, ci);
              expect(Object.hasOwn(config.experimental ?? {}, "cpus"), `${nodeEnv}/${ci}`).toBe(
                workers !== undefined,
              );
              expect(config.experimental?.cpus, `${nodeEnv}/${ci}`).toBe(workers);
              expect(config.experimental?.turbopackMemoryEviction, `${nodeEnv}/${ci}`).toBe(
                expected,
              );
              expect(config.experimental?.webpackBuildWorker).toBe(true);
              expect(config.cacheComponents).toBe(true);
              expect(typeof config.headers).toBe("function");
              expect(typeof config.rewrites).toBe("function");
              expect(config.serverExternalPackages).toEqual(
                {
                  stripe: ["stripe", "@chargily/chargily-pay"],
                  paddle: ["@chargily/chargily-pay", "@paddle/paddle-node-sdk"],
                  polar: ["@chargily/chargily-pay", "@polar-sh/sdk"],
                }[globalProvider],
              );
              expect(Boolean(config.intl)).toBe(i18n);
              expect(Boolean(config.eve)).toBe(eve);
              if (eve) {
                expect(config.experimental?.pluginOption).toBe("preserved");
                expect(config.experimental?.turbo).toBeUndefined();
              }
            }
          });
        }
      }
    }
  });

  describe("Next build-worker scope and complete TypeScript policy", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const runtime of ["node", "bun"] as const) {
        for (const hasCloudflare of [false, true]) {
          test(
            mode +
              "/" +
              runtime +
              "/cloudflare-" +
              hasCloudflare +
              " preserves the selected runtime and full TypeScript check",
            async () => {
              const files = generateProjectFiles(
                projectConfigSchema.parse({
                  name: "next-build-worker",
                  mode,
                  runtime,
                  framework: "nextjs",
                  database: "convex",
                  preset: "custom",
                  apps: ["web"],
                  auth: true,
                  api: true,
                  billing: ["chargily", globalProvider],
                  features: ["i18n"],
                  cache: "none",
                  deploy: hasCloudflare ? "cloudflare" : "none",
                }),
                { dryRun: true },
              );
              const sourceFor = (path: string): string => {
                const file = files.find((entry) => entry.path === path);
                if (!file) throw new Error("Missing " + path);
                return file.content;
              };
              const prefix = mode === "monorepo" ? "apps/web/" : "";
              const source = sourceFor(prefix + "next.config.ts");
              for (const [nodeEnv, ci, expected, workers] of environments) {
                const config = await evaluate(source, nodeEnv, ci);
                expect(config.experimental?.webpackBuildWorker).toBe(
                  hasCloudflare ? undefined : true,
                );
                expect(config.experimental?.cpus).toBe(workers);
                expect(config.experimental?.turbopackMemoryEviction).toBe(expected);
                expect(config.experimental?.useTypeScriptCli).toBeUndefined();
                expect(config.typescript?.ignoreBuildErrors).toBeUndefined();
                expect(config.intl).toBe(true);
              }
              expect(source.includes("webpackBuildWorker")).toBe(!hasCloudflare);
              const rootPackage = JSON.parse(sourceFor("package.json"));
              const appPackage = JSON.parse(sourceFor(prefix + "package.json"));
              expect(rootPackage.devDependencies.typescript).toBe(typescriptVersions.typescript);
              expect(appPackage.devDependencies.typescript).toBe(typescriptVersions.typescript);
              expect(appPackage.scripts.typecheck).toBe("tsc --noEmit");
              expect(rootPackage.scripts["lint:all"]).toContain("typecheck");
              expect(appPackage.scripts.build).toBe(
                hasCloudflare
                  ? "bun scripts/cloudflare.mjs build"
                  : runtime === "bun"
                    ? "bun ./node_modules/next/dist/bin/next build --webpack"
                    : "next build",
              );
              const appTsconfig = JSON.parse(sourceFor(prefix + "tsconfig.json"));
              const compilerOptions =
                mode === "monorepo"
                  ? {
                      ...JSON.parse(sourceFor("packages/typescript-config/nextjs.json"))
                        .compilerOptions,
                      ...appTsconfig.compilerOptions,
                    }
                  : appTsconfig.compilerOptions;
              expect(compilerOptions).toMatchObject({
                allowJs: true,
                noEmit: true,
                isolatedModules: true,
                jsx: "react-jsx",
                plugins: [{ name: "next" }],
              });
              expect(appTsconfig.include).toEqual(
                expect.arrayContaining([".next/types/**/*.ts", ".next/dev/types/**/*.ts"]),
              );
              expect(appTsconfig.exclude).toContain(".ghostinit");
              expect(appTsconfig.exclude).not.toContain(".next");
            },
          );
        }
      }
    }
  });
});

test("Cloudflare memory policy remains byte-for-byte unchanged", () => {
  const original =
    '  experimental: {\n    // Limit local prerender worker copies; CI keeps Next\'s default parallelism.\n    ...(process.env.CI ? {} : { cpus: 2 }),\n    // Reclaim persisted compiler cache between local development snapshots.\n    turbopackMemoryEviction:\n      process.env.NODE_ENV === "development" && !process.env.CI ? "full" : "auto",\n  },';
  expect(nextMemoryExperimentalConfig(true)).toBe(original);
});
