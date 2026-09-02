import { describe, expect, test } from "bun:test";
import { runtime as toolchainRuntime } from "../../packages/versions/src/index.js";
import type { AppName, FrameworkName, ProjectMode } from "../../src/lib/addons.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { resolvedToLegacyRenderConfig } from "../../src/generation/resolved-template-compiler.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type FrontendTarget = "nextjs" | "tanstack-start" | "expo" | "electron";

interface FrontendRuntimeCase {
  readonly mode: ProjectMode;
  readonly target: FrontendTarget;
}

const CASES: readonly FrontendRuntimeCase[] = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start", "expo", "electron"] as const).map((target) => ({
    mode,
    target,
  })),
);

function selection(target: FrontendTarget): {
  apps: AppName[];
  framework: FrameworkName;
} {
  if (target === "expo") return { apps: ["mobile"], framework: "nextjs" };
  if (target === "electron") return { apps: ["desktop"], framework: "nextjs" };
  return { apps: ["web"], framework: target };
}

function applicationManifestPath(testCase: FrontendRuntimeCase): string {
  if (testCase.mode === "single") return "package.json";
  if (testCase.target === "expo") return "apps/mobile/package.json";
  if (testCase.target === "electron") return "apps/desktop/package.json";
  return "apps/web/package.json";
}

describe("frontend-only Node runtime preservation", () => {
  for (const testCase of CASES) {
    test(`${testCase.mode}/${testCase.target} keeps Node independently of backend selection`, () => {
      const selected = selection(testCase.target);
      const resolution = resolveCreateConfig({
        name: `node-${testCase.mode}-${testCase.target}`,
        runtime: "node",
        mode: testCase.mode,
        framework: selected.framework,
        billing: [],
        features: [],
        database: "none",
        databaseWasExplicit: true,
        apps: selected.apps,
        preset: "frontend",
        cache: "none",
        deploy: "none",
      });

      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error(resolution.message);
      expect(resolution.config.runtime).toBe("node");
      expect(resolution.desiredConfig).toMatchObject({
        runtime: "node",
        backend: false,
        packageManager: { name: "bun", version: toolchainRuntime.bun },
      });
      expect(resolution.resolvedConfig).toMatchObject({
        runtime: "node",
        backend: false,
        packageManager: { name: "bun", version: toolchainRuntime.bun },
      });
      expect(resolvedToLegacyRenderConfig(resolution.resolvedConfig).runtime).toBe("node");

      const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
        desiredConfig: resolution.desiredConfig,
      });
      const desiredFile = plan.files.find(
        ({ physicalPath }) => physicalPath === "ghostinit.config.json",
      );
      expect(JSON.parse(desiredFile?.content ?? "null")).toMatchObject({
        runtime: "node",
        backend: false,
        packageManager: { name: "bun", version: toolchainRuntime.bun },
      });

      const rootManifest = plan.files.find(({ physicalPath }) => physicalPath === "package.json");
      const rootPackage = JSON.parse(rootManifest?.content ?? "null") as {
        engines?: Record<string, string>;
        packageManager?: string;
      };
      expect(rootPackage.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
      if (testCase.mode === "monorepo" || testCase.target !== "electron") {
        expect(rootPackage.engines?.node).toBe(`${toolchainRuntime.node.split(".")[0]}.x`);
      }

      const applicationManifest = plan.files.find(
        ({ physicalPath }) => physicalPath === applicationManifestPath(testCase),
      );
      const applicationPackage = JSON.parse(applicationManifest?.content ?? "null") as {
        packageManager?: string;
        scripts?: Record<string, string>;
      };
      expect(applicationPackage.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
      if (testCase.target === "nextjs") {
        expect(applicationPackage.scripts?.start).toBe("next start");
      } else if (testCase.target === "tanstack-start") {
        expect(applicationPackage.scripts?.start).toBe("node .output/server/index.mjs");
      }
    });
  }
});
