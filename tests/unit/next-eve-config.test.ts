import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Next Eve config composition", () => {
  test("resolves the Eve config function before normalizing legacy experimental.turbo", () => {
    const compileRoot = mkdtempSync(join(tmpdir(), "ghostinit-next-eve-config-"));
    roots.push(compileRoot);
    const configFiles: string[] = [];

    for (const mode of ["monorepo", "single"] as const) {
      for (const runtime of ["bun", "node"] as const) {
        for (const i18n of [false, true] as const) {
          const files = generateProjectFiles(
            projectConfigSchema.parse({
              name: `eve-${mode}-${runtime}-${i18n ? "i18n" : "plain"}`,
              runtime,
              version: "0.1.0",
              mode,
              framework: "nextjs",
              database: "postgres",
              billing: [],
              features: [],
              apps: ["web"],
              preset: "custom",
              auth: true,
              api: true,
              eve: true,
              i18n,
            }),
            { dryRun: false, validate: true },
          );
          const path = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
          const source = files.find((file) => file.path === path)?.content;
          if (!source) throw new Error(`Missing generated ${mode} Next config`);

          expect(source).toContain("type EveNextConfigFunction");
          expect(source).toContain("const withEveConfig = withEve(");
          expect(source).toContain(
            "const nextConfig: EveNextConfigFunction<NextConfig> = async (phase, context)",
          );
          expect(source).toContain("const resolved = await withEveConfig(phase, context)");
          expect(source).toContain("const experimental = resolved.experimental");
          expect(source).toContain('Reflect.deleteProperty(normalizedExperimental, "turbo")');
          expect(source).not.toContain("nextConfig.experimental");
          expect(source).not.toContain("eveExperimental");
          if (i18n) expect(source).toContain("withEve(withNextIntl(config)");

          const compilePath = `next-${mode}-${runtime}-${i18n ? "i18n" : "plain"}.ts`;
          writeFileSync(join(compileRoot, compilePath), source);
          configFiles.push(compilePath);
        }
      }
    }

    writeFileSync(
      join(compileRoot, "modules.d.ts"),
      `declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
declare module "next" {
  export interface NextConfig {
    [key: string]: unknown;
    experimental?: Record<string, unknown>;
  }
}
declare module "eve/next" {
  import type { NextConfig } from "next";
  export type EveNextConfigFunction<TConfig extends NextConfig = NextConfig> = (
    phase: string,
    context: { readonly defaultConfig: TConfig },
  ) => TConfig | Promise<TConfig>;
  export function withEve<TConfig extends NextConfig>(
    config: TConfig | EveNextConfigFunction<TConfig>,
    options?: { eveRoot?: string },
  ): EveNextConfigFunction<TConfig>;
}
declare module "next-intl/plugin" {
  export default function createNextIntlPlugin(path: string): <T>(config: T) => T;
}
`,
    );
    writeFileSync(
      join(compileRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "bundler",
          skipLibCheck: true,
        },
        files: ["modules.d.ts", ...configFiles],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
      {
        cwd: compileRoot,
        encoding: "utf8",
        shell: false,
        timeout: 30_000,
        windowsHide: true,
      },
    );
    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
