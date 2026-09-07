/**
 * Installed production-build acceptance — heavy, opt-in via E2E_BUILD=1.
 *
 * Each case uses the exact local CLI artifact, installs with the canonical Bun version, audits
 * the installed dependency graph, runs the generated static gates, builds production output, checks the architecture
 * envelope, starts that output, and probes its health endpoint. Cases stay
 * serial and their node_modules are removed before the next case starts.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cwd } from "node:process";
import { runtime } from "../../packages/versions/src/index.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import {
  assertLoopbackPortUnowned,
  parseArchitectureEnvelope,
  packagedDesktopLaunchCommand,
  rawWebSocketUpgradeStatus,
  reservePort,
  resolvePackagedDesktopExecutable,
  runCommand,
  scanPublicAssetsForCanary,
  spawnTracked,
  terminateProcessTree,
  terminateTrackedProcesses,
  waitForHealthyHttp,
  type CommandResult,
} from "./e2e-build-process.js";
import { configureNextLoopbackStart } from "./e2e-next-listener-binding.js";
import {
  captureNextCompilerConfig,
  expectNextCompilerConfigUnchanged,
  verifyNextDevelopmentConfig,
} from "./e2e-next-config-stability.js";
import { hasBroadWebSocketCspSource } from "./e2e-csp.js";
import { verifyNestedProductionApiRoutes } from "./e2e-api-route-dispatch.js";
import { verifyAuthenticatedPdfTemplates, verifyPdfNextPreload } from "./e2e-pdf-runtime.js";
import {
  startIsolatedE2EPostgres,
  startRejectingE2EPostgresAuthentication,
} from "./e2e-postgres.js";

interface ProductionProbeOptions {
  stockNextLoopback?: boolean;
  desktopMainEntry?: string;
  environmentOverrides?: Readonly<Record<string, string>>;
  isolatedPostgres?: boolean;
  messagingBoundary?: boolean;
  pdfTemplates?: boolean;
  productionCsp?: boolean;
  publicAssetRoots?: readonly string[];
  tanstackClientEntry?: string;
}

interface ProductionRuntime {
  environment: NodeJS.ProcessEnv;
  origin: string;
  port: number;
}

const REQUIRED_BUN_VERSION = runtime.bun;
const INSTALL_TIMEOUT_MS = 15 * 60_000;
const STATIC_GATE_TIMEOUT_MS = 10 * 60_000;
const BUILD_TIMEOUT_MS = 15 * 60_000;
const SERVER_READY_TIMEOUT_MS = 3 * 60_000;
const TEST_TIMEOUT_MS = 30 * 60_000;
const CLI = join(cwd(), "dist", "cli.js");
const BUN_EXECUTABLE = process.execPath;
const E2E_TEMP_ROOT = process.env.E2E_TMP?.trim() || tmpdir();
const KEEP_E2E_PROJECT = process.env.E2E_BUILD_KEEP === "1";
const E2E_BUILD_ENABLED = process.env.E2E_BUILD === "1";
const describeE2E = E2E_BUILD_ENABLED ? describe : describe.skip;
const SERVER_SECRET_CANARY = "ghostinit_server_only_canary_7c98f8f568854850b5f749b7c4c04557";
const DESKTOP_PACKAGED_API_URL = "https://desktop-api.example.test";
const DESKTOP_SERVER_ONLY_ENV_NAMES = [
  "AI_GATEWAY_API_KEY",
  "BETTER_AUTH_SECRET",
  "CHARGILY_API_KEY",
  "CHARGILY_SECRET_KEY",
  "CHARGILY_WEBHOOK_SECRET",
  "DATABASE_URL",
  "EVE_INTERNAL_AUTH_SECRET",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POSTHOG_API_KEY",
  "POSTGRES_PASSWORD",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;
const E2E_REDIS_ENVIRONMENT = {
  UPSTASH_REDIS_REST_URL: "https://ghostinit-cache.invalid",
  UPSTASH_REDIS_REST_TOKEN: "GHOSTINIT_E2E_NON_CREDENTIAL",
} as const;

function expectCommandOk(result: CommandResult, label: string): void {
  expect(result.timedOut, `${label} exceeded its timeout (${result.command})`).toBe(false);
  expect(
    result.error,
    `${label} failed to run: ${result.error?.message ?? "unknown error"}`,
  ).toBeUndefined();
  expect(
    result.exitCode,
    `${label} failed (${result.command}):\n${result.stdout.slice(-8_000)}\n${result.stderr.slice(-8_000)}`,
  ).toBe(0);
  expect(result.signal, `${label} was terminated by ${String(result.signal)}`).toBeNull();
}

describeE2E("e2e: installed production builds (E2E_BUILD=1 opt-in)", () => {
  let tempRoot = "";

  beforeAll(() => {
    expect(Bun.version).toBe(REQUIRED_BUN_VERSION);
    expect(existsSync(CLI), `Build the local CLI before running E2E: ${CLI}`).toBe(true);
    expect(existsSync(E2E_TEMP_ROOT), `E2E temp root does not exist: ${E2E_TEMP_ROOT}`).toBe(true);
  });

  beforeEach(() => {
    tempRoot = createTemporaryWorkspace("gi-e2e-build-", E2E_TEMP_ROOT);
  });

  afterEach(async () => {
    await terminateTrackedProcesses();
    if (tempRoot && KEEP_E2E_PROJECT) {
      process.stderr.write(`Retained E2E project root: ${tempRoot}\n`);
    } else if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  });

  async function expectArchitectureCheck(projectRoot: string): Promise<void> {
    const result = await runCommand(
      BUN_EXECUTABLE,
      [CLI, "check", "--cwd", projectRoot, "--json"],
      projectRoot,
      120_000,
    );
    expectCommandOk(result, "local CLI architecture check");

    const payload = parseArchitectureEnvelope(result.stdout.trim());
    expect(payload).toMatchObject({
      $schema: "https://ghostinit.dev/schemas/json-envelope.schema.json",
      schemaVersion: 2,
      success: true,
      exitCode: 0,
      meta: { command: "check" },
    });
    expect(typeof payload.meta?.durationMs).toBe("number");
    expect(Array.isArray(payload.data?.findings)).toBe(true);
    expect(payload.data?.summary).toMatchObject({ blockers: 0, highs: 0 });
    const blocking = (payload.data?.findings ?? []).filter(
      ({ severity }) => severity === "HIGH" || severity === "BLOCKER",
    );
    expect(
      blocking,
      `blocking architecture findings: ${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);
  }

  async function createProject(name: string, extraArgs: string[] = []): Promise<string> {
    const result = await runCommand(
      BUN_EXECUTABLE,
      [
        CLI,
        "create",
        name,
        "--cwd",
        tempRoot,
        "--yes",
        "--no-install",
        "--force",
        "--runtime",
        "bun",
        "--json",
        ...extraArgs,
      ],
      tempRoot,
      120_000,
    );
    expectCommandOk(result, `create ${name}`);

    const projectRoot = join(tempRoot, name);
    expect(existsSync(join(projectRoot, "package.json"))).toBe(true);
    return projectRoot;
  }

  async function probeProductionOutput(
    projectRoot: string,
    label: string,
    production: ProductionRuntime,
    options: ProductionProbeOptions = {},
  ): Promise<void> {
    await assertLoopbackPortUnowned(production.port);
    const running = spawnTracked(
      BUN_EXECUTABLE,
      ["run", "start"],
      projectRoot,
      production.environment,
    );
    try {
      const firstHealth = await waitForHealthyHttp(
        running,
        `${production.origin}/api/health`,
        SERVER_READY_TIMEOUT_MS,
      );
      const health = firstHealth.response;
      expect(health.status, `${label}: health status`).toBe(200);
      if (options.productionCsp) {
        const csp = health.headers.get("content-security-policy");
        expect(csp, `${label}: production CSP header`).toContain(
          "script-src 'self' 'unsafe-inline'",
        );
        expect(csp, `${label}: production CSP must not allow eval`).not.toContain("'unsafe-eval'");
        expect(
          hasBroadWebSocketCspSource(csp ?? ""),
          `${label}: production CSP must not allow broad dev sockets`,
        ).toBe(false);
        expect(csp, `${label}: production CSP disables plugins`).toContain("object-src 'none'");
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const stableHealth = await waitForHealthyHttp(
        running,
        `${production.origin}/api/health?ghostinit_stability=${Date.now()}`,
        10_000,
      );
      expect(
        Date.parse(stableHealth.payload.time),
        `${label}: health route returned a stale or cached stability payload`,
      ).toBeGreaterThan(Date.parse(firstHealth.payload.time));
      for (const path of ["/", "/sign-in"]) {
        const page = await fetch(`${production.origin}${path}`, {
          signal: AbortSignal.timeout(30_000),
        });
        expect(page.status, `${label}: ${path} renders successfully`).toBe(200);
        expect(page.headers.get("content-type"), `${label}: ${path} is an HTML page`).toContain(
          "text/html",
        );
        const html = await page.text();
        expect(html, `${label}: ${path} includes a document`).toMatch(/<html[\s>]/i);
        expect(html, `${label}: ${path} includes a body`).toMatch(/<body[\s>]/i);
      }
      await verifyNestedProductionApiRoutes(production.origin);
      if (options.pdfTemplates) {
        await verifyAuthenticatedPdfTemplates(
          production.origin,
          production.environment,
          options.messagingBoundary
            ? async (cookie) => {
                expect(
                  await rawWebSocketUpgradeStatus(production.port, "/api/ws", production.origin, {
                    Cookie: cookie,
                  }),
                  "Authenticated application WebSockets survive asynchronous session validation",
                ).toBe(101);
              }
            : undefined,
        );
      }
      if (options.messagingBoundary) {
        expect(await rawWebSocketUpgradeStatus(production.port, "/api/ws", production.origin)).toBe(
          401,
        );
        const removedHttpRoute = await fetch(`${production.origin}/api/realtime`, {
          signal: AbortSignal.timeout(5_000),
        });
        expect(removedHttpRoute.status).toBe(404);
        await removedHttpRoute.body?.cancel();
        const removedRoute = await rawWebSocketUpgradeStatus(
          production.port,
          "/api/realtime",
          production.origin,
        );
        expect(removedRoute).not.toBe(101);
      }
    } finally {
      await terminateProcessTree(running.child);
    }
  }

  async function reserveProductionRuntime(
    options: ProductionProbeOptions,
  ): Promise<ProductionRuntime> {
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.environmentOverrides,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      PORT: String(port),
      BETTER_AUTH_URL: origin,
      NEXT_PUBLIC_APP_URL: origin,
      VITE_APP_URL: origin,
      CONVEX_URL: "https://example.convex.cloud",
      NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
      VITE_CONVEX_URL: "https://example.convex.cloud",
      BETTER_AUTH_SECRET: SERVER_SECRET_CANARY,
      ...(options.desktopMainEntry ? { DESKTOP_API_URL: DESKTOP_PACKAGED_API_URL } : {}),
    };
    return { environment, origin, port };
  }

  async function pushGeneratedPostgresSchema(
    projectRoot: string,
    label: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> {
    const databaseWorkspace = existsSync(join(projectRoot, "packages", "database", "package.json"))
      ? "packages/database"
      : ".";
    const args =
      databaseWorkspace === "."
        ? ["run", "db:push"]
        : ["run", "--cwd", databaseWorkspace, "db:push"];
    const push = await runCommand(
      BUN_EXECUTABLE,
      args,
      projectRoot,
      STATIC_GATE_TIMEOUT_MS,
      environment,
    );
    expectCommandOk(push, `${label}: isolated PostgreSQL schema push`);
  }

  async function expectPostgresAuthenticationFailureIsFatal(
    projectRoot: string,
    label: string,
    production: ProductionRuntime,
  ): Promise<void> {
    const rejectingPostgres = await startRejectingE2EPostgresAuthentication();
    try {
      const rejected = await runCommand(BUN_EXECUTABLE, ["run", "start"], projectRoot, 60_000, {
        ...production.environment,
        ...rejectingPostgres.environment,
      });
      expect(
        rejected.timedOut,
        `${label}: invalid PostgreSQL auth must not be retried forever`,
      ).toBe(false);
      expect(
        rejected.error,
        `${label}: invalid PostgreSQL auth probe failed to launch`,
      ).toBeUndefined();
      expect(rejected.exitCode, `${label}: invalid PostgreSQL auth must fail production`).toBe(1);
      const output = `${rejected.stdout}\n${rejected.stderr}`;
      expect(output, `${label}: PostgreSQL did not preserve SQLSTATE 28P01`).toContain("28P01");
      expect(output).toMatch(/\[jobs\] (?:worker|scheduler) stopped unexpectedly/);
      expect(output).toContain('error: script "start:production" exited with code 1');
    } finally {
      await rejectingPostgres.close();
    }
  }

  async function installAndVerify(
    projectRoot: string,
    label: string,
    options: ProductionProbeOptions = {},
  ): Promise<void> {
    // Next's stock CLI accepts its bind address only through --hostname. Configure
    // that supported flag before audited bootstrap/build; root start and all
    // Eve/jobs supervision remain the generated production lifecycle.
    if (options.stockNextLoopback) await configureNextLoopbackStart(projectRoot);
    const install = await runCommand(
      BUN_EXECUTABLE,
      ["run", "install:bootstrap"],
      projectRoot,
      INSTALL_TIMEOUT_MS,
    );
    expectCommandOk(install, `${label}: verified dependency bootstrap`);

    // Normal GhostInit installation formats before verification. This manual
    // --no-install lifecycle mirrors that ordering before checking idempotence.
    const formatWrite = await runCommand(
      BUN_EXECUTABLE,
      ["run", "format"],
      projectRoot,
      STATIC_GATE_TIMEOUT_MS,
    );
    expectCommandOk(formatWrite, `${label}: format`);

    const format = await runCommand(
      BUN_EXECUTABLE,
      ["run", "format:check"],
      projectRoot,
      STATIC_GATE_TIMEOUT_MS,
    );
    expectCommandOk(format, `${label}: format:check`);
    const nextCompilerConfig = captureNextCompilerConfig(projectRoot);

    // Keep this as an explicit lifecycle stage even though lint:all also
    // includes typecheck. The first run gives generated TypeScript failures a
    // dedicated diagnostic boundary; Turbo and incremental tsc make the
    // fail-closed repetition inside lint:all a cache hit rather than a full
    // second compilation.
    const typecheck = await runCommand(
      BUN_EXECUTABLE,
      ["run", "typecheck"],
      projectRoot,
      STATIC_GATE_TIMEOUT_MS,
    );
    expectCommandOk(typecheck, `${label}: typecheck`);

    const lintAll = await runCommand(
      BUN_EXECUTABLE,
      ["run", "lint:all"],
      projectRoot,
      STATIC_GATE_TIMEOUT_MS,
    );
    expectCommandOk(lintAll, `${label}: lint:all`);
    if (options.pdfTemplates) await verifyPdfNextPreload(projectRoot);

    const isolatedPostgres = options.isolatedPostgres
      ? await startIsolatedE2EPostgres()
      : undefined;
    try {
      const productionOptions = isolatedPostgres
        ? {
            ...options,
            environmentOverrides: {
              ...options.environmentOverrides,
              ...isolatedPostgres.environment,
            },
          }
        : options;
      // The exact same cache-relevant environment is used for the accepted build
      // and the process that serves it. The generated root start script directly
      // owns the backend host, so startup cannot rebuild or fan out through Turbo.
      const production = await reserveProductionRuntime(productionOptions);
      if (isolatedPostgres) {
        await pushGeneratedPostgresSchema(projectRoot, label, production.environment);
      }
      await verifyNextDevelopmentConfig(nextCompilerConfig, production.environment);
      const build = await runCommand(
        BUN_EXECUTABLE,
        ["run", "build"],
        projectRoot,
        BUILD_TIMEOUT_MS,
        production.environment,
      );
      expectCommandOk(build, `${label}: production build`);
      expectNextCompilerConfigUnchanged(nextCompilerConfig, "Next production build");
      expect(`${build.stdout}\n${build.stderr}`).not.toContain(
        "Dynamic filesystem access causes tracing of the whole project",
      );

      const publicAssetRoots = options.publicAssetRoots ?? [];
      const canaryScan = scanPublicAssetsForCanary(
        projectRoot,
        publicAssetRoots,
        SERVER_SECRET_CANARY,
      );
      expect(
        canaryScan.missingRoots,
        `${label}: expected public build artifacts were not emitted`,
      ).toEqual([]);
      expect(
        canaryScan.presentRoots.length,
        `${label}: no public build artifacts were scanned`,
      ).toBe(publicAssetRoots.length);
      expect(
        canaryScan.leakedFiles,
        `${label}: a server-only canary reached deployable client assets`,
      ).toEqual([]);

      if (options.desktopMainEntry) {
        const desktopMainPath = join(projectRoot, options.desktopMainEntry);
        expect(existsSync(desktopMainPath), `${label}: desktop main artifact was not emitted`).toBe(
          true,
        );
        const desktopMain = readFileSync(desktopMainPath, "utf8");
        expect(desktopMain).not.toContain(SERVER_SECRET_CANARY);
        expect(
          desktopMain,
          `${label}: desktop main retained a workspace runtime import`,
        ).not.toContain("@repo/");
        expect(desktopMain).toContain("--ghostinit-startup-smoke");
        expect(desktopMain).toContain("app.exit(0)");
        expect(desktopMain, `${label}: validated packaged API fallback was not embedded`).toContain(
          DESKTOP_PACKAGED_API_URL,
        );
        for (const serverOnlyName of DESKTOP_SERVER_ONLY_ENV_NAMES) {
          expect(
            desktopMain,
            `${label}: ${serverOnlyName} reached the desktop main bundle`,
          ).not.toContain(serverOnlyName);
        }

        const desktopEnvironment: NodeJS.ProcessEnv = { ...process.env };
        delete desktopEnvironment.DESKTOP_API_URL;
        for (const serverOnlyName of DESKTOP_SERVER_ONLY_ENV_NAMES) {
          delete desktopEnvironment[serverOnlyName];
        }
        delete desktopEnvironment.ELECTRON_IS_DEV;
        delete desktopEnvironment.ELECTRON_RENDERER_URL;
        delete desktopEnvironment.ELECTRON_RUN_AS_NODE;
        const desktopRoot = dirname(dirname(desktopMainPath));
        const rootManifest = JSON.parse(
          readFileSync(join(projectRoot, "package.json"), "utf8"),
        ) as {
          name?: unknown;
        };
        if (typeof rootManifest.name !== "string") {
          throw new Error(`${label}: generated root package has no product name`);
        }
        const desktopExecutable = resolvePackagedDesktopExecutable(desktopRoot, rootManifest.name);
        const desktopLaunch = packagedDesktopLaunchCommand(
          desktopExecutable,
          join(tempRoot, "electron-user-data"),
        );
        const launch = await runCommand(
          desktopLaunch.command,
          desktopLaunch.args,
          dirname(desktopExecutable),
          60_000,
          desktopEnvironment,
        );
        expectCommandOk(launch, `${label}: no-env packaged desktop main launch`);
      }

      await expectArchitectureCheck(projectRoot);
      await probeProductionOutput(projectRoot, label, production, options);
      expectNextCompilerConfigUnchanged(nextCompilerConfig, "Next production start");
      if (isolatedPostgres) {
        await expectPostgresAuthenticationFailureIsFatal(projectRoot, label, production);
      }

      // Run the destructive negative proof last. A rejected build may leave
      // framework caches or output incomplete, so the accepted artifact is built,
      // scanned, checked, served, and stopped before this source canary is injected.
      if (options.tanstackClientEntry) {
        const clientEntry = join(projectRoot, options.tanstackClientEntry);
        const original = readFileSync(clientEntry, "utf8");
        try {
          writeFileSync(clientEntry, `import "server-only";\n${original}`);
          const rejectedBuild = await runCommand(
            BUN_EXECUTABLE,
            ["run", "build"],
            projectRoot,
            BUILD_TIMEOUT_MS,
            production.environment,
          );
          expect(rejectedBuild.timedOut).toBe(false);
          expect(rejectedBuild.error).toBeUndefined();
          expect(rejectedBuild.exitCode).not.toBe(0);
          const rejectedOutput = `${rejectedBuild.stdout}\n${rejectedBuild.stderr}`;
          const expectedImporter = options.tanstackClientEntry
            .replaceAll("\\", "/")
            .replace(/^apps\/web\//, "");
          expect(rejectedOutput).toContain("Import denied in client environment");
          expect(rejectedOutput).toContain("Denied by marker");
          expect(rejectedOutput.replaceAll("\\", "/")).toContain(expectedImporter);
        } finally {
          writeFileSync(clientEntry, original);
        }
      }
    } finally {
      await isolatedPostgres?.close();
    }
  }

  it(
    "builds and starts the default generated project",
    async () => {
      expect(E2E_BUILD_ENABLED).toBe(true);
      const projectRoot = await createProject("smoke");
      await installAndVerify(projectRoot, "default", {
        stockNextLoopback: true,
        productionCsp: true,
        publicAssetRoots: ["apps/web/.next/static"],
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "builds and starts billing=all with Eve",
    async () => {
      expect(E2E_BUILD_ENABLED).toBe(true);
      const projectRoot = await createProject("billall", ["--billing", "all", "--with-eve"]);
      await installAndVerify(projectRoot, "billing-all", {
        stockNextLoopback: true,
        productionCsp: true,
        publicAssetRoots: ["apps/web/.next/static"],
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "builds and starts single TanStack Postgres messaging",
    async () => {
      expect(E2E_BUILD_ENABLED).toBe(true);
      const projectRoot = await createProject("tanstack-messaging", [
        "--mode",
        "single",
        "--framework",
        "tanstack-start",
        "--database",
        "postgres",
        "--billing",
        "none",
        "--with-messaging",
      ]);
      await installAndVerify(projectRoot, "single-tanstack-messaging", {
        messagingBoundary: true,
        productionCsp: true,
        publicAssetRoots: [".output/public"],
        tanstackClientEntry: "src/router.tsx",
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "builds and starts TanStack with Convex",
    async () => {
      expect(E2E_BUILD_ENABLED).toBe(true);
      const projectRoot = await createProject("tanstack-convex", [
        "--framework",
        "tanstack-start",
        "--database",
        "convex",
        "--billing",
        "none",
      ]);
      await installAndVerify(projectRoot, "tanstack-convex", {
        productionCsp: true,
        publicAssetRoots: ["apps/web/.output/public"],
        tanstackClientEntry: "apps/web/src/router.tsx",
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "builds and starts single Next with Eve, messaging and server capabilities",
    async () => {
      expect(E2E_BUILD_ENABLED).toBe(true);
      const projectRoot = await createProject("custom-heavy", [
        "--mode",
        "single",
        "--preset",
        "custom",
        "--database",
        "postgres",
        "--billing",
        "stripe,chargily",
        "--with-auth",
        "--with-api",
        "--with-email",
        "--with-analytics",
        "--with-eve",
        "--with-i18n",
        "--with-pdf",
        "--with-messaging",
        "--with-storage",
        "--with-notifications",
        "--feature-flags",
        "posthog",
        "--with-jobs",
        "--cache",
        "redis",
      ]);
      await installAndVerify(projectRoot, "custom-capability-heavy", {
        messagingBoundary: true,
        pdfTemplates: true,
        environmentOverrides: E2E_REDIS_ENVIRONMENT,
        isolatedPostgres: true,
        productionCsp: true,
        publicAssetRoots: [".next/static"],
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "builds web, Expo, and Electron client artifacts without server secrets",
    async () => {
      expect(E2E_BUILD_ENABLED).toBe(true);
      const projectRoot = await createProject("multi-app", [
        "--apps",
        "web,mobile,desktop",
        "--database",
        "postgres",
        "--billing",
        "none",
      ]);
      await installAndVerify(projectRoot, "multi-app", {
        stockNextLoopback: true,
        desktopMainEntry: "apps/desktop/dist/main.js",
        productionCsp: true,
        publicAssetRoots: [
          "apps/web/.next/static",
          "apps/mobile/dist",
          "apps/desktop/dist/renderer",
        ],
      });
    },
    TEST_TIMEOUT_MS,
  );
});
