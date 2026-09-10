import { describe, expect, test } from "bun:test";
import {
  resolveCreateConfig,
  type CreateResolutionInput,
} from "../../src/commands/create/resolution.js";
import { generateProjectFiles } from "../../src/templates/default.js";

describe.each(["stripe", "paddle", "polar"] as const)("%s billing selection", (globalProvider) => {
  const BASE: CreateResolutionInput = {
    name: "generated-test-smoke",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    billing: [],
    features: [],
    database: "postgres",
    databaseWasExplicit: true,
    apps: ["web"],
    preset: undefined,
    cache: "none",
    deploy: "none",
  };

  const CORNERS: ReadonlyArray<readonly [string, Partial<CreateResolutionInput>]> = [
    ["next-monorepo", { billing: ["stripe", "chargily"] }],
    ["next-monorepo-node", { runtime: "node", billing: ["stripe"] }],
    ["single-next", { mode: "single", billing: ["stripe"] }],
    [
      "next-convex",
      {
        database: "convex",
        billing: ["chargily", globalProvider],
        withMessaging: true,
      },
    ],
    [
      "single-convex",
      {
        mode: "single",
        framework: "tanstack-start",
        database: "convex",
        billing: ["polar"],
        withStorage: true,
      },
    ],
    ["tanstack", { framework: "tanstack-start", billing: [globalProvider] }],
    ["no-billing", { features: ["eve", "i18n"] }],
    ["mobile", { apps: ["web", "mobile"], billing: ["stripe"] }],
    ["desktop", { apps: ["web", "mobile", "desktop"], billing: ["stripe"] }],
    ["single-tanstack", { mode: "single", framework: "tanstack-start", withMessaging: true }],
    [
      "single-eve-next",
      { mode: "single", preset: "custom", withAuth: true, withApi: true, withEve: true },
    ],
    [
      "single-eve-tanstack",
      {
        mode: "single",
        framework: "tanstack-start",
        preset: "custom",
        withAuth: true,
        withApi: true,
        withEve: true,
      },
    ],
    [
      "single-expo-frontend",
      { mode: "single", apps: ["mobile"], preset: "frontend", database: "none" },
    ],
    [
      "single-electron-frontend",
      { mode: "single", apps: ["desktop"], preset: "frontend", database: "none" },
    ],
    [
      "features",
      {
        withEve: true,
        withI18n: true,
        withPdf: true,
        withMessaging: true,
        cache: "redis",
        deploy: "docker",
      },
    ],
    ["notifications", { preset: "custom", withAuth: true, withApi: true, withNotifications: true }],
    [
      "feature-flags",
      { preset: "custom", database: "none", withApi: true, featureFlags: "posthog" },
    ],
    ["jobs", { preset: "custom", withJobs: true }],
    ["standalone-storage", { preset: "custom", withAuth: true, withApi: true, withStorage: true }],
    [
      "maximal-multi-app",
      {
        preset: "custom",
        apps: ["web", "mobile", "desktop"],
        billing: ["chargily", globalProvider],
        withAuth: true,
        withApi: true,
        withEmail: true,
        withAnalytics: true,
        withEve: true,
        withI18n: true,
        withPdf: true,
        withMessaging: true,
        withStorage: true,
        withNotifications: true,
        featureFlags: "posthog",
        withJobs: true,
        cache: "redis",
      },
    ],
  ];

  const UNIT_TEST_PATH = /(?:^|\/)tests\/.*\.(?:test|spec)\.[cm]?[jt]sx?$/;

  describe("generated root test smoke coverage", () => {
    test("every installed matrix corner has a real assertion for each Bun test task", () => {
      for (const [id, overrides] of CORNERS) {
        const resolution = resolveCreateConfig({ ...BASE, ...overrides, name: `generated-${id}` });
        if (!resolution.ok) throw new Error(`${id}: ${resolution.message}`);
        const files = generateProjectFiles(resolution.config, { dryRun: false });
        const unitTests = files.filter((file) => UNIT_TEST_PATH.test(file.path));
        const problems: string[] = [];

        for (const file of files) {
          if (!file.path.endsWith("package.json")) continue;
          const manifest = JSON.parse(file.content) as { scripts?: Record<string, string> };
          const command = manifest.scripts?.test;
          if (!command || command.startsWith("turbo ")) continue;
          if (command.includes("passWithNoTests")) {
            problems.push(`${file.path}: passWithNoTests is forbidden`);
            continue;
          }
          const packageRoot =
            file.path === "package.json" ? "" : file.path.slice(0, -"package.json".length);
          const hasPlaywrightSpecs = files.some(
            (candidate) =>
              candidate.path.startsWith(`${packageRoot}e2e/`) &&
              candidate.path.endsWith(".spec.ts"),
          );
          if (hasPlaywrightSpecs && command === "bun test") {
            problems.push(`${file.path}: bun:test discovery includes Playwright specs`);
            continue;
          }
          const expectedTestRoot = command.includes("bun test tests")
            ? `${packageRoot}tests/`
            : packageRoot;
          const smoke = unitTests.find((candidate) => candidate.path.startsWith(expectedTestRoot));
          if (!smoke) {
            problems.push(`${file.path}: ${command} has no emitted test`);
            continue;
          }
          if (!/\b(?:it|test)\s*\(/.test(smoke.content) || !/\bexpect\s*\(/.test(smoke.content)) {
            problems.push(`${smoke.path}: smoke test has no executable assertion`);
          }
        }

        expect(problems, id).toEqual([]);
      }
    });
  });
});
