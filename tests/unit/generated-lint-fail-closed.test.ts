import { describe, expect, test } from "bun:test";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function config(overrides: Partial<ProjectConfig>): ProjectConfig {
  return projectConfigSchema.parse({
    name: "lint-fail-closed",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    database: "postgres",
    preset: "custom",
    auth: true,
    api: true,
    email: true,
    analytics: true,
    billing: [],
    messaging: true,
    storage: true,
    notifications: true,
    featureFlags: "posthog",
    jobs: true,
    pdf: true,
    apps: ["web", "mobile", "desktop"],
    features: ["i18n"],
    ...overrides,
  });
}

function source(files: readonly TemplateFile[], path: string): string {
  const match = files.find((candidate) => candidate.path === path);
  expect(match, `missing generated file: ${path}`).toBeDefined();
  return match?.content ?? "";
}

function lintWarningsAllowed(files: readonly TemplateFile[]): string[] {
  return files.flatMap(({ path, content }) => {
    if (!path.endsWith("package.json")) return [];
    const manifest: unknown = JSON.parse(content);
    if (!manifest || typeof manifest !== "object") return [];
    const scripts = Reflect.get(manifest, "scripts");
    if (!scripts || typeof scripts !== "object") return [];
    return Object.entries(scripts).flatMap(([name, command]) => {
      if (!name.startsWith("lint") || typeof command !== "string" || !command.includes("oxlint")) {
        return [];
      }
      return command.includes("--deny-warnings") ? [] : [`${path}#${name}: ${command}`];
    });
  });
}

describe("generated lint gates fail closed", () => {
  const cases: Array<[string, Partial<ProjectConfig>]> = [
    ["monorepo Next/Expo/Electron", {}],
    ["monorepo TanStack/Expo/Electron", { framework: "tanstack-start" }],
    ["single Next", { mode: "single", apps: ["web"] }],
    ["single TanStack", { mode: "single", framework: "tanstack-start", apps: ["web"] }],
    [
      "single Expo frontend",
      {
        mode: "single",
        database: "none",
        preset: "frontend",
        auth: false,
        api: false,
        email: false,
        analytics: true,
        messaging: false,
        storage: false,
        notifications: false,
        featureFlags: "none",
        jobs: false,
        pdf: false,
        apps: ["mobile"],
      },
    ],
    [
      "single Electron frontend",
      {
        mode: "single",
        database: "none",
        preset: "frontend",
        auth: false,
        api: false,
        email: false,
        analytics: true,
        messaging: false,
        storage: false,
        notifications: false,
        featureFlags: "none",
        jobs: false,
        pdf: false,
        apps: ["desktop"],
      },
    ],
  ];

  for (const [label, overrides] of cases) {
    test(`${label} denies oxlint warnings`, () => {
      const files = generateProjectFiles(config(overrides), { dryRun: true });
      expect(lintWarningsAllowed(files)).toEqual([]);
    });
  }

  test("generated commit hooks deny oxlint warnings", () => {
    const files = generateProjectFiles(config({}), { dryRun: true });
    expect(source(files, ".husky/pre-commit")).toContain(
      "bunx --no-install oxlint --deny-warnings .",
    );
    expect(source(files, "lefthook.yml")).toContain(
      "run: bunx --no-install oxlint --deny-warnings .",
    );
  });

  test("frontend-only Electron omits the conditional loading import", () => {
    const frontend = generateProjectFiles(
      config({
        mode: "single",
        database: "none",
        preset: "frontend",
        auth: false,
        api: false,
        email: false,
        analytics: true,
        messaging: false,
        storage: false,
        notifications: false,
        featureFlags: "none",
        jobs: false,
        pdf: false,
        apps: ["desktop"],
      }),
      { dryRun: true },
    );
    const frontendHome = source(frontend, "src/renderer/features/home/screen.tsx");
    expect(frontendHome).not.toContain('import { Skeleton } from "@/components/ui/skeleton"');
    expect(frontendHome).not.toContain("<Skeleton");

    const full = generateProjectFiles(config({ apps: ["web", "desktop"] }), { dryRun: true });
    const fullHome = source(full, "apps/desktop/src/renderer/features/home/screen.tsx");
    expect(fullHome).toContain('import { Skeleton } from "@/components/ui/skeleton"');
    expect(fullHome).toContain("<Skeleton");
  });
});
