import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  generatedGitattributesContent,
  generatedGitignoreContent,
} from "../../src/templates/gitignore.js";

const configurations: Array<{ label: string; config: ProjectConfig }> = [
  ["monorepo Next", { mode: "monorepo", framework: "nextjs", apps: ["web"] }],
  ["monorepo TanStack", { mode: "monorepo", framework: "tanstack-start", apps: ["web"] }],
  ["monorepo Expo", { mode: "monorepo", framework: "nextjs", apps: ["mobile"] }],
  ["monorepo Electron", { mode: "monorepo", framework: "nextjs", apps: ["desktop"] }],
  ["single Next", { mode: "single", framework: "nextjs", apps: ["web"] }],
  ["single TanStack", { mode: "single", framework: "tanstack-start", apps: ["web"] }],
  ["single Expo", { mode: "single", framework: "nextjs", apps: ["mobile"] }],
  ["single Electron", { mode: "single", framework: "nextjs", apps: ["desktop"] }],
].map(([label, partial]) => ({
  label: label as string,
  config: projectConfigSchema.parse({
    name: "ignore-contract",
    runtime: "bun",
    database: "none",
    preset: "frontend",
    billing: [],
    features: [],
    auth: false,
    api: false,
    email: false,
    analytics: false,
    ...(partial as Partial<ProjectConfig>),
  }),
}));

const ignoredPaths = [
  ".env",
  ".env.local",
  ".env.production",
  "apps/web/.env.local",
  "apps/mobile/.env.production",
  "apps/desktop/.env",
  "apps/web/.next/cache/entry",
  "apps/web/.output/server/entry",
  "apps/web/.vercel/output/entry",
  "apps/mobile/.expo/state.json",
  "coverage/lcov.info",
  "reports/audit.json",
  "apps/web/coverage/lcov.info",
  "apps/web/reports/test.json",
  "apps/desktop/out/installer.exe",
] as const;

const trackedPaths = [
  ".env.example",
  ".env.production.example",
  ".env.template",
  ".env.production.template",
  "apps/web/.env.example",
  "apps/mobile/.env.preview.example",
  "apps/desktop/.env.template",
  "src/out/domain.ts",
] as const;

function materialize(path: string, content = "fixture\n"): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function checkIgnored(root: string, path: string): boolean {
  const result = spawnSync("git", ["-C", root, "check-ignore", "--no-index", "-q", "--", path], {
    encoding: "utf8",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed (${String(result.status)}): ${result.stderr}`);
  }
  return result.status === 0;
}

describe("canonical generated gitignore", () => {
  for (const { label, config } of configurations) {
    test(`${label} uses the canonical policy with real Git semantics`, () => {
      const generated = generateProjectFiles(config, { dryRun: false });
      const ignores = generated.filter(({ path }) => path.endsWith(".gitignore"));
      const attributes = generated.filter(({ path }) => path === ".gitattributes");
      expect(ignores.length, label).toBeGreaterThan(0);
      expect(attributes, label).toHaveLength(1);
      expect(attributes[0]?.content, label).toContain("*.sh text eol=lf");
      expect(attributes[0]?.content, label).toContain("/.husky/* text eol=lf");
      expect(attributes[0]?.content, label).toBe(
        generatedGitattributesContent(config.apps.includes("mobile")),
      );
      for (const ignore of ignores)
        expect(ignore.content, ignore.path).toBe(generatedGitignoreContent());

      const root = mkdtempSync(join(tmpdir(), "ghostinit-ignore-"));
      try {
        const initialized = spawnSync("git", ["init", "--quiet", root], {
          encoding: "utf8",
          shell: false,
        });
        expect(initialized.status, initialized.stderr).toBe(0);
        for (const ignore of ignores)
          materialize(join(root, ...ignore.path.split("/")), ignore.content);
        for (const path of [...ignoredPaths, ...trackedPaths]) {
          materialize(join(root, ...path.split("/")));
        }
        for (const path of ignoredPaths)
          expect(checkIgnored(root, path), `${label}: ${path}`).toBe(true);
        for (const path of trackedPaths)
          expect(checkIgnored(root, path), `${label}: ${path}`).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
