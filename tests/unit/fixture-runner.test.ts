import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import {
  BUILD_TIMEOUT_MS,
  CHECK_TIMEOUT_MS,
  FIXTURE_PLANS,
  FIXTURE_ROOT,
  INSTALL_TIMEOUT_MS,
  REQUIRED_BUN_VERSION,
} from "../../scripts/test-fixtures.js";

const normalizedPlans = FIXTURE_PLANS.map((plan) => ({
  id: plan.id,
  directory: relative(FIXTURE_ROOT, plan.directory).replaceAll("\\", "/"),
  stages: plan.stages.map((stage) => ({
    label: stage.label,
    args: [...stage.args],
    timeoutMs: stage.timeoutMs,
  })),
}));

describe("compatibility fixture runner plan", () => {
  test("pins every fixture, stage, command, and timeout", () => {
    expect(REQUIRED_BUN_VERSION).toBe(runtime.bun);
    expect(INSTALL_TIMEOUT_MS).toBe(900_000);
    expect(BUILD_TIMEOUT_MS).toBe(900_000);
    expect(CHECK_TIMEOUT_MS).toBe(300_000);
    expect(normalizedPlans).toEqual([
      {
        id: "drizzle-betterauth-orpc",
        directory: "drizzle-betterauth-orpc",
        stages: [
          {
            label: "frozen install",
            args: ["install", "--frozen-lockfile"],
            timeoutMs: 900_000,
          },
          {
            label: "high-severity audit",
            args: ["audit", "--audit-level=high"],
            timeoutMs: 300_000,
          },
          { label: "typecheck", args: ["run", "typecheck"], timeoutMs: 300_000 },
          { label: "test", args: ["test", "--timeout", "100000"], timeoutMs: 300_000 },
          { label: "check:runtime", args: ["run", "check:runtime"], timeoutMs: 300_000 },
        ],
      },
      {
        id: "next-tailwind-oxtools",
        directory: "next-tailwind-biome",
        stages: [
          {
            label: "frozen install",
            args: ["install", "--frozen-lockfile"],
            timeoutMs: 900_000,
          },
          {
            label: "high-severity audit",
            args: ["audit", "--audit-level=high"],
            timeoutMs: 300_000,
          },
          { label: "typecheck", args: ["run", "typecheck"], timeoutMs: 300_000 },
          { label: "lint", args: ["run", "lint"], timeoutMs: 300_000 },
          { label: "build", args: ["run", "build"], timeoutMs: 900_000 },
        ],
      },
      {
        id: "expo-uniwind-rnr",
        directory: "expo-uniwind-rnr",
        stages: [
          {
            label: "frozen install",
            args: ["install", "--frozen-lockfile"],
            timeoutMs: 900_000,
          },
          {
            label: "high-severity audit with verified patches",
            args: ["run", "audit:dependencies"],
            timeoutMs: 300_000,
          },
          {
            label: "check:image-size-patch",
            args: ["run", "check:image-size-patch"],
            timeoutMs: 300_000,
          },
          { label: "typecheck", args: ["run", "typecheck"], timeoutMs: 300_000 },
          { label: "check:tv", args: ["run", "check:tv"], timeoutMs: 300_000 },
          { label: "check:twa", args: ["run", "check:twa"], timeoutMs: 300_000 },
          { label: "check:uniwind", args: ["run", "check:uniwind"], timeoutMs: 300_000 },
        ],
      },
    ]);
  });

  test("targets committed lockfiles and declared package scripts", () => {
    expect(new Set(FIXTURE_PLANS.map(({ id }) => id)).size).toBe(FIXTURE_PLANS.length);
    expect(new Set(FIXTURE_PLANS.map(({ directory }) => directory)).size).toBe(
      FIXTURE_PLANS.length,
    );

    for (const plan of FIXTURE_PLANS) {
      expect(existsSync(plan.directory)).toBe(true);
      expect(existsSync(resolve(plan.directory, "bun.lock"))).toBe(true);
      const audits = plan.stages.filter(
        ({ args }) => args[0] === "audit" || args[1] === "audit:dependencies",
      );
      expect(audits).toEqual([
        expect.objectContaining({
          args:
            plan.id === "expo-uniwind-rnr"
              ? ["run", "audit:dependencies"]
              : ["audit", "--audit-level=high"],
        }),
      ]);
      const pkg = JSON.parse(readFileSync(resolve(plan.directory, "package.json"), "utf8")) as {
        packageManager?: string;
        scripts?: Record<string, string>;
      };
      expect(pkg.packageManager).toBe(`bun@${runtime.bun}`);
      for (const stage of plan.stages) {
        if (stage.args[0] !== "run") continue;
        const scriptName = stage.args[1];
        expect(typeof scriptName).toBe("string");
        expect(typeof pkg.scripts?.[scriptName ?? ""]).toBe("string");
      }
    }
  });

  test("awaits shared supervision before every stage or signal settlement", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../scripts/test-fixtures.ts"), "utf8");

    expect(source).toContain(
      'import { runSupervisedCommand } from "../src/commands/create/installer.js"',
    );
    expect(source).toContain("const completion = runSupervisedCommand({");
    expect(source).toContain("await cancelActiveFixtureStage(signal)");
    expect(source).toContain("return operation?.completion");
    expect(source).toContain("abortSignal: controller.signal");
    expect(source).toContain("if (terminationRequested || !cleanupWasVerified) controller.abort");
    expect(source).toContain("result.cleanupVerified &&");
    expect(source).not.toContain("spawn(");
    expect(source).toContain('process.on("SIGINT"');
    expect(source).toContain('process.on("SIGTERM"');
    expect(source).toContain("process.exit(exitCode)");
    expect(source).not.toContain("spawnSync");
  });
});
