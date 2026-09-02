import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function config(mode: "monorepo" | "single") {
  return projectConfigSchema.parse({
    name: `tanstack-plugin-${mode}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework: "tanstack-start",
    database: "postgres",
    billing: [],
    features: [],
    apps: ["web"],
    preset: "custom",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: true,
    i18n: false,
    pdf: false,
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
    cache: "none",
    deploy: "none",
  });
}

describe("TanStack Start Vite plugin shape", () => {
  test("flattens the latest array-returning plugin without changing plugin order", () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-tanstack-plugin-shape-"));
    roots.push(root);
    const sources: string[] = [];

    for (const mode of ["monorepo", "single"] as const) {
      const files = generateProjectFiles(config(mode), { dryRun: true, validate: true });
      const path = mode === "monorepo" ? "apps/web/vite.config.ts" : "vite.config.ts";
      const nitroPath = mode === "monorepo" ? "apps/web/nitro.config.ts" : "nitro.config.ts";
      const packagePath = mode === "monorepo" ? "apps/web/package.json" : "package.json";
      const source = files.find((entry) => entry.path === path)?.content;
      const nitroSource = files.find((entry) => entry.path === nitroPath)?.content;
      const manifest = JSON.parse(
        files.find((entry) => entry.path === packagePath)?.content ?? "{}",
      ) as { dependencies?: Record<string, string> };
      if (!source) throw new Error(`Missing ${mode} TanStack Vite config`);
      if (!nitroSource) throw new Error(`Missing ${mode} TanStack Nitro config`);
      expect(source).toContain("...tanstackStart({");
      expect(source.indexOf("tailwindcss()"), mode).toBeLessThan(
        source.indexOf("...tanstackStart({"),
      );
      expect(source.indexOf("...tanstackStart({"), mode).toBeLessThan(
        source.indexOf("viteReact()"),
      );
      expect(nitroSource).not.toContain("externals:");
      expect(nitroSource).not.toContain("noExternals");
      expect(manifest.dependencies?.pg).toBeTruthy();
      const filename = `${mode}.ts`;
      writeFileSync(join(root, filename), source);
      sources.push(filename);
    }

    writeFileSync(
      join(root, "modules.d.ts"),
      `declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
declare module "vite" {
  export type PluginOption = { readonly name: string } | false | null | undefined;
  export function defineConfig(
    value: (environment: { readonly command: string }) =>
      | {
          readonly plugins: readonly PluginOption[];
          readonly [key: string]: unknown;
        }
      | Promise<{
          readonly plugins: readonly PluginOption[];
          readonly [key: string]: unknown;
        }>,
  ): unknown;
}
declare module "@tanstack/react-start/plugin/vite" {
  import type { PluginOption } from "vite";
  export function tanstackStart(options?: unknown): PluginOption[];
}
declare module "@vitejs/plugin-react" {
  import type { PluginOption } from "vite";
  export default function viteReact(): PluginOption;
}
declare module "@tailwindcss/vite" {
  import type { PluginOption } from "vite";
  export default function tailwindcss(): PluginOption;
}
declare module "nitro/vite" {
  import type { PluginOption } from "vite";
  export function nitro(): PluginOption;
}
declare module "node:url" {
  export function fileURLToPath(value: URL): string;
}
`,
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "bundler",
          skipLibCheck: true,
        },
        files: ["modules.d.ts", ...sources],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
      {
        cwd: root,
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
