// @allow-long 2100: installed generation, process supervision, native artifacts, and Worker runtime evidence form one release gate
/**
 * Generate real projects, install and audit them, normalize and verify formatting, then
 * run architecture, typecheck, lint, the generated root test script,
 * portable-auth checks, and applicable deployment acceptance.
 *
 * This is the gate that the unit suite structurally cannot be. Templates are
 * assembled as string arrays, so `bun run check` on the host never sees the
 * OUTPUT: the host build stayed green while generated projects failed to
 * install, typecheck, lint, or satisfy the packaged architecture checker.
 *
 * The generated projects intentionally do not depend on an unpublished
 * `ghostinit` package. Before publication this runner always invokes the exact
 * host artifact at `dist/cli.js`; it never falls back to bunx or the network.
 *
 *   bun run test:generated              # default corners (see DEFAULT_CORNERS)
 *   bun run test:generated -- --all     # every corner
 *   bun run test:generated -- --workers # Cloudflare Worker release corners
 *   bun run test:generated -- --only next-monorepo,single-next
 *   bun run test:generated -- --keep    # leave the temp projects on disk
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createConnection, createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { runtime } from "../packages/versions/src/index.js";
import { runSupervisedCommand } from "../src/commands/create/installer.js";
import {
  assertProcessTreeExited,
  captureWindowsProcessTree,
  terminateProcessTree,
  type WindowsProcessRecord,
} from "../tests/helpers/process-tree.js";
import { createTemporaryWorkspace } from "../tests/helpers/temporary-workspace.js";
import { stageWorkerBindingFiles } from "../tests/helpers/worker-binding-files.js";
import { WorkerPreviewReadiness } from "./worker-preview-readiness.js";
import {
  isPublicPosthogProjectToken,
  selectedPosthogPublicKeys,
} from "../src/lib/posthog-key-policy.js";

type ProjectCheck =
  | "format"
  | "format:check"
  | "typecheck"
  | "lint:all"
  | "test"
  | "auth-declarations"
  | "native-contract"
  | `worker-${"build" | "secret-scan" | "dry-run" | "runtime" | "environment"}`
  | `native-${"typecheck" | "lint" | "test"}`;
type Step = "generate" | "architecture" | "install" | ProjectCheck;

interface WorkerRuntimeProbe {
  method: "POST";
  path: string;
  status: number;
  body: string;
  headers: Readonly<Record<string, string>>;
}

interface Corner {
  id: string;
  args: string[];
  note?: string;
  /** Package roots whose native type/lint/test scripts are blocking evidence. */
  nativePackageRoots?: readonly string[];
  /** Release-blocking deployment evidence for generated Cloudflare Workers. */
  worker?: {
    appRoot: "." | "apps/web";
    appPublicEnvKey: "NEXT_PUBLIC_APP_URL" | "VITE_APP_URL";
    artifactRoot: ".wrangler/ghostinit-dry-run";
    previewHostFlag: "--host" | "--ip";
    convexPublicEnvKey?: "NEXT_PUBLIC_CONVEX_URL" | "VITE_CONVEX_URL";
    deployableAssetRoots: readonly string[];
    expectedCspSources?: readonly string[];
    nativeApps?: readonly ("desktop" | "mobile")[];
    nativeArtifactRoots?: readonly string[];
    nativeArtifactFiles?: readonly string[];
    nativeWebsocket?: boolean;
    runtimeProbes?: readonly WorkerRuntimeProbe[];
    smokePaths?: readonly string[];
  };
}

const WORKER_SECURITY_RESPONSE_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export const CONVEX_WORKER_RUNTIME_PROBES = [
  {
    method: "POST",
    path: "/api/webhooks/stripe",
    status: 400,
    body: "STRIPE_SECRET_KEY is not configured",
    headers: WORKER_SECURITY_RESPONSE_HEADERS,
  },
  {
    method: "POST",
    path: "/api/webhooks/chargily",
    status: 400,
    body: "Missing signature header",
    headers: WORKER_SECURITY_RESPONSE_HEADERS,
  },
  {
    method: "POST",
    path: "/api/webhooks/paddle",
    status: 400,
    body: "Missing paddle-signature header",
    headers: WORKER_SECURITY_RESPONSE_HEADERS,
  },
  {
    method: "POST",
    path: "/api/webhooks/polar",
    status: 400,
    body: "POLAR_WEBHOOK_SECRET not configured",
    headers: WORKER_SECURITY_RESPONSE_HEADERS,
  },
  {
    method: "POST",
    path: "/api/auth/admin/list-users",
    status: 404,
    body: "Not found",
    headers: {
      ...WORKER_SECURITY_RESPONSE_HEADERS,
      "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
    },
  },
] as const satisfies readonly WorkerRuntimeProbe[];

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  cleanupVerified: boolean;
}

interface RunOptions {
  env?: NodeJS.ProcessEnv;
  /** Values removed before any captured command output can be displayed. */
  redact?: readonly string[];
  /** @internal Keeps actual timeout regressions bounded without changing the release limit. */
  timeoutMs?: number;
}

interface WorkerCheck {
  ok: boolean;
  detail: string;
  cleanupVerified: boolean;
}

const REQUIRED_BUN_VERSION = runtime.bun;
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_CAPTURE_CHARS = 512 * 1024;
// Preview intentionally rebuilds through the supported adapter before it
// listens. Keep the lifecycle bounded without assuming an OpenNext cold build
// finishes inside an ordinary server-start timeout.
const WORKER_RUNTIME_TIMEOUT_MS = 10 * 60 * 1000;
const WORKER_REQUEST_TIMEOUT_MS = 5 * 1000;
const MAX_WORKER_RESPONSE_BYTES = 1024 * 1024;
const MAX_SCANNED_ARTIFACT_FILE_BYTES = 128 * 1024 * 1024;
const MAX_SCANNED_ARTIFACT_BYTES = 512 * 1024 * 1024;
const MAX_SCANNED_ARTIFACT_FILES = 100_000;
const MAX_SCANNED_ARTIFACT_DEPTH = 64;

/** @internal Shared release-corner catalog for generated-output regression coverage. */
export const CORNERS: Corner[] = [
  { id: "next-monorepo", args: ["--database", "postgres", "--billing", "stripe,chargily"] },
  {
    id: "next-monorepo-node",
    args: ["--runtime", "node", "--database", "postgres", "--billing", "stripe"],
  },
  {
    id: "single-next",
    args: ["--mode", "single", "--database", "postgres", "--billing", "stripe"],
  },
  {
    id: "next-convex",
    args: ["--database", "convex", "--billing", "stripe,chargily,paddle,polar", "--with-messaging"],
  },
  {
    id: "single-convex",
    args: [
      "--mode",
      "single",
      "--framework",
      "tanstack-start",
      "--database",
      "convex",
      "--billing",
      "polar",
      "--with-storage",
    ],
  },
  {
    id: "tanstack",
    args: [
      "--framework",
      "tanstack-start",
      "--database",
      "postgres",
      "--billing",
      "stripe,paddle,polar",
    ],
  },
  {
    id: "no-billing",
    args: ["--database", "postgres", "--billing", "none", "--features", "eve,i18n"],
  },
  { id: "mobile", args: ["--apps", "web,mobile", "--database", "postgres", "--billing", "stripe"] },
  {
    id: "desktop",
    args: ["--apps", "web,mobile,desktop", "--database", "postgres", "--billing", "stripe"],
  },
  {
    id: "single-tanstack",
    args: [
      "--mode",
      "single",
      "--framework",
      "tanstack-start",
      "--database",
      "postgres",
      "--with-messaging",
    ],
  },
  {
    id: "single-eve-next",
    args: [
      "--mode",
      "single",
      "--framework",
      "nextjs",
      "--preset",
      "custom",
      "--database",
      "postgres",
      "--billing",
      "none",
      "--with-auth",
      "--with-api",
      "--with-eve",
    ],
  },
  {
    id: "single-eve-tanstack",
    args: [
      "--mode",
      "single",
      "--framework",
      "tanstack-start",
      "--preset",
      "custom",
      "--database",
      "postgres",
      "--billing",
      "none",
      "--with-auth",
      "--with-api",
      "--with-eve",
    ],
  },
  {
    id: "single-expo-frontend",
    args: [
      "--mode",
      "single",
      "--apps",
      "mobile",
      "--preset",
      "frontend",
      "--database",
      "none",
      "--billing",
      "none",
    ],
    nativePackageRoots: ["."],
  },
  {
    id: "single-electron-frontend",
    args: [
      "--mode",
      "single",
      "--apps",
      "desktop",
      "--preset",
      "frontend",
      "--database",
      "none",
      "--billing",
      "none",
    ],
    nativePackageRoots: ["."],
  },
  {
    id: "features",
    args: [
      "--database",
      "postgres",
      "--billing",
      "none",
      "--with-eve",
      "--with-i18n",
      "--with-pdf",
      "--with-messaging",
      "--cache",
      "redis",
      "--deploy",
      "docker",
    ],
  },
  {
    id: "notifications",
    args: [
      "--preset",
      "custom",
      "--database",
      "postgres",
      "--billing",
      "none",
      "--with-auth",
      "--with-api",
      "--with-notifications",
    ],
  },
  {
    id: "feature-flags",
    args: [
      "--preset",
      "custom",
      "--database",
      "none",
      "--billing",
      "none",
      "--with-api",
      "--feature-flags",
      "posthog",
    ],
  },
  {
    id: "jobs",
    args: ["--preset", "custom", "--database", "postgres", "--billing", "none", "--with-jobs"],
  },
  {
    id: "standalone-storage",
    args: [
      "--preset",
      "custom",
      "--database",
      "postgres",
      "--billing",
      "none",
      "--with-auth",
      "--with-api",
      "--with-storage",
    ],
  },
  {
    id: "maximal-multi-app",
    args: [
      "--preset",
      "custom",
      "--apps",
      "web,mobile,desktop",
      "--database",
      "postgres",
      "--billing",
      "all",
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
    ],
    nativePackageRoots: ["apps/mobile", "apps/desktop"],
    note: "all supported capabilities with direct Expo and Electron quality gates",
  },
  {
    id: "cloudflare-next-monorepo",
    args: [
      "--framework",
      "nextjs",
      "--apps",
      "web,mobile,desktop",
      "--database",
      "convex",
      "--billing",
      "all",
      "--with-i18n",
      "--with-messaging",
      "--with-notifications",
      "--feature-flags",
      "posthog",
      "--with-jobs",
      "--cache",
      "redis",
      "--deploy",
      "cloudflare",
    ],
    nativePackageRoots: ["apps/mobile", "apps/desktop"],
    worker: {
      appRoot: "apps/web",
      appPublicEnvKey: "NEXT_PUBLIC_APP_URL",
      artifactRoot: ".wrangler/ghostinit-dry-run",
      previewHostFlag: "--ip",
      deployableAssetRoots: [".open-next/assets", ".open-next/cache"],
      convexPublicEnvKey: "NEXT_PUBLIC_CONVEX_URL",
      expectedCspSources: [
        "https://fixture-worker.convex.cloud",
        "https://fixture-worker.convex.site",
        "wss://fixture-worker.convex.cloud",
        "wss://fixture-worker.convex.site",
      ],
      nativeApps: ["mobile", "desktop"],
      nativeArtifactRoots: ["apps/mobile/dist", "apps/desktop/dist/renderer"],
      nativeArtifactFiles: ["apps/desktop/dist/main.js", "apps/desktop/dist/preload.cjs"],
      nativeWebsocket: true,
      runtimeProbes: CONVEX_WORKER_RUNTIME_PROBES,
      smokePaths: ["/", "/api/health", "/api/rpc/health", "/billing/paddle-checkout"],
    },
    note: "OpenNext with every reviewed Convex Worker capability family",
  },
  {
    id: "cloudflare-next-single",
    args: [
      "--mode",
      "single",
      "--framework",
      "nextjs",
      "--runtime",
      "node",
      "--preset",
      "custom",
      "--database",
      "none",
      "--billing",
      "none",
      "--with-api",
      "--deploy",
      "cloudflare",
    ],
    worker: {
      appRoot: ".",
      appPublicEnvKey: "NEXT_PUBLIC_APP_URL",
      artifactRoot: ".wrangler/ghostinit-dry-run",
      previewHostFlag: "--ip",
      deployableAssetRoots: [".open-next/assets", ".open-next/cache"],
      smokePaths: ["/", "/api/health", "/api/rpc/health"],
    },
    note: "OpenNext database-free API with the Node compatibility selection",
  },
  {
    id: "cloudflare-tanstack-monorepo",
    args: [
      "--framework",
      "tanstack-start",
      "--apps",
      "web,mobile,desktop",
      "--database",
      "convex",
      "--billing",
      "all",
      "--with-i18n",
      "--with-messaging",
      "--with-notifications",
      "--feature-flags",
      "posthog",
      "--with-jobs",
      "--cache",
      "redis",
      "--deploy",
      "cloudflare",
    ],
    nativePackageRoots: ["apps/mobile", "apps/desktop"],
    worker: {
      appRoot: "apps/web",
      appPublicEnvKey: "VITE_APP_URL",
      artifactRoot: ".wrangler/ghostinit-dry-run",
      previewHostFlag: "--host",
      deployableAssetRoots: ["dist/client"],
      convexPublicEnvKey: "VITE_CONVEX_URL",
      expectedCspSources: [
        "https://fixture-worker.convex.cloud",
        "wss://fixture-worker.convex.cloud",
      ],
      nativeApps: ["mobile", "desktop"],
      nativeArtifactRoots: ["apps/mobile/dist", "apps/desktop/dist/renderer"],
      nativeArtifactFiles: ["apps/desktop/dist/main.js", "apps/desktop/dist/preload.cjs"],
      nativeWebsocket: true,
      runtimeProbes: CONVEX_WORKER_RUNTIME_PROBES,
      smokePaths: ["/", "/api/health", "/api/rpc/health", "/billing/paddle-checkout"],
    },
    note: "native Cloudflare Vite adapter with every reviewed Convex Worker capability family",
  },
  {
    id: "cloudflare-tanstack-single",
    args: [
      "--mode",
      "single",
      "--framework",
      "tanstack-start",
      "--runtime",
      "node",
      "--preset",
      "custom",
      "--database",
      "none",
      "--billing",
      "none",
      "--with-api",
      "--deploy",
      "cloudflare",
    ],
    worker: {
      appRoot: ".",
      appPublicEnvKey: "VITE_APP_URL",
      artifactRoot: ".wrangler/ghostinit-dry-run",
      previewHostFlag: "--host",
      deployableAssetRoots: ["dist/client"],
      smokePaths: ["/", "/api/health", "/api/rpc/health"],
    },
    note: "native Cloudflare Vite adapter database-free API with the Node compatibility selection",
  },
];

/** Kept small on purpose: local smoke blocks on these; CI selects --all. */
const DEFAULT_CORNERS = ["next-monorepo", "single-next"];
const WORKER_CORNERS = CORNERS.filter(({ worker }) => worker !== undefined).map(({ id }) => id);

const CLI = resolve(import.meta.dirname ?? ".", "../dist/cli.js");
const BUN_EXECUTABLE = process.execPath;
let activeChild: ChildProcess | undefined;
let activeRun:
  | { readonly controller: AbortController; readonly completion: Promise<RunResult> }
  | undefined;
const previewStops = new WeakMap<ChildProcess, Promise<void>>();
let terminationRequested = false;
let workspaceCleanupSafe = true;

export function generatedProjectName(cornerId: string): string {
  return `generated-${cornerId}`;
}

export function stopWorkerPreview(child: ChildProcess, timeoutMs = 45_000): Promise<void> {
  const existing = previewStops.get(child);
  if (existing) return existing;
  const promise = (async () => {
    let captured: WindowsProcessRecord[] = [];
    try {
      // Capture before EOF: Windows cannot authorize descendant discovery using
      // the reusable PID of an already-exited bun run wrapper.
      captured = await captureWindowsProcessTree(child);
      if (!child.stdin || child.stdin.destroyed) {
        throw new Error("Worker preview automation input is unavailable");
      }
      await new Promise<void>((resolveExit, rejectExit) => {
        const finish = (error?: Error): void => {
          clearTimeout(timer);
          child.off("exit", exited);
          child.off("error", failed);
          child.stdin?.off("error", inputFailed);
          if (error) rejectExit(error);
          else resolveExit();
        };
        const exited = (code: number | null, signal: NodeJS.Signals | null): void =>
          finish(
            code === 0 && signal === null
              ? undefined
              : new Error("Worker preview wrapper did not complete graceful shutdown successfully"),
          );
        const failed = (): void =>
          finish(new Error("Worker preview wrapper failed during shutdown"));
        const inputFailed = (): void => finish(new Error("Worker preview automation input failed"));
        const timer = setTimeout(
          () => finish(new Error("Worker preview graceful shutdown timed out")),
          timeoutMs,
        );
        child.once("exit", exited);
        child.once("error", failed);
        child.stdin!.once("error", inputFailed);
        if (child.exitCode !== null || child.signalCode !== null) {
          exited(child.exitCode, child.signalCode);
        } else {
          child.stdin!.end();
        }
      });
      await assertProcessTreeExited(child, captured);
    } catch (error) {
      // Forced cleanup cannot attest that the wrapper released its environment
      // lease. Retain the workspace/recovery evidence even if the tree is gone.
      try {
        await terminateProcessTree(child, captured);
      } catch {
        throw new Error(
          "Worker preview graceful shutdown failed and forced process-tree cleanup could not be verified",
        );
      }
      throw error;
    }
  })();
  previewStops.set(child, promise);
  return promise;
}

function parseArgs(argv: string[]): { ids: string[]; keep: boolean } {
  const keep = argv.includes("--keep");
  const onlyIndex = argv.indexOf("--only");
  const selectorCount = argv.filter(
    (argument) => argument === "--all" || argument === "--workers" || argument === "--only",
  ).length;
  if (selectorCount > 1) {
    throw new Error("Use only one generated-corner selector: --all, --workers, or --only.");
  }
  if (argv.includes("--all")) return { ids: CORNERS.map((corner) => corner.id), keep };
  if (argv.includes("--workers")) return { ids: WORKER_CORNERS, keep };
  if (onlyIndex !== -1) {
    if (!argv[onlyIndex + 1]) throw new Error("--only requires a comma-separated corner list.");
    const ids = argv[onlyIndex + 1]
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) throw new Error("--only requires at least one non-empty corner id.");
    return {
      ids,
      keep,
    };
  }
  return { ids: DEFAULT_CORNERS, keep };
}

function appendTail(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length <= MAX_CAPTURE_CHARS
    ? combined
    : combined.slice(combined.length - MAX_CAPTURE_CHARS);
}

function cleanupCorner(directory: string, keep: boolean): void {
  if (!keep) rmSync(directory, { recursive: true, force: true });
}

/**
 * Stream output so verbose installs/build tools cannot exceed an exec buffer.
 * A bounded tail is retained only for the failure summary.
 */
function redactOutput(output: string, values: readonly string[]): string {
  let redacted = output;
  for (const value of values) {
    if (value.length > 0) redacted = redacted.replaceAll(value, "[REDACTED]");
  }
  return redacted;
}

export function run(
  cmd: string,
  args: string[],
  cwd: string,
  options: RunOptions = {},
): Promise<RunResult> {
  let stdout = "";
  let stderr = "";
  const controller = new AbortController();
  if (terminationRequested) controller.abort("SIGTERM");
  const completion = runSupervisedCommand({
    command: cmd,
    argv: args,
    cwd,
    label: "Generated-project command",
    timeoutMs: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    env: options.env ?? process.env,
    abortSignal: controller.signal,
    // The gate owns process signals and binding restoration. The supervisor
    // receives cancellation through its controller and retains its own guard.
    signalSource: new EventEmitter(),
    onStdout(data) {
      stdout = appendTail(stdout, data.toString("utf8"));
      if (!options.redact?.length) process.stdout.write(data);
    },
    onStderr(data) {
      stderr = appendTail(stderr, data.toString("utf8"));
      if (!options.redact?.length) process.stderr.write(data);
    },
  })
    .catch((error: unknown) => ({
      exitCode: null,
      signal: null,
      timedOut: false,
      cleanupVerified: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }))
    .then((result): RunResult => {
      if (!result.cleanupVerified) workspaceCleanupSafe = false;
      if (result.error) stderr = appendTail(stderr, `\n${result.error.message}\n`);
      // Sensitive Worker probes keep raw output private until both bounded
      // streams and supervision diagnostics have passed through redaction.
      const safeStdout = redactOutput(stdout, options.redact ?? []);
      const safeStderr = redactOutput(stderr, options.redact ?? []);
      return {
        ok:
          result.cleanupVerified &&
          !result.error &&
          !result.timedOut &&
          result.exitCode === 0 &&
          result.signal === null,
        stdout: safeStdout,
        stderr: safeStderr,
        output: `${safeStdout}\n${safeStderr}`,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        cleanupVerified: result.cleanupVerified,
      };
    })
    .finally(() => {
      if (activeRun?.completion === completion) activeRun = undefined;
    });
  activeRun = { controller, completion };
  return completion;
}

/** @internal The signal handler and regression harness await the same run result. */
export function cancelActiveRun(signal: "SIGINT" | "SIGTERM"): Promise<RunResult> | undefined {
  const operation = activeRun;
  operation?.controller.abort(signal);
  return operation?.completion;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nativeScriptContract(directory: string, packageRoots: readonly string[]): string[] {
  const problems: string[] = [];
  for (const packageRoot of packageRoots) {
    const manifestPath = join(directory, packageRoot, "package.json");
    if (!existsSync(manifestPath)) {
      problems.push(`${packageRoot}: package.json is missing`);
      continue;
    }
    let manifest: unknown;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      problems.push(
        `${packageRoot}: package.json is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const scripts = isRecord(manifest) && isRecord(manifest.scripts) ? manifest.scripts : null;
    for (const script of ["typecheck", "lint", "test"] as const) {
      if (typeof scripts?.[script] !== "string" || scripts[script].trim().length === 0) {
        problems.push(`${packageRoot}: missing blocking ${script} script`);
      }
    }
  }
  return problems;
}

function validateArchitectureResult(result: RunResult): { ok: boolean; detail: string } {
  if (!result.ok) {
    const reason = result.timedOut
      ? "Architecture command timed out"
      : `Architecture command exited with ${String(result.exitCode ?? result.signal ?? "unknown")}`;
    return { ok: false, detail: `${reason}\n${result.output}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch (error) {
    return {
      ok: false,
      detail: `Architecture command did not emit valid JSON: ${error instanceof Error ? error.message : String(error)}\n${result.output}`,
    };
  }

  if (
    !isRecord(parsed) ||
    !isRecord(parsed.meta) ||
    !isRecord(parsed.data) ||
    !isRecord(parsed.data.summary) ||
    !Array.isArray(parsed.data.findings)
  ) {
    return { ok: false, detail: `Architecture JSON has an invalid envelope\n${result.stdout}` };
  }
  if (
    parsed.$schema !== "https://ghostinit.dev/schemas/json-envelope.schema.json" ||
    parsed.schemaVersion !== 2 ||
    parsed.success !== true ||
    parsed.exitCode !== 0 ||
    parsed.meta.command !== "check" ||
    typeof parsed.meta.durationMs !== "number" ||
    parsed.data.summary.blockers !== 0 ||
    parsed.data.summary.highs !== 0
  ) {
    return { ok: false, detail: `Architecture JSON reports failure\n${result.stdout}` };
  }

  const blocking = parsed.data.findings.filter(
    (finding) =>
      isRecord(finding) && (finding.severity === "HIGH" || finding.severity === "BLOCKER"),
  );
  if (blocking.length > 0) {
    return {
      ok: false,
      detail: `Architecture JSON contains ${blocking.length} blocking finding(s)\n${JSON.stringify(blocking, null, 2)}`,
    };
  }

  return { ok: true, detail: result.stdout };
}

export function firstErrors(output: string, limit = 8): string {
  const lines = output
    .split("\n")
    .filter((line) =>
      /error TS|error:|invalid config|failed:|timed out|format|architecture command|architecture JSON|worker artifact|worker runtime|worker binding|server-only/i.test(
        line,
      ),
    )
    .slice(0, limit);
  return lines.length
    ? lines.map((line) => `      ${line.trim()}`).join("\n")
    : "      (no error lines captured)";
}

interface AuthDeclarationCheck {
  ok: boolean;
  detail: string;
  cleanupVerified: boolean;
}

function authConsumerContent(authImport: string): string {
  return `import { auth } from "${authImport}";

export async function verifyPortableAuth(headers: Headers, password: string): Promise<void> {
  await auth.handler(new Request("https://example.test/api/auth/session", { headers }));
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  const role: string | null | undefined = session?.user.role;
  const banned: boolean | null | undefined = session?.user.banned;
  await auth.api.listUsers({ headers, query: { limit: 1 } });
  await auth.api.getUser({ headers, query: { id: "user-id" } });
  await auth.api.setRole({ headers, body: { userId: "user-id", role: "admin" } });
  await auth.api.banUser({ headers, body: { userId: "user-id" } });
  await auth.api.unbanUser({ headers, body: { userId: "user-id" } });
  const context = await auth.$context;
  if (password.length < context.password.config.minPasswordLength) return;
  await context.password.hash(password);
  context.generateId({ model: "user" });
  context.generateId({ model: "account" });
  void role;
  void banned;
}
`;
}

export async function verifyAuthDeclarations(
  directory: string,
): Promise<AuthDeclarationCheck | undefined> {
  const variants = [
    {
      server: "packages/auth/src/server.ts",
      extendsPath: "../packages/auth/tsconfig.json",
      authImport: "../packages/auth/src/server.js",
      declaration: "declarations/packages/auth/src/server.d.ts",
      typeRoots: ["../packages/auth/node_modules/@types", "../node_modules/@types"],
    },
    {
      server: "src/server/auth/index.ts",
      extendsPath: "../tsconfig.json",
      authImport: "../src/server/auth/index.js",
      declaration: "declarations/src/server/auth/index.d.ts",
      typeRoots: ["../node_modules/@types"],
    },
  ];
  const variant = variants.find(({ server }) => existsSync(join(directory, server)));
  if (!variant) return undefined;
  const source = readFileSync(join(directory, variant.server), "utf8");
  if (!source.includes("@better-auth/passkey")) return undefined;

  const probeDirectory = join(directory, ".ghostinit-auth-portability");
  let cleanupVerified = true;
  let result: AuthDeclarationCheck = {
    ok: false,
    detail: "Auth declaration probe did not complete.",
    cleanupVerified,
  };
  try {
    mkdirSync(probeDirectory, { recursive: true });
    writeFileSync(join(probeDirectory, "consumer.ts"), authConsumerContent(variant.authImport));
    writeFileSync(
      join(probeDirectory, "tsconfig.json"),
      JSON.stringify(
        {
          extends: variant.extendsPath,
          compilerOptions: {
            composite: false,
            incremental: false,
            noEmit: false,
            declaration: true,
            declarationMap: false,
            emitDeclarationOnly: true,
            rootDir: "..",
            outDir: "./declarations",
            // This is a server-only declaration probe. Do not inherit a single
            // app's Bun test or Vite client ambients: custom typeRoots make
            // automatic type directives resolve only from those roots, so the
            // inherited `bun-types/test` and `vite/client` entries would be
            // both irrelevant and unresolvable here. `@types/node` is a direct
            // dependency of each generated auth owner.
            types: ["node"],
            typeRoots: variant.typeRoots,
          },
          include: ["consumer.ts", `../${variant.server}`],
        },
        null,
        2,
      ),
    );
    const compilation = await run(
      BUN_EXECUTABLE,
      ["x", "--no-install", "tsc", "-p", join(probeDirectory, "tsconfig.json")],
      directory,
    );
    cleanupVerified = compilation.cleanupVerified;
    if (!compilation.ok) {
      result = { ok: false, detail: compilation.output, cleanupVerified };
    } else {
      const declarationPath = join(probeDirectory, variant.declaration);
      if (!existsSync(declarationPath)) {
        result = {
          ok: false,
          detail: `Auth declaration was not emitted at ${declarationPath}`,
          cleanupVerified,
        };
      } else {
        const declaration = readFileSync(declarationPath, "utf8");
        const normalizedDirectory = directory.replaceAll("\\", "/");
        const forbidden = [
          "@simplewebauthn/server",
          "AuthenticationResponseJSON",
          "PublicKeyCredentialCreationOptionsJSON",
          "PublicKeyCredentialRequestOptionsJSON",
          "zod/v4/core",
          ".bun",
          directory,
          normalizedDirectory,
        ].filter((value) => declaration.includes(value));
        const exposesPortableBoundary =
          declaration.includes("AdminCreationAuthContext") &&
          declaration.includes("PortableAuthOptions");
        result = {
          ok: forbidden.length === 0 && exposesPortableBoundary,
          detail:
            forbidden.length > 0
              ? `Auth declaration contains non-portable references: ${forbidden.join(", ")}`
              : exposesPortableBoundary
                ? "Portable auth declaration and consumer contract passed."
                : "Auth declaration did not expose the portable auth boundary.",
          cleanupVerified,
        };
      }
    }
  } catch (error) {
    result = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      cleanupVerified,
    };
  } finally {
    if (cleanupVerified) {
      try {
        rmSync(probeDirectory, { recursive: true, force: true });
      } catch (error) {
        cleanupVerified = false;
        result = {
          ok: false,
          detail: `Auth declaration probe cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          cleanupVerified: false,
        };
      }
    } else {
      result = {
        ...result,
        ok: false,
        detail: `${result.detail}\nLeft auth declaration probe at ${probeDirectory} because descendant cleanup was unverified.`,
        cleanupVerified: false,
      };
    }
  }
  return { ...result, cleanupVerified };
}

export function deployableArtifactPaths(
  directory: string,
  appRootPath: string,
  workerArtifactRoot: string,
  workerAssetRoots: readonly string[],
  nativeArtifactRoots: readonly string[] = [],
  nativeArtifactFiles: readonly string[] = [],
): string[] {
  const appRoot = resolve(directory, appRootPath);
  return [
    resolve(appRoot, workerArtifactRoot),
    ...workerAssetRoots.map((path) => resolve(appRoot, path)),
    ...nativeArtifactRoots.map((path) => resolve(directory, path)),
    ...nativeArtifactFiles.map((path) => resolve(directory, path)),
  ];
}

function verifyWorkerArtifactDoesNotContain(
  directory: string,
  worker: NonNullable<Corner["worker"]>,
  serverOnlyValues: readonly string[],
): WorkerCheck {
  const artifactRoots = deployableArtifactPaths(
    directory,
    worker.appRoot,
    worker.artifactRoot,
    worker.deployableAssetRoots,
    worker.nativeArtifactRoots,
    worker.nativeArtifactFiles,
  );
  try {
    for (const artifactRoot of artifactRoots) {
      if (!existsSync(artifactRoot)) {
        return {
          ok: false,
          detail: `Deployable artifact was not emitted at ${relative(directory, artifactRoot)}`,
          cleanupVerified: true,
        };
      }
    }
    const expected = serverOnlyValues.map((value) => Buffer.from(value, "utf8"));
    let scannedBytes = 0;
    let scannedFiles = 0;
    const visit = (path: string, depth = 0): string | undefined => {
      if (depth > MAX_SCANNED_ARTIFACT_DEPTH) {
        throw new Error("Worker artifacts exceed the bounded secret scanner depth.");
      }
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) {
        throw new Error(
          `Deployable artifact contains an unscannable symbolic link: ${relative(directory, path)}`,
        );
      }
      if (metadata.isDirectory()) {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          const leakedAt = visit(resolve(path, entry.name), depth + 1);
          if (leakedAt) return leakedAt;
        }
        return undefined;
      }
      if (!metadata.isFile()) {
        throw new Error(
          `Deployable artifact contains an unsupported special entry: ${relative(directory, path)}`,
        );
      }
      if (metadata.size > MAX_SCANNED_ARTIFACT_FILE_BYTES) {
        throw new Error(
          `Deployable artifact exceeds the bounded secret scanner size: ${relative(directory, path)}`,
        );
      }
      scannedFiles += 1;
      if (scannedFiles > MAX_SCANNED_ARTIFACT_FILES) {
        throw new Error("Worker artifacts exceed the bounded secret scanner file count.");
      }
      scannedBytes += metadata.size;
      if (scannedBytes > MAX_SCANNED_ARTIFACT_BYTES) {
        throw new Error("Worker artifact exceeds the bounded aggregate secret scanner size.");
      }
      const bytes = readFileSync(path);
      return expected.some((value) => bytes.includes(value))
        ? relative(directory, path)
        : undefined;
    };
    let leakedAt: string | undefined;
    for (const artifactRoot of artifactRoots) {
      leakedAt = visit(artifactRoot);
      if (leakedAt) break;
    }
    return leakedAt
      ? {
          ok: false,
          detail: `Deployable artifact contains a synthetic server-only value in ${leakedAt}`,
          cleanupVerified: true,
        }
      : {
          ok: true,
          detail: "Worker and native artifacts contain no synthetic server-only value.",
          cleanupVerified: true,
        };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      cleanupVerified: true,
    };
  }
}

function parseGeneratedDevVars(path: string): Record<string, string> {
  return parseGeneratedDevVarsContent(readFileSync(path, "utf8"));
}

function parseGeneratedDevVarsContent(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    const key = equals === -1 ? "" : trimmed.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Generated .dev.vars has an invalid key at line ${index + 1}.`);
    }
    let value = trimmed.slice(equals + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        throw new Error(`Generated .dev.vars has an invalid quoted value at line ${index + 1}.`);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (Object.hasOwn(values, key)) {
      throw new Error(`Generated .dev.vars repeats ${key} at line ${index + 1}.`);
    }
    values[key] = value;
  }
  return values;
}

function credentialSafeHostEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  const credentialName =
    /(?:SECRET|PASSWORD|TOKEN|CREDENTIAL|COOKIE|AUTH|BEARER|SESSION|SIGNATURE|PRIVATE|OTP|JWT|API_KEY|ACCESS_KEY|DATABASE_URL|POSTGRES_URL|REDIS_URL|(?:^|_)KEY(?:_|$))/i;
  for (const key of Object.keys(environment)) {
    if (credentialName.test(key)) delete environment[key];
  }
  return environment;
}

function decodeCredentialPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Every proxy representation a subprocess could echo or copy into an artifact. */
export function credentialUrlSensitiveValues(value: string): string[] {
  const values = new Set([value]);
  let credentialUrl: URL;
  try {
    credentialUrl = new URL(value);
  } catch {
    return [...values];
  }
  values.add(credentialUrl.href);
  if (!credentialUrl.username && !credentialUrl.password) return [...values];
  const encodedUsername = credentialUrl.username;
  const encodedPassword = credentialUrl.password;
  const encodedUserinfo = encodedUsername + (encodedPassword ? `:${encodedPassword}` : "");
  const decodedUsername = decodeCredentialPart(encodedUsername);
  const decodedPassword = decodeCredentialPart(encodedPassword);
  const decodedUserinfo = decodedUsername + (decodedPassword ? `:${decodedPassword}` : "");
  for (const part of [
    encodedUsername,
    encodedPassword,
    encodedUserinfo,
    decodedUsername,
    decodedPassword,
    decodedUserinfo,
  ]) {
    if (part) values.add(part);
  }
  values.add(
    `${credentialUrl.protocol}//${decodedUserinfo}@${credentialUrl.host}${credentialUrl.pathname}${credentialUrl.search}${credentialUrl.hash}`,
  );
  return [...values];
}

function workerEnvironmentInputs(directory: string, worker: NonNullable<Corner["worker"]>) {
  const appRoot = resolve(directory, worker.appRoot);
  const devVarPaths = [
    ...new Set([resolve(directory, ".dev.vars"), resolve(appRoot, ".dev.vars")]),
  ];
  for (const path of devVarPaths) {
    if (!existsSync(path)) {
      throw new Error(`Cloudflare project is missing ${relative(directory, path)}.`);
    }
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error("Worker environment input must be a regular file.");
  }
  const devVarInputs = devVarPaths.map((path) => {
    const original = readFileSync(path, "utf8");
    return { path, original, variables: parseGeneratedDevVarsContent(original) };
  });
  const parsedDevVars = devVarInputs.map(({ variables }) => variables);
  if (
    parsedDevVars.length > 1 &&
    JSON.stringify(Object.entries(parsedDevVars[0] ?? {}).sort()) !==
      JSON.stringify(Object.entries(parsedDevVars[1] ?? {}).sort())
  ) {
    throw new Error("Cloudflare root and app .dev.vars files have drifted.");
  }
  const localVariables: Record<string, string> = Object.assign({}, ...parsedDevVars);
  const declaredKeys = new Set<string>();
  for (const root of new Set([directory, appRoot])) {
    const example = resolve(root, ".env.example");
    if (!existsSync(example)) continue;
    const metadata = lstatSync(example);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error("Worker environment declaration must be a regular file.");
    for (const key of Object.keys(parseGeneratedDevVars(example))) declaredKeys.add(key);
  }
  const publicPosthogKeys = selectedPosthogPublicKeys(
    worker.appPublicEnvKey === "NEXT_PUBLIC_APP_URL" ? "nextjs" : "tanstack-start",
    ["web", ...(worker.nativeApps ?? [])],
  ).filter((key) => declaredKeys.has(key));
  return { devVarInputs, localVariables, declaredKeys, publicPosthogKeys };
}

/** Stage this gate's existing synthetic inputs as actual Wrangler file bindings. */
export async function prepareWorkerFixtureBindings(
  directory: string,
  worker: NonNullable<Corner["worker"]>,
): Promise<
  Awaited<ReturnType<typeof stageWorkerBindingFiles>> & {
    capabilityFixtures: WorkerCapabilityFixtures;
  }
> {
  const { devVarInputs, localVariables, declaredKeys, publicPosthogKeys } = workerEnvironmentInputs(
    directory,
    worker,
  );
  const existingPublicKeys = publicPosthogKeys.filter((key) => Object.hasOwn(localVariables, key));
  if (
    declaredKeys.has("POSTHOG_API_KEY") &&
    Object.hasOwn(localVariables, "POSTHOG_API_KEY") &&
    existingPublicKeys.length > 0
  ) {
    const token = "phc_" + randomBytes(24).toString("hex");
    localVariables.POSTHOG_API_KEY = token;
    for (const key of existingPublicKeys) localVariables[key] = token;
  }
  const capabilityFixtures = syntheticWorkerCapabilityFixtures();
  const fixtureVariables = workerFixtureVariables(localVariables, worker, capabilityFixtures);
  const replacements = devVarInputs.map(({ path, original, variables }) => ({
    path: relative(directory, path).replaceAll("\\", "/"),
    original,
    content:
      Object.entries(variables)
        .map(
          ([key, value]) =>
            key +
            "=" +
            JSON.stringify(declaredKeys.has(key) ? (fixtureVariables[key] ?? value) : value),
        )
        .join("\n") + "\n",
  }));
  return { ...(await stageWorkerBindingFiles(directory, replacements)), capabilityFixtures };
}

export function workerBuildEnvironment(
  directory: string,
  worker: NonNullable<Corner["worker"]>,
  syntheticServerOnlyValue: string,
  capabilityFixtures: WorkerCapabilityFixtures = syntheticWorkerCapabilityFixtures(),
): { env: NodeJS.ProcessEnv; serverOnlyValues: string[] } {
  const { localVariables, declaredKeys, publicPosthogKeys } = workerEnvironmentInputs(
    directory,
    worker,
  );
  const serverOnlyName =
    /(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|COOKIE|SIGNATURE|PRIVATE|API_KEY|DATABASE_URL|POSTGRES_URL|REDIS_URL)/;
  // Match the generated workflow's credential-free Worker step rather than
  // inheriting every placeholder from .dev.vars. This makes the local gate fail
  // whenever generated CI omits an exact build input.
  // A shared public PostHog token is an additional artifact-classification probe.
  const generatedCiBuildKeys = new Set([
    "SITE_URL",
    "NEXT_PUBLIC_APP_URL",
    "VITE_APP_URL",
    "EXPO_PUBLIC_APP_URL",
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_CONVEX_URL",
    "EXPO_PUBLIC_WS_URL",
    "DESKTOP_API_URL",
    "VITE_API_URL",
    "VITE_CONVEX_URL",
    "VITE_WS_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    ...publicPosthogKeys,
  ]);
  const admittedBuildVariables = Object.fromEntries(
    Object.entries(localVariables).filter(([key]) => generatedCiBuildKeys.has(key)),
  );
  const buildVariables = workerFixtureVariables(admittedBuildVariables, worker, capabilityFixtures);
  const serverOnlyValues = [syntheticServerOnlyValue];
  for (const key of [
    "BETTER_AUTH_SECRET",
    "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ]) {
    const value = buildVariables[key];
    if (value) serverOnlyValues.push(value);
  }
  for (const [key, value] of Object.entries(localVariables)) {
    const normalizedKey = key.toUpperCase();
    if (
      isPublicPosthogProjectToken(
        key,
        value,
        publicPosthogKeys,
        declaredKeys,
        Object.entries(localVariables),
      )
    )
      continue;
    if (
      value.length >= 12 &&
      !value.includes("REPLACE_WITH_") &&
      !/^(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_)/.test(normalizedKey) &&
      !/(?:PUBLIC|PUBLISHABLE)/.test(normalizedKey) &&
      serverOnlyName.test(normalizedKey)
    ) {
      serverOnlyValues.push(value);
    }
  }
  const safeHostEnvironment = credentialSafeHostEnvironment();
  for (const key of Object.keys(localVariables)) delete safeHostEnvironment[key];
  for (const [key, value] of Object.entries(safeHostEnvironment)) {
    if (/^(?:HTTPS?|ALL)_PROXY$/i.test(key) && value) {
      serverOnlyValues.push(...credentialUrlSensitiveValues(value));
    }
  }
  return {
    env: {
      ...safeHostEnvironment,
      ...buildVariables,
      GHOSTINIT_WORKER_TEST_SECRET: syntheticServerOnlyValue,
      GHOSTINIT_WORKER_SECURITY_TEST: "1",
      WRANGLER_SEND_METRICS: "false",
    },
    serverOnlyValues: [...new Set(serverOnlyValues)],
  };
}

interface WorkerCapabilityFixtures {
  siteUrl: string;
  betterAuthSecret: string;
  notificationTokenEncryptionKey: string;
  upstashRedisRestUrl: string;
  upstashRedisRestToken: string;
}

function syntheticWorkerCapabilityFixtures(): WorkerCapabilityFixtures {
  return {
    siteUrl: "https://ghostinit-ci.example.test",
    betterAuthSecret: randomBytes(32).toString("base64url"),
    notificationTokenEncryptionKey: randomBytes(32).toString("base64url"),
    upstashRedisRestUrl: `https://fixture-${randomBytes(12).toString("hex")}.upstash.io`,
    upstashRedisRestToken: randomBytes(32).toString("base64url"),
  };
}

function workerFixtureVariables(
  variables: Record<string, string>,
  worker: NonNullable<Corner["worker"]>,
  fixtures: WorkerCapabilityFixtures = syntheticWorkerCapabilityFixtures(),
): Record<string, string> {
  const result = { ...variables };
  result.SITE_URL = fixtures.siteUrl;
  result[worker.appPublicEnvKey] = fixtures.siteUrl;
  if (Object.hasOwn(result, "BETTER_AUTH_SECRET")) {
    result.BETTER_AUTH_SECRET = fixtures.betterAuthSecret;
  }
  if (Object.hasOwn(result, "BETTER_AUTH_URL")) result.BETTER_AUTH_URL = fixtures.siteUrl;
  if (Object.hasOwn(result, "NOTIFICATION_TOKEN_ENCRYPTION_KEY")) {
    result.NOTIFICATION_TOKEN_ENCRYPTION_KEY = fixtures.notificationTokenEncryptionKey;
  }
  const hasUpstashUrl = Object.hasOwn(result, "UPSTASH_REDIS_REST_URL");
  const hasUpstashToken = Object.hasOwn(result, "UPSTASH_REDIS_REST_TOKEN");
  if (hasUpstashUrl !== hasUpstashToken) {
    throw new Error("Generated Worker environment must declare both Upstash REST variables.");
  }
  if (hasUpstashUrl) {
    result.UPSTASH_REDIS_REST_URL = fixtures.upstashRedisRestUrl;
    result.UPSTASH_REDIS_REST_TOKEN = fixtures.upstashRedisRestToken;
  }
  if (worker.convexPublicEnvKey) {
    const convexUrl = "https://fixture-worker.convex.cloud";
    result.CONVEX_DEPLOYMENT = "dev:fixture-worker";
    result.CONVEX_URL = convexUrl;
    result.CONVEX_SITE_URL = "https://fixture-worker.convex.site";
    result[worker.convexPublicEnvKey] = convexUrl;
  }
  if (worker.nativeApps?.includes("mobile")) {
    result.EXPO_PUBLIC_APP_URL = fixtures.siteUrl;
    result.EXPO_PUBLIC_API_URL = fixtures.siteUrl;
    if (worker.convexPublicEnvKey) {
      result.EXPO_PUBLIC_CONVEX_URL = "https://fixture-worker.convex.cloud";
    }
    if (worker.nativeWebsocket) {
      result.EXPO_PUBLIC_WS_URL = "wss://ghostinit-ci.example.test/api/realtime";
    }
  }
  if (worker.nativeApps?.includes("desktop")) {
    result.DESKTOP_API_URL = fixtures.siteUrl;
    result.VITE_APP_URL = fixtures.siteUrl;
    result.VITE_API_URL = fixtures.siteUrl;
    if (worker.convexPublicEnvKey) {
      result.VITE_CONVEX_URL = "https://fixture-worker.convex.cloud";
    }
    if (worker.nativeWebsocket) {
      result.VITE_WS_URL = "wss://ghostinit-ci.example.test/api/realtime";
    }
  }
  return result;
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  server.unref();
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  if (address === null || typeof address === "string") {
    throw new Error("Could not reserve a numeric loopback port for the Worker runtime.");
  }
  return address.port;
}

async function assertLoopbackPortUnowned(port: number): Promise<void> {
  await new Promise<void>((resolveProbe, rejectProbe) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) rejectProbe(error);
      else resolveProbe();
    };
    const timer = setTimeout(
      () => finish(new Error("Could not prove the reserved Worker preview port is unowned.")),
      1_000,
    );
    socket.once("connect", () =>
      finish(new Error("Reserved Worker preview port was claimed before preview started.")),
    );
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") finish();
      else
        finish(new Error(`Could not verify the Worker preview port: ${error.code ?? "unknown"}.`));
    });
  });
}

async function fetchSameOrigin(
  origin: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let current = new URL(path, origin);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(current, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(WORKER_REQUEST_TIMEOUT_MS),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("Worker runtime returned a redirect without a location.");
    const next = new URL(location, current);
    if (next.origin !== origin) {
      throw new Error("Worker runtime attempted a cross-origin redirect.");
    }
    current = next;
  }
  throw new Error("Worker runtime exceeded the same-origin redirect limit.");
}

function isHealthyPayload(path: string, payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  if (path === "/api/rpc/health") {
    return isRecord(payload.json) && payload.json.status === "ok";
  }
  return payload.status === "ok";
}

export function previewReportedListening(output: string, port: number): boolean {
  const readiness = new WorkerPreviewReadiness(port);
  readiness.consume("stdout", output);
  readiness.finish("stdout");
  return readiness.isReady();
}

export async function assertWorkerRuntimeProbeResponse(
  response: Response,
  probe: WorkerRuntimeProbe,
): Promise<void> {
  const label = `${probe.method} ${probe.path}`;
  if (response.status !== probe.status) {
    await response.body?.cancel();
    throw new Error(
      `Worker runtime ${label} returned HTTP ${response.status}; expected ${probe.status}.`,
    );
  }
  for (const [name, expected] of Object.entries(probe.headers)) {
    if (response.headers.get(name) !== expected) {
      await response.body?.cancel();
      throw new Error(`Worker runtime ${label} returned an unexpected ${name} header.`);
    }
  }
  if ((await response.text()) !== probe.body) {
    throw new Error(`Worker runtime ${label} returned an unexpected response body.`);
  }
}

async function readWorkerResponseBody(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return body + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > MAX_WORKER_RESPONSE_BYTES) {
        void reader.cancel().catch(() => {});
        return null;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    // Response stream failures can contain private data. Reject without echoing them.
    void reader.cancel().catch(() => {});
    return null;
  } finally {
    reader.releaseLock();
  }
}

function hasWorkerHtmlError(body: string): boolean {
  return (
    /<[a-z][^>]*\bid\s*=\s*["']__next_error__["']/i.test(body) ||
    /<template\b[^>]*\bdata-dgst(?:\s|=|>)/i.test(body)
  );
}

function isCompleteWorkerHtml(body: string): boolean {
  return (
    /<html\b/i.test(body) &&
    /<body\b/i.test(body) &&
    /<main\b/i.test(body) &&
    /<\/body\s*>/i.test(body) &&
    /<\/html\s*>/i.test(body) &&
    !hasWorkerHtmlError(body)
  );
}

export async function hasValidWorkerResponse(
  response: Response,
  path: string,
  worker: NonNullable<Corner["worker"]>,
): Promise<boolean> {
  const csp = response.headers.get("content-security-policy") ?? "";
  const isPaddleCheckout = path === "/billing/paddle-checkout";
  const paddleCsp =
    !isPaddleCheckout ||
    (csp.includes("https://cdn.paddle.com") &&
      csp.includes("frame-src https://buy.paddle.com https://sandbox-buy.paddle.com") &&
      csp.includes("https://create-checkout.paddle.com") &&
      csp.includes("https://sandbox-create-checkout.paddle.com") &&
      csp.includes("frame-ancestors 'none'"));
  const hasProductionCsp =
    !csp.includes("'unsafe-eval'") &&
    csp.includes("https://fonts.googleapis.com") &&
    csp.includes("https://fonts.gstatic.com") &&
    !csp.includes("*.convex.") &&
    (worker.expectedCspSources ?? []).every((source) => csp.includes(source));
  const hasWorkerHeaders =
    response.headers.get("x-content-type-options") === "nosniff" &&
    response.headers.get("x-frame-options") === "DENY" &&
    hasProductionCsp &&
    paddleCsp;
  const body = await readWorkerResponseBody(response);
  if (body === null) return false;
  let validPayload = false;
  if (isPaddleCheckout) {
    validPayload =
      response.headers.get("content-type")?.includes("text/html") === true &&
      isCompleteWorkerHtml(body) &&
      /<main\b[^>]*\bdata-paddle-checkout-state="invalid"/.test(body);
  } else if (path === "/") {
    validPayload =
      response.headers.get("content-type")?.includes("text/html") === true &&
      isCompleteWorkerHtml(body);
  } else if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      validPayload = isHealthyPayload(path, JSON.parse(body));
    } catch {
      validPayload = false;
    }
  }
  return response.status === 200 && validPayload && hasWorkerHeaders;
}

async function verifyWorkerRuntime(
  directory: string,
  worker: NonNullable<Corner["worker"]>,
): Promise<WorkerCheck> {
  const appRoot = resolve(directory, worker.appRoot);
  let child: ChildProcess | undefined;
  let cleanupVerified = true;
  let ok = false;
  let detail = "Worker runtime smoke did not complete.";
  try {
    const port = await reserveLoopbackPort();
    await assertLoopbackPortUnowned(port);
    if (terminationRequested)
      throw new Error("Worker runtime was interrupted before preview startup.");
    const origin = `http://127.0.0.1:${port}`;
    const previewVariables = parseGeneratedDevVars(resolve(appRoot, ".dev.vars"));
    child = spawn(
      BUN_EXECUTABLE,
      [
        "run",
        "preview",
        "--",
        "--ghostinit-stop-on-stdin-end",
        worker.previewHostFlag,
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: appRoot,
        detached: process.platform !== "win32",
        env: {
          ...credentialSafeHostEnvironment(),
          ...previewVariables,
          WRANGLER_SEND_METRICS: "false",
        },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    activeChild = child;
    let startupError: Error | undefined;
    let runtimeOutput = "";
    const previewReadiness = new WorkerPreviewReadiness(port);
    child.once("error", (error) => {
      startupError = error;
    });
    // Exercise the generated OpenNext/Vite preview path rather than bypassing
    // it with raw Wrangler. Keep output private: preview loads .dev.vars, and a
    // failing third-party adapter must not be trusted to redact those values.
    child.stdout?.on("data", (data: Buffer) => {
      runtimeOutput = appendTail(runtimeOutput, data.toString("utf8"));
      previewReadiness.consume("stdout", data);
    });
    child.stderr?.on("data", (data: Buffer) => {
      runtimeOutput = appendTail(runtimeOutput, data.toString("utf8"));
      previewReadiness.consume("stderr", data);
    });
    child.stdout?.once("end", () => previewReadiness.finish("stdout"));
    child.stderr?.once("end", () => previewReadiness.finish("stderr"));

    const deadline = Date.now() + WORKER_RUNTIME_TIMEOUT_MS;
    const smokePaths = worker.smokePaths ?? ["/", "/api/health"];
    for (const path of smokePaths) {
      let lastStatus: number | undefined;
      let lastFailure = "no response";
      let routePassed = false;
      while (Date.now() < deadline) {
        if (startupError) throw startupError;
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(
            `Worker runtime exited before ${path} returned HTTP 200 (${String(child.exitCode ?? child.signalCode)}).`,
          );
        }
        try {
          const response = await fetchSameOrigin(origin, path);
          lastStatus = response.status;
          const validWorkerResponse = await hasValidWorkerResponse(response, path, worker);
          const previewOwnsPort = previewReadiness.isReady();
          if (validWorkerResponse && previewOwnsPort) {
            // Do not accept a response from a racing process after the preview
            // logged its address and exited. The owned child must remain alive
            // after the response has been fully validated.
            await Bun.sleep(50);
            if (child.exitCode !== null || child.signalCode !== null) {
              throw new Error(`Worker preview exited after responding to ${path}.`);
            }
            if (!previewReadiness.isReady()) {
              throw new Error(`Worker preview readiness was contradicted after ${path}.`);
            }
            routePassed = true;
            break;
          }
          lastFailure = `HTTP ${response.status}; preview ownership ${previewOwnsPort ? "verified" : "unverified"}; response contract ${validWorkerResponse ? "valid" : "invalid"}`;
        } catch (error) {
          lastFailure = error instanceof Error ? error.message : "request failed";
        }
        await Bun.sleep(250);
      }
      if (!routePassed) {
        throw new Error(
          `Worker runtime did not return HTTP 200 for ${path} within ${WORKER_RUNTIME_TIMEOUT_MS}ms (last status: ${lastStatus ?? "none"}; ${lastFailure}).`,
        );
      }
      console.log(`   worker-route GET ${path}: ok`);
    }
    for (const probe of worker.runtimeProbes ?? []) {
      const response = await fetchSameOrigin(origin, probe.path, {
        method: probe.method,
        body: "",
      });
      await assertWorkerRuntimeProbeResponse(response, probe);
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Worker preview exited after ${probe.method} ${probe.path}.`);
      }
      if (!previewReadiness.isReady()) {
        throw new Error(
          `Worker preview readiness was contradicted after ${probe.method} ${probe.path}.`,
        );
      }
      console.log(`   worker-route ${probe.method} ${probe.path}: ok`);
    }
    // A successful listen message followed by one response is not enough to
    // exclude a bind race or immediately dying preview. Recheck a generated
    // health route after a stability interval while the owned child is alive.
    await Bun.sleep(250);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Worker preview exited before the stability recheck.");
    }
    const stabilityResponse = await fetchSameOrigin(origin, "/api/health");
    if (!(await hasValidWorkerResponse(stabilityResponse, "/api/health", worker))) {
      throw new Error("Worker preview failed the post-start health/security stability recheck.");
    }
    await Bun.sleep(50);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Worker preview exited immediately after runtime acceptance.");
    }
    if (!previewReadiness.isReady()) {
      throw new Error("Worker preview readiness was contradicted during runtime acceptance.");
    }
    ok = true;
    detail = `Worker runtime passed ${smokePaths.join(", ")} acceptance.`;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  } finally {
    if (child) {
      try {
        await stopWorkerPreview(child);
      } catch (error) {
        cleanupVerified = false;
        detail = `${detail}\nWorker runtime process-tree cleanup could not be verified: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (activeChild === child) activeChild = undefined;
    }
  }
  return { ok: ok && cleanupVerified, detail, cleanupVerified };
}

async function main(): Promise<void> {
  if (typeof Bun === "undefined" || Bun.version !== REQUIRED_BUN_VERSION) {
    console.error(
      `Generated-project verification requires Bun ${REQUIRED_BUN_VERSION}; received ${typeof Bun === "undefined" ? "a non-Bun runtime" : `Bun ${Bun.version}`}.`,
    );
    process.exitCode = 1;
    return;
  }
  if (!existsSync(CLI)) {
    console.error(`dist/cli.js not found at ${CLI} — run \`bun run build\` first.`);
    process.exitCode = 1;
    return;
  }

  let ids: string[];
  let keep: boolean;
  try {
    ({ ids, keep } = parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const selected = CORNERS.filter((corner) => ids.includes(corner.id));
  const missing = ids.filter((id) => !CORNERS.some((corner) => corner.id === id));
  if (missing.length) {
    console.error(`Unknown corner(s): ${missing.join(", ")}`);
    console.error(`Available: ${CORNERS.map((corner) => corner.id).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const root = createTemporaryWorkspace("ghostinit-generated-");
  let activeWorkerBindings: Awaited<ReturnType<typeof prepareWorkerFixtureBindings>> | undefined;
  let pendingWorkerBindings: ReturnType<typeof prepareWorkerFixtureBindings> | undefined;
  const terminateForSignal = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    if (terminationRequested) return;
    terminationRequested = true;
    let cleanupVerified = workspaceCleanupSafe;
    const command = cancelActiveRun(signal);
    if (command) {
      const result = await command;
      cleanupVerified &&= result.cleanupVerified;
      if (!result.cleanupVerified) {
        console.error(
          `Interrupted, but process-tree cleanup could not be verified: ${result.output}`,
        );
      }
    }
    const child = activeChild;
    if (child) {
      try {
        await stopWorkerPreview(child);
      } catch (error) {
        cleanupVerified = false;
        console.error(
          `Interrupted, but process-tree cleanup could not be verified: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (pendingWorkerBindings) {
      try {
        activeWorkerBindings = await pendingWorkerBindings;
      } catch (error) {
        cleanupVerified = cleanupVerified && isRecord(error) && error.cleanupVerified === true;
      }
    }
    if (activeWorkerBindings) {
      try {
        await activeWorkerBindings.restore(cleanupVerified);
      } catch (error) {
        cleanupVerified = false;
        console.error(
          `Interrupted, but Worker binding restoration could not be verified: ${error instanceof Error ? error.message : "Worker binding restoration failed."}`,
        );
      }
    }
    if (!keep && cleanupVerified) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch (error) {
        cleanupVerified = false;
        console.error(
          `Interrupted, but generated workspace cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (!cleanupVerified) {
      console.error(
        `Left generated workspace at ${root} because descendant cleanup was unverified.`,
      );
    }
    process.exit(cleanupVerified ? (signal === "SIGINT" ? 130 : 143) : 1);
  };
  const onSigint = (): void => void terminateForSignal("SIGINT");
  const onSigterm = (): void => void terminateForSignal("SIGTERM");
  // Keep both listeners installed while cleanup runs so a repeated signal
  // cannot bypass the bounded verification and restore the default exit path.
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  console.log(`Verifying ${selected.length} corner(s) in ${root} with Bun ${Bun.version}\n`);

  const results: Array<{
    id: string;
    step: Step;
    ok: boolean;
    detail: string;
  }> = [];
  let hardFailures = 0;

  try {
    cornerLoop: for (const corner of selected) {
      console.log(`── ${corner.id} ${corner.note ? `(${corner.note})` : ""}`);
      const failuresBeforeCorner = hardFailures;
      const projectName = generatedProjectName(corner.id);
      const directory = join(root, projectName);
      const generation = await run(
        BUN_EXECUTABLE,
        [
          CLI,
          "create",
          projectName,
          "--yes",
          "--no-install",
          "--runtime",
          "bun",
          "--cwd",
          root,
          ...corner.args,
        ],
        root,
      );
      if (terminationRequested) return;
      if (!generation.ok) {
        console.log("   generate:     FAIL");
        results.push({
          id: corner.id,
          step: "generate",
          ok: false,
          detail: generation.output,
        });
        hardFailures++;
        if (!generation.cleanupVerified) {
          workspaceCleanupSafe = false;
          break;
        }
        cleanupCorner(directory, keep);
        continue;
      }
      console.log("   generate:     ok");

      const install = await run(BUN_EXECUTABLE, ["run", "install:bootstrap"], directory);
      if (terminationRequested) return;
      console.log(`   install:      ${install.ok ? "ok" : "FAIL"}`);
      if (!install.ok) {
        results.push({
          id: corner.id,
          step: "install",
          ok: false,
          detail: install.output,
        });
        hardFailures++;
        if (!install.cleanupVerified) {
          workspaceCleanupSafe = false;
          break;
        }
        cleanupCorner(directory, keep);
        continue;
      }

      const nativeProblems = nativeScriptContract(directory, corner.nativePackageRoots ?? []);
      console.log(
        `   ${"native-contract".padEnd(13)} ${nativeProblems.length === 0 ? "ok" : "FAIL"}`,
      );
      if (nativeProblems.length > 0) {
        results.push({
          id: corner.id,
          step: "native-contract",
          ok: false,
          detail: nativeProblems.join("\n"),
        });
        hardFailures++;
        cleanupCorner(directory, keep);
        continue;
      }

      for (const step of ["format", "format:check"] as const) {
        const result = await run(BUN_EXECUTABLE, ["run", step], directory);
        if (terminationRequested) return;
        console.log(`   ${step.padEnd(13)} ${result.ok ? "ok" : "FAIL"}`);
        if (result.ok) continue;
        results.push({ id: corner.id, step, ok: false, detail: result.output });
        hardFailures++;
        if (!result.cleanupVerified) {
          workspaceCleanupSafe = false;
          break cornerLoop;
        }
        cleanupCorner(directory, keep);
        continue cornerLoop;
      }

      const architectureRun = await run(
        BUN_EXECUTABLE,
        [CLI, "check", "--cwd", directory, "--json"],
        root,
      );
      if (terminationRequested) return;
      const architecture = validateArchitectureResult(architectureRun);
      console.log(`   architecture: ${architecture.ok ? "ok" : "FAIL"}`);
      if (!architecture.ok) {
        results.push({
          id: corner.id,
          step: "architecture",
          ok: false,
          detail: architecture.detail,
        });
        hardFailures++;
        if (!architectureRun.cleanupVerified) {
          workspaceCleanupSafe = false;
          break;
        }
        cleanupCorner(directory, keep);
        continue;
      }

      for (const step of ["typecheck", "lint:all", "test"] as const) {
        const result = await run(BUN_EXECUTABLE, ["run", step], directory);
        if (terminationRequested) return;
        const label = result.ok ? "ok" : "FAIL";
        console.log(`   ${step.padEnd(13)} ${label}`);
        if (!result.ok) {
          results.push({
            id: corner.id,
            step,
            ok: false,
            detail: result.output,
          });
          hardFailures++;
          if (!result.cleanupVerified) {
            workspaceCleanupSafe = false;
            break cornerLoop;
          }
        }
      }
      for (const packageRoot of corner.nativePackageRoots ?? []) {
        if (packageRoot === ".") continue;
        for (const step of ["typecheck", "lint", "test"] as const) {
          const result = await run(BUN_EXECUTABLE, ["run", step], join(directory, packageRoot));
          if (terminationRequested) return;
          const label = `native:${packageRoot}:${step}`;
          console.log(`   ${label.padEnd(29)} ${result.ok ? "ok" : "FAIL"}`);
          if (result.ok) continue;
          results.push({
            id: corner.id,
            step: `native-${step}`,
            ok: false,
            detail: `${packageRoot}\n${result.output}`,
          });
          hardFailures++;
          if (!result.cleanupVerified) {
            workspaceCleanupSafe = false;
            break cornerLoop;
          }
        }
      }
      const authDeclarations = await verifyAuthDeclarations(directory);
      if (terminationRequested) return;
      if (authDeclarations) {
        console.log(`   ${"auth-declarations".padEnd(13)} ${authDeclarations.ok ? "ok" : "FAIL"}`);
        if (!authDeclarations.ok) {
          results.push({
            id: corner.id,
            step: "auth-declarations",
            ok: false,
            detail: authDeclarations.detail,
          });
          hardFailures++;
          if (!authDeclarations.cleanupVerified) {
            workspaceCleanupSafe = false;
            break cornerLoop;
          }
        }
      }
      if (corner.worker && hardFailures === failuresBeforeCorner) {
        let bindingCleanupSafe = true;
        workerChecks: {
          try {
            const syntheticServerOnlyValue = randomBytes(32).toString("base64url");
            let buildEnvironment: ReturnType<typeof workerBuildEnvironment>;
            try {
              pendingWorkerBindings = prepareWorkerFixtureBindings(directory, corner.worker);
              activeWorkerBindings = await pendingWorkerBindings;
              pendingWorkerBindings = undefined;
              if (terminationRequested) return;
              buildEnvironment = workerBuildEnvironment(
                directory,
                corner.worker,
                syntheticServerOnlyValue,
                activeWorkerBindings.capabilityFixtures,
              );
            } catch (error) {
              console.log(`   ${"worker-build-env".padEnd(20)} FAIL`);
              results.push({
                id: corner.id,
                step: "worker-build",
                ok: false,
                detail: error instanceof Error ? error.message : String(error),
              });
              hardFailures++;
              if (!activeWorkerBindings) {
                pendingWorkerBindings = undefined;
                bindingCleanupSafe = isRecord(error) && error.cleanupVerified === true;
                workspaceCleanupSafe &&= bindingCleanupSafe;
              }
              break workerChecks;
            }
            const workerRunOptions: RunOptions = {
              env: buildEnvironment.env,
              redact: buildEnvironment.serverOnlyValues,
            };
            const workerBuild = await run(
              BUN_EXECUTABLE,
              // Exercise the conventional build entrypoint. Multi-app monorepos
              // must produce the scanned Worker plus Expo and Electron artifacts;
              // web-only roots delegate this command to the same Worker wrapper.
              ["run", "build"],
              directory,
              workerRunOptions,
            );
            if (terminationRequested) return;
            console.log(`   ${"worker-build".padEnd(13)} ${workerBuild.ok ? "ok" : "FAIL"}`);
            if (!workerBuild.ok) {
              console.error(firstErrors(workerBuild.output));
              results.push({
                id: corner.id,
                step: "worker-build",
                ok: false,
                detail: workerBuild.output,
              });
              hardFailures++;
              if (!workerBuild.cleanupVerified) {
                bindingCleanupSafe = false;
                workspaceCleanupSafe = false;
              }
              break workerChecks;
            }

            const workerScan = verifyWorkerArtifactDoesNotContain(
              directory,
              corner.worker,
              buildEnvironment.serverOnlyValues,
            );
            console.log(`   ${"worker-secret-scan".padEnd(20)} ${workerScan.ok ? "ok" : "FAIL"}`);
            if (!workerScan.ok) {
              results.push({
                id: corner.id,
                step: "worker-secret-scan",
                ok: false,
                detail: workerScan.detail,
              });
              hardFailures++;
              break workerChecks;
            }

            const workerDryRun = await run(
              BUN_EXECUTABLE,
              ["run", "cloudflare:dry-run"],
              directory,
              workerRunOptions,
            );
            if (terminationRequested) return;
            console.log(`   ${"worker-dry-run".padEnd(20)} ${workerDryRun.ok ? "ok" : "FAIL"}`);
            if (!workerDryRun.ok) {
              results.push({
                id: corner.id,
                step: "worker-dry-run",
                ok: false,
                detail: workerDryRun.output,
              });
              hardFailures++;
              if (!workerDryRun.cleanupVerified) {
                bindingCleanupSafe = false;
                workspaceCleanupSafe = false;
              }
              break workerChecks;
            }

            const workerRuntime = await verifyWorkerRuntime(directory, corner.worker);
            if (terminationRequested) return;
            console.log(`   ${"worker-runtime".padEnd(20)} ${workerRuntime.ok ? "ok" : "FAIL"}`);
            if (!workerRuntime.ok) {
              console.error(firstErrors(workerRuntime.detail));
              results.push({
                id: corner.id,
                step: "worker-runtime",
                ok: false,
                detail: workerRuntime.detail,
              });
              hardFailures++;
              if (!workerRuntime.cleanupVerified) {
                bindingCleanupSafe = false;
                workspaceCleanupSafe = false;
              }
            }
          } finally {
            // The signal handler awaits the same preparation/restoration and
            // owns cleanup after proving the active process tree has stopped.
            if (!terminationRequested && activeWorkerBindings) {
              try {
                await activeWorkerBindings.restore(bindingCleanupSafe);
              } catch (error) {
                workspaceCleanupSafe = false;
                hardFailures++;
                console.error("   worker-environment   FAIL");
                results.push({
                  id: corner.id,
                  step: "worker-environment",
                  ok: false,
                  detail:
                    error instanceof Error ? error.message : "Worker binding restoration failed.",
                });
              }
              activeWorkerBindings = undefined;
            }
          }
        }
        if (!workspaceCleanupSafe) break cornerLoop;
      }
      if (terminationRequested) return;
      cleanupCorner(directory, keep);
    }

    console.log("\n──────── summary ────────");
    if (results.length === 0) {
      console.log(
        "All checked corners generated, installed, audited, formatted, passed architecture, typechecked, linted, tested, and completed applicable deployment gates cleanly.",
      );
    }
    for (const result of results) {
      console.log(`FAIL   ${result.id} :: ${result.step}`);
      console.log(firstErrors(result.detail));
    }

    if (hardFailures > 0) {
      console.error(`\n${hardFailures} failure(s).`);
      process.exitCode = 1;
      return;
    }
    console.log("\nNo failures.");
  } finally {
    if (terminationRequested) {
      // The signal handler owns verified descendant and workspace cleanup.
    } else {
      // Bun narrows Process.removeListener to its memoryPressure overload in
      // the ambient type, while runtime Process still inherits EventEmitter.
      EventEmitter.prototype.removeListener.call(process, "SIGINT", onSigint);
      EventEmitter.prototype.removeListener.call(process, "SIGTERM", onSigterm);
      if (!keep && workspaceCleanupSafe) rmSync(root, { recursive: true, force: true });
      else if (!keep) {
        console.error(`\nLeft projects in ${root} because descendant cleanup was unverified.`);
      } else console.log(`\nLeft projects in ${root}`);
    }

    if (corner.worker) {
      const appDir = existsSync(join(dir, "apps", "web")) ? join(dir, "apps", "web") : dir;
      const buildScript = corner.worker === "next" ? "build:worker" : "build";
      const buildEnv = readDevVars(appDir);
      const workerBuild = run("bun", ["run", buildScript], appDir, buildEnv);
      console.log(`   worker build: ${workerBuild.ok ? "ok" : "FAIL"}`);
      if (!workerBuild.ok) {
        results.push({
          id: corner.id,
          step: "worker-build",
          ok: false,
          expected: false,
          detail: workerBuild.output,
        });
        hardFailures++;
        continue;
      }

      const secret = buildEnv.BETTER_AUTH_SECRET ?? buildEnv.POSTGRES_PASSWORD ?? "";
      const leakedArtifact = findSecretInWorkerArtifacts(appDir, secret);
      console.log(`   secret scan:  ${leakedArtifact ? "FAIL" : "ok"}`);
      if (leakedArtifact) {
        results.push({
          id: corner.id,
          step: "worker-secret-scan",
          ok: false,
          expected: false,
          detail: `Secret-like local build value was embedded in ${leakedArtifact}`,
        });
        hardFailures++;
        continue;
      }

      const dryRun = run("bunx", ["wrangler", "deploy", "--dry-run"], appDir);
      console.log(`   worker dry:   ${dryRun.ok ? "ok" : "FAIL"}`);
      if (!dryRun.ok) {
        results.push({
          id: corner.id,
          step: "worker-dry-run",
          ok: false,
          expected: false,
          detail: dryRun.output,
        });
        hardFailures++;
      }
    }
  }
}

if (import.meta.main) await main();
