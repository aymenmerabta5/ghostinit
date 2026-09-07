import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const providerPackages = {
  stripe: "stripe",
  chargily: "@chargily/chargily-pay",
  paddle: "@paddle/paddle-node-sdk",
  polar: "@polar-sh/sdk",
} as const;
type Provider = keyof typeof providerPackages;
const providers = Object.keys(providerPackages) as Provider[];

function generate(
  mode: "single" | "monorepo",
  runtime: "node" | "bun",
  billing: Provider[],
  cloudflare = false,
) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "next-server-packages",
      mode,
      runtime,
      framework: "nextjs",
      database: cloudflare ? "convex" : "postgres",
      preset: "custom",
      apps: ["web"],
      auth: true,
      api: true,
      billing,
      features: [],
      cache: "none",
      deploy: cloudflare ? "cloudflare" : "none",
    }),
    { dryRun: true },
  );
}

function content(files: ReturnType<typeof generate>, path: string): string {
  const source = files.find((file) => file.path === path)?.content;
  if (!source) throw new Error(`Missing ${path}`);
  return source;
}

describe("Next native server dependency boundary", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const runtime of ["node", "bun"] as const) {
      test(`${mode}/${runtime} externalizes only selected server SDKs owned by the web manifest`, () => {
        for (let mask = 0; mask < 1 << providers.length; mask++) {
          const selected = providers.filter((_, index) => (mask & (1 << index)) !== 0);
          const files = generate(mode, runtime, selected);
          const prefix = mode === "single" ? "" : "apps/web/";
          const config = content(files, prefix + "next.config.ts");
          const manifest = JSON.parse(content(files, prefix + "package.json")) as {
            dependencies: Record<string, string>;
          };
          const declaration = config.match(/serverExternalPackages: (\[[\s\S]*?\])/);
          if (selected.length === 0) {
            expect(declaration).toBeNull();
            continue;
          }
          expect(config.match(/serverExternalPackages:/g)).toHaveLength(1);
          if (!declaration?.[1]) throw new Error("Missing native package policy");
          const externals = JSON.parse(declaration[1]) as string[];
          expect(externals).toEqual(selected.map((provider) => providerPackages[provider]));
          expect(externals).not.toContain("@paddle/paddle-js");
          for (const external of externals) {
            expect(manifest.dependencies[external], `${prefix}${external}`).toBeString();
          }
          for (const provider of providers.filter((candidate) => !selected.includes(candidate))) {
            expect(manifest.dependencies[providerPackages[provider]]).toBeUndefined();
          }
        }
      });

      test(`${mode}/${runtime} leaves Worker SDK packaging to its adapter`, () => {
        const files = generate(mode, runtime, [...providers], true);
        const prefix = mode === "single" ? "" : "apps/web/";
        const config = content(files, prefix + "next.config.ts");
        expect(config).not.toContain("serverExternalPackages");
        expect(config).toContain("initOpenNextCloudflareForDev");
        const manifest = JSON.parse(content(files, prefix + "package.json")) as {
          dependencies: Record<string, string>;
        };
        for (const provider of providers) {
          expect(manifest.dependencies[providerPackages[provider]]).toBeString();
        }
      });
    }
  }
});
