import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

type Workflow = {
  on: {
    push: { branches: string[] };
    pull_request: { branches: string[] };
  };
  jobs: Record<
    string,
    {
      if?: string | boolean;
      steps: Array<{
        name?: string;
        if?: string | boolean;
        uses?: string;
        with?: Record<string, unknown>;
        run?: string;
      }>;
    }
  >;
};

const parseWorkflow = (name: string): Workflow =>
  Bun.YAML.parse(readFileSync(resolve(root, `.github/workflows/${name}`), "utf8")) as Workflow;

test("required CI uses exact branches, Bun, and retained gates", () => {
  const ci = parseWorkflow("ci.yml");
  const e2e = parseWorkflow("e2e.yml");
  expect(ci.on.push.branches).toEqual(["master", "develop"]);
  expect(ci.on.pull_request.branches).toEqual(["master", "develop"]);

  const allSteps = [...Object.values(ci.jobs), ...Object.values(e2e.jobs)].flatMap(
    ({ steps }) => steps,
  );
  const bunPins = allSteps
    .filter(({ uses }) => uses?.startsWith("oven-sh/setup-bun@"))
    .map(({ with: input }) => input?.["bun-version"]);
  expect(bunPins.length).toBeGreaterThan(0);
  expect(new Set(bunPins)).toEqual(new Set(["1.4.0"]));

  const normalizedRuns = (job: keyof typeof ci.jobs): string[] => {
    expect(ci.jobs[job].if).toBeUndefined();
    return ci.jobs[job].steps
      .filter((step) => step.if === undefined)
      .map(({ run }) => run)
      .filter((run): run is string => typeof run === "string")
      .map((run) => run.replace(/\s+/g, " ").trim());
  };
  const checkRuns = normalizedRuns("check-and-test");
  for (const required of [
    "bun install --frozen-lockfile",
    "bun run check",
    "bun run typecheck",
    "bun run typecheck:scripts",
    "bun run check:versions",
    "bun run test",
    "bun run pretest:fixtures",
    "bun run test:fixtures",
    "bun run build",
    "tests/unit/compatibility-ledger.test.ts",
    "tests/integration/packed-cli.test.ts",
  ]) {
    expect(checkRuns.some((run) => run.includes(required))).toBe(true);
  }
  expect(normalizedRuns("generated-project-smoke")).toContain("bun run test:generated");
  const fastJob = e2e.jobs["e2e-fast"];
  expect(fastJob.if).toBeUndefined();
  const packagedCheck = fastJob.steps.find(
    ({ name }) => name === "Run packaged architecture check",
  );
  expect(packagedCheck?.if).toBeUndefined();
  expect(packagedCheck?.run).toBe(
    './dist/cli.js check --cwd "$RUNNER_TEMP/gi-test/e2e-fast" --json',
  );

  const e2eRuns = Object.values(e2e.jobs).flatMap(({ steps }) =>
    steps.map(({ run }) => run).filter((run): run is string => typeof run === "string"),
  );
  expect(
    e2eRuns.some((run) =>
      /(?:\bghostinit|(?:^|\/)dist\/cli\.js)\s+check[^\n]*\|\|\s*true/.test(run),
    ),
  ).toBe(false);
});
