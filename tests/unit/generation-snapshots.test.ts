/**
 * Snapshot / golden tests for generated projects.
 *
 * Complements generation-matrix which checks structural invariants across 12 corners.
 * This file checks content stability for 2 stable corners (monorepo/next and single/next)
 * and ensures deploy / env / template-validation integration.
 */

import { describe, it, expect } from "bun:test";
import { generateProjectFiles } from "../../src/templates/default.ts";
import type { ProjectConfig } from "../../src/lib/config.ts";
import { validateGeneratedFiles } from "../../src/lib/template-validator.ts";

function cfg(partial: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
    ...partial,
  } as ProjectConfig;
}

describe("generation snapshots", () => {
  it("monorepo/next/postgres default emits expected core files and parses", () => {
    const files = generateProjectFiles(cfg({}));
    const paths = files.map((f) => f.path).sort();
    // Core files must exist
    expect(paths).toContain("package.json");
    expect(paths).toContain("turbo.json");
    expect(paths).toContain(".env.example");
    expect(paths).toContain(".env.local");
    expect(paths).toContain("apps/web/src/app/page.tsx");
    // No deploy files by default (deploy=none)
    expect(paths).not.toContain("Dockerfile");
    expect(paths).not.toContain("fly.toml");
    expect(paths).not.toContain("vercel.json");
    // Template validation: all TS/TSX must parse
    const result = validateGeneratedFiles(files);
    expect(result.valid).toBe(true);
    if (!result.valid) console.error(result.errors.slice(0, 5));
  });

  it("single/next/postgres emits flat structure", () => {
    const files = generateProjectFiles(cfg({ mode: "single" as const }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).not.toContain("apps/web/package.json");
    const result = validateGeneratedFiles(files);
    expect(result.valid).toBe(true);
  });

  it("deploy=docker emits Dockerfile + .dockerignore", () => {
    const files = generateProjectFiles(cfg({ deploy: "docker" as never }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain(".dockerignore");
    expect(paths).not.toContain("fly.toml");
    const df = files.find((f) => f.path === "Dockerfile")!;
    expect(df.content).toContain("FROM oven/bun");
    expect(df.content).toContain("EXPOSE 3000");
  });

  it("deploy=fly emits Dockerfile + fly.toml", () => {
    const files = generateProjectFiles(cfg({ deploy: "fly" as never }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain("fly.toml");
    const fly = files.find((f) => f.path === "fly.toml")!;
    expect(fly.content).toContain('app = "demo"');
    expect(fly.content).toContain("internal_port = 3000");
  });

  it("deploy=vercel emits vercel.json", () => {
    const files = generateProjectFiles(cfg({ deploy: "vercel" as never }));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("vercel.json");
    const v = files.find((f) => f.path === "vercel.json")!;
    const parsed = JSON.parse(v.content);
    expect(parsed.framework).toBe("nextjs");
  });

  it(".env.example contains placeholders not minted secrets", () => {
    const files = generateProjectFiles(cfg({ billing: ["stripe"] as never }));
    const env = files.find((f) => f.path === ".env.example")!;
    expect(env.content).toContain("REPLACE_WITH_STRIPE_SECRET_KEY");
    expect(env.content).not.toContain("sk_live_");
    // PostHog placeholder
    expect(env.content).toContain("REPLACE_WITH");
  });

  it("turbo.json globalEnv matches manifest exhaustive list", async () => {
    const { getGlobalEnvKeys } = await import("../../src/lib/env-manifest.ts");
    const files = generateProjectFiles(cfg({}));
    const turbo = files.find((f) => f.path === "turbo.json")!;
    const parsed = JSON.parse(turbo.content);
    const expected = getGlobalEnvKeys("bun");
    // Generated turbo.json should contain exactly the manifest list (deduped)
    expect(parsed.globalEnv).toEqual(expected);
  });
});
