import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  runSupervisedCommand,
  type SupervisedCommandResult,
} from "../../src/commands/create/installer.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { redactSecretValues } from "../../src/lib/logger.js";

/**
 * Public dev --once waits for --start, retaining one backend without a watcher.
 * The init-only probe with a restart per codegen hit repeated local start_push
 * OCC failures; this establishes the app through the normal local dev push first.
 * A fixture-owned file marks readiness because detached Windows --start children
 * do not reliably forward their stdout to the parent CLI.
 */
export function startCodegenOwner(
  root: string,
  node: string,
  environment: NodeJS.ProcessEnv,
  secret: string,
) {
  const controller = new AbortController();
  let output = "";
  let settled: SupervisedCommandResult | undefined;
  const safeOutput = () => redactSecretValues(output.replaceAll(secret, "[REDACTED]"));
  const observe = (chunk: Buffer): void => {
    output = (output + chunk.toString("utf8")).slice(-32_000);
  };
  const completion = runSupervisedCommand({
    command: node,
    argv: [
      join(root, "node_modules", "convex", "bin", "main.js"),
      "dev",
      "--once",
      "--typecheck=enable",
      "--tail-logs",
      "disable",
      "--start",
      "bun --smol .proof-hold.ts",
    ],
    cwd: root,
    label: "Public local dev owner",
    env: environment,
    timeoutMs: 480_000,
    abortSignal: controller.signal,
    onStdout: observe,
    onStderr: observe,
  })
    .catch((error: unknown): SupervisedCommandResult => ({
      exitCode: null,
      signal: null,
      timedOut: false,
      cleanupVerified: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }))
    .then((result) => {
      settled = result;
      console.log(
        `[convex-codegen] Public local dev owner: exit=${result.exitCode}, cleanup=${result.cleanupVerified}`,
      );
      return result;
    });
  const ready = (async () => {
    const deadline = Date.now() + 180_000;
    while (!settled && Date.now() < deadline) {
      const marker = await readFile(join(root, ".proof-ready"), "utf8").catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        },
      );
      if (marker === "ready" && !settled) {
        console.log("[convex-codegen] Public local dev owner ready (file barrier)");
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    if (!settled) {
      controller.abort("SIGTERM");
      await completion;
    }
    throw new Error(`Public local dev did not become ready\n${safeOutput()}`);
  })();
  let closing: Promise<void> | undefined;
  return {
    ready,
    get running() {
      return settled === undefined;
    },
    get cleanupVerified() {
      return settled?.cleanupVerified ?? false;
    },
    get receipt() {
      return {
        label: "Public local dev owner",
        exitCode: settled?.exitCode ?? null,
        cleanupVerified: settled?.cleanupVerified ?? false,
      };
    },
    close(abort = false): Promise<void> {
      return (closing ??= (async () => {
        if (!settled) {
          if (abort) controller.abort("SIGTERM");
          else {
            try {
              const transaction = new FsTransaction(root);
              await transaction.write(".proof-release", "release\n");
              await transaction.commit();
            } catch (error) {
              controller.abort("SIGTERM");
              await completion;
              throw error;
            }
          }
        }
        const result = await completion;
        if (
          !result.cleanupVerified ||
          result.timedOut ||
          (!abort && (result.exitCode !== 0 || result.signal !== null))
        ) {
          throw new Error(
            `Public local dev owner failed or cleanup was not verified\n${safeOutput()}`,
          );
        }
      })());
    },
  };
}
