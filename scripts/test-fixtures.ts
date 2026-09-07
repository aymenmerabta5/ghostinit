/** Install and exercise every committed dependency-compatibility project exactly once. */
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { runtime } from "../packages/versions/src/index.js";
import { runSupervisedCommand } from "../src/commands/create/installer.js";

export interface FixtureStage {
  readonly label: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

export interface FixturePlan {
  readonly id: string;
  readonly directory: string;
  readonly stages: readonly FixtureStage[];
}

export const REQUIRED_BUN_VERSION = runtime.bun;
const ROOT = resolve(import.meta.dirname, "..");
export const FIXTURE_ROOT = resolve(ROOT, "tests", "fixtures", "compatibility");
export const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
export const BUILD_TIMEOUT_MS = 15 * 60 * 1000;
export const CHECK_TIMEOUT_MS = 5 * 60 * 1000;

const installStage: FixtureStage = {
  label: "frozen install",
  args: ["install", "--frozen-lockfile"],
  timeoutMs: INSTALL_TIMEOUT_MS,
};

const auditStage: FixtureStage = {
  label: "high-severity audit",
  args: ["audit", "--audit-level=high"],
  timeoutMs: CHECK_TIMEOUT_MS,
};

const patchedAuditStage: FixtureStage = {
  label: "high-severity audit with verified patches",
  args: ["run", "audit:dependencies"],
  timeoutMs: CHECK_TIMEOUT_MS,
};

const scriptStage = (name: string, timeoutMs = CHECK_TIMEOUT_MS): FixtureStage => ({
  label: name,
  args: ["run", name],
  timeoutMs,
});

export const FIXTURE_PLANS: readonly FixturePlan[] = [
  {
    id: "drizzle-betterauth-orpc",
    directory: resolve(FIXTURE_ROOT, "drizzle-betterauth-orpc"),
    stages: [
      installStage,
      auditStage,
      scriptStage("typecheck"),
      { label: "test", args: ["test", "--timeout", "100000"], timeoutMs: CHECK_TIMEOUT_MS },
      scriptStage("check:runtime"),
    ],
  },
  {
    id: "next-tailwind-oxtools",
    directory: resolve(FIXTURE_ROOT, "next-tailwind-biome"),
    stages: [
      installStage,
      auditStage,
      scriptStage("typecheck"),
      scriptStage("lint"),
      scriptStage("build", BUILD_TIMEOUT_MS),
    ],
  },
  {
    id: "expo-uniwind-rnr",
    directory: resolve(FIXTURE_ROOT, "expo-uniwind-rnr"),
    stages: [
      installStage,
      patchedAuditStage,
      scriptStage("check:image-size-patch"),
      scriptStage("typecheck"),
      scriptStage("check:tv"),
      scriptStage("check:twa"),
      scriptStage("check:uniwind"),
    ],
  },
];

let activeStage:
  | { readonly controller: AbortController; readonly completion: Promise<boolean> }
  | undefined;
let terminationRequested = false;
let cleanupWasVerified = true;

/** @internal Exported for real process-lifecycle regressions. */
export function runStage(plan: FixturePlan, stage: FixtureStage): Promise<boolean> {
  const command = `${process.execPath} ${stage.args.join(" ")}`;
  console.log(`\n[fixtures] ${plan.id} :: ${stage.label}`);
  const controller = new AbortController();
  if (terminationRequested || !cleanupWasVerified) controller.abort("SIGTERM");
  const completion = runSupervisedCommand({
    command: process.execPath,
    argv: stage.args,
    cwd: plan.directory,
    label: `[fixtures] ${plan.id} :: ${stage.label}`,
    timeoutMs: stage.timeoutMs,
    env: process.env,
    abortSignal: controller.signal,
    signalSource: new EventEmitter(),
    onStdout: (chunk) => {
      process.stdout.write(chunk);
    },
    onStderr: (chunk) => {
      process.stderr.write(chunk);
    },
  })
    .catch((error: unknown) => ({
      exitCode: null,
      signal: null,
      timedOut: false,
      cleanupVerified: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }))
    .then((result) => {
      if (result.timedOut) {
        console.error(`[fixtures] timed out after ${stage.timeoutMs}ms: ${command}`);
      }
      if (!result.cleanupVerified) {
        cleanupWasVerified = false;
        console.error(
          `[fixtures] could not verify ${plan.id} process-tree termination: ${result.error?.message ?? "unknown cleanup failure"}`,
        );
      } else if (
        !result.timedOut &&
        result.error &&
        result.exitCode === null &&
        result.signal === null
      ) {
        console.error(`[fixtures] failed to start ${command}: ${result.error.message}`);
      } else if (!result.timedOut && (result.exitCode !== 0 || result.signal !== null)) {
        console.error(
          `[fixtures] ${plan.id} :: ${stage.label} failed with ${String(result.exitCode ?? result.signal ?? "unknown")}`,
        );
      }
      return (
        result.cleanupVerified &&
        !result.error &&
        !result.timedOut &&
        result.exitCode === 0 &&
        result.signal === null
      );
    })
    .finally(() => {
      if (activeStage?.completion === completion) activeStage = undefined;
    });
  activeStage = { controller, completion };
  return completion;
}

/** @internal Cancellation joins the same stage before another stage or caller can proceed. */
export function cancelActiveFixtureStage(
  signal: "SIGINT" | "SIGTERM",
): Promise<boolean> | undefined {
  const operation = activeStage;
  operation?.controller.abort(signal);
  return operation?.completion;
}

/** @internal Preserve uncertain cleanup after the completed stage leaves activeStage. */
export function assertFixtureStageCleanup(): void {
  if (activeStage || !cleanupWasVerified) {
    throw new Error("Fixture stage process-tree cleanup could not be verified");
  }
}

async function main(): Promise<void> {
  if (typeof Bun === "undefined" || Bun.version !== REQUIRED_BUN_VERSION) {
    throw new Error(
      `Fixture verification requires Bun ${REQUIRED_BUN_VERSION}; received ${typeof Bun === "undefined" ? "a non-Bun runtime" : `Bun ${Bun.version}`}`,
    );
  }

  const failed: string[] = [];
  fixtureLoop: for (const fixture of FIXTURE_PLANS) {
    for (const stage of fixture.stages) {
      const passed = await runStage(fixture, stage);
      if (terminationRequested) return;
      if (passed) continue;
      failed.push(`${fixture.id} :: ${stage.label}`);
      if (!cleanupWasVerified) break fixtureLoop;
      break;
    }
  }

  if (!cleanupWasVerified) {
    throw new Error(
      `Fixture verification aborted because process-tree cleanup could not be verified:\n- ${failed.join("\n- ")}`,
    );
  }
  if (failed.length > 0) {
    throw new Error(`Fixture verification failed:\n- ${failed.join("\n- ")}`);
  }
  console.log(`\n[fixtures] ${FIXTURE_PLANS.length} compatibility fixtures passed all checks.`);
}

const terminateForSignal = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
  if (terminationRequested) return;
  terminationRequested = true;
  await cancelActiveFixtureStage(signal);
  const exitCode = cleanupWasVerified ? (signal === "SIGINT" ? 130 : 143) : 1;
  process.exit(exitCode);
};
if (import.meta.main) {
  // Keep both listeners installed while cleanup runs so a repeated signal
  // cannot bypass the bounded verification and restore the default exit path.
  process.on("SIGINT", () => void terminateForSignal("SIGINT"));
  process.on("SIGTERM", () => void terminateForSignal("SIGTERM"));
  await main();
}
