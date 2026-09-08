import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

interface Config {
  experimental?: Record<string, unknown>;
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
              billing: ["stripe", "chargily", "paddle", "polar"],
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
            expect(config.experimental?.turbopackMemoryEviction, `${nodeEnv}/${ci}`).toBe(expected);
            expect(config.cacheComponents).toBe(true);
            expect(typeof config.headers).toBe("function");
            expect(typeof config.rewrites).toBe("function");
            expect(config.serverExternalPackages).toEqual([
              "stripe",
              "@chargily/chargily-pay",
              "@paddle/paddle-node-sdk",
              "@polar-sh/sdk",
            ]);
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
