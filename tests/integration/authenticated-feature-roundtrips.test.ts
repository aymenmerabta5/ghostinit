import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FsTransaction } from "../../src/lib/fs.js";
import {
  compileGeneratedRouter,
  fixtureEnvironmentSource,
  generateRouterSources,
  ROUTER_FIXTURE_NOTIFICATION_KEY,
  type RouterVariant,
} from "../helpers/generated-router-fixture.js";
import {
  authenticatedRoundtripDriver,
  postgresRoundtripEntry,
} from "../helpers/authenticated-roundtrip-runner.js";
import { startIsolatedE2EPostgres } from "./e2e-postgres.js";
import { ProcessTreeTerminationError, terminateProcessTree } from "../helpers/process-tree.js";
import { convexRoundtripFixture } from "../helpers/convex-router-runtime.js";
import { spawn } from "node:child_process";

const requireHost = createRequire(import.meta.url);

async function runFixture(root: string, environment: Readonly<Record<string, string>>) {
  const child = spawn(process.execPath, ["test", "roundtrip.test.ts", "--timeout", "70000"], {
    cwd: root,
    env: {
      ...process.env,
      ...environment,
      NODE_ENV: "test",
      BETTER_AUTH_URL: "http://localhost:3000",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      NOTIFICATION_TOKEN_ENCRYPTION_KEY: ROUTER_FIXTURE_NOTIFICATION_KEY,
    },
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (value: Buffer) => (output += value.toString()));
  child.stderr.on("data", (value: Buffer) => (output += value.toString()));
  const completion = new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const code = await Promise.race([
      completion,
      new Promise<"timeout">((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout("timeout"), 75_000);
      }),
    ]);
    if (code === "timeout") throw new Error("Generated authenticated roundtrip timed out");
    expect(code, output.slice(-16_000)).toBe(0);
    expect(output).toContain("AUTHENTICATED_COMPOSITION_PASS");
    const requests = Number(/AUTHENTICATED_COMPOSITION_PASS (\d+)/.exec(output)?.[1]);
    expect(requests).toBeGreaterThanOrEqual(20);
    return requests;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) await terminateProcessTree(child);
  }
}

function verifyTempRoot(root: string): void {
  const path = resolve(root);
  const inside = relative(resolve(tmpdir()), path);
  if (
    !inside ||
    inside.startsWith("..") ||
    isAbsolute(inside) ||
    !basename(path).startsWith("ghostinit-auth-roundtrip-")
  ) {
    throw new Error("Refusing to remove unverified authenticated fixture root");
  }
}

async function verifyVariant(variant: RouterVariant): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ghostinit-auth-roundtrip-"));
  const postgres = variant.database === "postgres" ? await startIsolatedE2EPostgres() : null;
  let preserveRoot = false;
  try {
    const sources = generateRouterSources(variant);
    const fixture =
      variant.database === "convex"
        ? convexRoundtripFixture(sources, variant)
        : {
            entry: postgresRoundtripEntry(sources, variant),
            overrides: { "__fixture__/environment.ts": fixtureEnvironmentSource() },
            aliases: {
              "@repo/config/server": "__fixture__/environment.ts",
              "@/lib/env/server": "__fixture__/environment.ts",
            },
          };
    const bundle = await compileGeneratedRouter(
      sources,
      fixture.entry,
      fixture.overrides,
      fixture.aliases,
    );
    const driver = authenticatedRoundtripDriver
      .replace(
        '"@orpc/client"',
        JSON.stringify(pathToFileURL(requireHost.resolve("@orpc/client")).href),
      )
      .replace(
        '"@orpc/client/fetch"',
        JSON.stringify(pathToFileURL(requireHost.resolve("@orpc/client/fetch")).href),
      );
    const transaction = new FsTransaction(root);
    await transaction.write("fixture.mjs", bundle);
    await transaction.write("roundtrip.test.ts", driver);
    await transaction.commit();
    const requests = await runFixture(root, postgres?.environment ?? {});
    console.log(
      `[authenticated-roundtrip] ${variant.mode}/${variant.framework}/${variant.database}: ${requests} HTTP requests, plan ${sources.planHash}`,
    );
  } catch (error) {
    preserveRoot = error instanceof ProcessTreeTerminationError;
    throw error;
  } finally {
    await postgres?.close();
    if (!preserveRoot) {
      verifyTempRoot(root);
      await rm(root, { recursive: true, force: true });
    }
  }
}

describe("authenticated generated feature roundtrips", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} executes the generated composition`, async () => {
          await verifyVariant({ mode, framework, database });
        }, 90_000);
      }
    }
  }
});
