import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runtime as toolchainRuntime } from "../../packages/versions/src/index.js";

type FrontendTarget = "nextjs" | "tanstack-start" | "expo" | "electron";
type FrontendRuntimeCase = readonly [mode: "monorepo" | "single", target: FrontendTarget];

const CASES: readonly FrontendRuntimeCase[] = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start", "expo", "electron"] as const).map(
    (target) => [mode, target] as const,
  ),
);
const SOURCE_CLI = resolve(import.meta.dir, "../../src/cli.ts");

function targetArguments(target: FrontendTarget): string[] {
  if (target === "expo") return ["--apps", "mobile"];
  if (target === "electron") return ["--apps", "desktop"];
  return ["--apps", "web", "--framework", target];
}

function applicationManifestPath(
  projectRoot: string,
  mode: FrontendRuntimeCase[0],
  target: FrontendTarget,
): string {
  if (mode === "single") return join(projectRoot, "package.json");
  if (target === "expo") return join(projectRoot, "apps", "mobile", "package.json");
  if (target === "electron") return join(projectRoot, "apps", "desktop", "package.json");
  return join(projectRoot, "apps", "web", "package.json");
}

describe("CLI frontend-only Node runtime matrix", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-frontend-node-"));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  for (const [mode, target] of CASES) {
    test(`${mode}/${target}`, () => {
      const name = `node-${mode}-${target}`;
      const result = spawnSync(
        process.execPath,
        [
          SOURCE_CLI,
          "create",
          name,
          "--yes",
          "--no-install",
          "--json",
          "--cwd",
          root,
          "--mode",
          mode,
          "--runtime",
          "node",
          "--preset",
          "frontend",
          "--database",
          "none",
          "--billing",
          "none",
          ...targetArguments(target),
        ],
        { encoding: "utf8" },
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const output = JSON.parse(result.stdout) as {
        data: {
          resolvedProjectConfig: {
            backend: false | object;
            packageManager: { name: string; version: string };
            runtime: string;
          };
        };
      };
      expect(output.data.resolvedProjectConfig).toMatchObject({
        runtime: "node",
        backend: false,
        packageManager: { name: "bun", version: toolchainRuntime.bun },
      });

      const projectRoot = join(root, name);
      const desired = JSON.parse(readFileSync(join(projectRoot, "ghostinit.config.json"), "utf8"));
      expect(desired).toMatchObject({
        runtime: "node",
        backend: false,
        packageManager: { name: "bun", version: toolchainRuntime.bun },
      });
      const applicationPackage = JSON.parse(
        readFileSync(applicationManifestPath(projectRoot, mode, target), "utf8"),
      );
      expect(applicationPackage.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
      if (target === "nextjs") expect(applicationPackage.scripts.start).toBe("next start");
      if (target === "tanstack-start") {
        expect(applicationPackage.scripts.start).toBe("node .output/server/index.mjs");
      }
    });
  }
});
