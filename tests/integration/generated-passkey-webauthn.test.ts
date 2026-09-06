import { describe, expect, test } from "bun:test";
import { chromium, type Browser } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, basename, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateRouterSources, type RouterVariant } from "../helpers/generated-router-fixture.js";
import {
  compilePasskeyFixture,
  passkeyServerSource,
} from "../helpers/generated-passkey-fixture.js";
import { verifyGeneratedPasskeys } from "../helpers/passkey-browser-driver.js";
import { resolveLocalPlaywrightInvocation } from "../helpers/generated-playwright-cli.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import { terminateProcessTree } from "../helpers/process-tree.js";
import { startIsolatedE2EPostgres } from "./e2e-postgres.js";

const REPO_ROOT = resolve(import.meta.dir, "../..");

function completion(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
}

async function bounded<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Passkey fixture operation timed out")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ensureChromium(): Promise<void> {
  if (existsSync(chromium.executablePath())) return;
  const invocation = resolveLocalPlaywrightInvocation(REPO_ROOT, ["install", "chromium"]);
  const child = spawn(invocation.command, invocation.args, {
    cwd: REPO_ROOT,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: "pipe",
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (value: Buffer) => {
      output = (output + value.toString()).slice(-32_000);
    });
  try {
    expect(await bounded(completion(child), 300_000), output).toBe(0);
    expect(existsSync(chromium.executablePath())).toBe(true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) await terminateProcessTree(child);
  }
}

function startFixture(root: string, environment: Readonly<Record<string, string>>) {
  const child = spawn(process.execPath, [join(root, "server.ts")], {
    cwd: root,
    env: {
      ...process.env,
      ...environment,
      NODE_ENV: "test",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    },
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: "pipe",
  });
  let output = "";
  const done = completion(child);
  const ready = new Promise<string>((resolveReady, reject) => {
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (value: Buffer) => {
        output = (output + value.toString()).slice(-32_000);
        const match = /PASSKEY_FIXTURE_READY (http:\/\/localhost:\d+)/.exec(output);
        if (match) resolveReady(match[1]!);
      });
    void done.then(
      (code) => reject(new Error(`Passkey fixture exited ${code}: ${output}`)),
      reject,
    );
  });
  return {
    child,
    done,
    ready: bounded(ready, 35_000),
    diagnostics: () => output.replace(/params:[\s\S]*/i, "params: [redacted]").slice(-8_000),
  };
}

function verifyTemporaryRoot(root: string): void {
  const within = relative(realpathSync.native(tmpdir()), resolve(root));
  if (
    !within ||
    within.startsWith("..") ||
    isAbsolute(within) ||
    !basename(root).startsWith("ghostinit-passkey-browser-")
  ) {
    throw new Error("Refusing cleanup outside the owned passkey fixture root");
  }
}

async function verifyVariant(browser: Browser, variant: RouterVariant): Promise<void> {
  const root = createTemporaryWorkspace("ghostinit-passkey-browser-");
  const postgres = await startIsolatedE2EPostgres();
  let running: ReturnType<typeof startFixture> | undefined;
  let origin: string | undefined;
  let preserveRoot = false;
  let operationError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    const sources = generateRouterSources(variant);
    const fixture = await compilePasskeyFixture(sources, variant);
    const transaction = new FsTransaction(root);
    await transaction.write("fixture.mjs", fixture.server);
    await transaction.write("client.js", fixture.browser);
    await transaction.write("server.ts", passkeyServerSource);
    await transaction.commit();
    running = startFixture(root, postgres.environment);
    origin = await running.ready;
    const requests = await verifyGeneratedPasskeys(browser, origin);
    console.log(
      `[passkey-browser] ${variant.mode}/${variant.framework}: ${requests} real auth requests, plan ${sources.planHash}`,
    );
  } catch (error) {
    operationError = new Error(
      `Generated passkey fixture failed: ${running?.diagnostics() ?? "before launch"}`,
      { cause: error },
    );
  } finally {
    if (running) {
      if (origin && running.child.exitCode === null && running.child.signalCode === null) {
        try {
          await fetch(`${origin}/__fixture__/close`, {
            method: "POST",
            signal: AbortSignal.timeout(2_000),
          });
          await bounded(running.done, 3_000);
        } catch {
          /* Fall through to verified process-tree termination. */
        }
      }
      if (running.child.exitCode === null && running.child.signalCode === null) {
        try {
          await terminateProcessTree(running.child);
        } catch (error) {
          preserveRoot = true;
          cleanupErrors.push(error);
        }
      }
    }
    try {
      await postgres.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (!preserveRoot) {
      try {
        verifyTemporaryRoot(root);
        await rm(root, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      operationError === undefined ? cleanupErrors : [operationError, ...cleanupErrors],
      "Passkey fixture cleanup was incomplete",
    );
  }
  if (operationError !== undefined) throw operationError;
}

describe("generated browser passkeys", () => {
  test("completes registration, authentication, listing, rename, and ownership-safe deletion", async () => {
    await ensureChromium();
    const browser = await chromium.launch({
      headless: true,
      executablePath: chromium.executablePath(),
    });
    try {
      console.log(
        `[passkey-browser] Chromium ${browser.version()}; runtime ${dirname(chromium.executablePath())}`,
      );
      for (const mode of ["monorepo", "single"] as const) {
        for (const framework of ["nextjs", "tanstack-start"] as const) {
          await verifyVariant(browser, { mode, framework, database: "postgres" });
        }
      }
    } finally {
      await browser.close();
    }
  }, 600_000);
});
