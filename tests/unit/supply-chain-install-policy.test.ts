import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { supplyChain } from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { minimumReleaseAgeBunfigContent } from "../helpers/bunfig.js";

const root = resolve(import.meta.dir, "../..");
const fixtureNames = [
  "drizzle-betterauth-orpc",
  "expo-uniwind-rnr",
  "next-tailwind-biome",
] as const;

interface BunfigPolicy {
  install?: {
    minimumReleaseAge?: number;
    minimumReleaseAgeExcludes?: string[];
  };
}

function expectPolicy(content: string, label: string): void {
  const parsed = Bun.TOML.parse(content) as BunfigPolicy;
  expect(parsed.install?.minimumReleaseAge, label).toBe(supplyChain.minimumReleaseAgeSeconds);
  expect(parsed.install?.minimumReleaseAgeExcludes, label).toEqual([]);
}

function config(
  mode: "monorepo" | "single",
  runtime: "bun" | "node",
  deploy: "none" | "docker" | "fly" | "vercel",
): ProjectConfig {
  return {
    name: `age-policy-${mode}-${runtime}-${deploy}`,
    version: "0.1.0",
    runtime,
    mode,
    preset: "frontend",
    framework: "nextjs",
    database: "none",
    apps: ["web"],
    billing: [],
    features: [],
    auth: false,
    api: false,
    email: false,
    analytics: false,
    deploy,
  } as ProjectConfig;
}

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const result = files.find((file) => file.path === path)?.content;
  if (result === undefined) throw new Error(`Missing generated file: ${path}`);
  return result;
}

describe("seven-day package release-age policy", () => {
  test("keeps the host and compatibility fixtures on the typed policy without exclusions", () => {
    expect(supplyChain.minimumReleaseAgeSeconds).toBe(7 * 24 * 60 * 60);
    expectPolicy(readFileSync(resolve(root, "bunfig.toml"), "utf8"), "host");
    for (const fixture of fixtureNames) {
      expectPolicy(
        readFileSync(resolve(root, "tests/fixtures/compatibility", fixture, "bunfig.toml"), "utf8"),
        fixture,
      );
    }
    expectPolicy(minimumReleaseAgeBunfigContent(), "temporary project helper");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const runtime of ["bun", "node"] as const) {
      for (const deploy of ["none", "docker", "fly", "vercel"] as const) {
        test(`${mode}/${runtime}/${deploy} inherits the generated install policy`, () => {
          const files = generateProjectFiles(config(mode, runtime, deploy), { dryRun: true });
          expectPolicy(content(files, "bunfig.toml"), `${mode}/${runtime}/${deploy}`);
          const combined = files.map((file) => file.content).join("\n");
          expect(combined).not.toMatch(/--minimum-release-age(?:=|\s+)0(?:\s|$)/);

          const generatedWorkflow = files.find(
            (file) => file.path === ".github/workflows/ci.yml",
          )?.content;
          if (generatedWorkflow !== undefined) {
            expect(generatedWorkflow).toContain("run: bun install --frozen-lockfile");
          }
          expect(content(files, "README.md")).toContain(
            `less than ${supplyChain.minimumReleaseAgeSeconds} seconds ago`,
          );
          expect(content(files, "AGENTS.md")).toContain(
            `newer than ${supplyChain.minimumReleaseAgeSeconds} seconds and has no exclusions`,
          );

          if (deploy === "docker" || deploy === "fly") {
            const dockerfile = content(files, "Dockerfile");
            const contextCopy = dockerfile.indexOf("COPY . .");
            const installs = [...dockerfile.matchAll(/^RUN bun install[^\r\n]*$/gm)];
            expect(installs).toHaveLength(2);
            for (const install of installs) {
              expect(install.index ?? -1).toBeGreaterThan(contextCopy);
            }
            expect(content(files, ".dockerignore").split(/\r?\n/)).not.toContain("bunfig.toml");
            const guide = content(
              files,
              deploy === "docker" ? "docs/DOCKER_DEPLOYMENT.md" : "docs/FLY_DEPLOYMENT.md",
            );
            expect(guide).toContain(`${supplyChain.minimumReleaseAgeSeconds}-second`);
            expect(guide).toContain("minimum package age");
            expect(guide).toContain("no exclusions");
          }

          if (deploy === "vercel") {
            const vercel = JSON.parse(content(files, "vercel.json")) as {
              installCommand: string;
            };
            expect(vercel.installCommand).toContain("install --frozen-lockfile");
            expect(vercel.installCommand).not.toContain("--minimum-release-age");
            const guide = files.find((file) => file.path === "docs/VERCEL_DEPLOYMENT.md")?.content;
            if (guide !== undefined) {
              expect(guide).toContain(
                `${supplyChain.minimumReleaseAgeSeconds}-second minimum package age`,
              );
              expect(guide).toContain("no exclusions");
            }
          }
        });
      }
    }
  }

  test("standalone temporary install fixtures materialize the same bunfig before resolving", () => {
    const callsites = [
      [
        "tests/integration/convex-auth-boundary-typecheck.test.ts",
        '["install", "--ignore-scripts"]',
      ],
      [
        "tests/integration/nitro-websocket-compat-runtime.test.ts",
        '["install", "--ignore-scripts"]',
      ],
      ["tests/integration/packed-cli.test.ts", '["add", "--exact"'],
    ] as const;
    for (const [path, resolutionMarker] of callsites) {
      const source = readFileSync(resolve(root, path), "utf8");
      const policy = source.indexOf("minimumReleaseAgeBunfigContent()");
      const resolution = source.indexOf(resolutionMarker);
      expect(policy, path).toBeGreaterThanOrEqual(0);
      expect(resolution, path).toBeGreaterThan(policy);
    }
  });
});
