import { describe, expect, test } from "bun:test";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

const SECRET_NAMES = [
  "BETTER_AUTH_SECRET",
  "POSTGRES_PASSWORD",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CHARGILY_SECRET_KEY",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POSTHOG_API_KEY",
  "S3_SECRET_ACCESS_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
] as const;

function config(overrides: Partial<ProjectConfig>): ProjectConfig {
  return projectConfigSchema.parse({
    name: "runtime-config",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    database: "convex",
    preset: "custom",
    apps: ["web", "mobile", "desktop"],
    auth: true,
    api: true,
    email: true,
    analytics: true,
    notifications: true,
    messaging: true,
    storage: true,
    cache: "redis",
    billing: ["stripe"],
    features: [],
    ...overrides,
  });
}

function generated(overrides: Partial<ProjectConfig>): TemplateFile[] {
  return generateProjectFiles(config(overrides), { dryRun: true });
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((file) => file.path === path);
  if (!found) throw new Error(`Missing generated file: ${path}`);
  return found.content;
}

function schemaKeys(source: string): string[] {
  return [...source.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):/gm)]
    .map((match) => match[1] ?? "")
    .filter(Boolean)
    .toSorted();
}

function configImports(source: string): string[] {
  return [...source.matchAll(/from\s+["']((?:@repo\/config|@\/lib\/env)(?:\/[^"']+)?)['"]/g)].map(
    (match) => match[1] ?? "",
  );
}

function isClientSurface(file: TemplateFile): boolean {
  return (
    /["']use client["']/.test(file.content) ||
    file.path.startsWith("apps/mobile/") ||
    file.path.startsWith("apps/desktop/src/renderer/") ||
    file.path.startsWith("src/renderer/")
  );
}

function expectedClientEntry(
  file: TemplateFile,
  framework: "nextjs" | "tanstack-start",
): "next" | "vite" | "expo" {
  if (file.path.startsWith("apps/mobile/") || file.path.startsWith("app/")) return "expo";
  if (file.path.includes("desktop/src/renderer/") || file.path.startsWith("src/renderer/")) {
    return "vite";
  }
  return framework === "tanstack-start" ? "vite" : "next";
}

describe("runtime-specific generated config entrypoints", () => {
  test("monorepo exports a safe root plus explicit server and public runtimes", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generated({ framework });
      const manifest = JSON.parse(read(files, "packages/config/package.json")) as {
        exports: Record<string, string>;
      };
      expect(manifest.exports).toEqual({
        ".": "./src/index.ts",
        "./server": "./src/server.ts",
        "./next": "./src/next.ts",
        "./vite": "./src/vite.ts",
        "./expo": "./src/expo.ts",
        "./desktop-main": "./src/desktop-main.ts",
      });
      expect(manifest.exports["./server-schema"]).toBeUndefined();
      for (const name of [
        "index",
        "server-schema",
        "server",
        "next",
        "vite",
        "expo",
        "desktop-main",
      ]) {
        expect(
          files.some(({ path }) => path === `packages/config/src/${name}.ts`),
          name,
        ).toBe(true);
      }
      expect(files.some(({ path }) => path === "packages/config/src/env.ts")).toBe(false);

      const root = read(files, "packages/config/src/index.ts");
      expect(root).toContain("CONFIG_ENTRYPOINTS");
      expect(root).not.toContain("export { env");
      expect(root).not.toMatch(/process\.env|import\.meta\.env/);
      for (const secret of SECRET_NAMES) expect(root).not.toContain(secret);
    }
  });

  test("single mode mirrors isolated entries without a monolithic compatibility value", () => {
    for (const [framework, apps] of [
      ["nextjs", ["web"]],
      ["tanstack-start", ["web"]],
      ["nextjs", ["mobile"]],
      ["nextjs", ["desktop"]],
    ] as const) {
      const files = generated({ mode: "single", framework, apps: [...apps] });
      for (const name of [
        "index",
        "server-schema",
        "server",
        "next",
        "vite",
        "expo",
        "desktop-main",
      ]) {
        expect(
          files.some(({ path }) => path === `src/lib/env/${name}.ts`),
          name,
        ).toBe(true);
      }
      expect(files.some(({ path }) => path === "src/lib/env.ts")).toBe(false);
      const root = read(files, "src/lib/env/index.ts");
      expect(root).not.toContain("export { env");
      expect(root).not.toMatch(/process\.env|import\.meta\.env/);
    }
  });

  test("public modules are lexically prefix-isolated and contain no server secret", () => {
    const files = generated({ framework: "nextjs" });
    const entries = {
      next: read(files, "packages/config/src/next.ts"),
      vite: read(files, "packages/config/src/vite.ts"),
      expo: read(files, "packages/config/src/expo.ts"),
    };
    for (const [entry, source] of Object.entries(entries)) {
      for (const secret of SECRET_NAMES)
        expect(source, `${entry}: ${secret}`).not.toContain(secret);
    }
    expect(entries.next).toContain("process.env.NEXT_PUBLIC_APP_URL");
    expect(entries.next).not.toMatch(/\b(?:VITE_|EXPO_PUBLIC_)\w*/);
    expect(entries.vite).toContain("viteEnv.VITE_APP_URL");
    expect(entries.vite).not.toMatch(/\b(?:NEXT_PUBLIC_|EXPO_PUBLIC_)\w*/);
    expect(entries.vite).not.toMatch(/viteEnv\s*\[/);
    expect(entries.expo).toContain("process.env.EXPO_PUBLIC_APP_URL");
    expect(entries.expo).not.toMatch(/\b(?:NEXT_PUBLIC_|VITE_)\w*/);

    const server = `${read(files, "packages/config/src/server-schema.ts")}\n${read(
      files,
      "packages/config/src/server.ts",
    )}`;
    expect(server).not.toMatch(/NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_/);
  });

  test("desktop packages embed a validated secret-free endpoint with runtime override precedence", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const mode of ["monorepo", "single"] as const) {
        const files = generated({
          mode,
          framework,
          apps: ["desktop"],
          preset: "frontend",
          database: "none",
          auth: false,
          api: false,
          email: false,
          analytics: false,
          billing: [],
        });
        const label = `${mode}/${framework}`;
        const prefix = mode === "monorepo" ? "apps/desktop/" : "";
        const configPath =
          mode === "monorepo"
            ? "packages/config/src/desktop-main.ts"
            : "src/lib/env/desktop-main.ts";
        const configSource = read(files, configPath);
        const runtimeConfig = read(files, `${prefix}src/server/transport/runtime-config.ts`);
        const main = read(files, `${prefix}src/main.ts`);
        const vite = read(files, `${prefix}electron.vite.config.ts`);
        const expectedConfigImport =
          mode === "monorepo" ? "@repo/config/desktop-main" : "./src/lib/env/desktop-main";

        expect(main, label).toMatch(/from "\.\/server\/transport\/runtime-config(?:\.js)?"/);
        expect(runtimeConfig, label).toContain(
          `from "${mode === "monorepo" ? "@repo/config/desktop-main" : "../../lib/env/desktop-main"}"`,
        );
        expect(vite, label).toContain(`from "${expectedConfigImport}"`);
        expect(vite, label).toContain('loadEnv(mode, environmentRoot, "DESKTOP_API_URL")');
        expect(vite, label).toContain(
          "__GHOSTINIT_DESKTOP_EMBEDDED_API_URL__: JSON.stringify(embeddedApiUrl)",
        );
        expect(vite, label).toContain("{ isPackaged: true }");
        expect(configSource, label).not.toContain("VITE_API_URL");
        expect(main, label).not.toContain("@repo/config/server");
        expect(main, label).toContain(
          'const DESKTOP_STARTUP_SMOKE_ARGUMENT = "--ghostinit-startup-smoke"',
        );
        expect(main, label).toContain('process.stdout.write("[desktop] startup smoke ok\\n")');
        expect(main, label).toContain("app.exit(0)");
        expect(main, label).not.toContain('startup smoke ok\\n", () => app.exit');
        if (mode === "monorepo") {
          expect(vite).toContain('externalizeDeps: { exclude: ["@repo/config"] }');
          expect(vite).toContain('new URL("../../", import.meta.url)');
        } else {
          expect(vite).toContain('new URL("./", import.meta.url)');
        }
        for (const secret of SECRET_NAMES) {
          expect(configSource, `${label}: config ${secret}`).not.toContain(secret);
          expect(runtimeConfig, `${label}: runtime ${secret}`).not.toContain(secret);
          expect(vite, `${label}: build ${secret}`).not.toContain(secret);
          expect(main, `${label}: main ${secret}`).not.toContain(secret);
        }

        const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
          configSource.replace(/^export /gm, ""),
        );
        const resolveDesktopMainEnv = new Function(
          `${executable}; return resolveDesktopMainEnv;`,
        )() as (
          environment: Readonly<Record<string, string | undefined>>,
          options?: { readonly embeddedApiUrl?: string; readonly isPackaged: boolean },
        ) => { DESKTOP_API_URL: string };

        expect(resolveDesktopMainEnv({}, { isPackaged: false })).toEqual({
          DESKTOP_API_URL: "http://localhost:3000",
        });
        expect(
          resolveDesktopMainEnv(
            {},
            { embeddedApiUrl: "https://embedded.example.com/base", isPackaged: true },
          ),
        ).toEqual({ DESKTOP_API_URL: "https://embedded.example.com" });
        expect(
          resolveDesktopMainEnv(
            { DESKTOP_API_URL: "https://managed.example.com/runtime" },
            { embeddedApiUrl: "https://embedded.example.com", isPackaged: true },
          ),
        ).toEqual({ DESKTOP_API_URL: "https://managed.example.com" });
        expect(() => resolveDesktopMainEnv({}, { isPackaged: true })).toThrow(
          "required for packaged",
        );
        expect(() =>
          resolveDesktopMainEnv({ DESKTOP_API_URL: "http://localhost:3000" }, { isPackaged: true }),
        ).toThrow("must use HTTPS");
        expect(
          resolveDesktopMainEnv(
            { DESKTOP_API_URL: "http://127.0.0.1:3000/path" },
            { isPackaged: false },
          ),
        ).toEqual({ DESKTOP_API_URL: "http://127.0.0.1:3000" });
        for (const unsafe of [
          "ftp://api.example.com",
          "https://user:password@api.example.com",
          "https://api.example.com?tenant=one",
          "https://api.example.com#fragment",
        ]) {
          expect(() =>
            resolveDesktopMainEnv(
              { DESKTOP_API_URL: unsafe },
              { embeddedApiUrl: "https://embedded.example.com", isPackaged: true },
            ),
          ).toThrow();
        }
      }
    }

    const full = generated({ framework: "nextjs", apps: ["web", "desktop"] });
    const main = read(full, "apps/desktop/src/main.ts");
    const runtimeConfig = read(full, "apps/desktop/src/server/transport/runtime-config.ts");
    const transport = read(full, "apps/desktop/src/server/transport/api-fetch.ts");
    expect(main).toMatch(/from "\.\/server\/transport\/runtime-config(?:\.js)?"/);
    expect(runtimeConfig).toContain('from "@repo/config/desktop-main"');
    expect(transport).toMatch(/from "\.\/runtime-config(?:\.js)?"/);
    expect(`${main}\n${runtimeConfig}\n${transport}`).not.toContain("env.BETTER_AUTH_URL");
    expect(`${main}\n${runtimeConfig}\n${transport}`).not.toContain("@repo/config/server");
  });

  test("every generated client imports only its audience config entry", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generated({ framework });
      const entrySources = {
        next: read(files, "packages/config/src/next.ts"),
        vite: read(files, "packages/config/src/vite.ts"),
        expo: read(files, "packages/config/src/expo.ts"),
      };
      for (const file of files.filter(isClientSurface)) {
        for (const specifier of configImports(file.content)) {
          const expected = expectedClientEntry(file, framework);
          expect(specifier, file.path).toBe(`@repo/config/${expected}`);
          expect(specifier, file.path).not.toBe("@repo/config/server");
          expect(specifier, file.path).not.toBe("@repo/config");
          for (const match of file.content.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)) {
            const key = match[1];
            expect(entrySources[expected], `${file.path}: ${key}`).toContain(`${key}:`);
          }
        }
      }

      const analyticsClient = files
        .filter(({ path }) => path.startsWith("packages/analytics/src/client/"))
        .map(({ content }) => content)
        .join("\n");
      expect(analyticsClient).toContain(
        framework === "nextjs" ? "@repo/config/next" : "@repo/config/vite",
      );
      expect(analyticsClient).not.toContain("@repo/config/server");
      expect(analyticsClient).not.toContain("POSTHOG_API_KEY");
    }
  });

  test("monorepo and single schemas keep the same key contracts", () => {
    const monorepo = generated({ mode: "monorepo", framework: "nextjs", apps: ["web"] });
    const single = generated({ mode: "single", framework: "nextjs", apps: ["web"] });
    expect(schemaKeys(read(single, "src/lib/env/server-schema.ts"))).toEqual(
      schemaKeys(read(monorepo, "packages/config/src/server-schema.ts")),
    );
    for (const entry of ["next", "vite", "expo"] as const) {
      expect(schemaKeys(read(single, `src/lib/env/${entry}.ts`))).toEqual(
        schemaKeys(read(monorepo, `packages/config/src/${entry}.ts`)),
      );
    }
  });

  test("every typed env consumer references a key declared by its imported entry", () => {
    for (const overrides of [
      { mode: "monorepo", framework: "nextjs", apps: ["web", "mobile", "desktop"] },
      {
        mode: "monorepo",
        framework: "tanstack-start",
        apps: ["web", "mobile", "desktop"],
      },
      { mode: "single", framework: "nextjs", apps: ["web"] },
      { mode: "single", framework: "tanstack-start", apps: ["web"] },
      { mode: "single", framework: "nextjs", apps: ["mobile"] },
      { mode: "single", framework: "nextjs", apps: ["desktop"] },
    ] satisfies Array<Partial<ProjectConfig>>) {
      const files = generated(overrides);
      for (const file of files) {
        for (const specifier of configImports(file.content)) {
          const entry = specifier.split("/").at(-1);
          if (!entry || !["server", "next", "vite", "expo", "desktop-main"].includes(entry))
            continue;
          const targetPath =
            overrides.mode === "single"
              ? `src/lib/env/${entry}.ts`
              : `packages/config/src/${entry}.ts`;
          const target = read(files, targetPath);
          for (const match of file.content.matchAll(/(?<!\.)\benv\.([A-Z][A-Z0-9_]+)/g)) {
            const key = match[1];
            expect(target, `${file.path}: ${specifier}.${key}`).toContain(`${key}:`);
          }
        }
      }
    }
  });

  test("tsconfig aliases expose only the supported config entrypoints", () => {
    const files = generated({ framework: "nextjs" });
    const rootTsconfig = JSON.parse(read(files, "tsconfig.json")) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    const paths = rootTsconfig.compilerOptions.paths;
    for (const entry of ["server", "next", "vite", "expo", "desktop-main"] as const) {
      expect(paths[`@repo/config/${entry}`]).toEqual([`./packages/config/src/${entry}.ts`]);
    }
    expect(paths["@repo/config/*"]).toBeUndefined();
  });
});
