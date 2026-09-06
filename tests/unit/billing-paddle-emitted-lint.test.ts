import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { paddleCheckoutControllerContent } from "../../src/templates/billing/ui/paddle-checkout-client.js";
import { paddleCheckoutTypesContent } from "../../src/templates/billing/ui/paddle-checkout-server.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { lintScriptFiles } from "../../src/templates/tooling/lint-scripts.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const repository = resolve(import.meta.dir, "../..");
const fixturePrefix = "ghostinit-paddle-emitted-lint-";
const temporary: string[] = [];
const scriptPaths = new Set(["scripts/check-server-only.cjs", "scripts/lib/oxc.cjs"]);

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    if (
      dirname(directory) !== realpathSync.native(tmpdir()) ||
      !basename(directory).startsWith(fixturePrefix)
    )
      throw new Error("Unsafe emitted-lint fixture cleanup");
    rmSync(directory, { recursive: true, force: true });
  }
});

async function fixture(files: Record<string, string>): Promise<string> {
  const directory = createTemporaryWorkspace(fixturePrefix);
  temporary.push(directory);
  const transaction = new FsTransaction(directory);
  for (const script of lintScriptFiles()) {
    if (scriptPaths.has(script.path)) await transaction.write(script.path, script.content);
  }
  for (const [path, content] of Object.entries(files)) await transaction.write(path, content);
  await transaction.commit();
  return directory;
}

function checkWithBothRuntimes(directory: string, exitCode: number, reason?: string): void {
  for (const runtime of ["bun", "node"] as const) {
    const executable = runtime === "bun" ? process.execPath : Bun.which("node");
    if (!executable) throw new Error(`${runtime} is required for emitted-linter verification`);
    const result = spawnSync(executable, [resolve(directory, "scripts/check-server-only.cjs")], {
      cwd: directory,
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, NODE_PATH: resolve(repository, "node_modules") },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ?? ""}`;
    expect(result.status, `${runtime}: ${output}`).toBe(exitCode);
    expect(output).toContain(
      exitCode === 0
        ? "Server-only runtime boundary check passed"
        : "Client-reachable server runtime",
    );
    if (reason) expect(output).toContain(reason);
  }
}

function browserGraph(base: string): Record<string, string> {
  return {
    [`${base}src/contracts/billing.ts`]: paddleCheckoutTypesContent,
    [`${base}src/adapters/billing/paddle.ts`]: paddleCheckoutControllerContent,
    [`${base}src/features/billing/paddle-checkout.ts`]:
      '"use client"; import { startPaddleCheckout } from "@/adapters/billing/paddle"; export const openCheckout = startPaddleCheckout;',
  };
}

describe("Paddle browser boundary in the actual emitted CJS checker", () => {
  for (const mode of ["single", "monorepo"] as const) {
    const base = mode === "monorepo" ? "apps/web/" : "";

    test(`${mode}: the emitted controller and neutral contracts remain client-safe`, async () => {
      checkWithBothRuntimes(await fixture(browserGraph(base)), 0);
    });

    for (const [name, file, source, reason] of [
      [
        "direct feature SDK import",
        "src/features/billing/direct-sdk.ts",
        '"use client"; import { initializePaddle } from "@paddle/paddle-js"; export const unsafe = initializePaddle;',
        'imports server runtime "@paddle/paddle-js"',
      ],
      [
        "direct feature dynamic SDK import",
        "src/features/billing/direct-sdk.ts",
        '"use client"; export const unsafe = import("@paddle/paddle-js");',
        'imports server runtime "@paddle/paddle-js"',
      ],
      [
        "direct feature SDK re-export",
        "src/features/billing/direct-sdk.ts",
        '"use client"; export { initializePaddle } from "@paddle/paddle-js";',
        'imports server runtime "@paddle/paddle-js"',
      ],
      [
        "similar adapter path",
        "src/adapters/billing/paddle-extra.ts",
        '"use client"; import { initializePaddle } from "@paddle/paddle-js"; export const unsafe = initializePaddle;',
        'imports server runtime "@paddle/paddle-js"',
      ],
      [
        "nested adapter path",
        "src/adapters/billing/nested/paddle.ts",
        '"use client"; import { initializePaddle } from "@paddle/paddle-js"; export const unsafe = initializePaddle;',
        'imports server runtime "@paddle/paddle-js"',
      ],
      [
        "browser SDK subpath",
        "src/adapters/billing/paddle.ts",
        '"use client"; import { initializePaddle } from "@paddle/paddle-js/dist/paddle"; export const unsafe = initializePaddle;',
        'imports server runtime "@paddle/paddle-js/dist/paddle"',
      ],
      [
        "Paddle Node SDK at the browser adapter",
        "src/adapters/billing/paddle.ts",
        '"use client"; import { Paddle } from "@paddle/paddle-node-sdk"; export const unsafe = Paddle;',
        'imports server runtime "@paddle/paddle-node-sdk"',
      ],
      [
        "Node runtime at the browser adapter",
        "src/adapters/billing/paddle.ts",
        `${paddleCheckoutControllerContent}\nimport { readFile } from "node:fs/promises"; export const unsafe = readFile;`,
        'imports server runtime "node:fs/promises"',
      ],
      [
        "server-only marker at the browser adapter",
        "src/adapters/billing/paddle.ts",
        `${paddleCheckoutControllerContent}\nimport "server-only";`,
        'imports server runtime "server-only"',
      ],
      [
        "private environment at the browser adapter",
        "src/adapters/billing/paddle.ts",
        `${paddleCheckoutControllerContent}\nexport const unsafe = process.env.PADDLE_API_KEY;`,
        'accesses server environment key "PADDLE_API_KEY"',
      ],
    ] as const) {
      test(`${mode}: rejects ${name}`, async () => {
        const files = browserGraph(base);
        files[`${base}${file}`] = source;
        checkWithBothRuntimes(await fixture(files), 1, reason);
      });
    }

    for (const importer of [
      "adapters/billing/paddle",
      "features/billing/paddle-checkout",
    ] as const) {
      test(`${mode}: ${importer} cannot reach an owned server-only helper`, async () => {
        const files = browserGraph(base);
        files[`${base}src/server/billing/private.ts`] =
          'import "server-only"; export const privateConfig = "server-owned";';
        files[`${base}src/${importer}.ts`] +=
          '\nimport { privateConfig } from "@/server/billing/private"; export const unsafe = privateConfig;';
        checkWithBothRuntimes(
          await fixture(files),
          1,
          `${base}src/${importer}.ts -> ${base}src/server/billing/private.ts`,
        );
      });
    }

    for (const [kind, reference] of [
      ["dynamic import", 'export const unsafe = import("@/server/billing/private");'],
      ["re-export", 'export { privateConfig } from "@/server/billing/private";'],
    ] as const) {
      test(`${mode}: client to barrel to adapter preserves ${kind} server taint`, async () => {
        const files = browserGraph(base);
        files[`${base}src/server/billing/private.ts`] =
          'import "server-only"; export const privateConfig = "server-owned";';
        files[`${base}src/adapters/billing/paddle.ts`] += `\n${reference}`;
        files[`${base}src/lib/paddle-bridge.ts`] =
          'export { startPaddleCheckout } from "@/adapters/billing/paddle";';
        files[`${base}src/features/billing/paddle-checkout.ts`] =
          '"use client"; export { startPaddleCheckout } from "@/lib/paddle-bridge";';
        checkWithBothRuntimes(
          await fixture(files),
          1,
          [
            `${base}src/features/billing/paddle-checkout.ts`,
            `${base}src/lib/paddle-bridge.ts`,
            `${base}src/adapters/billing/paddle.ts`,
            `${base}src/server/billing/private.ts`,
          ].join(" -> "),
        );
      });
    }

    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework}: the full Paddle Worker tree passes its emitted checker`, async () => {
        const resolution = resolveCreateConfig({
          name: "paddle-emitted-lint",
          runtime: "bun",
          mode,
          framework,
          database: "convex",
          databaseWasExplicit: true,
          preset: "saas",
          billing: ["paddle"],
          apps: ["web"],
          features: [],
          cache: "none",
          deploy: "cloudflare",
        });
        if (!resolution.ok) throw new Error(resolution.message);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
          desiredConfig: resolution.desiredConfig,
        });
        const files = Object.fromEntries(
          plan.files.map((file) => [file.physicalPath, file.content]),
        );
        checkWithBothRuntimes(await fixture(files), 0);
      });
    }
  }
});
