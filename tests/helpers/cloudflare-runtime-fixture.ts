// @allow-long 510: isolated local-package harness exercises generated Worker scripts without network access
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { GenerationPlan } from "../../src/domain/generation/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type CreateInput = Parameters<typeof resolveCreateConfig>[0];

export type CloudflareFramework = "nextjs" | "tanstack-start";
export type CloudflareMode = "monorepo" | "single";

export interface CloudflarePlanOptions {
  readonly auth?: boolean;
  readonly database?: "convex" | "none";
  readonly framework?: CloudflareFramework;
  readonly mode?: CloudflareMode;
  readonly name?: string;
  readonly overrides?: Partial<CreateInput>;
}

export function cloudflarePlan(options: CloudflarePlanOptions = {}): GenerationPlan {
  const mode = options.mode ?? "single";
  const framework = options.framework ?? "nextjs";
  const database = options.database ?? "none";
  const resolution = resolveCreateConfig({
    name: options.name ?? `cloudflare-${mode}-${framework === "nextjs" ? "next" : "tanstack"}`,
    runtime: "bun",
    mode,
    framework,
    billing: [],
    features: [],
    database,
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "cloudflare",
    withAuth: options.auth ?? false,
    withApi: options.auth ?? false,
    withEmail: false,
    withAnalytics: false,
    withEve: false,
    withI18n: true,
    withPdf: false,
    withMessaging: false,
    withStorage: false,
    withNotifications: false,
    featureFlags: "none",
    withJobs: false,
    ...options.overrides,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  return buildProjectGenerationPlan(resolution.resolvedConfig, {
    desiredConfig: resolution.desiredConfig,
  });
}

export function generatedContent(plan: GenerationPlan, path: string): string {
  const generated = plan.files.find(({ physicalPath }) => physicalPath === path);
  if (!generated) throw new Error(`Missing generated file: ${path}`);
  return generated.content;
}

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content, { encoding: "utf8", mode: 0o755 });
}

const FAKE_DOTENV_SOURCE = `export function parse(input) {
  const result = {};
  for (const line of input.toString().split(/\\r?\\n/)) {
    const match = /^\\s*(?:export\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*)?$/.exec(line);
    if (!match?.[1]) continue;
    let value = (match[2] ?? "").trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\\\n/g, "\\n").replace(/\\\\r/g, "\\r").replace(/\\\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\\s+#.*$/, "").trim();
    }
    result[match[1]] = value;
  }
  return result;
}
`;

function fakeAdapterSource(framework: CloudflareFramework, artifactContent: string): string {
  const next = framework === "nextjs";
  return `import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const action = args[0] ?? "";
appendFileSync(resolve("events.jsonl"), JSON.stringify({
  tool: "adapter",
  action,
  args,
  devVarsExists: existsSync(".dev.vars"),
  environmentLockExists: existsSync(".dev.vars.ghostinit-build-lock"),
  env: {
    appName: process.env.APP_NAME ?? null,
    publicUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.VITE_APP_URL ?? null,
    undeclaredPublic: process.env.NEXT_PUBLIC_UNDECLARED_TRAP ?? process.env.VITE_UNDECLARED_TRAP ?? null,
    serverSecret: process.env.BETTER_AUTH_SECRET ?? process.env.SERVER_SECRET ?? null,
    unreviewed: process.env.UNREVIEWED_BUILD_SECRET ?? null,
    credential: process.env.CLOUDFLARE_API_TOKEN ?? null,
  },
}) + "\\n");
if ((action === "dev" || action === "preview") && existsSync(".delay-runtime-child")) {
  writeFileSync(".runtime-child-paused", "paused\\n");
  const delayMs = Math.min(5000, Math.max(1, Number(readFileSync(".delay-runtime-child", "utf8")) || 1400));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}
if (action === "build") {
  if (existsSync(".dev.vars")) {
    console.error("adapter observed .dev.vars");
    process.exit(71);
  }
  if (existsSync(".delay-adapter")) {
    writeFileSync(".adapter-paused", "paused\\n");
    const delayMs = Math.min(5000, Math.max(1, Number(readFileSync(".delay-adapter", "utf8")) || 1400));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    if (existsSync(".dev.vars")) {
      console.error("adapter observed .dev.vars after concurrent wrapper start");
      process.exit(71);
    }
  }
  if (existsSync(".fail-adapter")) process.exit(72);
  if (existsSync(".create-conflicting-dev-vars")) writeFileSync(".dev.vars", "CONFLICT=adapter-created\\n");
  ${
    next
      ? `mkdirSync(".open-next/assets", { recursive: true });
  writeFileSync(".open-next/assets/index.html", ${JSON.stringify(artifactContent || "safe-public")});
  if (!existsSync(".omit-open-next-cache")) {
    mkdirSync(".open-next/cache", { recursive: true });
    writeFileSync(".open-next/cache/cache-entry", "safe-cache");
  }`
      : `mkdirSync("dist/server", { recursive: true });
  writeFileSync("dist/server/wrangler.json", JSON.stringify({ name: "fixture-worker", main: "index.js", vars: {}, compatibility_date: "2026-08-01", compatibility_flags: ["nodejs_compat"] }));
  mkdirSync("dist/client", { recursive: true });
  writeFileSync("dist/client/index.html", ${JSON.stringify(artifactContent || "safe-public")});`
  }
}

`;
}

const FAKE_WRANGLER_SOURCE = `import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
appendFileSync(resolve("events.jsonl"), JSON.stringify({
  tool: "wrangler",
  args,
  dryRun,
  devVarsExists: existsSync(".dev.vars"),
  environmentLockExists: existsSync(".dev.vars.ghostinit-build-lock"),
  env: {
    appName: process.env.APP_NAME ?? null,
    publicUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.VITE_APP_URL ?? null,
    undeclaredPublic: process.env.NEXT_PUBLIC_UNDECLARED_TRAP ?? process.env.VITE_UNDECLARED_TRAP ?? null,
    serverSecret: process.env.BETTER_AUTH_SECRET ?? process.env.SERVER_SECRET ?? null,
    unreviewed: process.env.UNREVIEWED_BUILD_SECRET ?? null,
    credential: process.env.CLOUDFLARE_API_TOKEN ?? null,
    openNextDeploy: process.env.OPEN_NEXT_DEPLOY ?? null,
  },
}) + "\\n");
const outIndex = args.indexOf("--outdir");
if (outIndex >= 0) {
  const outdir = args[outIndex + 1];
  if (!outdir) process.exit(73);
  mkdirSync(outdir, { recursive: true });
  const body = existsSync(".leak-dry-run") ? (process.env.BETTER_AUTH_SECRET ?? "missing") : "safe-worker";
  writeFileSync(resolve(outdir, "worker.js"), body);
}
`;

function fakeConvexSource(publicKey: "NEXT_PUBLIC_CONVEX_URL" | "VITE_CONVEX_URL"): string {
  const publicSiteKey =
    publicKey === "NEXT_PUBLIC_CONVEX_URL" ? "NEXT_PUBLIC_CONVEX_SITE_URL" : "VITE_CONVEX_SITE_URL";
  return `import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
appendFileSync(resolve("convex-events.jsonl"), JSON.stringify({
  args,
  environmentLockExists: existsSync(".dev.vars.ghostinit-build-lock"),
  env: {
    authSecret: process.env.BETTER_AUTH_SECRET ?? null,
    deployKey: process.env.CONVEX_DEPLOY_KEY ?? null,
    deployment: process.env.CONVEX_DEPLOYMENT ?? null,
    httpsProxy: process.env.HTTPS_PROXY ?? null,
    unrelatedProcessSecret: process.env.UNRELATED_PROCESS_SECRET ?? null,
    unrelatedProjectSecret: process.env.BETTER_AUTH_SECRET ?? null,
    url: process.env.CONVEX_URL ?? null,
  },
}) + "\\n");
if (args[0] === "dev" || existsSync(".fake-convex-output-nonbootstrap") || existsSync(".fake-convex-exit-9")) {
  let lines = existsSync(".fake-convex-public-only") ? [
    "CONVEX_DEPLOYMENT=dev:fixture-worker",
    ${JSON.stringify(publicKey + "=https://fixture-worker.convex.cloud")},
    ${JSON.stringify(publicSiteKey + "=https://fixture-worker.convex.site")},
    "",
  ] : [
    "CONVEX_DEPLOYMENT=dev:fixture-worker",
    "CONVEX_URL=https://fixture-worker.convex.cloud",
    "CONVEX_SITE_URL=https://fixture-worker.convex.site",
    ${JSON.stringify(publicKey + "=https://fixture-worker.convex.cloud")},
    "",
  ];
  if (existsSync(".fake-convex-malformed")) lines.splice(1, 0, "this is not dotenv");
  if (existsSync(".fake-convex-conflicting-duplicate")) lines.splice(1, 0, "CONVEX_DEPLOYMENT=dev:other-worker");
  if (existsSync(".fake-convex-incomplete")) lines = lines.filter((line) => !line.includes("SITE_URL="));
  if (existsSync(".fake-convex-mismatched-site")) {
    lines = lines.map((line) => line.includes("SITE_URL=") ? line.slice(0, line.indexOf("=") + 1) + "https://different-worker.convex.site" : line);
  }
  if (existsSync(".fake-convex-mismatched-deployment")) {
    lines = lines.map((line) => line.startsWith("CONVEX_DEPLOYMENT=") ? "CONVEX_DEPLOYMENT=dev:different-worker" : line);
  }
  writeFileSync(".env.local", lines.join("\\n"));
}
if (args[0] === "dev" && !args.includes("--once") && existsSync(".delay-convex-dev")) {
  writeFileSync(".convex-dev-paused", "paused\\n");
  const delayMs = Math.min(5000, Math.max(1, Number(readFileSync(".delay-convex-dev", "utf8")) || 1400));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}
if (existsSync(".recreate-convex-env-late")) {
  const deadline = Date.now() + 10_000;
  while (existsSync(".env.local") || existsSync(".dev.vars.ghostinit-build-lock")) {
    if (Date.now() >= deadline) throw new Error("Fixture did not observe completed Convex startup");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  writeFileSync(".env.local", "USER_SECRET=late-user-owned-value\\n");
}
if (existsSync(".fake-convex-exit-9")) process.exit(9);
`;
}

function writePackage(
  root: string,
  directory: string,
  name: string,
  source: string,
  bin?: string,
): void {
  const manifest = {
    name,
    version: "0.0.0",
    private: true,
    type: "module",
    exports: "./index.mjs",
    ...(bin ? { bin: { [bin]: "./bin.mjs" } } : {}),
  };
  write(root, `${directory}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  write(root, `${directory}/index.mjs`, source);
  if (bin) {
    write(root, `${directory}/bin.mjs`, '#!/usr/bin/env bun\nawait import("./index.mjs");\n');
  }
}

function installLocalPackages(root: string, dependencies: Record<string, string>): void {
  write(
    root,
    "package.json",
    `${JSON.stringify(
      {
        name: "cloudflare-runtime-fixture",
        private: true,
        scripts: {
          "audit:lock": "bun scripts/audit-lock-fixture.mjs",
          "audit:dependencies": "bun scripts/audit-dependencies-fixture.mjs",
        },
        dependencies,
      },
      null,
      2,
    )}\n`,
  );
  // macOS clones installed files; keep vendor and installed bytes independent on every OS.
  const installed = spawnSync(
    process.execPath,
    ["install", "--offline", "--ignore-scripts", "--backend", "copyfile"],
    {
      cwd: root,
      encoding: "utf8",
      env: testEnvironment(),
      windowsHide: true,
    },
  );
  if (installed.status !== 0) {
    throw new Error(`Local fixture install failed: ${installed.stdout}${installed.stderr}`);
  }
}

export interface WorkerFixtureOptions {
  readonly artifactContent?: string;
  readonly devVars?: string;
  readonly framework?: CloudflareFramework;
  readonly plan?: GenerationPlan;
}

export interface RuntimeFixture {
  readonly cwd?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly root: string;
  readonly script: string;
}

export function createWorkerFixture(options: WorkerFixtureOptions = {}): RuntimeFixture {
  const framework = options.framework ?? "nextjs";
  const plan = options.plan ?? cloudflarePlan({ framework });
  const root = mkdtempSync(join(tmpdir(), "ghostinit-cloudflare-runtime-"));
  const monorepoScript = plan.files.some(
    ({ physicalPath }) => physicalPath === "apps/web/scripts/cloudflare.mjs",
  );
  const appDirectory = monorepoScript ? "apps/web" : ".";
  const appRoot = join(root, appDirectory);
  const adapterPackage = framework === "nextjs" ? "vendor/opennext" : "vendor/vite";
  const adapterName = framework === "nextjs" ? "@opennextjs/cloudflare" : "vite";
  const adapterBin = framework === "nextjs" ? "opennextjs-cloudflare" : "vite";
  const convexScript = plan.files.find(
    ({ physicalPath }) => physicalPath === "scripts/cloudflare-convex.mjs",
  )?.content;
  writePackage(root, "vendor/dotenv", "dotenv", FAKE_DOTENV_SOURCE);
  writePackage(
    root,
    adapterPackage,
    adapterName,
    fakeAdapterSource(framework, options.artifactContent ?? ""),
    adapterBin,
  );
  writePackage(root, "vendor/wrangler", "wrangler", FAKE_WRANGLER_SOURCE, "wrangler");
  if (convexScript) {
    writePackage(
      root,
      "vendor/convex",
      "convex",
      fakeConvexSource(framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL"),
      "convex",
    );
  }
  installLocalPackages(root, {
    dotenv: "file:vendor/dotenv",
    [adapterName]: `file:${adapterPackage}`,
    wrangler: "file:vendor/wrangler",
    ...(convexScript ? { convex: "file:vendor/convex" } : {}),
  });
  mkdirSync(appRoot, { recursive: true });
  if (monorepoScript) {
    writeFileSync(
      join(appRoot, "package.json"),
      `${JSON.stringify({ name: "fixture-web", private: true }, null, 2)}\n`,
      "utf8",
    );
  }
  const script = monorepoScript ? "apps/web/scripts/cloudflare.mjs" : "scripts/cloudflare.mjs";
  write(root, script, generatedContent(plan, script));
  const previewHelper = plan.files.find(({ physicalPath }) =>
    physicalPath.endsWith("/cloudflare-preview-config.mjs"),
  );
  if (previewHelper) write(root, previewHelper.physicalPath, previewHelper.content);
  if (convexScript) write(root, "scripts/cloudflare-convex.mjs", convexScript);
  write(
    root,
    "scripts/audit-lock-fixture.mjs",
    `import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".create-runtime-env-during-audit")) {
  writeFileSync(".env.production.local", "SERVER_SECRET=audit-race-secret\\n");
}
`,
  );
  write(
    root,
    "scripts/audit-dependencies-fixture.mjs",
    `import { writeFileSync } from "node:fs";
if (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY || process.env.CF_API_TOKEN || process.env.BETTER_AUTH_SECRET) {
  console.error("dependency audit received an application or deploy credential");
  process.exit(91);
}
writeFileSync(".dependency-audit-ran", "ok\\n");
`,
  );
  write(root, "scripts/require-bun-lock.mjs", "process.exit(0);\n");
  const devVars = options.devVars ?? "SERVER_SECRET=local-server-secret-value\n";
  write(
    root,
    ".env.example",
    "APP_NAME=GhostInit\nSERVER_SECRET=REPLACE_WITH_SECRET\nNEXT_PUBLIC_APP_URL=https://example.com\nVITE_APP_URL=https://example.com\n",
  );
  write(root, ".dev.vars", devVars);
  if (monorepoScript) write(root, "apps/web/.dev.vars", devVars);
  return {
    root,
    cwd: appRoot,
    script,
    environment: {
      SITE_URL: "https://worker.fixture.example",
      [framework === "nextjs" ? "NEXT_PUBLIC_APP_URL" : "VITE_APP_URL"]:
        "https://worker.fixture.example",
    },
  };
}

export function createConvexFixture(
  scriptContent: string,
  publicKey: "NEXT_PUBLIC_CONVEX_URL" | "VITE_CONVEX_URL",
): RuntimeFixture {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-cloudflare-convex-"));
  writePackage(root, "vendor/dotenv", "dotenv", FAKE_DOTENV_SOURCE);
  writePackage(root, "vendor/convex", "convex", fakeConvexSource(publicKey), "convex");
  installLocalPackages(root, {
    convex: "file:vendor/convex",
    dotenv: "file:vendor/dotenv",
  });
  write(root, "apps/web/package.json", '{"name":"web","private":true}\n');
  const script = "scripts/cloudflare-convex.mjs";
  write(root, script, scriptContent);
  return { root, script };
}

const PASSTHROUGH_ENVIRONMENT_KEYS = [
  "APPDATA",
  "BUN_INSTALL",
  "COMSPEC",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "WINDIR",
] as const;

export function testEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { CI: "1", NO_COLOR: "1" };
  for (const key of PASSTHROUGH_ENVIRONMENT_KEYS) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return { ...environment, ...extra };
}

export interface ScriptResult {
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

export function runFixture(
  fixture: RuntimeFixture,
  args: readonly string[],
  environment: NodeJS.ProcessEnv = {},
): ScriptResult {
  const result = spawnSync(process.execPath, [join(fixture.root, fixture.script), ...args], {
    cwd: fixture.cwd ?? fixture.root,
    encoding: "utf8",
    env: testEnvironment({ ...fixture.environment, ...environment }),
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export interface RuntimeEvent {
  readonly action?: string;
  readonly args: readonly string[];
  readonly devVarsExists?: boolean;
  readonly dryRun?: boolean;
  readonly environmentLockExists?: boolean;
  readonly env?: Readonly<Record<string, string | null>>;
  readonly tool?: "adapter" | "wrangler";
}

export function readEvents(root: string, name = "events.jsonl"): readonly RuntimeEvent[] {
  const rootPath = join(root, name);
  const path = existsSync(rootPath) ? rootPath : join(root, "apps/web", name);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RuntimeEvent);
}

export function destroyFixture(fixture: RuntimeFixture): void {
  const canonicalTemporaryRoot = join(tmpdir(), "ghostinit-cloudflare-");
  if (!fixture.root.startsWith(canonicalTemporaryRoot)) {
    throw new Error(`Refusing to remove unexpected fixture root: ${fixture.root}`);
  }
  rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5 });
}
