/**
 * Generate real projects, install and audit them, normalize and verify formatting, then
 * run architecture, typecheck, lint, the generated root test script, and
 * portable-auth checks.
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
 *   bun run test:generated -- --only next-monorepo,single-next
 *   bun run test:generated -- --keep    # leave the temp projects on disk
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runtime } from "../packages/versions/src/index.js";
import { terminateProcessTree } from "../tests/helpers/process-tree.js";

type ProjectCheck =
  | "format"
  | "format:check"
  | "audit"
  | "typecheck"
  | "lint:all"
  | "test"
  | "auth-declarations"
  | "native-contract"
  | `native-${"typecheck" | "lint" | "test"}`;
type Step = "generate" | "architecture" | "install" | ProjectCheck;

interface Corner {
  id: string;
  args: string[];
  note?: string;
  /** Package roots whose native type/lint/test scripts are blocking evidence. */
  nativePackageRoots?: readonly string[];
}

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

const REQUIRED_BUN_VERSION = runtime.bun;
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_CAPTURE_CHARS = 512 * 1024;

const CORNERS: Corner[] = [
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
];

/** Kept small on purpose: local smoke blocks on these; CI selects --all. */
const DEFAULT_CORNERS = ["next-monorepo", "single-next"];

const CLI = resolve(import.meta.dirname ?? ".", "../dist/cli.js");
const BUN_EXECUTABLE = process.execPath;
let activeChild: ChildProcess | undefined;
let activeTermination:
  | { readonly child: ChildProcess; readonly promise: Promise<void> }
  | undefined;
let terminationRequested = false;

export function generatedProjectName(cornerId: string): string {
  return `generated-${cornerId}`;
}

function ensureProcessTreeTerminated(child: ChildProcess): Promise<void> {
  if (activeTermination?.child === child) return activeTermination.promise;
  const promise = terminateProcessTree(child).finally(() => {
    if (activeTermination?.promise === promise) activeTermination = undefined;
  });
  activeTermination = { child, promise };
  return promise;
}

function parseArgs(argv: string[]): { ids: string[]; keep: boolean } {
  const keep = argv.includes("--keep");
  if (argv.includes("--all")) return { ids: CORNERS.map((corner) => corner.id), keep };
  const onlyIndex = argv.indexOf("--only");
  if (onlyIndex !== -1 && argv[onlyIndex + 1]) {
    return {
      ids: argv[onlyIndex + 1]
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
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
function run(cmd: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveRun) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let cleanupVerified = true;

    const child = spawn(cmd, args, {
      cwd,
      detached: process.platform !== "win32",
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    activeChild = child;

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString("utf8");
      stdout = appendTail(stdout, chunk);
    });
    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString("utf8");
      stderr = appendTail(stderr, chunk);
    });
    child.stdout?.pipe(process.stdout, { end: false });
    child.stderr?.pipe(process.stderr, { end: false });

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (activeChild === child) activeChild = undefined;
      resolveRun({
        ok: !timedOut && exitCode === 0,
        stdout,
        stderr,
        output: `${stdout}\n${stderr}`,
        exitCode,
        signal,
        timedOut,
        cleanupVerified,
      });
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      stderr = appendTail(stderr, `\nCommand timed out after ${COMMAND_TIMEOUT_MS}ms.\n`);
      void ensureProcessTreeTerminated(child)
        .catch((error) => {
          cleanupVerified = false;
          stderr = appendTail(
            stderr,
            `\nProcess-tree cleanup could not be verified: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        })
        .finally(() => finish(child.exitCode, child.signalCode));
    }, COMMAND_TIMEOUT_MS);
    timeoutTimer.unref();

    child.once("error", (error) => {
      if (timedOut) return;
      stderr = appendTail(stderr, `\nFailed to start ${cmd}: ${error.message}\n`);
      finish(null, null);
    });
    child.once("close", (exitCode, signal) => {
      // The root closing after a timeout is not proof that descendants exited.
      if (timedOut) return;
      finish(exitCode, signal);
    });
  });
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

function firstErrors(output: string, limit = 8): string {
  const lines = output
    .split("\n")
    .filter((line) =>
      /error TS|error:|invalid config|failed:|timed out|format|architecture command|architecture JSON/i.test(
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

  const { ids, keep } = parseArgs(process.argv.slice(2));
  const selected = CORNERS.filter((corner) => ids.includes(corner.id));
  const missing = ids.filter((id) => !CORNERS.some((corner) => corner.id === id));
  if (missing.length) {
    console.error(`Unknown corner(s): ${missing.join(", ")}`);
    console.error(`Available: ${CORNERS.map((corner) => corner.id).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const root = mkdtempSync(join(tmpdir(), "ghostinit-generated-"));
  const terminateForSignal = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    if (terminationRequested) return;
    terminationRequested = true;
    let cleanupVerified = true;
    const child = activeChild;
    if (child) {
      try {
        await ensureProcessTreeTerminated(child);
      } catch (error) {
        cleanupVerified = false;
        console.error(
          `Interrupted, but process-tree cleanup could not be verified: ${error instanceof Error ? error.message : String(error)}`,
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
  let workspaceCleanupSafe = true;

  try {
    cornerLoop: for (const corner of selected) {
      console.log(`── ${corner.id} ${corner.note ? `(${corner.note})` : ""}`);
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

      const install = await run(BUN_EXECUTABLE, ["install"], directory);
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

      const audit = await run(BUN_EXECUTABLE, ["run", "audit:dependencies"], directory);
      if (terminationRequested) return;
      console.log(`   ${"audit".padEnd(13)} ${audit.ok ? "ok" : "FAIL"}`);
      if (!audit.ok) {
        results.push({ id: corner.id, step: "audit", ok: false, detail: audit.output });
        hardFailures++;
        if (!audit.cleanupVerified) {
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
      cleanupCorner(directory, keep);
    }

    console.log("\n──────── summary ────────");
    if (results.length === 0) {
      console.log(
        "All checked corners generated, installed, audited, formatted, passed architecture, typechecked, linted, and tested cleanly.",
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
  }
}

if (import.meta.main) await main();
