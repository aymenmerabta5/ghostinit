import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const targets = ["upstash", "convex", "stripe", "chargily", "paddle", "polar", "staging"];

type Step = {
  name?: string;
  if?: string | boolean;
  env?: Record<string, string>;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  "continue-on-error"?: boolean;
};

type Job = {
  env?: Record<string, string>;
  environment?: string | { name?: string };
  if?: string | boolean;
  needs?: string | string[];
  permissions?: Record<string, string>;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  "continue-on-error"?: boolean;
  strategy?: { matrix?: { os?: string[] } };
  steps: Step[];
};

type Workflow = {
  env?: Record<string, string>;
  on: {
    workflow_dispatch?: {
      inputs?: Record<
        string,
        { required?: boolean; type?: string; options?: string[]; description?: string }
      >;
    };
  };
  permissions?: Record<string, string>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs: Record<string, Job>;
};

function workflow(name: string): Workflow {
  return Bun.YAML.parse(
    readFileSync(resolve(root, `.github/workflows/${name}`), "utf8"),
  ) as Workflow;
}

test("external readiness is manual, canonical-ref gated, target-scoped, and least-privilege", () => {
  const source = readFileSync(resolve(root, ".github/workflows/external-readiness.yml"), "utf8");
  const parsed = workflow("external-readiness.yml");
  expect(Object.keys(parsed.on)).toEqual(["workflow_dispatch"]);
  expect(source).not.toContain("pull_request_target");
  expect(source).not.toMatch(/^\s+(?:push|pull_request|schedule):/m);
  expect(parsed.on.workflow_dispatch?.inputs?.target).toEqual({
    description: "Sandbox/staging contract to probe",
    required: true,
    type: "choice",
    options: targets,
  });
  expect(parsed.permissions).toEqual({ contents: "read" });
  expect(parsed.concurrency?.["cancel-in-progress"]).toBe(false);
  expect(parsed.env).toBeUndefined();
  expect(Object.keys(parsed.jobs)).toEqual(["ref-policy", "sandbox-smoke"]);

  const preflight = parsed.jobs["ref-policy"];
  expect(preflight?.environment).toBeUndefined();
  expect(preflight?.env).toBeUndefined();
  expect(preflight?.permissions).toBeUndefined();
  expect(preflight?.["timeout-minutes"]).toBe(1);
  expect(preflight?.steps).toHaveLength(1);
  const policyStep = preflight?.steps[0];
  expect(policyStep?.env).toEqual({
    CANONICAL_REPOSITORY: "aymenmerabta5/ghostinit",
    DEFAULT_BRANCH: "${{ github.event.repository.default_branch }}",
    DISPATCH_REF: "${{ github.ref }}",
    EVENT_IS_FORK: "${{ github.event.repository.fork }}",
    EVENT_REPOSITORY: "${{ github.repository }}",
    REF_PROTECTED: "${{ github.ref_protected }}",
    SELECTED_TARGET: "${{ inputs.target }}",
  });
  expect(policyStep?.run).toContain('"$EVENT_REPOSITORY" != "$CANONICAL_REPOSITORY"');
  expect(policyStep?.run).toContain('"$EVENT_IS_FORK" != "false"');
  expect(policyStep?.run).toContain('"$DISPATCH_REF" != "refs/heads/$DEFAULT_BRANCH"');
  expect(policyStep?.run).toContain('"$REF_PROTECTED" != "true"');
  expect(policyStep?.run).toContain("upstash|convex|stripe|chargily|paddle|polar|staging");
  expect(policyStep?.run).toContain("exit 1");
  expect(policyStep?.run).not.toContain("${{ secrets.");

  const job = parsed.jobs["sandbox-smoke"];
  expect(job?.if).toBeUndefined();
  expect(job?.needs).toBe("ref-policy");
  expect(job?.env).toBeUndefined();
  expect(job?.permissions).toBeUndefined();
  expect(job?.environment).toEqual({ name: "external-readiness-${{ inputs.target }}" });
  expect(job?.["runs-on"]).toBe("ubuntu-latest");
  expect(job?.["timeout-minutes"]).toBeGreaterThan(0);
  expect(job?.["timeout-minutes"]).toBeLessThanOrEqual(10);
  expect(job?.["continue-on-error"]).toBeUndefined();

  const steps = job?.steps ?? [];
  const actions = steps.filter(({ uses }) => uses);
  expect(actions.length).toBe(2);
  for (const step of actions) expect(step.uses).toMatch(/^[^@]+@[a-f0-9]{40}$/);
  const checkout = actions.find(({ uses }) => uses?.startsWith("actions/checkout@"));
  expect(checkout?.with).toEqual({
    "persist-credentials": false,
    ref: "${{ github.sha }}",
  });

  const expectedEnvironmentKeys: Record<string, string[]> = {
    upstash: ["GHOSTINIT_EXTERNAL_READINESS", "GHOSTINIT_SMOKE_UPSTASH_CONFIG"],
    convex: ["GHOSTINIT_EXTERNAL_READINESS", "GHOSTINIT_SMOKE_CONVEX_CONFIG"],
    stripe: ["GHOSTINIT_EXTERNAL_READINESS", "STRIPE_SECRET_KEY"],
    chargily: ["CHARGILY_API_KEY", "CHARGILY_MODE", "GHOSTINIT_EXTERNAL_READINESS"],
    paddle: ["GHOSTINIT_EXTERNAL_READINESS", "PADDLE_API_KEY", "PADDLE_ENVIRONMENT"],
    polar: ["GHOSTINIT_EXTERNAL_READINESS", "POLAR_ACCESS_TOKEN", "POLAR_ENVIRONMENT"],
    staging: ["GHOSTINIT_EXTERNAL_READINESS", "GHOSTINIT_STAGING_CONFIG"],
  };
  const expectedSecrets: Record<string, [string, string]> = {
    upstash: ["GHOSTINIT_SMOKE_UPSTASH_CONFIG", "${{ secrets.GHOSTINIT_SMOKE_UPSTASH_CONFIG }}"],
    convex: ["GHOSTINIT_SMOKE_CONVEX_CONFIG", "${{ secrets.GHOSTINIT_SMOKE_CONVEX_CONFIG }}"],
    stripe: ["STRIPE_SECRET_KEY", "${{ secrets.STRIPE_TEST_SECRET_KEY }}"],
    chargily: ["CHARGILY_API_KEY", "${{ secrets.CHARGILY_TEST_API_KEY }}"],
    paddle: ["PADDLE_API_KEY", "${{ secrets.PADDLE_SANDBOX_API_KEY }}"],
    polar: ["POLAR_ACCESS_TOKEN", "${{ secrets.POLAR_SANDBOX_ACCESS_TOKEN }}"],
    staging: ["GHOSTINIT_STAGING_CONFIG", "${{ secrets.GHOSTINIT_STAGING_CONFIG }}"],
  };
  const probeSteps = steps.filter(({ run }) => run?.includes("scripts/external-readiness.ts"));
  expect(probeSteps).toHaveLength(targets.length);
  for (const target of targets) {
    const step = probeSteps.find(({ run }) => run?.includes(`--target ${target}`));
    expect(step, target).toBeDefined();
    expect(step?.if).toBe(`inputs.target == '${target}'`);
    expect(step?.env?.GHOSTINIT_EXTERNAL_READINESS).toBe("1");
    expect(Object.keys(step?.env ?? {}).sort()).toEqual(expectedEnvironmentKeys[target]);
    const [secretKey, secretExpression] = expectedSecrets[target]!;
    expect(step?.env?.[secretKey]).toBe(secretExpression);
    expect(step?.run).toContain(`bun ./scripts/external-readiness.ts --target ${target}`);
    expect(step?.run).toContain(
      `printf '%s\\n' ${target} >> "$RUNNER_TEMP/ghostinit-external-readiness-completed"`,
    );
    expect(step?.run).not.toContain("${{ secrets.");
    expect(step?.run).not.toContain("${{ inputs.");
    expect(step?.["continue-on-error"]).toBeUndefined();
  }

  const completion = steps.find(
    ({ name }) => name === "Require exactly one selected probe to complete",
  );
  expect(completion?.if).toBeUndefined();
  expect(completion?.env).toEqual({ SELECTED_TARGET: "${{ inputs.target }}" });
  expect(completion?.run).toContain('"${#completed[@]}" -ne 1');
  expect(completion?.run).toContain('"${completed[0]}" != "$SELECTED_TARGET"');
  expect(completion?.run).not.toContain("${{ secrets.");

  const secretExpressions = source.match(/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/g) ?? [];
  expect(secretExpressions).toHaveLength(targets.length);
  expect(new Set(secretExpressions).size).toBe(targets.length);
  expect(source).not.toContain("${{ vars.");
  expect(source).not.toContain("::add-mask::");
  expect(source).not.toMatch(/\b(?:curl|wget|npx|npm|docker)\b/);
  expect(source).not.toContain("bun install");
  expect(source).not.toContain("upload-artifact");
});

test("ordinary CI permanently exercises portable and offline readiness gates on three OSes", () => {
  const ci = workflow("ci.yml");
  const portability = ci.jobs.portability;
  expect(portability?.["runs-on"]).toBe("${{ matrix.os }}");
  expect(portability?.strategy?.matrix?.os).toEqual([
    "ubuntu-latest",
    "windows-latest",
    "macos-latest",
  ]);
  const commands = (portability?.steps ?? [])
    .map(({ run }) => run ?? "")
    .join("\n")
    .replace(/\s+/g, " ");
  for (const gate of [
    "bun run check",
    "bun run typecheck",
    "bun run check:capability-evidence",
    "bun run build",
    "tests/integration/packed-cli.test.ts",
    "tests/unit/external-readiness-harness.test.ts",
    "tests/unit/external-readiness-workflow.test.ts",
    "git diff --exit-code",
  ]) {
    expect(commands, gate).toContain(gate);
  }
  expect(commands).not.toContain("GHOSTINIT_EXTERNAL_READINESS=1");
  expect(commands).not.toMatch(
    /(?:STRIPE|CHARGILY|PADDLE|POLAR|UPSTASH|CONVEX).*(?:SECRET|TOKEN|KEY)=/,
  );

  const mainCommands = ci.jobs["check-and-test"]?.steps.map(({ run }) => run ?? "").join("\n");
  expect(mainCommands).toContain("bun run check:capability-evidence");
});

test("long-running local E2E jobs have explicit job deadlines", () => {
  const e2e = workflow("e2e.yml");
  for (const name of ["e2e-scheduled", "e2e-manual", "e2e-build-gated", "runtime-security-gated"]) {
    expect(e2e.jobs[name]?.["timeout-minutes"], name).toBeGreaterThan(0);
  }
});
