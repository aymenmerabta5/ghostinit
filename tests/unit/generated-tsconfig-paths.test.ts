import { describe, expect, test } from "bun:test";
import { posix } from "node:path";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { tsConfigFiles } from "../../src/templates/packages/typescript-config.js";
import { rootTsConfig } from "../../src/templates/root/config.js";
import type { TemplateFile } from "../../src/templates/shared.js";

interface ParsedTsConfig {
  compilerOptions?: {
    baseUrl?: unknown;
    paths?: Record<string, unknown>;
  };
}

function config(partial: Partial<ProjectConfig>): ProjectConfig {
  return projectConfigSchema.parse({
    name: "tsconfig-paths",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    framework: "nextjs",
    database: "postgres",
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    auth: false,
    api: false,
    email: false,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
    billing: [],
    features: [],
    ...partial,
  });
}

const configurations = [
  config({
    apps: ["web", "mobile", "desktop"],
    billing: ["stripe", "chargily", "paddle", "polar"],
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
    cache: "redis",
  }),
  config({
    framework: "tanstack-start",
    database: "convex",
    apps: ["web", "mobile", "desktop"],
    auth: true,
    api: true,
    messaging: true,
    storage: true,
    billing: ["stripe"],
  }),
  ...(["nextjs", "tanstack-start"] as const).flatMap((framework) =>
    (["web", "mobile", "desktop"] as const).map((app) =>
      config({ mode: "single", framework, apps: [app] }),
    ),
  ),
];

function wildcardCount(value: string): number {
  return value.split("*").length - 1;
}

function emittedConfigs(): Array<{ key: string; file: TemplateFile }> {
  const direct = [rootTsConfig(), ...tsConfigFiles()].map((file) => ({
    key: `direct::${file.path}`,
    file,
  }));
  const generated = configurations.flatMap((configuration, index) =>
    generateProjectFiles(configuration)
      .filter(({ path }) => path.endsWith(".json"))
      .map((file) => ({ key: `generated-${index}::${file.path}`, file })),
  );
  return [...direct, ...generated];
}

describe("generated TypeScript path mappings", () => {
  test("every emitted target is relative and has a valid wildcard substitution", () => {
    let pathTableCount = 0;
    for (const { key, file } of emittedConfigs()) {
      const parsed = Bun.JSONC.parse(file.content) as ParsedTsConfig;
      const compilerOptions = parsed.compilerOptions;
      if (!compilerOptions) continue;
      expect(compilerOptions.baseUrl, `${key} must not reintroduce baseUrl`).toBeUndefined();
      if (!compilerOptions.paths) continue;
      pathTableCount += 1;

      for (const [pattern, rawTargets] of Object.entries(compilerOptions.paths)) {
        expect(Array.isArray(rawTargets), `${key} ${pattern}`).toBe(true);
        const patternWildcards = wildcardCount(pattern);
        expect(patternWildcards, `${key} ${pattern}`).toBeLessThanOrEqual(1);
        for (const target of rawTargets as unknown[]) {
          expect(typeof target, `${key} ${pattern}`).toBe("string");
          const value = String(target);
          expect(value, `${key} ${pattern}`).toMatch(/^\.\.?\//);
          const targetWildcards = wildcardCount(value);
          expect(targetWildcards, `${key} ${pattern} -> ${value}`).toBeLessThanOrEqual(1);
          expect(targetWildcards, `${key} ${pattern} -> ${value}`).toBeLessThanOrEqual(
            patternWildcards,
          );
        }
      }
    }
    expect(pathTableCount).toBeGreaterThan(0);
  });

  test("every generic monorepo alias still resolves @repo/auth to packages/auth/src", () => {
    let checked = 0;
    for (const { key, file } of emittedConfigs()) {
      const parsed = Bun.JSONC.parse(file.content) as ParsedTsConfig;
      const rawTargets = parsed.compilerOptions?.paths?.["@repo/*"];
      if (!Array.isArray(rawTargets)) continue;
      const packageTarget = rawTargets.find(
        (target): target is string =>
          typeof target === "string" && target.includes("packages/*/src"),
      );
      expect(packageTarget, `${key} must retain its package workspace target`).toBeDefined();
      const resolved = posix.normalize(
        posix.join(posix.dirname(file.path), packageTarget!.replace("*", "auth")),
      );
      expect(resolved, key).toBe("packages/auth/src");
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("native app configs resolve workspace packages only through package exports", () => {
    const files = generateProjectFiles(configurations[0]!);
    for (const path of ["apps/mobile/tsconfig.json", "apps/desktop/tsconfig.json"]) {
      const file = files.find((entry) => entry.path === path);
      if (!file) throw new Error(`Missing generated config: ${path}`);
      const parsed = Bun.JSONC.parse(file.content) as ParsedTsConfig;
      const paths = parsed.compilerOptions?.paths ?? {};
      expect(
        Object.keys(paths).filter((alias) => alias.startsWith("@repo/")),
        path,
      ).toEqual([]);
      expect(paths["@/*"], path).toBeDefined();
    }
  });
});
