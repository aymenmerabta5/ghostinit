import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { formatGenerationText } from "../../src/generation/plan-formatter.js";

type MatrixCase = readonly [mode: "monorepo" | "single", framework: "nextjs" | "tanstack-start"];

const CASES: readonly MatrixCase[] = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start"] as const).map((framework) => [mode, framework] as const),
);
const SOURCE_CLI = resolve(import.meta.dir, "../../src/cli.ts");

function run(args: string[], cwd?: string) {
  return spawnSync(process.execPath, [SOURCE_CLI, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function probePath(mode: MatrixCase[0], framework: MatrixCase[1]): string[] {
  return [
    ...(mode === "monorepo" ? ["apps", "web"] : []),
    framework === "nextjs" ? "next.config.ts" : "vite.config.ts",
  ];
}

function projectSnapshot(root: string, directory = root): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const relative = absolute.slice(root.length + 1).replaceAll("\\", "/");
    if (relative === ".ghostinit/state.json" || relative === ".ghostinit.lock") continue;
    if (entry.isDirectory()) Object.assign(result, projectSnapshot(root, absolute));
    else if (entry.isFile()) {
      result[relative] = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    }
  }
  return result;
}

describe("source CLI canonical format lifecycle", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-cli-format-lifecycle-"));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  for (const [mode, framework] of CASES) {
    test(`${mode}/${framework} create -> upgrade -> sync is byte-stable`, async () => {
      const name = `format-${mode}-${framework}`;
      const created = run([
        "create",
        name,
        "--yes",
        "--no-install",
        "--quiet",
        "--cwd",
        root,
        "--mode",
        mode,
        "--framework",
        framework,
        "--preset",
        "frontend",
        "--database",
        "none",
        "--billing",
        "none",
      ]);
      expect(created.status, `${created.stdout}\n${created.stderr}`).toBe(0);
      const projectRoot = join(root, name);
      const probe = join(projectRoot, ...probePath(mode, framework));
      const before = readFileSync(probe, "utf8");
      const beforeSnapshot = projectSnapshot(projectRoot);
      expect(await formatGenerationText(probe.replaceAll("\\", "/"), before)).toBe(before);

      const upgraded = run(["upgrade", "--json"], projectRoot);
      expect(upgraded.status, `${upgraded.stdout}\n${upgraded.stderr}`).toBe(0);
      const upgradeOutput = JSON.parse(upgraded.stdout) as {
        data: {
          plan: {
            conflicts: unknown[];
            creates: unknown[];
            deletions: unknown[];
            environmentMerges: unknown[];
            moves: unknown[];
            retired: unknown[];
            rewrites: unknown[];
            secretOperations: unknown[];
          };
        };
      };
      expect(upgradeOutput.data.plan).toMatchObject({
        creates: [],
        moves: [],
        rewrites: [],
        deletions: [],
        retired: [],
        environmentMerges: [],
        secretOperations: [],
        conflicts: [],
      });
      expect(readFileSync(probe, "utf8")).toBe(before);
      expect(projectSnapshot(projectRoot)).toEqual(beforeSnapshot);

      const synced = run(["sync", "--check", "--json"], projectRoot);
      expect(synced.status, `${synced.stdout}\n${synced.stderr}`).toBe(0);
      expect(JSON.parse(synced.stdout)).toMatchObject({
        success: true,
        data: { inSync: true },
      });
      expect(readFileSync(probe, "utf8")).toBe(before);
      expect(projectSnapshot(projectRoot)).toEqual(beforeSnapshot);
    });
  }
});
