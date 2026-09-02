/** Install and exercise every committed dependency-compatibility project exactly once. */
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { runtime } from "../packages/versions/src/index.js";
import { terminateProcessTree } from "../tests/helpers/process-tree.js";

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

let activeChild: ChildProcess | undefined;
let activeTermination:
  | { readonly child: ChildProcess; readonly promise: Promise<void> }
  | undefined;
let terminationRequested = false;
let cleanupWasVerified = true;

function ensureProcessTreeTerminated(child: ChildProcess): Promise<void> {
  if (activeTermination?.child === child) return activeTermination.promise;
  const promise = terminateProcessTree(child).finally(() => {
    if (activeTermination?.promise === promise) activeTermination = undefined;
  });
  activeTermination = { child, promise };
  return promise;
}

async function runStage(plan: FixturePlan, stage: FixtureStage): Promise<boolean> {
  const command = `${process.execPath} ${stage.args.join(" ")}`;
  console.log(`\n[fixtures] ${plan.id} :: ${stage.label}`);
  const child = spawn(process.execPath, [...stage.args], {
    cwd: plan.directory,
    detached: process.platform !== "win32",
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  activeChild = child;

  return await new Promise<boolean>((resolveStage) => {
    let settled = false;
    let timedOut = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (activeChild === child) activeChild = undefined;
      resolveStage(ok);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`[fixtures] timed out after ${stage.timeoutMs}ms: ${command}`);
      void ensureProcessTreeTerminated(child)
        .catch((error) => {
          cleanupWasVerified = false;
          console.error(
            `[fixtures] could not verify ${plan.id} process-tree termination: ${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => finish(false));
    }, stage.timeoutMs);

    child.once("error", (error) => {
      if (timedOut) return;
      console.error(`[fixtures] failed to start ${command}: ${error.message}`);
      finish(false);
    });
    child.once("close", (code, signal) => {
      // Timeout settlement belongs to the verified tree-cleanup promise. The
      // root closing is not proof that its descendants have also exited.
      if (timedOut) return;
      if (code !== 0) {
        console.error(
          `[fixtures] ${plan.id} :: ${stage.label} failed with ${String(code ?? signal ?? "unknown")}`,
        );
        finish(false);
        return;
      }
      finish(true);
    });
  });
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
  let exitCode = signal === "SIGINT" ? 130 : 143;
  const child = activeChild;
  if (child) {
    try {
      await ensureProcessTreeTerminated(child);
    } catch (error) {
      cleanupWasVerified = false;
      exitCode = 1;
      console.error(
        `[fixtures] interrupted, but process-tree cleanup could not be verified: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  process.exit(exitCode);
};
if (import.meta.main) {
  // Keep both listeners installed while cleanup runs so a repeated signal
  // cannot bypass the bounded verification and restore the default exit path.
  process.on("SIGINT", () => void terminateForSignal("SIGINT"));
  process.on("SIGTERM", () => void terminateForSignal("SIGTERM"));
  await main();
}
