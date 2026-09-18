import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ghostinitVersion, runtime } from "../../packages/versions/src/index.js";
import {
  assertEmittedEnvironmentKeysTracked,
  assertExactGlobalEnv,
} from "../../scripts/verify-generated-env.js";
import { CORNERS, generatedProjectName } from "../../scripts/test-generated.js";
import { parseCreateSpecific, parseRawArgs } from "../../src/cli/args.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { githubWorkflow } from "../../src/templates/root/config.js";
import { huskyFiles } from "../../src/templates/root/husky.js";

const root = resolve(import.meta.dir, "../..");

type Workflow = {
  concurrency?: {
    group: string;
    "cancel-in-progress": boolean | string;
  };
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  on: {
    push?: { branches: string[]; tags?: string[] };
    pull_request?: { branches: string[] };
    workflow_dispatch?: { inputs: Record<string, { default?: string }> };
  };
  jobs: Record<
    string,
    {
      name?: string;
      needs?: string | string[];
      if?: string | boolean;
      "continue-on-error"?: boolean;
      "runs-on"?: string;
      "timeout-minutes"?: number;
      env?: Record<string, string>;
      strategy?: {
        "fail-fast"?: boolean;
        matrix?: {
          os?: string[];
          include?: Array<{ id: string; framework: string; billing: string; features: string }>;
        };
      };
      steps: Array<{
        "continue-on-error"?: boolean;
        env?: Record<string, string>;
        name?: string;
        if?: string | boolean;
        shell?: string;
        uses?: string;
        with?: Record<string, unknown>;
        run?: string;
      }>;
    }
  >;
};

const parseWorkflow = (name: string): Workflow =>
  Bun.YAML.parse(readFileSync(resolve(root, `.github/workflows/${name}`), "utf8")) as Workflow;

test("scheduled and manual E2E billing profiles resolve to complete generated plans", () => {
  const workflow = parseWorkflow("e2e.yml");
  const scheduled = workflow.jobs["e2e-scheduled"].strategy?.matrix?.include;
  const defaults = workflow.on.workflow_dispatch?.inputs;
  if (!scheduled || !defaults) throw new Error("E2E billing profiles are missing");
  expect(
    scheduled.map(({ framework, features, billing }) => ({ framework, features, billing })),
  ).toEqual([
    { framework: "tanstack-start", features: "eve", billing: "polar,chargily,manual" },
    { framework: "nextjs", features: "eve,i18n", billing: "paddle,chargily,manual" },
    { framework: "nextjs", features: "eve", billing: "stripe,chargily" },
  ]);
  expect(defaults.billing.default).toBe("stripe,chargily,manual");
  const profiles = [
    ...scheduled,
    {
      id: "manual-demo",
      billing: defaults.billing.default,
      framework: defaults.framework.default,
      features: defaults.features.default,
    },
  ];
  const scheduledProviders = new Set<string>();
  for (const profile of profiles) {
    if (!profile.billing || !profile.framework || !profile.features)
      throw new Error("E2E profile defaults must be explicit");
    const raw = parseRawArgs([
      "bun",
      "dist/cli.js",
      "create",
      profile.id,
      "--no-install",
      "--force",
      "--json",
      "--billing",
      profile.billing,
      "--framework",
      profile.framework,
      "--features",
      profile.features,
      "--database",
      "postgres",
    ]);
    const parsed = parseCreateSpecific(raw.values, raw.command);
    const result = resolveCreateConfig({
      ...parsed,
      name: profile.id,
      runtime: "bun",
      databaseWasExplicit: true,
    });
    if (!result.ok) throw new Error(`${profile.id}: ${result.message}`);
    const config = result.config;
    expect(config.mode).toBe("monorepo");
    expect(config.apps).toEqual(["web"]);
    expect(config.database).toBe("postgres");
    expect(config.auth).toBe(true);
    expect(config.api).toBe(true);
    expect(config.email).toBe(true);
    expect(config.analytics).toBe(true);
    expect(config.eve).toBe(true);
    expect(config.i18n).toBe(profile.features.split(",").includes("i18n"));
    if (profile.id !== "manual-demo") {
      for (const provider of config.billing) scheduledProviders.add(provider);
    }
    const plan = buildProjectGenerationPlan(result.resolvedConfig);
    const paths = new Set(plan.files.map(({ physicalPath }) => physicalPath));
    for (const path of [
      "apps/web/package.json",
      "apps/eve/package.json",
      "packages/auth/src/server.ts",
      "packages/api/src/index.ts",
      "packages/database/src/index.ts",
    ])
      expect(paths.has(path), `${profile.id}: ${path}`).toBe(true);
    if (config.billing.includes("manual")) {
      expect(config.storage).toBe(true);
      for (const path of [
        "packages/storage/src/index.ts",
        "packages/billing/src/manual-payment-config.ts",
        "packages/api/src/procedures/billing/manual.ts",
        "packages/database/src/schema/manual-payments.ts",
      ])
        expect(paths.has(path), `${profile.id}: ${path}`).toBe(true);
    }
  }
  expect([...scheduledProviders].sort()).toEqual([
    "chargily",
    "manual",
    "paddle",
    "polar",
    "stripe",
  ]);
});

test("real Convex codegen is a blocking cross-platform Node LTS gate", () => {
  const job = parseWorkflow("ci.yml").jobs["convex-codegen"];
  expect(job.needs).toBe("check-and-test");
  expect(job.if).toBeUndefined();
  expect(job.strategy?.matrix?.os).toEqual(["ubuntu-latest", "windows-latest", "macos-latest"]);
  expect(job.strategy?.["fail-fast"]).toBe(false);
  const node = job.steps.find(({ uses }) => uses?.startsWith("actions/setup-node@"));
  expect(node?.with?.["node-version"]).toBe(runtime.node);
  const checks = job.steps
    .filter(({ if: condition }) => condition === undefined)
    .map(({ run }) => run);
  const sourceCheck = checks.indexOf("bun run check");
  const codegen = checks.indexOf("bun run test:convex-codegen");
  expect(sourceCheck).toBeGreaterThanOrEqual(0);
  expect(codegen).toBeGreaterThan(sourceCheck);
  expect(checks.indexOf("git diff --exit-code")).toBeGreaterThan(codegen);
});

test("required CI uses exact branches, Bun, and retained gates", () => {
  const ci = parseWorkflow("ci.yml");
  const e2e = parseWorkflow("e2e.yml");
  for (const workflow of [ci, e2e]) {
    expect(workflow.on.push?.branches).toEqual(["master", "develop"]);
    expect(workflow.on.push?.tags).toEqual(["v*"]);
    expect(workflow.on.pull_request?.branches).toEqual(["master", "develop"]);
  }
  expect(ci.concurrency).toEqual({
    group:
      "${{ github.ref_type == 'tag' && 'ghostinit-release-tags' || format('ci-{0}', github.event.pull_request.number || github.ref) }}",
    "cancel-in-progress": "${{ github.ref_type != 'tag' }}",
  });
  expect(e2e.concurrency).toEqual({
    group:
      "${{ github.ref_type == 'tag' && 'ghostinit-release-tags' || format('e2e-{0}-{1}', github.event.pull_request.number || github.ref, github.event_name) }}",
    "cancel-in-progress": "${{ github.ref_type != 'tag' }}",
  });
  expect(ci.concurrency?.group).toContain("'ghostinit-release-tags'");
  expect(e2e.concurrency?.group).toContain("'ghostinit-release-tags'");

  const allSteps = [...Object.values(ci.jobs), ...Object.values(e2e.jobs)].flatMap(
    ({ steps }) => steps,
  );
  for (const workflow of [ci, e2e]) {
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const job of Object.values(workflow.jobs)) {
      expect(job["continue-on-error"]).toBeUndefined();
      for (const step of job.steps) expect(step["continue-on-error"]).toBeUndefined();
    }
  }
  const pinnedActions = allSteps
    .map(({ uses }) => uses)
    .filter((uses): uses is string =>
      /^(?:actions\/(?:checkout|setup-node)|oven-sh\/setup-bun)@/.test(uses ?? ""),
    );
  expect(pinnedActions.length).toBeGreaterThan(0);
  for (const action of pinnedActions) expect(action).toMatch(/^[^@]+@[a-f0-9]{40}$/);
  for (const checkout of allSteps.filter(({ uses }) => uses?.startsWith("actions/checkout@"))) {
    expect(checkout.with?.["persist-credentials"]).toBe(false);
  }
  const bunPins = allSteps
    .filter(({ uses }) => uses?.startsWith("oven-sh/setup-bun@"))
    .map(({ with: input }) => input?.["bun-version"]);
  expect(bunPins.length).toBeGreaterThan(0);
  expect(new Set(bunPins)).toEqual(new Set([runtime.bun]));
  const nodePins = allSteps
    .filter(({ uses }) => uses?.startsWith("actions/setup-node@"))
    .map(({ with: input }) => input?.["node-version"]);
  expect(nodePins.length).toBeGreaterThan(0);
  expect(new Set(nodePins)).toEqual(new Set([runtime.node]));
  for (const jobName of ["e2e-scheduled", "e2e-manual", "e2e-build-gated"] as const) {
    const nodeSetup = e2e.jobs[jobName].steps.find(({ uses }) =>
      uses?.startsWith("actions/setup-node@"),
    );
    expect(nodeSetup?.with?.["node-version"], jobName).toBe(runtime.node);
  }

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
    "bun audit --audit-level=high",
    "bun run check",
    "bun run typecheck",
    "bun run typecheck:scripts",
    "bun run check:versions",
    "bun run test",
    "bun run test:fixtures",
    "bun run build",
    "tests/unit/compatibility-ledger.test.ts",
    "tests/integration/packed-cli.test.ts",
    "git diff --exit-code",
  ]) {
    expect(checkRuns.some((run) => run.includes(required))).toBe(true);
  }
  // The fixture runner owns its installs; the removed lifecycle hook must not double-install.
  expect(checkRuns.some((run) => run.includes("bun run pretest:fixtures"))).toBe(false);
  expect(ci.jobs["generated-project-smoke"]["timeout-minutes"]).toBe(360);
  expect(normalizedRuns("generated-project-smoke")).toContain("bun run test:generated -- --all");
  const cloudflarePortability = ci.jobs["cloudflare-portability"];
  expect(cloudflarePortability.name).toBe("Cloudflare Workers (${{ matrix.os }})");
  expect(cloudflarePortability["runs-on"]).toBe("${{ matrix.os }}");
  expect(cloudflarePortability["timeout-minutes"]).toBe(150);
  expect(cloudflarePortability.strategy).toEqual({
    "fail-fast": false,
    matrix: { os: ["windows-latest", "macos-latest"] },
  });
  const cloudflarePortabilityRuns = normalizedRuns("cloudflare-portability");
  for (const required of [
    "bun run check:lock-age",
    "bun install --frozen-lockfile",
    "bun run build",
    "bun run test:generated -- --only cloudflare-next-single,cloudflare-tanstack-single",
    "git diff --check",
    "git diff --exit-code",
  ]) {
    expect(
      cloudflarePortabilityRuns.some((run) => run.includes(required)),
      required,
    ).toBe(true);
  }
  const cloudflareCleanup = cloudflarePortability.steps.find(
    ({ name }) => name === "Clean generated runner temp",
  );
  expect(cloudflareCleanup?.if).toBe("always()");
  expect(cloudflareCleanup?.shell).toBe("bash");
  expect(cloudflareCleanup?.run).toContain('[ "$RUNNER_TEMP" = "/" ]');
  expect(cloudflareCleanup?.run).toContain("-name 'ghostinit-generated-*'");

  const portability = ci.jobs.portability;
  expect(portability.name).toBe("Portability (${{ matrix.os }})");
  expect(portability["runs-on"]).toBe("${{ matrix.os }}");
  expect(portability["timeout-minutes"]).toBe(30);
  expect(portability.strategy).toEqual({
    "fail-fast": false,
    matrix: { os: ["ubuntu-latest", "windows-latest", "macos-latest"] },
  });
  const portabilityRuns = normalizedRuns("portability");
  const dependencySecurityPortability = portability.steps.find(
    ({ name }) => name === "Test dependency security bootstrap portability",
  );
  expect(dependencySecurityPortability?.run).toBe(
    "bun test --timeout 120000 tests/unit/dependency-audit-security.test.ts",
  );
  const combinedPortability = portability.steps.find(
    ({ name }) =>
      name === "Test installer, supervisors, process-tree, filesystem, and Bun portability",
  );
  expect(combinedPortability?.run).not.toContain("tests/unit/dependency-audit-security.test.ts");
  for (const required of [
    "bun install --frozen-lockfile",
    "Bun.version !== runtime.bun",
    "bun run check",
    "tests/unit/installer-safety.test.ts",
    "tests/unit/generated-runner-containment.test.ts",
    "tests/unit/one-shot-runner-containment.test.ts",
    "tests/unit/deployment-supervisor.test.ts",
    "tests/unit/deployment-portability.test.ts",
    "tests/unit/deployment-lockfile-guard.test.ts",
    "tests/unit/jobs-supervisor-portability.test.ts",
    "tests/unit/next-runtime-deployment.test.ts",
    "tests/unit/posix-process-groups.test.ts",
    "tests/unit/process-tree.test.ts",
    "tests/unit/e2e-runtime-evidence.test.ts",
    "tests/unit/temporary-workspace.test.ts",
    "tests/unit/worker-preview-readiness.test.ts",
    "tests/unit/worker-preview-stop.test.ts",
    "tests/unit/cloudflare-preview-config.test.ts",
    "tests/unit/cloudflare-secret-ownership.test.ts",
    "tests/unit/cloudflare-wrapper-lifecycle.test.ts",
    "tests/unit/cloudflare-opennext-source-preservation.test.ts",
    "tests/unit/fs.test.ts",
    "tests/unit/bun-version-ssot.test.ts",
    "tests/unit/supply-chain-install-policy.test.ts",
    "tests/unit/dependency-audit-security.test.ts",
  ]) {
    expect(
      portabilityRuns.some((run) => run.includes(required)),
      required,
    ).toBe(true);
  }
  for (const linuxOnlyGate of [
    "bun run test:fixtures",
    "bun run test:generated",
    "bun run test:e2e-build",
    "nitro-websocket-compat-runtime.test.ts",
  ]) {
    expect(
      portabilityRuns.some((run) => run.includes(linuxOnlyGate)),
      linuxOnlyGate,
    ).toBe(false);
  }

  const fastJob = e2e.jobs["e2e-fast"];
  expect(fastJob.if).toBeUndefined();
  const packagedCheck = fastJob.steps.find(
    ({ name }) => name === "Run packaged architecture check",
  );
  expect(packagedCheck?.if).toBeUndefined();
  expect(packagedCheck?.shell).toBe("bash");
  expect(packagedCheck?.run).toContain(
    'bun ./dist/cli.js check --cwd "$RUNNER_TEMP/gi-test/e2e-fast" --json',
  );
  expect(packagedCheck?.run).toContain("JSON.parse");
  expect(packagedCheck?.run).toContain("payload.success !== true");
  expect(packagedCheck?.run).toContain("payload.exitCode !== 0");
  expect(packagedCheck?.run).toContain('payload.meta?.command !== "check"');
  expect(packagedCheck?.run).toContain('finding?.severity === "HIGH"');
  const fastSmoke = fastJob.steps.find(({ name }) => name === "Run fast generated/source checks");
  expect(fastSmoke?.env?.E2E_CLEANUP).toBeUndefined();

  const buildJob = e2e.jobs["e2e-build-gated"];
  expect(buildJob.if).toBeUndefined();
  expect(buildJob["timeout-minutes"]).toBe(90);
  expect(buildJob.steps.some(({ run }) => run === "bun run test:e2e-build")).toBe(true);

  const e2eRuns = Object.values(e2e.jobs).flatMap(({ steps }) =>
    steps.map(({ run }) => run).filter((run): run is string => typeof run === "string"),
  );
  const smokeInvocations = e2eRuns.flatMap((run) =>
    run
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes("scripts/e2e-smoke.sh")),
  );
  expect(smokeInvocations).toHaveLength(3);
  for (const invocation of smokeInvocations) {
    expect(invocation).toMatch(/^bash \.\/scripts\/e2e-smoke\.sh(?:\s|$)/);
  }
  expect(
    e2eRuns.some((run) =>
      /(?:\bghostinit|(?:^|\/)dist\/cli\.js)\s+check[^\n]*\|\|\s*true/.test(run),
    ),
  ).toBe(false);
  expect(e2eRuns.some((run) => /\b(?:bunx|npx)\b[^\n]*\bghostinit\b/.test(run))).toBe(false);
  const runtimeProbe = e2e.jobs["runtime-security-gated"].steps.find(({ run }) =>
    run?.includes("nitro-websocket-compat-runtime.test.ts"),
  );
  expect(runtimeProbe?.env?.NITRO_WEBSOCKET_RUNTIME).toBe("1");
  expect(e2eRuns.some((run) => run.includes("git diff --check"))).toBe(true);

  const manualRuns = e2e.jobs["e2e-manual"].steps
    .map(({ run }) => run)
    .filter((run): run is string => typeof run === "string");
  expect(manualRuns.some((run) => run.includes("${{ inputs."))).toBe(false);

  for (const jobName of ["e2e-fast", "e2e-scheduled", "e2e-manual"] as const) {
    const job = e2e.jobs[jobName];
    const cleanup = job.steps.find(({ name }) => name === "Clean generated runner temp");
    expect(cleanup?.if, `${jobName}: cleanup must run after failures`).toBe("always()");
    expect(cleanup?.shell).toBe("bash");
    expect(cleanup?.run).toContain('[ "$RUNNER_TEMP" = "/" ]');
    expect(cleanup?.run).toContain("-name 'gi-test'");
    expect(job.steps.at(-1)?.name).toBe("Clean generated runner temp");
  }

  for (const jobName of ["e2e-scheduled", "e2e-manual"] as const) {
    const smoke = e2e.jobs[jobName].steps.find(({ run }) => run?.includes("scripts/e2e-smoke.sh"));
    expect(smoke?.env?.E2E_CLEANUP).toBe("1");
  }

  for (const jobName of ["e2e-build-gated", "runtime-security-gated"] as const) {
    const cleanup = e2e.jobs[jobName].steps.find(
      ({ name }) => name === "Clean generated runner temp",
    );
    expect(cleanup?.if, `${jobName}: cleanup must run after failures`).toBe("always()");
    expect(cleanup?.run).toContain("-name 'gi-e2e-build-*'");
    expect(cleanup?.run).toContain("-name 'ghostinit-nitro-ws-*'");
  }

  const generatedCleanup = ci.jobs["generated-project-smoke"].steps.find(
    ({ name }) => name === "Clean generated runner temp",
  );
  expect(generatedCleanup?.if).toBe("always()");
  expect(generatedCleanup?.run).toContain("-name 'ghostinit-generated-*'");
  expect(generatedCleanup?.run).toContain('[ "$RUNNER_TEMP" = "/" ]');
});

test("E2E smoke uses Bun and owns safe process and workspace cleanup", () => {
  const source = readFileSync(resolve(root, "scripts/e2e-smoke.sh"), "utf8");
  const examples = [...source.matchAll(/\bBILLING=([a-z,]+)/g)];
  expect(examples.length).toBeGreaterThan(0);
  for (const [, billing] of examples) {
    const raw = parseRawArgs(["bun", "dist/cli.js", "create", "demo", "--billing", billing]);
    expect(() => parseCreateSpecific(raw.values, raw.command)).not.toThrow();
  }
  const environmentVerifier = readFileSync(
    resolve(root, "scripts/verify-generated-env.ts"),
    "utf8",
  );

  expect(source).toContain('bun "$CLI" create "$PROJECT_NAME"');
  expect(source).toContain('bun "$CLI" check --cwd "$PROJECT_ROOT" --json');
  expect(source).toContain('bun ./scripts/verify-generated-env.ts "$PROJECT_ROOT"');
  expect(source).not.toContain("globalEnv < 50");
  expect(source).not.toMatch(/\$COUNT"\s+-lt\s+\d+/);
  expect(environmentVerifier).toContain("getCapabilityScopedGlobalEnvKeys(config)");
  expect(environmentVerifier).toContain("loadDesiredProjectConfig(root)");
  expect(environmentVerifier).toContain('[".env.example", ".env.local"]');
  expect(source).not.toContain('node "$CLI"');
  expect(source).not.toMatch(/^"\$CLI"\s+(?:create|check)\b/m);

  expect(source).toContain("trap cleanup EXIT");
  expect(source).toContain("trap 'exit 130' INT");
  expect(source).toContain("trap 'exit 143' TERM");
  expect(source).toContain("trap '' INT TERM");
  expect(source).toContain("setsid bun run dev &");
  expect(source).toContain("capture_dev_process_group");
  expect(source).toContain('if [ "$candidate" -gt 1 ] && [ "$candidate" = "$pid" ]');
  expect(source).toContain('if ! kill -0 "$pid"');
  expect(source.indexOf("capture_dev_process_group")).toBeLessThan(
    source.lastIndexOf("capture_dev_process_group"),
  );
  expect(source).toContain('kill -TERM -- "-$pgid"');
  expect(source).toContain('kill -KILL -- "-$pgid"');
  expect(source).toContain('wait "$pid"');
  expect(source).toContain("dev process-tree cleanup could not be verified");
  expect(source).toContain("is still running after cleanup");

  expect(source).toContain("assert_safe_workspace_path");
  expect(source).toContain('[ "$TMP_PARENT" = "/" ]');
  expect(source).toContain('"$TMP_PARENT"/gi-test)');
  expect(source).toContain('rm -rf -- "$ROOT_TMP"');
  expect(source).toContain('CLEANUP="${E2E_CLEANUP:-0}"');
  expect(source).toContain('if [ "$CLEANUP" = "1" ] && [ "$KEEP" != "1" ]; then');
});

test("E2E env contract rejects missing, duplicate, unexpected, and reordered cache inputs", () => {
  expect(() => assertExactGlobalEnv(["A", "B"], ["A", "B"])).not.toThrow();
  expect(() => assertExactGlobalEnv(["A"], ["A", "B"])).toThrow("missing: B");
  expect(() => assertExactGlobalEnv(["A", "A", "B"], ["A", "B"])).toThrow("duplicates: A");
  expect(() => assertExactGlobalEnv(["A", "B", "C"], ["A", "B"])).toThrow("unexpected: C");
  expect(() => assertExactGlobalEnv(["B", "A"], ["A", "B"])).toThrow("manifest order: different");
  expect(() =>
    assertEmittedEnvironmentKeysTracked(
      ["DATABASE_URL", "NEXT_PUBLIC_NEW_VALUE"],
      ["DATABASE_URL", "NEXT_PUBLIC_*"],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEmittedEnvironmentKeysTracked(["UNTRACKED_SECRET"], ["NODE_ENV"], ["PORT"]),
  ).toThrow("does not track emitted environment keys: UNTRACKED_SECRET");
});

test("package CI and release scripts run each expensive gate once with Bun", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    packageManager: string;
    engines: { bun: string };
    publishConfig: Record<string, unknown>;
  };

  expect(pkg.packageManager).toBe(`bun@${runtime.bun}`);
  expect(pkg.engines.bun).toBe(runtime.bun);
  expect(pkg.scripts["test:e2e-build"]).toBe(
    "E2E_BUILD=1 bun test --timeout 1800000 tests/integration/e2e-build.test.ts",
  );
  expect(pkg.scripts["test:realtime-runtime"]).toBe(
    "NITRO_WEBSOCKET_RUNTIME=1 bun test --timeout 900000 tests/integration/nitro-websocket-compat-runtime.test.ts",
  );
  expect(pkg.scripts["pretest:fixtures"]).toBeUndefined();
  expect(pkg.scripts["test:fixtures"]).toBe("bun run scripts/test-fixtures.ts");
  expect(pkg.scripts["test:workers"]).toBe("bun run scripts/test-generated.ts --workers");
  expect(pkg.scripts["test:ci"]).toBe(
    "bun run check:lock-age && bun run check && bun run typecheck && bun run scripts/sync-turbo-env.ts --check && bun run check:versions && bun run check:capability-evidence && bun audit --audit-level=high && git diff --check && bun run test && bun run test:fixtures && bun run test:convex-codegen && bun run test:generated -- --all && bun run test:realtime-runtime && bun run test:e2e-build",
  );
  expect(pkg.scripts["check:capability-evidence"]).toBe(
    "bun run scripts/check-capability-evidence.ts",
  );
  expect(pkg.scripts["test:ci"]).not.toContain("bun run pretest:fixtures");
  expect(pkg.scripts["release:artifact"]).toBe("bun run scripts/release-artifact.ts");
  expect(pkg.scripts.release).toBe("bun run test:ci && bun run release:artifact");
  expect(pkg.scripts.release).not.toMatch(/\b(?:npm|npx)\b/);
  expect(pkg.publishConfig).toEqual({ access: "public" });
});

test("generated-project gate is streaming, tree-safe, exact-local, and capability-complete", () => {
  const source = readFileSync(resolve(root, "scripts/test-generated.ts"), "utf8");
  const cornerSource = (id: string): string => {
    const start = source.indexOf(`id: "${id}"`);
    expect(start, `missing generated corner ${id}`).toBeGreaterThanOrEqual(0);
    const next = source.indexOf("\n  {", start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  };
  const runtimeProbeStart = source.indexOf("export const CONVEX_WORKER_RUNTIME_PROBES");
  const runtimeProbeEnd = source.indexOf(
    "] as const satisfies readonly WorkerRuntimeProbe[];",
    runtimeProbeStart,
  );
  expect(runtimeProbeStart).toBeGreaterThanOrEqual(0);
  expect(runtimeProbeEnd).toBeGreaterThan(runtimeProbeStart);
  const runtimeProbeSource = source.slice(runtimeProbeStart, runtimeProbeEnd);

  expect(source).toContain("const REQUIRED_BUN_VERSION = runtime.bun");
  expect(source).toContain("Bun.version !== REQUIRED_BUN_VERSION");
  expect(source).toContain("const BUN_EXECUTABLE = process.execPath");
  expect(source).toContain("const completion = runSupervisedCommand({");
  const commandRunner = source.slice(
    source.indexOf("export function run("),
    source.indexOf("function validateArchitectureResult("),
  );
  expect(commandRunner).not.toContain("spawn(");
  expect(commandRunner).not.toContain("activeChild =");
  expect(commandRunner).toContain("abortSignal: controller.signal");
  expect(commandRunner).toContain("signalSource: new EventEmitter()");
  expect(commandRunner).toContain("if (terminationRequested) controller.abort");
  expect(commandRunner).toContain("if (!result.cleanupVerified) workspaceCleanupSafe = false");
  expect(source).toContain("shell: false");
  expect(source).not.toContain("shell: true");
  expect(source).not.toContain("execFileSync");
  expect(source).toContain("if (!options.redact?.length) process.stdout.write(data)");
  expect(source).toContain("if (!options.redact?.length) process.stderr.write(data)");
  expect(source).toContain("MAX_CAPTURE_CHARS");
  expect(source).toContain('} from "../tests/helpers/process-tree.js"');
  expect(source).toContain("await stopWorkerPreview(child)");
  expect(source).toContain("await captureWorkerPreviewOwnership(child)");
  expect(source).toContain("const current = await captureWindowsProcessTree(child)");
  expect(source).toContain("captured = [...captured, ...current]");
  expect(source).toContain("console.error(workerRuntime.detail)");
  expect(source).toContain("await assertProcessTreeExited(child, captured)");
  expect(source).toContain("previewStops.get(child)");
  expect(source).toContain("cleanupVerified: boolean");
  expect(commandRunner).toContain("result.cleanupVerified &&");
  expect(commandRunner).toContain("!result.timedOut &&");
  const signalHandler = source.slice(
    source.indexOf("const terminateForSignal = async"),
    source.indexOf("const onSigint = (): void => void terminateForSignal"),
  );
  expect(signalHandler).toContain("const command = cancelActiveRun(signal)");
  expect(signalHandler.indexOf("const result = await command")).toBeLessThan(
    signalHandler.indexOf("await activeWorkerBindings.restore(cleanupVerified)"),
  );
  expect(source).toContain('process.on("SIGINT", onSigint)');
  expect(source).toContain('process.on("SIGTERM", onSigterm)');
  expect(source).not.toContain("spawnSync");

  expect(source).toContain('[CLI, "check", "--cwd", directory, "--json"]');
  expect(source).toContain("validateArchitectureResult(architectureRun)");
  expect(source).toContain("parsed.success !== true");
  expect(source).toContain("parsed.exitCode !== 0");
  expect(source).toContain('parsed.meta.command !== "check"');
  expect(source).toContain("parsed.data.summary.blockers !== 0");
  expect(source).not.toMatch(/\b(?:bunx|npx)\b[^\n]*\bghostinit\b/);
  expect(source).not.toContain("expectedFailures");
  expect(source).not.toContain("known gap");
  expect(source).toContain("const projectName = generatedProjectName(corner.id)");
  expect(source).toContain("const directory = join(root, projectName)");

  for (const corner of [
    "notifications",
    "feature-flags",
    "jobs",
    "standalone-storage",
    "single-eve-next",
    "single-eve-tanstack",
    "single-expo-frontend",
    "single-electron-frontend",
    "maximal-multi-app",
    "cloudflare-next-monorepo",
    "cloudflare-next-single",
    "cloudflare-tanstack-monorepo",
    "cloudflare-tanstack-single",
  ]) {
    expect(source).toContain(`id: "${corner}"`);
  }
  for (const flag of ["--with-notifications", "--feature-flags", "--with-jobs", "--with-storage"]) {
    expect(source).toContain(`"${flag}"`);
  }
  expect(cornerSource("single-convex")).toContain('"--framework",\n      "tanstack-start"');
  expect(cornerSource("single-convex")).toContain('"--database",\n      "convex"');
  expect(cornerSource("single-convex")).toContain('"--with-storage"');
  expect(cornerSource("next-convex")).toContain('"--with-messaging"');
  expect(cornerSource("single-tanstack")).toContain('"--with-messaging"');
  expect(cornerSource("single-eve-next")).toContain('"--with-eve"');
  expect(cornerSource("single-eve-tanstack")).toContain('"tanstack-start"');
  expect(cornerSource("single-eve-tanstack")).toContain('"--with-eve"');
  expect(cornerSource("features")).toContain('"--cache",\n      "redis"');
  expect(cornerSource("desktop")).toContain('"--apps", "web,mobile,desktop"');
  expect(cornerSource("maximal-multi-app")).toContain('"web,mobile,desktop"');
  expect(cornerSource("maximal-multi-app")).toContain(
    'nativePackageRoots: ["apps/mobile", "apps/desktop"]',
  );
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"--database",\n      "convex"');
  const billingSelection = (id: string): string | undefined => {
    const corner = CORNERS.find((entry) => entry.id === id);
    expect(corner, `missing executable corner ${id}`).toBeDefined();
    return corner?.args[(corner?.args.indexOf("--billing") ?? -1) + 1];
  };
  expect(billingSelection("cloudflare-next-monorepo")).toBe("paddle,chargily,manual");
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"--with-i18n"');
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"--with-messaging"');
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"--with-notifications"');
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"--feature-flags",\n      "posthog"');
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"--with-jobs"');
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"--cache",\n      "redis"');
  expect(cornerSource("cloudflare-next-monorepo")).toContain(
    'artifactRoot: ".wrangler/ghostinit-dry-run"',
  );
  expect(cornerSource("cloudflare-next-monorepo")).toContain('previewHostFlag: "--ip"');
  expect(cornerSource("cloudflare-next-monorepo")).toContain(
    'convexPublicEnvKey: "NEXT_PUBLIC_CONVEX_URL"',
  );
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"/api/rpc/health"');
  expect(cornerSource("cloudflare-next-monorepo")).toContain('"wss://fixture-worker.convex.site"');
  for (const id of ["cloudflare-next-monorepo", "cloudflare-tanstack-monorepo"]) {
    const corner = cornerSource(id);
    for (const expected of [
      '"--database",\n      "convex"',
      '"--with-i18n"',
      '"--with-messaging"',
      '"--with-notifications"',
      '"--feature-flags",\n      "posthog"',
      '"--with-jobs"',
      '"--cache",\n      "redis"',
    ]) {
      expect(corner, `${id}: ${expected}`).toContain(expected);
    }
    for (const provider of ["paddle", "stripe", "polar"]) {
      const variantId = provider === "paddle" ? id : `${id}-${provider}`;
      expect(billingSelection(variantId)).toBe(`${provider},chargily,manual`);
    }
    expect(corner).toContain('"--apps",\n      "web,mobile,desktop"');
    expect(corner).toContain('nativePackageRoots: ["apps/mobile", "apps/desktop"]');
    expect(corner).toContain(
      'nativeArtifactRoots: ["apps/mobile/dist", "apps/desktop/dist/renderer"]',
    );
    expect(corner).toContain(
      'nativeArtifactFiles: ["apps/desktop/dist/main.js", "apps/desktop/dist/preload.cjs"]',
    );
    expect(corner).toContain("runtimeProbes: CONVEX_WORKER_RUNTIME_PROBES");
  }
  for (const path of [
    "/api/webhooks/stripe",
    "/api/webhooks/chargily",
    "/api/webhooks/paddle",
    "/api/webhooks/polar",
    "/api/auth/admin/list-users",
  ]) {
    expect(runtimeProbeSource, path).toContain(`path: "${path}"`);
  }
  expect(cornerSource("cloudflare-next-single")).toContain('"--database",\n      "none"');
  expect(cornerSource("cloudflare-next-single")).toContain('"--runtime",\n      "node"');
  expect(cornerSource("cloudflare-next-single")).toContain('"--with-api"');
  expect(cornerSource("cloudflare-next-single")).toContain('"/api/rpc/health"');
  expect(cornerSource("cloudflare-next-single")).toContain(
    'artifactRoot: ".wrangler/ghostinit-dry-run"',
  );
  expect(cornerSource("cloudflare-tanstack-monorepo")).toContain(
    '"--framework",\n      "tanstack-start"',
  );
  expect(cornerSource("cloudflare-tanstack-monorepo")).toContain(
    'artifactRoot: ".wrangler/ghostinit-dry-run"',
  );
  expect(cornerSource("cloudflare-tanstack-monorepo")).toContain('previewHostFlag: "--host"');
  expect(cornerSource("cloudflare-tanstack-monorepo")).toContain(
    'convexPublicEnvKey: "VITE_CONVEX_URL"',
  );
  expect(cornerSource("cloudflare-tanstack-monorepo")).toContain('"/api/rpc/health"');
  expect(cornerSource("cloudflare-tanstack-monorepo")).toContain(
    '"wss://fixture-worker.convex.cloud"',
  );
  expect(cornerSource("cloudflare-tanstack-single")).toContain('"--mode",\n      "single"');
  expect(cornerSource("cloudflare-tanstack-single")).toContain('"--runtime",\n      "node"');
  expect(cornerSource("cloudflare-tanstack-single")).toContain('"--with-api"');
  expect(cornerSource("cloudflare-tanstack-single")).toContain('"/api/rpc/health"');
  expect(cornerSource("cloudflare-tanstack-single")).toContain(
    'artifactRoot: ".wrangler/ghostinit-dry-run"',
  );
  expect(source).toContain('if (argv.includes("--workers")) return { ids: WORKER_CORNERS, keep }');
  expect(source).toContain("if (selectorCount > 1)");
  expect(source).toContain("Use only one generated-corner selector");
  expect(source).toContain("--only requires at least one non-empty corner id");
  expect(source).toContain(
    "const WORKER_CORNERS = CORNERS.filter(({ worker }) => worker !== undefined)",
  );
  expect(source).toContain('await run(BUN_EXECUTABLE, ["run", "install:bootstrap"], directory)');
  expect(source).not.toContain(
    'await run(BUN_EXECUTABLE, ["run", "audit:dependencies"], directory)',
  );
  expect(source).toContain('for (const step of ["format", "format:check"] as const)');
  expect(source).toContain('for (const step of ["typecheck", "lint:all", "test"] as const)');
  expect(source).toContain('for (const step of ["typecheck", "lint", "test"] as const)');
  expect(source).not.toContain("passWithNoTests");
  expect(source).toContain("await verifyAuthDeclarations(directory)");
  expect(source).toContain('["run", "build"]');
  expect(source).toContain("verifyWorkerArtifactDoesNotContain(");
  expect(source).toContain('["run", "cloudflare:dry-run"]');
  expect(source).toContain("await verifyWorkerRuntime(directory, corner.worker)");
  expect(source).toContain("GHOSTINIT_WORKER_TEST_SECRET: syntheticServerOnlyValue");
  expect(source).toContain('GHOSTINIT_WORKER_SECURITY_TEST: "1"');
  expect(source).toContain("/^(?:HTTPS?|ALL)_PROXY$/i.test(key)");
  expect(source).toContain('resolve(directory, ".dev.vars")');
  expect(source).toContain('resolve(appRoot, ".dev.vars")');
  expect(source).toContain("const devVarInputs = devVarPaths.map((path) => {");
  expect(source).toContain("variables: parseGeneratedDevVarsContent(original)");
  expect(source).toContain("Cloudflare root and app .dev.vars files have drifted");
  expect(source).toContain("await stageWorkerBindingFiles(directory, replacements)");
  expect(source).toContain(
    "pendingWorkerBindings = prepareWorkerFixtureBindings(directory, corner.worker)",
  );
  expect(source).toContain("activeWorkerBindings = await pendingWorkerBindings");
  expect(source).toContain("activeWorkerBindings.capabilityFixtures");
  expect(source).toContain("await activeWorkerBindings.restore(bindingCleanupSafe)");
  expect(source).toContain("await activeWorkerBindings.restore(cleanupVerified)");
  expect(source).toContain(
    'const previewVariables = parseGeneratedDevVars(resolve(appRoot, ".dev.vars"))',
  );
  expect(source).not.toContain("prepareWorkerPosthogFixture(");
  expect(source).toContain("const admittedBuildVariables = Object.fromEntries(");
  expect(source).toContain("const generatedCiBuildKeys = new Set([");
  expect(source).toContain("generatedCiBuildKeys.has(key)");
  expect(source).toContain('value.includes("REPLACE_WITH_")');
  expect(source).toContain("syntheticWorkerCapabilityFixtures()");
  expect(source).toContain('result.CONVEX_DEPLOYMENT = "dev:fixture-worker"');
  expect(source).toContain("result.CONVEX_URL = convexUrl");
  expect(source).toContain('result.CONVEX_SITE_URL = "https://fixture-worker.convex.site"');
  expect(source).toContain("credentialSafeHostEnvironment()");
  expect(source).toContain("if (credentialName.test(key)) delete environment[key]");
  expect(source).toContain("...buildVariables");
  expect(source).toContain("redact: buildEnvironment.serverOnlyValues");
  expect(source).toContain("worker.previewHostFlag");
  expect(source).not.toContain('"wrangler", "dev"');
  expect(source).toContain("await assertLoopbackPortUnowned(port)");
  const runtimeStartup = source.slice(
    source.indexOf("const port = await reserveLoopbackPort()"),
    source.indexOf(
      "activeChild = child",
      source.indexOf("const port = await reserveLoopbackPort()"),
    ),
  );
  expect(runtimeStartup.indexOf("if (terminationRequested)")).toBeGreaterThan(
    runtimeStartup.indexOf("await assertLoopbackPortUnowned(port)"),
  );
  expect(runtimeStartup.indexOf("if (terminationRequested)")).toBeLessThan(
    runtimeStartup.indexOf("child = spawn("),
  );
  expect(source).toContain("new WorkerPreviewReadiness(port)");
  expect(source).toContain('previewReadiness.consume("stdout", data)');
  expect(source).toContain('previewReadiness.consume("stderr", data)');
  expect(source).toContain("previewReadiness.isReady()");
  expect(source).not.toContain("previewReportedListening(runtimeOutput, port)");
  expect(source).toContain("post-start health/security stability recheck");
  expect(source).toContain("await assertWorkerRuntimeProbeResponse(response, probe)");
  expect(source).toContain("response.status !== probe.status");
  expect(source).toContain("(await response.text()) !== probe.body");
  expect(runtimeProbeSource).toContain(
    '"cache-control": "private, no-cache, no-store, max-age=0, must-revalidate"',
  );
  expect(source).toContain('response.headers.get("x-frame-options") === "DENY"');
  expect(source).toContain("!csp.includes(\"'unsafe-eval'\")");
  expect(source).toContain("hasSelfHostedFontPolicy(csp)");
  expect(source).toContain('!csp.includes("*.convex.")');
  expect(source).toContain('const smokePaths = worker.smokePaths ?? ["/", "/api/health"]');
  expect(source).toContain('response.headers.get("content-type")?.includes("application/json")');
  expect(source).toContain('redirect: "manual"');
  expect(source).toContain("if (next.origin !== origin)");
  expect(source).toContain('payload.json.status === "ok"');
  expect(source).toContain('payload.status === "ok"');
  expect(source).toContain("await stopWorkerPreview(child)");
  expect(source).toContain("return { ok: ok && cleanupVerified, detail, cleanupVerified }");
  const orderedStages = [
    "const generation = await run(",
    'const install = await run(BUN_EXECUTABLE, ["run", "install:bootstrap"], directory)',
    'for (const step of ["format", "format:check"] as const)',
    "const architectureRun = await run(",
    'for (const step of ["typecheck", "lint:all", "test"] as const)',
    "const authDeclarations = await verifyAuthDeclarations(directory)",
    "pendingWorkerBindings = prepareWorkerFixtureBindings(directory, corner.worker)",
    "const workerBuild = await run(",
    "const workerScan = verifyWorkerArtifactDoesNotContain(",
    "const workerDryRun = await run(",
    "const workerRuntime = await verifyWorkerRuntime(directory, corner.worker)",
  ];
  const stageIndexes = orderedStages.map((marker) => source.indexOf(marker));
  expect(stageIndexes.every((index) => index >= 0)).toBe(true);
  for (let index = 1; index < stageIndexes.length; index += 1) {
    expect(stageIndexes[index], orderedStages[index]).toBeGreaterThan(stageIndexes[index - 1]);
  }
  const formattingStage = source.slice(stageIndexes[2], stageIndexes[3]);
  expect(formattingStage).toContain("cleanupCorner(directory, keep)");
  expect(formattingStage).toContain("continue cornerLoop");
  expect(source).toContain('["x", "--no-install", "tsc"');
  expect(source).toContain('source.includes("@better-auth/passkey")');
  expect(source).toContain('"@simplewebauthn/server"');
  expect(source).toContain('"AuthenticationResponseJSON"');
  expect(source).toContain('"PublicKeyCredentialCreationOptionsJSON"');
  expect(source).toContain('"PublicKeyCredentialRequestOptionsJSON"');
  expect(source).toContain('"zod/v4/core"');
  expect(source).toContain("await auth.api.listUsers");
  expect(source).toContain("const context = await auth.$context");
});

test("generated-project corner names cannot collide with platform package names", () => {
  expect(generatedProjectName("web")).toBe("generated-web");
  expect(generatedProjectName("mobile")).toBe("generated-mobile");
  expect(generatedProjectName("desktop")).toBe("generated-desktop");
});

test("generated browser acceptance cannot select stale PATH Bun shims", () => {
  const source = readFileSync(
    resolve(root, "tests/integration/generated-web-primitives.test.ts"),
    "utf8",
  );

  expect(source).toContain("const REQUIRED_BUN_VERSION = runtime.bun");
  expect(source).toContain("const BUN_EXECUTABLE = process.execPath");
  expect(source).toContain("expect(Bun.version).toBe(REQUIRED_BUN_VERSION)");
  expect(source).toContain("runBounded(BUN_EXECUTABLE, args, cwd, env, 900_000)");
  expect(source).toContain('runBounded(BUN_EXECUTABLE, ["x", ...args]');
  expect(source).toContain("spawn(BUN_EXECUTABLE, args");
  expect(source).not.toContain('Bun.which("bun")');
  expect(source).not.toContain('Bun.which("bunx")');
});

test("production E2E builds representative runtimes with strict lifecycle cleanup", () => {
  const source = readFileSync(resolve(root, "tests/integration/e2e-build.test.ts"), "utf8");
  const processSource = readFileSync(
    resolve(root, "tests/integration/e2e-build-process.ts"),
    "utf8",
  );

  expect(source).toContain("const REQUIRED_BUN_VERSION = runtime.bun");
  expect(source).toContain("const BUN_EXECUTABLE = process.execPath");
  expect(source).toContain('createProject("smoke")');
  expect(source).toContain('for (const provider of ["stripe", "paddle", "polar"] as const)');
  const billingBuild = source.slice(
    source.indexOf('for (const provider of ["stripe"'),
    source.indexOf('"builds and starts single TanStack Postgres messaging"'),
  );
  expect(billingBuild).toContain("createProject(`billing-${provider}`, [");
  expect(billingBuild).toContain('"--billing",');
  expect(billingBuild).toContain("`${provider},chargily,manual`,");
  expect(billingBuild).toContain('"--with-eve",');
  expect(billingBuild).toContain("installAndVerify(projectRoot, `billing-${provider}`, {");
  for (const project of ["tanstack-messaging", "tanstack-convex", "custom-heavy", "multi-app"]) {
    expect(source).toContain(`createProject("${project}"`);
  }
  expect(source.match(/await installAndVerify\(/g)).toHaveLength(6);
  expect(source).not.toContain('["run", "audit:dependencies"]');
  expect(source).toContain('["run", "format"]');
  expect(source).toContain('["run", "format:check"]');
  expect(source).toContain('["run", "typecheck"]');
  expect(source).toContain('["run", "lint:all"]');
  expect(source).toMatch(
    /const typecheck = await runCommand\(\s*BUN_EXECUTABLE,\s*\["run", "typecheck"\],\s*projectRoot,\s*STATIC_GATE_TIMEOUT_MS,\s*\);/,
  );
  expect(source).toContain("expectCommandOk(typecheck, `${label}: typecheck`)");
  expect(source).toMatch(
    /const build = await runCommand\(\s*BUN_EXECUTABLE,\s*\["run", "build"\],\s*projectRoot,\s*BUILD_TIMEOUT_MS,\s*production\.environment,\s*\);/,
  );
  expect(source).toContain("expectCommandOk(build, `${label}: production build`)");
  expect(source).toMatch(
    /spawnTracked\(\s*BUN_EXECUTABLE,\s*\["run", "start"\],\s*projectRoot,\s*production\.environment,\s*\)/,
  );
  expect(source).not.toContain('"web#start"');
  expect(source).not.toContain("projectLayout");
  expect(source).toContain("const production = await reserveProductionRuntime(productionOptions)");
  expect(source).toContain("production.environment");
  expect(source).toContain("E2E_REDIS_ENVIRONMENT");
  expect(source).toContain('UPSTASH_REDIS_REST_URL: "https://ghostinit-cache.invalid"');
  expect(source).toContain('UPSTASH_REDIS_REST_TOKEN: "GHOSTINIT_E2E_NON_CREDENTIAL"');
  expect(source).toContain("environmentOverrides: E2E_REDIS_ENVIRONMENT");
  expect(source).toContain("const isolatedPostgres = options.isolatedPostgres");
  expect(source).toContain("await pushGeneratedPostgresSchema(projectRoot, label");
  expect(source).toContain("await expectPostgresAuthenticationFailureIsFatal(");
  expect(source).toContain("isolatedPostgres: true");
  expect(source).toContain("resolvePackagedDesktopExecutable(desktopRoot, rootManifest.name)");
  expect(source).toContain("packagedDesktopLaunchCommand(");
  expect(source).not.toContain('"--headless"');
  expect(source).not.toContain('"--no-install",\n          "electron"');
  expect(source).toContain("expectArchitectureCheck(projectRoot)");
  expect(source).toContain('expectCommandOk(result, "local CLI architecture check")');
  expect(source).toContain("parseArchitectureEnvelope(result.stdout.trim())");
  expect(source).toMatch(
    /rawWebSocketUpgradeStatus\(\s*production\.port,\s*"\/api\/ws",\s*production\.origin/,
  );
  expect(source).toMatch(
    /rawWebSocketUpgradeStatus\(\s*production\.port,\s*"\/api\/realtime",\s*production\.origin/,
  );
  expect(source).toContain('writeFileSync(clientEntry, `import "server-only";');
  expect(source).toContain("Import denied in client environment");
  expect(source).toContain("Denied by marker");
  expect(source).toContain('rejectedOutput.replaceAll("\\\\", "/")');
  expect(source).toContain("toContain(expectedImporter)");
  const acceptedInstall = source.indexOf(
    "expectCommandOk(install, `${label}: verified dependency bootstrap`)",
  );
  const acceptedFormat = source.indexOf("expectCommandOk(format, `${label}: format:check`)");
  const acceptedTypecheck = source.indexOf("expectCommandOk(typecheck, `${label}: typecheck`)");
  const acceptedLint = source.indexOf("expectCommandOk(lintAll, `${label}: lint:all`)");
  const acceptedBuild = source.indexOf("expectCommandOk(build, `${label}: production build`)");
  expect(source).toContain("Dynamic filesystem access causes tracing of the whole project");
  const runtimeProbe = source.indexOf("await probeProductionOutput(projectRoot");
  const clientCanary = source.indexOf('writeFileSync(clientEntry, `import "server-only";');
  expect(acceptedInstall).toBeGreaterThan(-1);
  expect(acceptedFormat).toBeGreaterThan(acceptedInstall);
  expect(acceptedTypecheck).toBeGreaterThan(acceptedFormat);
  expect(acceptedLint).toBeGreaterThan(acceptedTypecheck);
  expect(acceptedBuild).toBeGreaterThan(acceptedLint);
  expect(runtimeProbe).toBeGreaterThan(acceptedBuild);
  expect(clientCanary).toBeGreaterThan(runtimeProbe);
  expect(source).toMatch(
    /const rejectedBuild = await runCommand\([\s\S]*?BUILD_TIMEOUT_MS,[\s\S]*?production\.environment,[\s\S]*?\);/,
  );
  expect(source).toContain("terminateTrackedProcesses()");
  expect(source).toContain("await assertLoopbackPortUnowned(production.port)");
  expect(source).toContain("const stableHealth = await waitForHealthyHttp(");
  expect(source).toContain("health route returned a stale or cached stability payload");
  expect(processSource).toContain('detached: process.platform !== "win32"');
  expect(processSource).toContain("terminateProcessTree as terminateVerifiedProcessTree");
  expect(processSource).toContain("posixGraceMs: SUPERVISED_PROCESS_TREE_GRACE_MS");
  expect(processSource).toContain("const completion = runSupervisedCommand({");
  expect(processSource).toContain("activeCommands.set(controller, completion)");
  expect(processSource).toContain('controller.abort("SIGTERM")');
  expect(processSource).toContain("if (unverifiedCommandCleanup) throw unverifiedCommandCleanup");
  const commandSource = processSource.slice(
    processSource.indexOf("export function runCommand("),
    processSource.indexOf("export function terminateTrackedProcesses("),
  );
  expect(commandSource).not.toContain("spawnTracked(");
  expect(commandSource).not.toContain("activeChildren");
  expect(processSource).toContain("productionListenerOwnedByProcessTree(running.child, port)");
  expect(processSource).toContain("isExactHealthPayload(payload)");
  expect(processSource).toContain("Public build artifact contains an unscannable symbolic link");
  expect(processSource).toContain("Public build artifact contains an unsupported special entry");
});

test("version verification fails closed and enforces the release version", () => {
  const source = readFileSync(resolve(root, "scripts/check-versions.ts"), "utf8");

  expect(source).toContain('readFileSync(new URL("../package.json", import.meta.url), "utf8")');
  expect(source).toMatch(/\.version\s*!==\s*[A-Za-z][A-Za-z0-9_]*\.ghostinitVersion/);
  expect(source).toContain("GhostInit version mismatch");
  expect(source).toContain("evidence/compatibility/dependency-versions.json");
  expect(source).toContain("registry lookup failed");
  expect(source).toContain("audit evidence is missing or stale");
  expect(source).toContain("if (failures.length > 0)");
  expect(source).toContain("process.exit(1)");
  expect(source).not.toContain("resolvable pins are valid");
});

test("generated hooks fail closed and never trust an unversioned global checker", () => {
  const files = huskyFiles();
  const hook = files.find(({ path }) => path === ".husky/pre-commit")?.content;
  const lefthook = files.find(({ path }) => path === "lefthook.yml")?.content;

  expect(hook).toBeDefined();
  expect(hook).toContain("set -e");
  expect(hook).toContain("bunx --no-install oxlint --deny-warnings .");
  expect(hook).toContain("bunx --no-install oxfmt --check .");
  expect(hook).toContain(`expected_ghostinit_version="${ghostinitVersion}"`);
  expect(hook).toContain("bun ./node_modules/ghostinit/dist/cli.js check --json");
  expect(hook).toContain('bunx --bun "ghostinit@$expected_ghostinit_version" check --json');
  expect(hook).not.toMatch(/\|\|\s*(?:echo|true)/);
  expect(hook).not.toContain("command -v ghostinit");
  expect(hook).not.toMatch(/\n\s*ghostinit\s+check/);

  expect(lefthook).toContain("run: bunx --no-install oxlint --deny-warnings .");
  expect(lefthook).toContain("run: bunx --no-install oxfmt --check .");
  expect(lefthook).toContain(`run: bunx --bun ghostinit@${ghostinitVersion} check --json`);
  expect(lefthook).not.toMatch(/\|\|\s*(?:echo|true)/);
});

test("generated workflow is immutable, least-privilege, frozen, and blocking", () => {
  const rendered = githubWorkflow("bun").content;
  const workflow = Bun.YAML.parse(rendered) as Workflow;
  const steps = workflow.jobs.build.steps;
  const runs = steps.map(({ run }) => run).filter((run): run is string => typeof run === "string");
  const uses = steps.map((step) => step.uses).filter((use): use is string => use !== undefined);

  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.build["timeout-minutes"]).toBe(60);
  expect(uses).toHaveLength(2);
  for (const action of uses) expect(action).toMatch(/^[^@]+@[a-f0-9]{40}$/);
  expect(steps.find(({ uses: use }) => use?.startsWith("actions/checkout@"))?.with).toEqual({
    "persist-credentials": false,
  });
  expect(steps.find(({ uses: use }) => use?.startsWith("oven-sh/setup-bun@"))?.with).toEqual({
    "bun-version": runtime.bun,
  });
  expect(runs).toContain("bun install --frozen-lockfile");
  expect(runs.indexOf("bun run audit:lock")).toBeLessThan(
    runs.indexOf("bun install --frozen-lockfile"),
  );
  expect(runs).toContain("bun run audit:dependencies");
  expect(runs).toContain("bun run format:check");
  expect(runs).toContain("bun run lint:all");
  expect(runs).toContain("bun run test");
  expect(runs).toContain("bun run build");
  expect(runs.some((run) => run.includes("git diff --check"))).toBe(true);
  expect(runs.some((run) => run.includes("git diff --exit-code"))).toBe(true);
  expect(runs.some((run) => run.includes(`ghostinit@${ghostinitVersion} check --json`))).toBe(true);
  expect(runs.some((run) => run.includes("JSON.parse"))).toBe(true);
  expect(runs.some((run) => run.includes("payload.success !== true"))).toBe(true);
  expect(rendered).not.toContain("continue-on-error");

  const workerRendered = githubWorkflow("bun", "cloudflare", {
    database: "convex",
    framework: "nextjs",
    auth: true,
    notifications: true,
    cache: true,
    apps: ["web", "mobile", "desktop"],
    messaging: true,
  }).content;
  const workerWorkflow = Bun.YAML.parse(workerRendered) as Workflow;
  const workerSteps = workerWorkflow.jobs.build.steps;
  const workerRuns = workerSteps
    .map(({ run }) => run)
    .filter((run): run is string => typeof run === "string");
  const workerBuildSteps = workerSteps.filter(({ run }) => run === "bun run build");
  expect(workerWorkflow.env).toBeUndefined();
  expect(workerWorkflow.jobs.build.env).toBeUndefined();
  expect(workerRendered).not.toContain("${{ secrets.");
  expect(workerBuildSteps).toHaveLength(1);
  expect(workerBuildSteps[0]?.env).toEqual({
    SITE_URL: "https://ghostinit-ci.example.test",
    NEXT_PUBLIC_APP_URL: "https://ghostinit-ci.example.test",
    CONVEX_DEPLOYMENT: "dev:fixture-worker",
    CONVEX_URL: "https://fixture-worker.convex.cloud",
    CONVEX_SITE_URL: "https://fixture-worker.convex.site",
    NEXT_PUBLIC_CONVEX_URL: "https://fixture-worker.convex.cloud",
    BETTER_AUTH_SECRET:
      "ghostinit-ci-only-not-a-production-secret-${{ github.run_id }}-${{ github.run_attempt }}",
    BETTER_AUTH_URL: "https://ghostinit-ci.example.test",
    NOTIFICATION_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    UPSTASH_REDIS_REST_URL: "https://redis.example.test",
    UPSTASH_REDIS_REST_TOKEN: "ghostinit-ci-only-${{ github.run_id }}-${{ github.run_attempt }}",
    EXPO_PUBLIC_APP_URL: "https://ghostinit-ci.example.test",
    EXPO_PUBLIC_API_URL: "https://ghostinit-ci.example.test",
    EXPO_PUBLIC_CONVEX_URL: "https://fixture-worker.convex.cloud",
    EXPO_PUBLIC_WS_URL: "wss://ghostinit-ci.example.test/api/realtime",
    DESKTOP_API_URL: "https://ghostinit-ci.example.test",
    VITE_APP_URL: "https://ghostinit-ci.example.test",
    VITE_API_URL: "https://ghostinit-ci.example.test",
    VITE_CONVEX_URL: "https://fixture-worker.convex.cloud",
    VITE_WS_URL: "wss://ghostinit-ci.example.test/api/realtime",
  });
  expect(workerRuns.filter((run) => run === "bun run build")).toHaveLength(1);
  expect(workerRuns).not.toContain("bun run cloudflare:dry-run");
  expect(workerRuns.indexOf("bun run audit:lock")).toBeLessThan(
    workerRuns.indexOf("bun install --frozen-lockfile"),
  );
});
