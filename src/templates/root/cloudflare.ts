// @allow-long 1900: Worker configs, hardened build orchestration, and Convex env migration form one audited deployment contract
import type { DeploymentProfile } from "./deploy.js";
import { cloudflareProcessHelpers } from "./cloudflare-process.js";
import { cloudflarePreviewConfigContent } from "./cloudflare-preview-config.js";
import { file, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import { createHash } from "node:crypto";
import { paddleCheckoutPolicyDeclaration } from "../billing/ui/paddle-csp.js";
import {
  isPublicPosthogProjectToken,
  selectedPosthogPublicKeys,
} from "../../lib/posthog-key-policy.js";

export const CLOUDFLARE_COMPATIBILITY_DATE = "2026-08-01";
export const OPENNEXT_AWS_WINDOWS_PATCH_PATH = `patches/@opennextjs+aws@${v.cloudflare["@opennextjs/aws"]}.patch`;
export const OPENNEXT_AWS_WINDOWS_PATCH_VERSION = v.cloudflare["@opennextjs/aws"];
export const OPENNEXT_AWS_WINDOWS_PATCH_KEY = `@opennextjs/aws@${OPENNEXT_AWS_WINDOWS_PATCH_VERSION}`;
// Reviewed immutable digest; dependency audit recomputes the emitted patch.
export const OPENNEXT_AWS_WINDOWS_PATCH_SHA256 =
  "8a3e9bc123a083789691009293f1be300d5e18152798103f976a418c2b2e9b4a";
export const OPENNEXT_AWS_PATCHED_COPY_TRACED_FILES_SHA256 =
  "f40520e0a246206bbc7851bc3d505cc67dc070da3eb4bba59c02655445364ce7";

function boundedCloudflareName(value: string): string {
  const normalized =
    value
      .replace(/[^a-z0-9-]/g, "-")
      .toLowerCase()
      .replace(/^-+|-+$/g, "") || "ghostinit-app";
  if (normalized.length <= 63) return normalized;
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 10);
  return `${normalized.slice(0, 52).replace(/-+$/g, "")}-${digest}`;
}

function workerName(projectName: string): string {
  return boundedCloudflareName(projectName);
}

function wranglerContent(projectName: string, profile: DeploymentProfile): string {
  const name = workerName(projectName);
  const cacheName = boundedCloudflareName(`${name}-cache`);
  const next = profile.framework === "nextjs";
  const config: Record<string, unknown> = {
    $schema: "node_modules/wrangler/config-schema.json",
    name,
    main: next ? ".open-next/worker.js" : "src/cloudflare-worker.ts",
    compatibility_date: CLOUDFLARE_COMPATIBILITY_DATE,
    compatibility_flags: next
      ? ["nodejs_compat", "global_fetch_strictly_public"]
      : ["nodejs_compat"],
    keep_vars: true,
    observability: { enabled: true },
  };
  if (next) {
    config.assets = { directory: ".open-next/assets", binding: "ASSETS" };
    config.services = [{ binding: "WORKER_SELF_REFERENCE", service: name }];
    config.r2_buckets = [
      {
        binding: "NEXT_INC_CACHE_R2_BUCKET",
        bucket_name: cacheName,
      },
    ];
    config.durable_objects = {
      bindings: [
        { name: "NEXT_CACHE_DO_QUEUE", class_name: "DOQueueHandler" },
        { name: "NEXT_TAG_CACHE_DO_SHARDED", class_name: "DOShardedTagCache" },
      ],
    };
    // Never rewrite an applied migration. Existing v1 deployments add the
    // sharded tag cache through v2; new deployments apply both in order.
    config.migrations = [
      { tag: "v1", new_sqlite_classes: ["DOQueueHandler"] },
      { tag: "v2", new_sqlite_classes: ["DOShardedTagCache"] },
    ];
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

function openNextConfigContent(): string {
  return `import { defineCloudflareConfig, type OpenNextConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";

const config: OpenNextConfig = {
  ...defineCloudflareConfig({
    incrementalCache: r2IncrementalCache,
    queue: doQueue,
    tagCache: doShardedTagCache({ baseShardSize: 12 }),
  }),
  // OpenNext owns the standalone/tracing build environment. This private
  // command avoids recursing into the public, audited Worker build wrapper.
  buildCommand: "bun run build:framework",
};

export default config;
`;
}

export const OPENNEXT_AWS_WINDOWS_PATCH_CONTENT = `diff --git a/dist/build/copyTracedFiles.js b/dist/build/copyTracedFiles.js
--- a/dist/build/copyTracedFiles.js
+++ b/dist/build/copyTracedFiles.js
@@ -33,6 +33,11 @@ const EXCLUDED_PACKAGES = [
     "next/dist/compiled/amphtml-validator",
 ];
 export function isExcluded(srcPath) {
+    const normalized = srcPath.replaceAll("\\\\", "/");
+    if (normalized.includes("/node_modules/.bun/sharp@") ||
+        normalized.includes("/node_modules/.bun/@img+")) {
+        return true;
+    }
     return EXCLUDED_PACKAGES.some((excluded) =>\x20
     // \`pnpm\` can create a symbolic link that points to the pnpm store folder
     // This will live under \`/node_modules/sharp\`. We need to handle this in our regex
@@ -225,7 +230,16 @@ File \${serverPath} does not exist
         }
         if (symlink) {
             try {
-                symlinkSync(symlink, to);
+                const windowsSourceTarget = process.platform === "win32"
+                    ? path.resolve(path.dirname(from), symlink)
+                    : symlink;
+                const type = process.platform === "win32" && statSync(windowsSourceTarget).isDirectory()
+                    ? "junction"
+                    : undefined;
+                const destinationTarget = type === "junction"
+                    ? path.resolve(path.dirname(to), symlink)
+                    : symlink;
+                symlinkSync(destinationTarget, to, type);
             }
             catch (e) {
                 if (e.code !== "EEXIST") {
`;

function workerContent(hasConvex: boolean, hasPaddle: boolean): string {
  const convexSourceDeclaration = hasConvex
    ? `const rawConvexUrl = import.meta.env.VITE_CONVEX_URL;
if (!rawConvexUrl) throw new Error("VITE_CONVEX_URL is required to build an exact Convex CSP");
const convexUrl = new URL(rawConvexUrl);
if (convexUrl.protocol !== "https:") throw new Error("VITE_CONVEX_URL must use HTTPS");
const convexConnectSources = " " + convexUrl.origin + " wss://" + convexUrl.host;
`
    : `const convexConnectSources = "";
`;
  return `import handler from "@tanstack/react-start/server-entry";
${hasPaddle ? paddleCheckoutPolicyDeclaration() : ""}

${convexSourceDeclaration}
const allowsDevelopmentDiagnostics = import.meta.env.DEV;
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (allowsDevelopmentDiagnostics ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' blob: data:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://us.i.posthog.com" + convexConnectSources + (allowsDevelopmentDiagnostics ? " ws: wss:" : ""),
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ") + ";";

const securityHeaders = {
  "Content-Security-Policy": contentSecurityPolicy,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
} as const;

export default {
  async fetch(...args: Parameters<typeof handler.fetch>): Promise<Response> {
    const response = await handler.fetch(...args);
    if (response.status === 101) return response;
    const secured = new Response(response.body, response);
    for (const [name, value] of Object.entries(securityHeaders)) secured.headers.set(name, value);
    ${hasPaddle ? 'if (new URL(args[0].url).pathname.replace(/\\/$/, "") === "/billing/paddle-checkout") secured.headers.set("Content-Security-Policy", paddleCheckoutContentSecurityPolicy(contentSecurityPolicy));' : ""}
    return secured;
  },
};
`;
}

function buildScriptContent(profile: DeploymentProfile): string {
  const framework = profile.framework;
  const monorepo = profile.mode === "monorepo";
  const publicAssets =
    framework === "nextjs" ? [".open-next/assets", ".open-next/cache"] : ["dist/client"];
  const requiredBuildVariables =
    profile.database === "convex"
      ? [
          "CONVEX_DEPLOYMENT",
          "CONVEX_URL",
          "CONVEX_SITE_URL",
          framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL",
        ]
      : [];
  if (profile.auth) requiredBuildVariables.push("BETTER_AUTH_SECRET", "BETTER_AUTH_URL");
  if (profile.notifications) requiredBuildVariables.push("NOTIFICATION_TOKEN_ENCRYPTION_KEY");
  if (profile.cache) {
    requiredBuildVariables.push("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN");
  }
  return `import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync, openSync, closeSync, fstatSync, ftruncateSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parse as parseDotenv } from "dotenv";

${framework === "tanstack-start" ? 'import { assertNoPreviewConfigRecovery, stagePreviewConfig } from "./cloudflare-preview-config.mjs";' : ""}

${cloudflareProcessHelpers()}

const EXPECTED_BUN_VERSION = ${JSON.stringify(v.runtime.bun)};
const FRAMEWORK = ${JSON.stringify(framework)};
const IS_MONOREPO = ${JSON.stringify(monorepo)};
const APP_ROOT = process.cwd();
const WORKSPACE_ROOT = ${monorepo ? 'resolve(APP_ROOT, "../..")' : "APP_ROOT"};
const ENVIRONMENT_ROOTS = [...new Set([WORKSPACE_ROOT, APP_ROOT])];
const DEPLOYABLE_ASSET_ROOTS = ${JSON.stringify(publicAssets)}.map((path) => resolve(APP_ROOT, path));
const DRY_RUN_ROOT = resolve(APP_ROOT, ".wrangler/ghostinit-dry-run");
const LOCK_GUARD = resolve(WORKSPACE_ROOT, "scripts/require-bun-lock.mjs");
const ENVIRONMENT_LOCK_PATH = resolve(WORKSPACE_ROOT, ".dev.vars.ghostinit-build-lock");
const MAX_ENVIRONMENT_LOCK_BYTES = 4096;
const MAX_SCANNED_FILE_BYTES = 128 * 1024 * 1024;
const MAX_SCANNED_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_SCANNED_FILES = 100_000;
const MAX_SCANNED_ENTRIES = 120_000;
const MAX_SCAN_DEPTH = 64;
const CONTROL_PLANE_KEYS = new Set([
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_RUNTIME_TOKEN", "CF_API_TOKEN",
  "CI_JOB_TOKEN", "CLOUDFLARE_API_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_EMAIL",
  "GH_TOKEN", "GITHUB_TOKEN", "NODE_AUTH_TOKEN", "NPM_TOKEN",
]);
const CLOUDFLARE_DEPLOY_KEYS = new Set([
  "CF_ACCOUNT_ID", "CF_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_EMAIL",
]);
const SYSTEM_BUILD_KEYS = new Set([
  "APPDATA", "BUN_INSTALL", "CI", "COLORTERM", "COMSPEC", "FORCE_COLOR", "HOME",
  "HOMEDRIVE", "HOMEPATH", "HTTP_PROXY", "HTTPS_PROXY", "LOCALAPPDATA", "NO_COLOR",
  "NO_PROXY", "NODE_ENV", "NODE_EXTRA_CA_CERTS", "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA", "SSL_CERT_DIR", "SSL_CERT_FILE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP",
  "TERM", "TMP", "TMPDIR", "USERPROFILE", "WINDIR", "WRANGLER_LOG",
]);
const REQUIRED_BUILD_VARIABLES = ${JSON.stringify(requiredBuildVariables)};
const PUBLIC_POSTHOG_KEYS = ${JSON.stringify(selectedPosthogPublicKeys(profile.framework, profile.apps))};
const isPublicPosthogProjectToken = ${isPublicPosthogProjectToken.toString()};
const PRODUCTION_ORIGIN_KEYS = [
  "SITE_URL",
  ${JSON.stringify(framework === "nextjs" ? "NEXT_PUBLIC_APP_URL" : "VITE_APP_URL")},
];

function fail(message) { throw new Error(message); }
const action = process.argv[2] ?? "build";
if (!["build", "deploy", "dev", "dry-run", "preview", "upload"].includes(action)) fail("Unknown Cloudflare action");
if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  fail("Cloudflare builds require Bun " + EXPECTED_BUN_VERSION + "; received " + (typeof Bun === "undefined" ? "a non-Bun runtime" : "Bun " + Bun.version));
}

function pathMetadata(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function isRuntimeDotenvFileName(name) {
  const normalized = name.toLowerCase();
  if (!/^\\.env(?:$|\\.)/.test(normalized)) return false;
  if (normalized === ".env.example" || normalized === ".env.template") return false;
  if (/^\\.env\\.(?:[^.]+\\.)+(?:example|template)$/.test(normalized)) return false;
  return true;
}

function assertNoRuntimeDotenvFiles() {
const unsafeEnvironmentFiles = [];
for (const root of ENVIRONMENT_ROOTS) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (isRuntimeDotenvFileName(entry.name)) {
      unsafeEnvironmentFiles.push(relative(WORKSPACE_ROOT, resolve(root, entry.name)).replaceAll("\\\\", "/"));
    }
  }
}
if (unsafeEnvironmentFiles.length > 0) {
  fail("Refusing Worker build because runtime .env files can be bundled. Move local values to .dev.vars and inject production build variables explicitly. Files: " + unsafeEnvironmentFiles.sort().join(", "));
}
}

const SAFE_PROJECT_BUILD_KEYS = new Set([
  "ANALYTICS_DISABLED", "APP_NAME", "NODE_ENV", "RUNTIME", "SITE_URL",
  ...REQUIRED_BUILD_VARIABLES,
]);
const DECLARED_PROJECT_KEYS = new Set();
for (const root of ENVIRONMENT_ROOTS) {
  const examplePath = resolve(root, ".env.example");
  const metadata = pathMetadata(examplePath);
  if (!metadata) continue;
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1024 * 1024) fail("Unsafe or oversized .env.example");
  for (const key of Object.keys(parseDotenv(readFileSync(examplePath)))) DECLARED_PROJECT_KEYS.add(key.toUpperCase());
}
const buildEnvironment = {};
for (const [key, value] of Object.entries(process.env)) {
  const normalizedKey = key.toUpperCase();
  const publicBuildValue = /^(?:NEXT_PUBLIC_|VITE_)/.test(normalizedKey);
  if ((SYSTEM_BUILD_KEYS.has(normalizedKey) || SAFE_PROJECT_BUILD_KEYS.has(normalizedKey) || (publicBuildValue && DECLARED_PROJECT_KEYS.has(normalizedKey))) && !CONTROL_PLANE_KEYS.has(normalizedKey)) buildEnvironment[key] = value;
}
if (process.env.GHOSTINIT_WORKER_SECURITY_TEST === "1" && process.env.GHOSTINIT_WORKER_TEST_SECRET) {
  buildEnvironment.GHOSTINIT_WORKER_SECURITY_TEST = "1";
  buildEnvironment.GHOSTINIT_WORKER_TEST_SECRET = process.env.GHOSTINIT_WORKER_TEST_SECRET;
}
// Trust/patch/vulnerability tooling and publication receive only host/process
// plumbing. Build-time application secrets stay confined to the framework
// build and artifact scan.
const toolEnvironment = {};
for (const [key, value] of Object.entries(process.env)) {
  const normalizedKey = key.toUpperCase();
  if (SYSTEM_BUILD_KEYS.has(normalizedKey)) toolEnvironment[key] = value;
}
const deploymentEnvironment = { ...toolEnvironment };
for (const [key, value] of Object.entries(process.env)) {
  if (CLOUDFLARE_DEPLOY_KEYS.has(key.toUpperCase())) deploymentEnvironment[key] = value;
}
function isExampleValue(value) {
  return value.includes("REPLACE_WITH_") || new Set([
    "dev:example-123", "https://example-123.convex.cloud", "https://example-123.convex.cloud/",
    "https://example-123.convex.site", "https://example-123.convex.site/",
    "https://example.com", "https://example.com/",
  ]).has(value);
}
for (const key of REQUIRED_BUILD_VARIABLES) {
  const value = buildEnvironment[key];
  if (!value || isExampleValue(value)) fail("Missing required Cloudflare build variable: " + key);
}

function productionOrigin(key) {
  const value = buildEnvironment[key];
  if (!value || isExampleValue(value)) fail("Missing required Cloudflare production origin: " + key);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("Invalid Cloudflare production origin: " + key);
  }
  const hostname = parsed.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" || hostname === "[::]" || hostname === "[::1]" ||
    /^127(?:\\.|$)/.test(hostname) || /^\\[::ffff:(?:127\\.|7f[0-9a-f]{2}:)/.test(hostname);
  if (
    parsed.protocol !== "https:" || loopback || parsed.username || parsed.password ||
    parsed.search || parsed.hash || (parsed.pathname !== "" && parsed.pathname !== "/")
  ) {
    fail("Cloudflare production origin must be a non-loopback HTTPS origin without credentials, a path, query, or fragment: " + key);
  }
  return parsed;
}
if (["build", "deploy", "dry-run", "upload"].includes(action)) {
  const origins = PRODUCTION_ORIGIN_KEYS.map(productionOrigin);
  const applicationOrigin = origins[0].origin;
  if (origins.some((origin) => origin.origin !== applicationOrigin)) {
    fail("SITE_URL and the framework application URL must use the same production origin");
  }
  ${profile.auth ? 'if (productionOrigin("BETTER_AUTH_URL").origin !== applicationOrigin) fail("BETTER_AUTH_URL must match the Cloudflare application origin");' : ""}
  ${
    profile.database === "convex"
      ? `const convexOrigin = productionOrigin("CONVEX_URL");
  const publicConvexOrigin = productionOrigin(${JSON.stringify(
    framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL",
  )});
  const convexSiteOrigin = productionOrigin("CONVEX_SITE_URL");
  const convexTenant = convexOrigin.hostname.slice(0, -".convex.cloud".length);
  if (!convexOrigin.hostname.endsWith(".convex.cloud") || !convexTenant || convexTenant.startsWith("-") || convexTenant.endsWith("-") || [...convexTenant].some((character) => !"abcdefghijklmnopqrstuvwxyz0123456789-".includes(character))) fail("CONVEX_URL must use an exact tenant .convex.cloud origin");
  if (publicConvexOrigin.origin !== convexOrigin.origin) fail("The public Convex URL must match CONVEX_URL exactly");
  if (convexSiteOrigin.hostname !== convexTenant + ".convex.site") fail("CONVEX_SITE_URL must match the CONVEX_URL tenant exactly");`
      : ""
  }
  ${profile.cache ? 'productionOrigin("UPSTASH_REDIS_REST_URL");' : ""}
}

function run(args, cwd = APP_ROOT, env = buildEnvironment) {
  const result = spawnSync(process.execPath, args, { cwd, env, shell: false, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Cloudflare subprocess failed with exit code " + (result.status ?? 1));
}

function environmentLockProcessIsActive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    // EPERM and platform-specific probe failures are treated as active. A
    // false positive only requires explicit recovery; a false negative could
    // disclose a concurrently hidden environment.
    return true;
  }
}

function describeExistingEnvironmentLock() {
  const metadata = pathMetadata(ENVIRONMENT_LOCK_PATH);
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_ENVIRONMENT_LOCK_BYTES) {
    return "Unsafe Worker environment lock exists; after confirming no wrapper or descendant is running, remove .dev.vars.ghostinit-build-lock and retry";
  }
  let record;
  try {
    record = JSON.parse(readFileSync(ENVIRONMENT_LOCK_PATH, "utf8"));
  } catch {
    return "Unreadable Worker environment lock exists; after confirming no wrapper or descendant is running, remove .dev.vars.ghostinit-build-lock and retry";
  }
  const active = environmentLockProcessIsActive(record?.pid);
  if (active === false && record?.child) {
    return "A Worker environment lock retains a runtime child identity; verify the recorded child PID and process group have stopped before removing the lock";
  }
  return active === false
    ? "A stale Worker environment lock remains after an interrupted wrapper; after confirming the wrapper and recorded child/process group have stopped, remove .dev.vars.ghostinit-build-lock and retry to recover hidden values"
    : "Another Cloudflare wrapper is already using the local environment; retry after it exits";
}

function acquireEnvironmentLifecycleLock(mode = "writer") {
  assertNoProcessRecovery(WORKSPACE_ROOT);
  ${framework === "tanstack-start" ? "assertNoPreviewConfigRecovery(WORKSPACE_ROOT);" : ""}
  const record = { version: 1, pid: process.pid, owner: randomUUID(), mode };
  let owner = JSON.stringify(record) + "\\n";
  let lockFd;
  try {
    lockFd = openSync(ENVIRONMENT_LOCK_PATH, "wx+", 0o600);
    writeFileSync(lockFd, owner, "utf8");
  } catch (error) {
    if (lockFd !== undefined) closeSync(lockFd);
    if (error?.code === "EEXIST") throw new Error(describeExistingEnvironmentLock());
    throw error;
  }
  const lockIdentity = fstatSync(lockFd);
  const workspaceIdentity = lstatSync(realpathSync.native(WORKSPACE_ROOT));
  let released = false;
  let retained = false;
  const verify = () => {
    const workspace = lstatSync(realpathSync.native(WORKSPACE_ROOT));
    if (!workspace.isDirectory() || workspace.isSymbolicLink() || ["dev", "ino", "birthtimeMs"].some((key) => workspace[key] !== workspaceIdentity[key])) throw new Error("Worker environment workspace ownership changed");
    const metadata = pathMetadata(ENVIRONMENT_LOCK_PATH);
    if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_ENVIRONMENT_LOCK_BYTES || ["dev", "ino", "birthtimeMs"].some((key) => metadata[key] !== lockIdentity[key])) {
      throw new Error("Worker environment lock changed while the Cloudflare wrapper was running");
    }
    if (readFileSync(ENVIRONMENT_LOCK_PATH, "utf8") !== owner) {
      throw new Error("Worker environment lock ownership changed while the Cloudflare wrapper was running");
    }
  };
  const release = () => {
    if (released || retained) return;
    verify();
    const captured = resolve(WORKSPACE_ROOT, ".dev.vars.ghostinit-process-recovery-lock-" + randomUUID());
    renameSync(ENVIRONMENT_LOCK_PATH, captured);
    const actual = lstatSync(captured);
    if (!actual.isFile() || actual.isSymbolicLink() || ["dev", "ino", "birthtimeMs"].some((key) => actual[key] !== lockIdentity[key]) || readFileSync(captured, "utf8") !== owner) {
      retained = true;
      throw new Error("Worker environment lock changed during release; captured ownership evidence was retained");
    }
    unlinkSync(captured);
    closeSync(lockFd);
    released = true;
  };
  release.retain = () => { retained = true; };
  release.assertOwned = verify;
  release.trackChild = (child) => {
    verify();
    record.child = childProcessIdentity(child);
    const updated = JSON.stringify(record) + "\\n";
    ftruncateSync(lockFd, 0);
    writeSync(lockFd, updated, 0, "utf8");
    owner = updated;
  };
  return release;
}

function recoverHiddenLocalRuntimeEnvironment() {
  const candidates = [];
  for (const root of ENVIRONMENT_ROOTS) {
    const source = resolve(root, ".dev.vars");
    const backup = resolve(root, ".dev.vars.ghostinit-build-hidden");
    const sourceMetadata = pathMetadata(source);
    const backupMetadata = pathMetadata(backup);
    if (sourceMetadata && backupMetadata) fail("Both .dev.vars and its build recovery file exist");
    if (!backupMetadata) continue;
    if (!backupMetadata.isFile() || backupMetadata.isSymbolicLink() || backupMetadata.size > 1024 * 1024) {
      fail("Refusing unsafe .dev.vars build recovery input");
    }
    candidates.push({ source, backup });
  }
  const recovered = [];
  try {
    for (const entry of candidates) {
      if (pathMetadata(entry.source) || !pathMetadata(entry.backup)) throw new Error("Local environment changed during Worker recovery");
      renameSync(entry.backup, entry.source);
      recovered.push(entry);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of [...recovered].reverse()) {
      try {
        if (!pathMetadata(entry.source) || pathMetadata(entry.backup)) throw new Error("Worker environment recovery changed during rollback");
        renameSync(entry.source, entry.backup);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Worker environment recovery failed and rollback was incomplete");
    }
    throw error;
  }
}

async function runLongLived(args, cwd, env, stopOnStdinEnd, onCleanupVerified) {
  const child = spawn(process.execPath, args, {
    cwd, env, detached: process.platform !== "win32", shell: false,
    stdio: stopOnStdinEnd ? ["ignore", "inherit", "inherit"] : "inherit", windowsHide: true,
  });
  const completion = new Promise((resolveCompletion) => {
    child.once("error", (error) => resolveCompletion({ error }));
    child.once("exit", (code, signal) => resolveCompletion({ code, signal }));
  });
  let requestedSignal = null;
  let requestedStop = false;
  let inputFailed = false;
  let terminationPromise = null;
  let notifyTermination;
  const interrupted = new Promise((resolveInterrupted) => { notifyTermination = resolveInterrupted; });
  const requestTermination = (signal, fromInput = false) => {
    requestedStop = true;
    if (!fromInput) requestedSignal ??= signal;
    terminationPromise ??= terminateSupervisedProcessTree(child, completion, signal)
      .then(() => null, (error) => error);
    notifyTermination();
  };
  const onInterrupt = () => requestTermination("SIGINT");
  const onTerminate = () => requestTermination("SIGTERM");
  const onInputEnd = () => requestTermination("SIGTERM", true);
  const onInputError = () => { inputFailed = true; onInputEnd(); };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  if (stopOnStdinEnd) {
    process.stdin.once("end", onInputEnd);
    process.stdin.once("error", onInputError);
    process.stdin.resume();
  }
  try {
    releaseEnvironmentLifecycleLock.trackChild(child);
    captureProcessTree(child);
    releaseEnvironmentLifecycleLock.trackChild(child);
    const terminal = await Promise.race([completion, interrupted]);
    const terminationError = await (terminationPromise ??= terminateSupervisedProcessTree(child, completion)
      .then(() => null, (error) => error));
    if (terminationError) throw terminationError;
    onCleanupVerified?.();
    if (inputFailed) throw new Error("Worker automation input failed during shutdown");
    if (requestedSignal) {
      process.exitCode = requestedSignal === "SIGINT" ? 130 : 143;
      return;
    }
    if (requestedStop) return;
    if (terminal?.error) throw terminal.error;
    if (terminal?.signal) throw new Error("Cloudflare subprocess terminated by signal " + terminal.signal);
    if (terminal?.code !== 0) throw new Error("Cloudflare subprocess failed with exit code " + (terminal?.code ?? 1));
  } catch (error) {
    const terminationError = await (terminationPromise ??= terminateSupervisedProcessTree(child, completion)
      .then(() => null, (failure) => failure));
    if (terminationError) {
      releaseEnvironmentLifecycleLock.retain();
      child.unref();
      throw new Error("Cloudflare process-tree cleanup could not be verified; the environment lock and child identity were retained", { cause: new AggregateError([error, terminationError]) });
    }
    onCleanupVerified?.();
    throw error;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    if (stopOnStdinEnd) {
      process.stdin.off("end", onInputEnd);
      process.stdin.off("error", onInputError);
      process.stdin.pause();
    }
  }
}

function hideLocalRuntimeEnvironment() {
  const candidates = [];
  const hidden = [];
  for (const root of ENVIRONMENT_ROOTS) {
    const source = resolve(root, ".dev.vars");
    const backup = resolve(root, ".dev.vars.ghostinit-build-hidden");
    const sourceMetadata = pathMetadata(source);
    const backupMetadata = pathMetadata(backup);
    if (backupMetadata) fail("Unexpected hidden .dev.vars while the Worker environment lock is owned");
    if (!sourceMetadata) continue;
    if (!sourceMetadata.isFile() || sourceMetadata.isSymbolicLink()) fail("Refusing unsafe .dev.vars build input");
    candidates.push({ source, backup });
  }
  const restore = () => {
    const restorationErrors = [];
    for (const entry of [...hidden].reverse()) {
      try {
        if (pathMetadata(entry.source) || !pathMetadata(entry.backup)) throw new Error("Local environment changed while the Worker build was running");
        renameSync(entry.backup, entry.source);
      } catch (error) {
        restorationErrors.push(error);
      }
    }
    if (restorationErrors.length > 0) {
      throw new AggregateError(
        [new Error("Could not restore every hidden .dev.vars file"), ...restorationErrors],
        "Could not restore every hidden .dev.vars file",
      );
    }
  };
  try {
    for (const entry of candidates) {
      renameSync(entry.source, entry.backup);
      hidden.push(entry);
    }
  } catch (error) {
    try {
      restore();
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], "Could not roll back partial .dev.vars hiding");
    }
    throw error;
  }
  return restore;
}

function withHiddenLocalRuntimeEnvironment(callback) {
  const restore = hideLocalRuntimeEnvironment();
  try {
    callback();
  } catch (error) {
    try {
      restore();
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        "Cloudflare subprocess failed and hidden .dev.vars restoration was incomplete",
      );
    }
    throw error;
  }
  restore();
}

function localEnvironmentEntries() {
  const environments = [];
  for (const root of ENVIRONMENT_ROOTS) {
    const source = resolve(root, ".dev.vars");
    const backup = resolve(root, ".dev.vars.ghostinit-build-hidden");
    const sourceMetadata = pathMetadata(source);
    const backupMetadata = pathMetadata(backup);
    if (backupMetadata) fail("Hidden .dev.vars was not recovered before local environment loading");
    if (!sourceMetadata) continue;
    if (!sourceMetadata.isFile() || sourceMetadata.isSymbolicLink() || sourceMetadata.size > 1024 * 1024) fail("Unsafe or oversized .dev.vars");
    environments.push({ path: source, fields: Object.entries(parseDotenv(readFileSync(source))).sort(([left], [right]) => left.localeCompare(right)) });
  }
  if (IS_MONOREPO && environments.length === 1) {
    fail("Root and web .dev.vars must either both exist or both be absent");
  }
  if (environments.length > 1 && JSON.stringify(environments[0].fields) !== JSON.stringify(environments[1].fields)) {
    fail("Root and web .dev.vars files diverged; reconcile them before building");
  }
  return environments[0]?.fields ?? [];
}

async function executeCloudflareAction() {
assertNoRuntimeDotenvFiles();
const LOCAL_ENVIRONMENT_ENTRIES = Object.freeze(localEnvironmentEntries().map((entry) => Object.freeze([...entry])));
for (const [key] of LOCAL_ENVIRONMENT_ENTRIES) {
  const normalizedKey = key.toUpperCase();
  if (!DECLARED_PROJECT_KEYS.has(normalizedKey)) fail("Undeclared key in .dev.vars: " + key);
  if (CONTROL_PLANE_KEYS.has(normalizedKey) || CLOUDFLARE_DEPLOY_KEYS.has(normalizedKey)) fail("Control-plane credential is not allowed in .dev.vars: " + key);
}

function localRuntimeEnvironment() {
  const environment = { ...buildEnvironment };
  for (const [key, value] of LOCAL_ENVIRONMENT_ENTRIES) environment[key] = value;
  return environment;
}

function addSecretValue(values, value, key) {
  if (!value || values.has(value)) return;
  values.set(value, key);
  const serialized = JSON.stringify(value).slice(1, -1);
  if (serialized !== value && !values.has(serialized)) values.set(serialized, key);
}

function decodedCredentialPart(value, key, strict) {
  try {
    return decodeURIComponent(value);
  } catch {
    if (strict) fail("Invalid percent encoding in credential-bearing URL: " + key);
    return value;
  }
}

function addCredentialUrlSecrets(values, key, value, strict = false) {
  if (!value) return;
  let credentialUrl;
  try {
    credentialUrl = new URL(value);
  } catch {
    if (strict && value.includes("@")) fail("Invalid credential-bearing proxy URL in " + key);
    return;
  }
  if (!credentialUrl.username && !credentialUrl.password) return;
  addSecretValue(values, value, key);
  addSecretValue(values, credentialUrl.href, key);
  const encodedUsername = credentialUrl.username;
  const encodedPassword = credentialUrl.password;
  const encodedUserinfo = encodedUsername + (encodedPassword ? ":" + encodedPassword : "");
  const decodedUsername = decodedCredentialPart(encodedUsername, key, strict);
  const decodedPassword = decodedCredentialPart(encodedPassword, key, strict);
  const decodedUserinfo = decodedUsername + (decodedPassword ? ":" + decodedPassword : "");
  for (const part of [encodedUsername, encodedPassword, encodedUserinfo, decodedUsername, decodedPassword, decodedUserinfo]) {
    if (part.length >= 8) addSecretValue(values, part, key);
  }
  addSecretValue(values, credentialUrl.protocol + "//" + decodedUserinfo + "@" + credentialUrl.host + credentialUrl.pathname + credentialUrl.search + credentialUrl.hash, key);
}

function secretValues(environment = buildEnvironment) {
  const values = new Map();
  const entries = [...Object.entries(environment), ...LOCAL_ENVIRONMENT_ENTRIES];
  for (const [key, value] of entries) {
    if (isPublicPosthogProjectToken(key, value, PUBLIC_POSTHOG_KEYS, DECLARED_PROJECT_KEYS, entries)) continue;
    const normalizedKey = key.toUpperCase();
    const proxyUrl = normalizedKey === "HTTP_PROXY" || normalizedKey === "HTTPS_PROXY";
    addCredentialUrlSecrets(values, key, value, proxyUrl);
    if (CLOUDFLARE_DEPLOY_KEYS.has(normalizedKey) || /(?:^|_)(?:DATABASE|POSTGRES|REDIS|MYSQL|MARIADB|MONGODB|MONGO|AMQP|BROKER|CONNECTION)(?:_[A-Z0-9]+)*_(?:URL|URI)$/.test(normalizedKey)) {
      if (value && !value.includes("REPLACE_WITH_")) addSecretValue(values, value, key);
      continue;
    }
    if (!value || value.length < 12 || value.includes("REPLACE_WITH_")) continue;
    if (/^(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_)/.test(normalizedKey) || /(?:PUBLIC|PUBLISHABLE)/.test(normalizedKey)) continue;
    if (!/(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|COOKIE|SIGNATURE|PRIVATE|API_KEY)/.test(normalizedKey) && !/(?:^|_)KEY(?:_|$)/.test(normalizedKey)) continue;
    addSecretValue(values, value, key);
  }
  return values;
}

function scan(root, values, state, depth = 0) {
  if (depth > MAX_SCAN_DEPTH) fail("Worker artifact exceeds the bounded secret scanner depth");
  const metadata = lstatSync(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("Worker artifact root is not a regular directory");
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    const entryMetadata = lstatSync(path);
    state.entries += 1;
    if (state.entries > MAX_SCANNED_ENTRIES) fail("Worker artifacts exceed the bounded secret scanner entry count");
    if (entryMetadata.isSymbolicLink()) fail("Worker artifact contains an unscannable symbolic link: " + relative(APP_ROOT, path));
    if (entryMetadata.isDirectory()) { scan(path, values, state, depth + 1); continue; }
    if (!entryMetadata.isFile()) fail("Worker artifact contains an unsupported special entry: " + relative(APP_ROOT, path));
    state.files += 1;
    state.bytes += entryMetadata.size;
    if (state.files > MAX_SCANNED_FILES) fail("Worker artifacts exceed the bounded secret scanner file count");
    if (entryMetadata.size > MAX_SCANNED_FILE_BYTES) fail("Worker artifact exceeds the bounded secret scanner per-file size: " + relative(APP_ROOT, path));
    if (state.bytes > MAX_SCANNED_TOTAL_BYTES) fail("Worker artifacts exceed the bounded secret scanner aggregate size");
    const bytes = readFileSync(path);
    for (const [value, key] of values) {
      if (bytes.includes(Buffer.from(value, "utf8"))) fail("Worker artifact contains the server-only value from " + key + " in " + relative(APP_ROOT, path));
    }
  }
}

function assertSafeDryRunRoot() {
  const appReal = realpathSync(APP_ROOT);
  const parent = resolve(APP_ROOT, ".wrangler");
  if (existsSync(parent)) {
    const parentMetadata = lstatSync(parent);
    if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) fail("Refusing unsafe .wrangler output parent");
    const parentRelative = relative(appReal, realpathSync(parent));
    if (parentRelative.startsWith(".." + sep) || isAbsolute(parentRelative)) fail("Wrangler output parent escapes the application root");
  }
  if (!existsSync(DRY_RUN_ROOT)) return;
  const outputMetadata = lstatSync(DRY_RUN_ROOT);
  if (!outputMetadata.isDirectory() || outputMetadata.isSymbolicLink()) fail("Refusing unsafe Cloudflare dry-run output path");
  const outputRelative = relative(appReal, realpathSync(DRY_RUN_ROOT));
  if (outputRelative.startsWith(".." + sep) || isAbsolute(outputRelative)) fail("Cloudflare dry-run output escapes the application root");
}

buildEnvironment.NODE_ENV = action === "dev" ? "development" : "production";
toolEnvironment.NODE_ENV = buildEnvironment.NODE_ENV;
deploymentEnvironment.NODE_ENV = buildEnvironment.NODE_ENV;
const requestedArguments = process.argv.slice(3);
if (requestedArguments[0] === "--") requestedArguments.shift();
const stopControlCount = requestedArguments.filter((argument) => argument === "--ghostinit-stop-on-stdin-end").length;
if (stopControlCount > 1 || (stopControlCount && !["dev", "preview"].includes(action))) {
  fail("The Worker stdin stop control is available once for dev or preview only");
}
const stopOnStdinEnd = stopControlCount === 1;
const forwarded = requestedArguments.filter((argument) => argument !== "--ghostinit-stop-on-stdin-end");
const allowed = new Set(
  action === "dev"
    ? FRAMEWORK === "nextjs" ? ["hostname", "port"] : ["host", "port"]
    : action === "preview"
      ? FRAMEWORK === "nextjs" ? ["ip", "port"] : ["host", "port"]
      : [],
);
for (let index = 0; index < forwarded.length; index += 1) {
  const argument = forwarded[index];
  const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argument);
  if (!match?.[1] || !allowed.has(match[1])) fail("Unsupported forwarded Cloudflare argument" + (match?.[1] ? ": --" + match[1] : ""));
  const value = match[2] ?? forwarded[++index];
  if (!value || value.startsWith("--") || !/^[A-Za-z0-9_.:[\\]-]+$/.test(value)) fail("Invalid value for Cloudflare option --" + match[1]);
  if (match[1] === "port" && (!/^\\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) fail("Cloudflare preview port is out of range");
}
const dryRunRelative = relative(APP_ROOT, DRY_RUN_ROOT);
if (!dryRunRelative || dryRunRelative.startsWith(".." + sep) || isAbsolute(dryRunRelative)) fail("Unsafe Cloudflare dry-run output path");
run([LOCK_GUARD], WORKSPACE_ROOT, toolEnvironment);
run(["run", "audit:lock"], WORKSPACE_ROOT, toolEnvironment);
if (action === "deploy" || action === "upload") {
  // Production publication must verify the installed reviewed patches and
  // block unreviewed HIGH/CRITICAL advisories, not only attest bun.lock.
  run(["run", "audit:dependencies"], WORKSPACE_ROOT, toolEnvironment);
}
if (action === "dev") {
  assertNoRuntimeDotenvFiles();
  await runLongLived(FRAMEWORK === "nextjs" ? [resolve(APP_ROOT, "node_modules/next/dist/bin/next"), "dev", ...forwarded] : ["x", "--no-install", "vite", "dev", ...forwarded], APP_ROOT, localRuntimeEnvironment(), stopOnStdinEnd);
  return;
}
assertNoRuntimeDotenvFiles();
withHiddenLocalRuntimeEnvironment(() => {
  run(["x", "--no-install", FRAMEWORK === "nextjs" ? "opennextjs-cloudflare" : "vite", "build"]);
});
assertSafeDryRunRoot();
rmSync(DRY_RUN_ROOT, { recursive: true, force: true });
const scanEnvironment =
  action === "deploy" || action === "upload"
    ? { ...buildEnvironment, ...deploymentEnvironment }
    : buildEnvironment;
const dryRunEnvironment = FRAMEWORK === "nextjs" ? { ...buildEnvironment, OPEN_NEXT_DEPLOY: "true" } : buildEnvironment;
const secrets = secretValues(scanEnvironment);
assertNoRuntimeDotenvFiles();
withHiddenLocalRuntimeEnvironment(() => {
  run(["x", "--no-install", "wrangler", "deploy", "--dry-run", "--outdir", DRY_RUN_ROOT], APP_ROOT, dryRunEnvironment);
});
const scanState = { entries: 0, files: 0, bytes: 0 };
scan(DRY_RUN_ROOT, secrets, scanState);
for (const root of DEPLOYABLE_ASSET_ROOTS) {
  if (!existsSync(root)) fail("Expected deployable asset root is missing: " + relative(APP_ROOT, root));
  scan(root, secrets, scanState);
}
if (action === "build" || action === "dry-run") return;
if (action === "preview") {
  assertNoRuntimeDotenvFiles();
  ${
    framework === "nextjs"
      ? 'await runLongLived(["x", "--no-install", "opennextjs-cloudflare", "preview", "--", ...forwarded], APP_ROOT, localRuntimeEnvironment(), stopOnStdinEnd);'
      : `const previewEnvironment = Object.freeze(localRuntimeEnvironment());
  const previewWorkspaceRoot = realpathSync.native(WORKSPACE_ROOT);
  const previewAppRoot = resolve(previewWorkspaceRoot, relative(WORKSPACE_ROOT, APP_ROOT));
  const metadata = stagePreviewConfig({ workspaceRoot: previewWorkspaceRoot, appRoot: previewAppRoot, localEntries: LOCAL_ENVIRONMENT_ENTRIES, assertOwned: releaseEnvironmentLifecycleLock.assertOwned, retain: releaseEnvironmentLifecycleLock.retain });
  let cleanupVerified = false;
  let previewError;
  try {
    await runLongLived(["x", "--no-install", "vite", "preview", ...forwarded], APP_ROOT, previewEnvironment, stopOnStdinEnd, () => { cleanupVerified = true; });
  } catch (error) { previewError = error; }
  try { metadata.restore(cleanupVerified); }
  catch (error) {
    throw previewError ? new AggregateError([previewError, error], "Worker preview failed and configuration recovery was retained") : error;
  }
  if (previewError) throw previewError;`
  }
}
if (action === "deploy") {
  assertNoRuntimeDotenvFiles();
  withHiddenLocalRuntimeEnvironment(() => {
    run(FRAMEWORK === "nextjs"
      ? ["x", "--no-install", "opennextjs-cloudflare", "deploy", "--", "--keep-vars", ...forwarded]
      : ["x", "--no-install", "wrangler", "deploy", "--keep-vars", ...forwarded], APP_ROOT, deploymentEnvironment);
  });
}
if (action === "upload") {
  if (FRAMEWORK !== "nextjs") fail("Upload is available only for the OpenNext adapter");
  assertNoRuntimeDotenvFiles();
  withHiddenLocalRuntimeEnvironment(() => {
    run(["x", "--no-install", "opennextjs-cloudflare", "upload", ...forwarded], APP_ROOT, deploymentEnvironment);
  });
}
}

const releaseEnvironmentLifecycleLock = acquireEnvironmentLifecycleLock(
  ["dev", "preview"].includes(action) ? "runtime-visible" : "writer",
);
try {
  recoverHiddenLocalRuntimeEnvironment();
  await executeCloudflareAction();
} catch (error) {
  try {
    releaseEnvironmentLifecycleLock();
  } catch (releaseError) {
    throw new AggregateError(
      [error, releaseError],
      "Cloudflare action failed and Worker environment lock cleanup was incomplete",
    );
  }
  throw error;
}
releaseEnvironmentLifecycleLock();
`;
}

function convexScriptContent(profile: DeploymentProfile): string {
  const publicKey = profile.framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL";
  const publicSiteKey =
    profile.framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_SITE_URL" : "VITE_CONVEX_SITE_URL";
  const mirrorTarget =
    profile.mode === "monorepo" ? ',\n  resolve(root, "apps/web/.dev.vars")' : "";
  const mirrorEnvironmentRoot =
    profile.mode === "monorepo"
      ? ',\n  { path: resolve(root, "apps/web"), label: "apps/web" }'
      : "";
  return `import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parse as parseDotenv } from "dotenv";

${cloudflareProcessHelpers(true)}

const action = process.argv[2];
if (!action || !["bootstrap", "dev", "deploy", "codegen"].includes(action)) throw new Error("Expected Convex action: bootstrap, dev, deploy, or codegen");
const root = process.cwd();
const environmentLockPath = resolve(root, ".dev.vars.ghostinit-build-lock");
const maxEnvironmentLockBytes = 4096;
const temporaryEnvironmentPrefix = ".dev.vars.ghostinit-convex-";
const temporaryEnvironmentName = temporaryEnvironmentPrefix + process.pid + "-" + randomUUID();
const temporaryEnvironmentPath = resolve(root, temporaryEnvironmentName);
const generatedPath = resolve(root, ".env.local");
const targetPaths = [
  resolve(root, ".dev.vars")${mirrorTarget},
];
const environmentRoots = [
  { path: root, label: "." }${mirrorEnvironmentRoot},
];
const publicUrlKey = ${JSON.stringify(publicKey)};
const publicSiteUrlKey = ${JSON.stringify(publicSiteKey)};
const allowedOutputKeys = new Set(["CONVEX_DEPLOYMENT", "CONVEX_URL", "CONVEX_SITE_URL", publicUrlKey, publicSiteUrlKey]);
const authoritativeConvexKeys = new Set(["CONVEX_DEPLOYMENT", "CONVEX_URL", "CONVEX_SITE_URL", publicUrlKey]);
const configurationSelectors = new Set([
  ...authoritativeConvexKeys,
  "NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_CONVEX_SITE_URL",
  "VITE_CONVEX_URL", "VITE_CONVEX_SITE_URL",
  "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY", "CONVEX_ADMIN_KEY",
  "CONVEX_ACCESS_TOKEN", "CONVEX_DEPLOYMENT_TOKEN",
]);
const SYSTEM_ENVIRONMENT_KEYS = new Set([
  "ALL_PROXY", "APPDATA", "BUN_INSTALL", "CI", "COLORTERM", "COMSPEC", "FORCE_COLOR",
  "HOME", "HOMEDRIVE", "HOMEPATH", "HTTP_PROXY", "HTTPS_PROXY", "LOCALAPPDATA",
  "NO_COLOR", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA", "SSL_CERT_DIR", "SSL_CERT_FILE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP",
  "TERM", "TMP", "TMPDIR", "USERPROFILE", "WINDIR",
]);
const forwardedOptionPolicy = {
  bootstrap: new Set(),
  dev: new Set(["once"]),
  deploy: new Set(),
  codegen: new Set(),
};
const canonicalEnvironmentFields = (environment) => JSON.stringify(Object.entries(environment).sort(([left], [right]) => left.localeCompare(right)));

function pathMetadata(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function isRuntimeDotenvFileName(name) {
  const normalized = name.toLowerCase();
  if (!/^\\.env(?:$|\\.)/.test(normalized)) return false;
  if (normalized === ".env.example" || normalized === ".env.template") return false;
  if (/^\\.env\\.(?:[^.]+\\.)+(?:example|template)$/.test(normalized)) return false;
  return true;
}

function assertRegularEnvironmentFile(path, metadata) {
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1024 * 1024) {
    throw new Error("Unsafe or oversized dotenv entry: " + path.replace(root, "."));
  }
}

function rollbackFailure(primary, cleanupErrors, message) {
  if (cleanupErrors.length > 0) throw new AggregateError([new Error(message), primary, ...cleanupErrors], message);
  throw primary;
}

function lockProcessIsActive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function describeExistingEnvironmentLock() {
  const metadata = pathMetadata(environmentLockPath);
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maxEnvironmentLockBytes) {
    return "Unsafe Worker environment lock exists; after confirming no wrapper or descendant is running, remove .dev.vars.ghostinit-build-lock and retry";
  }
  let record;
  try {
    record = JSON.parse(readFileSync(environmentLockPath, "utf8"));
  } catch {
    return "Unreadable Worker environment lock exists; after confirming no wrapper or descendant is running, remove .dev.vars.ghostinit-build-lock and retry";
  }
  if (lockProcessIsActive(record?.pid) === false && record?.child) {
    return "A Worker environment lock retains a runtime child identity; verify the recorded child PID and process group have stopped before removing the lock";
  }
  return lockProcessIsActive(record?.pid) === false
    ? "A stale Worker environment lock remains after an interrupted wrapper; after confirming the wrapper and recorded child/process group have stopped, remove .dev.vars.ghostinit-build-lock and retry to recover hidden values"
    : "Another Cloudflare or Convex wrapper is already using the local environment; retry after it exits";
}

function acquireEnvironmentLifecycleLock() {
  assertNoProcessRecovery(root);
  const record = { version: 1, pid: process.pid, owner: randomUUID() };
  let owner = JSON.stringify(record) + "\\n";
  try {
    writeFileSync(environmentLockPath, owner, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      const lockError = new Error(describeExistingEnvironmentLock());
      lockError.code = "EEXIST";
      throw lockError;
    }
    throw error;
  }
  let released = false;
  let retained = false;
  const verify = () => {
    const metadata = pathMetadata(environmentLockPath);
    if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maxEnvironmentLockBytes) {
      throw new Error("Worker environment lock changed while the Convex wrapper was running");
    }
    if (readFileSync(environmentLockPath, "utf8") !== owner) {
      throw new Error("Worker environment lock ownership changed while the Convex wrapper was running");
    }
  };
  const release = () => {
    if (released || retained) return;
    verify();
    unlinkSync(environmentLockPath);
    released = true;
  };
  release.trackChild = (child) => {
    verify();
    record.child = childProcessIdentity(child);
    const updated = JSON.stringify(record) + "\\n";
    writeFileSync(environmentLockPath, updated, { encoding: "utf8", mode: 0o600 });
    owner = updated;
  };
  release.ownsLock = true;
  release.verify = verify;
  release.retain = () => { retained = true; };
  return release;
}

function recoverWorkerHiddenEnvironment() {
  const candidates = [];
  for (const targetPath of targetPaths) {
    const backup = targetPath + ".ghostinit-build-hidden";
    const targetMetadata = pathMetadata(targetPath);
    const backupMetadata = pathMetadata(backup);
    if (targetMetadata && backupMetadata) throw new Error("Both .dev.vars and its build recovery file exist");
    if (!backupMetadata) continue;
    assertRegularEnvironmentFile(backup, backupMetadata);
    candidates.push({ targetPath, backup });
  }
  const recovered = [];
  try {
    for (const entry of candidates) {
      if (pathMetadata(entry.targetPath) || !pathMetadata(entry.backup)) throw new Error("Worker environment changed during Convex recovery");
      renameSync(entry.backup, entry.targetPath);
      recovered.push(entry);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of [...recovered].reverse()) {
      try {
        if (!pathMetadata(entry.targetPath) || pathMetadata(entry.backup)) throw new Error("Worker environment recovery changed during rollback");
        renameSync(entry.targetPath, entry.backup);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    rollbackFailure(error, rollbackErrors, "Worker environment recovery failed and rollback was incomplete");
  }
}

function cleanupStaleConvexEnvironmentFiles() {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.name.startsWith(temporaryEnvironmentPrefix)) continue;
    const match = /^\\.dev\\.vars\\.ghostinit-convex-(\\d+)-[0-9a-f-]{36}$/.exec(entry.name);
    if (!match) throw new Error("Unsafe Convex temporary environment filename; inspect it before retrying");
    if (lockProcessIsActive(Number(match[1])) !== false) continue;
    throw new Error("A stale Convex temporary environment remains; after confirming its Convex child stopped, remove the named .dev.vars.ghostinit-convex-* file and retry");
  }
}

function removeTemporaryEnvironmentInput() {
  const metadata = pathMetadata(temporaryEnvironmentPath);
  if (!metadata) return;
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Convex temporary input is not a regular file");
  unlinkSync(temporaryEnvironmentPath);
}

function removeGeneratedEnvironmentOutput(expectedContent, expectedMetadata) {
  const metadata = pathMetadata(generatedPath);
  if (!metadata) return false;
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Convex produced an unsafe .env.local entry");
  const identityChanged = expectedMetadata && ["dev", "ino", "birthtimeMs", "mtimeMs", "ctimeMs", "size"].some((field) => metadata[field] !== expectedMetadata[field]);
  if (identityChanged || (expectedContent !== undefined && readFileSync(generatedPath, "utf8") !== expectedContent)) {
    throw new Error(".env.local changed after Convex wrote it; leaving the conflicting file untouched");
  }
  unlinkSync(generatedPath);
  return true;
}

function removeCurrentGeneratedEnvironmentOutput() {
  const metadata = pathMetadata(generatedPath);
  if (!metadata) return false;
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Convex produced an unsafe .env.local entry");
  return removeGeneratedEnvironmentOutput(readFileSync(generatedPath, "utf8"), metadata);
}

function readGeneratedConvexEnvironment(onRead) {
  const metadata = pathMetadata(generatedPath);
  if (!metadata) throw new Error("Convex did not produce .env.local configuration output");
  assertRegularEnvironmentFile(generatedPath, metadata);
  const content = readFileSync(generatedPath, "utf8");
  onRead({ content, metadata });
  const discovered = new Map();
  const unknown = [];
  for (const [index, line] of content.split(/\\r?\\n/).entries()) {
    if (!line.trim() || /^\\s*#/.test(line)) continue;
    const match = /^\\s*(?:export\\s+)?([A-Z][A-Z0-9_]*)\\s*=(.*)$/.exec(line);
    const parsedLine = parseDotenv(line);
    const parsedEntries = Object.entries(parsedLine);
    const rawValue = match?.[2]?.trim() ?? "";
    const openingQuote = rawValue.startsWith('"') ? '"' : rawValue.startsWith("'") ? "'" : null;
    if (!match?.[1] || (openingQuote && (rawValue.length < 2 || !rawValue.endsWith(openingQuote))) || parsedEntries.length !== 1 || parsedEntries[0][0] !== match[1]) {
      throw new Error("Convex wrote a malformed dotenv field on line " + (index + 1));
    }
    const [key, value] = parsedEntries[0];
    if (!allowedOutputKeys.has(key)) { unknown.push(key); continue; }
    if (discovered.has(key) && discovered.get(key) !== value) throw new Error("Convex wrote conflicting duplicate values for " + key);
    discovered.set(key, value);
  }
  if (unknown.length > 0) throw new Error("Convex wrote unrecognized fields to .env.local: " + [...new Set(unknown)].sort().join(", "));
  return { content, discovered };
}

function hostedConvexOrigin(value, suffix, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Convex CLI returned an invalid " + label); }
  if (url.protocol !== "https:" || !url.hostname.endsWith(suffix) || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Convex CLI returned an invalid " + label);
  }
  return url.origin;
}

function validateGeneratedConvexSelection(discovered) {
  const deployment = discovered.get("CONVEX_DEPLOYMENT");
  if (!deployment || !/^dev:[A-Za-z0-9][A-Za-z0-9_-]*$/.test(deployment)) {
    throw new Error("Convex returned an invalid or missing CONVEX_DEPLOYMENT");
  }
  const coherentOrigin = (keys, suffix, label) => {
    const values = keys.flatMap((key) => discovered.has(key) ? [hostedConvexOrigin(discovered.get(key), suffix, label)] : []);
    if (values.length === 0 || values.some((value) => value !== values[0])) throw new Error("Convex returned missing or conflicting " + label + " values");
    return values[0];
  };
  const convexOrigin = coherentOrigin(["CONVEX_URL", publicUrlKey], ".convex.cloud", "Convex URL");
  const siteOrigin = coherentOrigin(["CONVEX_SITE_URL", publicSiteUrlKey], ".convex.site", "Convex site URL");
  const expectedSiteOrigin = "https://" + new URL(convexOrigin).hostname.replace(/\\.convex\\.cloud$/, ".convex.site");
  if (siteOrigin !== expectedSiteOrigin) throw new Error("Convex returned URL fields for different deployments");
  const deploymentHost = deployment.slice("dev:".length) + ".convex.cloud";
  if (new URL(convexOrigin).hostname !== deploymentHost) throw new Error("Convex returned a deployment name and URL for different deployments");
  return { deployment, convexOrigin, siteOrigin };
}

async function waitForStableGeneratedEnvironment(child) {
  const deadline = Date.now() + 15_000;
  let previous = null;
  let stableReads = 0;
  while (Date.now() < deadline) {
    const metadata = pathMetadata(generatedPath);
    if (metadata) {
      assertRegularEnvironmentFile(generatedPath, metadata);
      const content = readFileSync(generatedPath, "utf8");
      stableReads = content === previous ? stableReads + 1 : 0;
      previous = content;
      if (stableReads >= 1 || child.exitCode !== null || child.signalCode !== null) return;
    }
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Convex dev exited before producing stable .env.local output");
    await sleep(50);
  }
  throw new Error("Timed out waiting for Convex dev to produce stable .env.local output");
}

async function executeConvexAction(releaseEnvironmentLifecycleLock) {
releaseEnvironmentLifecycleLock.verify();
// Recover interrupted prior commits only after validating every root. If a later
// recovery move fails, earlier moves are put back rather than splitting mirrors.
const recoveryEntries = targetPaths.map((targetPath) => {
  const backup = targetPath + ".ghostinit-backup";
  const prepared = targetPath + ".ghostinit-prepared";
  const targetMetadata = pathMetadata(targetPath);
  const backupMetadata = pathMetadata(backup);
  const preparedMetadata = pathMetadata(prepared);
  if (targetMetadata) assertRegularEnvironmentFile(targetPath, targetMetadata);
  if (backupMetadata) assertRegularEnvironmentFile(backup, backupMetadata);
  if (preparedMetadata) assertRegularEnvironmentFile(prepared, preparedMetadata);
  return { targetPath, backup, prepared, targetMetadata, backupMetadata };
});
if (!releaseEnvironmentLifecycleLock.ownsLock && recoveryEntries.some((entry) => pathMetadata(entry.prepared) || entry.backupMetadata)) {
  throw new Error("Convex environment recovery requires exclusive access; stop the active Worker runtime and retry");
}
if (releaseEnvironmentLifecycleLock.ownsLock) {
  for (const entry of recoveryEntries) {
    if (pathMetadata(entry.prepared)) unlinkSync(entry.prepared);
  }
}
for (const entry of recoveryEntries) {
  if (entry.targetMetadata && entry.backupMetadata) throw new Error("Both .dev.vars and its recovery backup exist; reconcile them before continuing");
}
const unsafeEnvironmentEntries = environmentRoots.flatMap(({ path, label }) => {
  const metadata = pathMetadata(path);
  if (!metadata || !metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Unsafe or missing Convex environment root: " + label);
  }
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => isRuntimeDotenvFileName(entry.name))
    .map((entry) => (label === "." ? entry.name : label + "/" + entry.name));
}).sort();
if (unsafeEnvironmentEntries.length > 0) {
  if (unsafeEnvironmentEntries.some((name) => name.toLowerCase().endsWith(".env.local"))) {
    throw new Error("Refusing to run Convex while .env.local exists. Move its values to .dev.vars first.");
  }
  throw new Error("Refusing alternate Convex dotenv authority. Move values to .dev.vars: " + unsafeEnvironmentEntries.join(", "));
}
const recoveredEntries = [];
try {
  for (const entry of releaseEnvironmentLifecycleLock.ownsLock ? recoveryEntries : []) {
    if (entry.targetMetadata || !entry.backupMetadata) continue;
    renameSync(entry.backup, entry.targetPath);
    recoveredEntries.push(entry);
  }
} catch (error) {
  const cleanupErrors = [];
  for (const entry of [...recoveredEntries].reverse()) {
    try {
      if (!pathMetadata(entry.targetPath) || pathMetadata(entry.backup)) throw new Error("Convex recovery path changed while rolling back");
      renameSync(entry.targetPath, entry.backup);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
  }
  rollbackFailure(error, cleanupErrors, "Convex environment recovery failed and rollback was incomplete");
}
releaseEnvironmentLifecycleLock.verify();
let localEnvironment = {};
let observedLocalEnvironment = false;
let existingTargetCount = 0;
for (const targetPath of targetPaths) {
  const targetMetadata = pathMetadata(targetPath);
  if (!targetMetadata) continue;
  existingTargetCount += 1;
  assertRegularEnvironmentFile(targetPath, targetMetadata);
  const parsed = parseDotenv(readFileSync(targetPath));
  if (observedLocalEnvironment && canonicalEnvironmentFields(parsed) !== canonicalEnvironmentFields(localEnvironment)) {
    throw new Error("Root and web .dev.vars files diverged; reconcile them before running Convex");
  }
  observedLocalEnvironment = true;
  localEnvironment = parsed;
}
if (targetPaths.length === 2 && existingTargetCount === 1) throw new Error("Root and web .dev.vars must either both exist or both be absent");
releaseEnvironmentLifecycleLock.verify();
const configuredDeployment = localEnvironment.CONVEX_DEPLOYMENT;
if (action !== "bootstrap" && (!configuredDeployment || configuredDeployment.includes("REPLACE_WITH_") || configuredDeployment === "dev:example-123")) {
  throw new Error("Convex is not configured. Run bun run convex:bootstrap first.");
}
if (action === "bootstrap") {
  for (const [key, value] of Object.entries(localEnvironment)) {
    if (value.includes("REPLACE_WITH_") || new Set(["dev:example-123", "https://example-123.convex.cloud", "https://example-123.convex.cloud/", "https://example-123.convex.site", "https://example-123.convex.site/"]).has(value)) delete localEnvironment[key];
  }
}
for (const key of Object.keys(localEnvironment)) {
  if (/^(?:CONVEX_|NEXT_PUBLIC_CONVEX_|VITE_CONVEX_)/.test(key) && !authoritativeConvexKeys.has(key)) {
    throw new Error("Unsupported Convex selector or credential in .dev.vars: " + key);
  }
}

const forwarded = process.argv.slice(3);
if (forwarded[0] === "--") forwarded.shift();
const seenForwardedOptions = new Set();
for (const argument of forwarded) {
  const match = /^--([a-z0-9-]+)$/.exec(argument);
  const option = /^--([a-z0-9-]+)/.exec(argument)?.[1];
  if (!option || !forwardedOptionPolicy[action].has(option) || seenForwardedOptions.has(option)) {
    throw new Error("Unsupported forwarded Convex argument" + (option ? ": --" + option : ""));
  }
  if (!match) {
    throw new Error("Convex option --" + option + " does not accept an inline value");
  }
  seenForwardedOptions.add(option);
}
for (const key of configurationSelectors) {
  const ambient = process.env[key];
  if (ambient !== undefined && ambient !== localEnvironment[key]) {
    throw new Error("Ambient Convex configuration conflicts with authoritative .dev.vars: " + key);
  }
}
for (const key of Object.keys(process.env)) {
  const normalizedKey = key.toUpperCase();
  if (normalizedKey.startsWith("CONVEX_") && normalizedKey !== "CONVEX_DEPLOY_KEY" && !authoritativeConvexKeys.has(normalizedKey) && !configurationSelectors.has(normalizedKey)) {
    throw new Error("Unsupported ambient Convex selector or credential: " + normalizedKey);
  }
}
if (action !== "deploy" && process.env.CONVEX_DEPLOY_KEY) {
  throw new Error("CONVEX_DEPLOY_KEY is accepted only by the explicit Convex deploy action");
}
const convexEnvironment = {};
for (const [key, value] of Object.entries(process.env)) {
  if (SYSTEM_ENVIRONMENT_KEYS.has(key.toUpperCase())) convexEnvironment[key] = value;
}
for (const [key, value] of Object.entries(localEnvironment)) {
  if (authoritativeConvexKeys.has(key)) convexEnvironment[key] = value;
}
if (action === "deploy" && process.env.CONVEX_DEPLOY_KEY) {
  convexEnvironment.CONVEX_DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY;
}
const temporaryLines = [];
for (const [key, value] of Object.entries(localEnvironment)) {
  if (authoritativeConvexKeys.has(key)) temporaryLines.push(key + "=" + JSON.stringify(value));
}
if (action !== "bootstrap") {
  writeFileSync(temporaryEnvironmentPath, temporaryLines.length > 0 ? temporaryLines.join("\\n") + "\\n" : "", {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}
releaseEnvironmentLifecycleLock.verify();
const convexAction = action === "bootstrap" ? "dev" : action;
const environmentArgs = action === "bootstrap" ? ["--once"] : ["--env-file", temporaryEnvironmentName];
const childArgs = ["x", "--no-install", "convex", convexAction, ...environmentArgs, ...forwarded];
let generatedOutputSnapshot;
const validateConfiguredOutput = () => {
  const output = readGeneratedConvexEnvironment((snapshot) => { generatedOutputSnapshot = snapshot; });
  const selection = validateGeneratedConvexSelection(output.discovered);
  if (selection.deployment !== configuredDeployment) throw new Error("Convex changed the authoritative deployment selection");
  for (const key of ["CONVEX_URL", publicUrlKey]) {
    const expected = localEnvironment[key];
    if (expected && hostedConvexOrigin(expected, ".convex.cloud", key).toLowerCase() !== selection.convexOrigin.toLowerCase()) {
      throw new Error("Convex output does not match the authoritative " + key);
    }
  }
  const expectedSite = localEnvironment.CONVEX_SITE_URL;
  if (expectedSite && hostedConvexOrigin(expectedSite, ".convex.site", "CONVEX_SITE_URL").toLowerCase() !== selection.siteOrigin.toLowerCase()) {
    throw new Error("Convex output does not match the authoritative CONVEX_SITE_URL");
  }
  return output.content;
};
const cleanupChildEnvironment = (primary, message, expectedGeneratedContent, removeGenerated = true) => {
  const cleanupErrors = [];
  const cleanups = [removeTemporaryEnvironmentInput];
  if (removeGenerated) {
    cleanups.unshift(generatedOutputSnapshot
      ? () => removeGeneratedEnvironmentOutput(generatedOutputSnapshot.content, generatedOutputSnapshot.metadata)
      : expectedGeneratedContent === undefined
      ? removeCurrentGeneratedEnvironmentOutput
      : () => removeGeneratedEnvironmentOutput(expectedGeneratedContent));
  }
  for (const cleanup of cleanups) {
    try { cleanup(); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
  }
  if (primary) rollbackFailure(primary, cleanupErrors, message);
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, message);
};

if (action === "dev" && !forwarded.includes("--once")) {
  const child = spawn(process.execPath, childArgs, {
    cwd: root,
    env: convexEnvironment,
    detached: process.platform !== "win32",
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  const completion = new Promise((resolveCompletion) => {
    child.once("error", (error) => resolveCompletion({ error }));
    child.once("exit", (code, signal) => resolveCompletion({ code, signal }));
  });
  let terminationPromise = null;
  let requestedSignal = null;
  let removeRecoveryMarker;
  let treeCleanupVerified = false;
  let notifyTermination;
  const interrupted = new Promise((resolveInterrupted) => { notifyTermination = resolveInterrupted; });
  const beginTermination = (signal = "SIGTERM") => {
    terminationPromise ??= (async () => {
      const failures = [];
      try { removeRecoveryMarker ??= createProcessRecoveryMarker(root, child); } catch (error) { failures.push(error); }
      try {
        await terminateSupervisedProcessTree(child, completion, signal);
        treeCleanupVerified = true;
      } catch (error) { failures.push(error); }
      if (failures.length > 0) throw new AggregateError(failures, "Convex child cleanup or recovery evidence persistence failed");
    })().then(() => null, (error) => error);
    return terminationPromise;
  };
  const requestTermination = (signal) => {
    requestedSignal ??= signal;
    beginTermination(signal);
    notifyTermination();
  };
  const onInterrupt = () => requestTermination("SIGINT");
  const onTerminate = () => requestTermination("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  const removeSignalForwarding = () => {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  };
  try {
    releaseEnvironmentLifecycleLock.trackChild(child);
    captureProcessTree(child);
    releaseEnvironmentLifecycleLock.trackChild(child);
    await Promise.race([waitForStableGeneratedEnvironment(child), interrupted.then(() => { throw new Error("Convex dev startup interrupted by signal " + requestedSignal); })]);
    const generatedContent = validateConfiguredOutput();
    removeGeneratedEnvironmentOutput(generatedContent, generatedOutputSnapshot.metadata);
    releaseEnvironmentLifecycleLock();
  } catch (error) {
    removeSignalForwarding();
    const terminationError = await beginTermination();
    if (terminationError) {
      if (treeCleanupVerified) {
        removeRecoveryMarker?.();
        cleanupChildEnvironment(terminationError, "Convex startup cleanup failed", undefined);
      }
      releaseEnvironmentLifecycleLock.retain();
      child.unref();
      throw new Error(
        "Convex dev startup failed and its process tree termination could not be verified; the environment lock and child recovery evidence were retained",
        { cause: new AggregateError([error, terminationError]) },
      );
    }
    removeRecoveryMarker();
    cleanupChildEnvironment(error, "Convex dev startup failed and cleanup was incomplete", undefined);
  }
  const terminal = await Promise.race([completion, interrupted]);
  const terminationError = await beginTermination(requestedSignal ?? "SIGTERM");
  removeSignalForwarding();
  if (terminationError) {
    if (treeCleanupVerified) {
      removeRecoveryMarker?.();
      cleanupChildEnvironment(terminationError, "Convex recovery evidence persistence failed after verified cleanup", undefined, false);
    }
    child.unref();
    throw new Error("Convex process-tree cleanup could not be verified; child recovery evidence was retained", { cause: terminationError });
  }
  removeRecoveryMarker();
  const recreatedEnvironment = pathMetadata(generatedPath)
    ? new Error(".env.local reappeared after Convex dev startup; leaving the unowned file untouched")
    : null;
  cleanupChildEnvironment(recreatedEnvironment, "Convex dev final cleanup was incomplete", undefined, false);
  if (requestedSignal) throw new Error("Convex subprocess terminated by signal " + requestedSignal);
  if (terminal?.error) throw terminal.error;
  if (terminal?.signal) throw new Error("Convex subprocess terminated by signal " + terminal.signal);
  if (terminal?.code !== 0) throw new Error("Convex subprocess failed with exit code " + (terminal?.code ?? 1));
  return;
}

const result = spawnSync(process.execPath, childArgs, {
  cwd: root,
  env: convexEnvironment,
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error || result.status !== 0 || result.signal !== null) {
  const failure = result.error ?? new Error(result.signal ? "Convex subprocess terminated by signal " + result.signal : "Convex subprocess failed with exit code " + (result.status ?? 1));
  cleanupChildEnvironment(failure, "Convex failed and its environment output could not be removed", undefined);
}

const generatedMetadata = pathMetadata(generatedPath);
if (action !== "bootstrap") {
  let validationError = null;
  let generatedContent;
  const wroteConfigurationOutput = Boolean(pathMetadata(generatedPath));
  if (wroteConfigurationOutput) {
    try { generatedContent = validateConfiguredOutput(); } catch (error) { validationError = error; }
    if (!validationError && action !== "dev") validationError = new Error("Convex wrote unexpected .env.local output for " + action);
  } else if (action === "dev") {
    validationError = new Error("Convex dev completed without .env.local configuration output");
  }
  cleanupChildEnvironment(validationError, "Convex configuration output was rejected and cleanup was incomplete", generatedContent);
  return;
}
if (!generatedMetadata) throw new Error("Convex bootstrap completed without a generated .env.local");
let generatedContent;
try {
  assertRegularEnvironmentFile(generatedPath, generatedMetadata);
  generatedContent = readFileSync(generatedPath, "utf8");
  const discovered = new Map();
  const unknown = [];
  for (const [index, line] of generatedContent.split(/\\r?\\n/).entries()) {
    if (!line.trim() || /^\\s*#/.test(line)) continue;
    const match = /^\\s*(?:export\\s+)?([A-Z][A-Z0-9_]*)\\s*=(.*)$/.exec(line);
    const parsedLine = parseDotenv(line);
    const parsedEntries = Object.entries(parsedLine);
    const rawValue = match?.[2]?.trim() ?? "";
    const openingQuote = rawValue.startsWith('"') ? '"' : rawValue.startsWith("'") ? "'" : null;
    if (!match?.[1] || (openingQuote && (rawValue.length < 2 || !rawValue.endsWith(openingQuote))) || parsedEntries.length !== 1 || parsedEntries[0][0] !== match[1]) {
      throw new Error("Convex wrote a malformed dotenv field on line " + (index + 1));
    }
    const [key, value] = parsedEntries[0];
    if (!allowedOutputKeys.has(key)) { unknown.push(key); continue; }
    if (discovered.has(key) && discovered.get(key) !== value) throw new Error("Convex wrote conflicting duplicate values for " + key);
    discovered.set(key, value);
  }
  if (unknown.length > 0) throw new Error("Convex wrote unrecognized fields to its temporary environment: " + [...new Set(unknown)].sort().join(", "));
  const deployment = discovered.get("CONVEX_DEPLOYMENT");
  if (!deployment || !/^dev:[A-Za-z0-9][A-Za-z0-9_-]*$/.test(deployment)) {
    throw new Error("Convex bootstrap returned an invalid or missing CONVEX_DEPLOYMENT");
  }
  function hostedOrigin(value, suffix, label) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Convex CLI returned an invalid " + label);
    }
    if (url.protocol !== "https:" || !url.hostname.endsWith(suffix) || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Convex CLI returned an invalid " + label);
    }
    return url.origin;
  }
  function coherentOrigin(keys, suffix, label) {
    const values = keys.flatMap((key) => discovered.has(key) ? [hostedOrigin(discovered.get(key), suffix, label)] : []);
    if (values.length === 0 || values.some((value) => value !== values[0])) {
      throw new Error("Convex bootstrap returned missing or conflicting " + label + " values");
    }
    return values[0];
  }
  const convexOrigin = coherentOrigin(["CONVEX_URL", publicUrlKey], ".convex.cloud", "Convex URL");
  const siteOrigin = coherentOrigin(["CONVEX_SITE_URL", publicSiteUrlKey], ".convex.site", "Convex site URL");
  const expectedSiteOrigin = "https://" + new URL(convexOrigin).hostname.replace(/\\.convex\\.cloud$/, ".convex.site");
  if (siteOrigin !== expectedSiteOrigin) throw new Error("Convex bootstrap returned URL fields for different deployments");
  const deploymentHost = deployment.slice("dev:".length) + ".convex.cloud";
  if (new URL(convexOrigin).hostname !== deploymentHost) throw new Error("Convex bootstrap returned a deployment name and URL for different deployments");
  discovered.set("CONVEX_URL", convexOrigin);
  discovered.set(publicUrlKey, convexOrigin);
  discovered.set("CONVEX_SITE_URL", siteOrigin);
  discovered.delete(publicSiteUrlKey);
  function assertReplacementSnapshot(path, content, expectedMetadata, message) {
    const metadata = pathMetadata(path);
    // Moving a file can update ctime, so compare the retained file identity,
    // modification time, size, and bytes across prepare/install/rollback moves.
    if (!metadata || !expectedMetadata || !metadata.isFile() || metadata.isSymbolicLink() ||
      ["dev", "ino", "birthtimeMs", "mtimeMs", "size"].some((field) => metadata[field] !== expectedMetadata[field]) ||
      readFileSync(path, "utf8") !== content) throw new Error(message);
  }
  const replacements = targetPaths.map((targetPath) => {
    const targetMetadata = pathMetadata(targetPath);
    if (targetMetadata) assertRegularEnvironmentFile(targetPath, targetMetadata);
    const source = targetMetadata ? readFileSync(targetPath, "utf8") : "";
    const seen = new Set();
    const lines = source.split(/\\r?\\n/).map((line) => {
      const key = /^\\s*(?:export\\s+)?([A-Z][A-Z0-9_]*)\\s*=/.exec(line)?.[1];
      if (!key || !discovered.has(key)) return line;
      seen.add(key);
      return key + "=" + discovered.get(key);
    });
    while (lines.at(-1) === "") lines.pop();
    for (const [key, value] of discovered) if (!seen.has(key)) lines.push(key + "=" + value);
    const temporary = targetPath + ".ghostinit-prepared";
    const backup = targetPath + ".ghostinit-backup";
    if (pathMetadata(temporary) || pathMetadata(backup)) throw new Error("Temporary Convex environment path already exists");
    return { targetPath, temporary, backup, content: lines.join("\\n") + "\\n", originalContent: source, originalMetadata: targetMetadata, preparedMetadata: null, existed: Boolean(targetMetadata), installed: false };
  });
  const movedBackups = [];
  const installedTargets = [];
  try {
    // Prepare every replacement inside the same rollback boundary. A failed or
    // partial later write must not strand an earlier secret-bearing temp file.
    for (const replacement of replacements) {
      writeFileSync(replacement.temporary, replacement.content, { encoding: "utf8", mode: 0o600, flag: "wx" });
      replacement.preparedMetadata = pathMetadata(replacement.temporary);
    }
    for (const replacement of replacements) {
      if (!replacement.existed) continue;
      assertReplacementSnapshot(replacement.targetPath, replacement.originalContent, replacement.originalMetadata, "Convex environment target changed before backup; leaving the conflicting file untouched");
      renameSync(replacement.targetPath, replacement.backup);
      movedBackups.push(replacement);
    }
    for (const replacement of replacements) {
      if (pathMetadata(replacement.targetPath)) throw new Error("Convex environment target appeared before install; leaving the conflicting file untouched");
      assertReplacementSnapshot(replacement.temporary, replacement.content, replacement.preparedMetadata, "Convex prepared environment changed before install");
      renameSync(replacement.temporary, replacement.targetPath);
      replacement.installed = true;
      installedTargets.push(replacement);
    }
  } catch (error) {
    const cleanupErrors = [];
    for (const replacement of [...installedTargets].reverse()) {
      try {
        const metadata = pathMetadata(replacement.targetPath);
        if (metadata) {
          assertReplacementSnapshot(replacement.targetPath, replacement.content, replacement.preparedMetadata, "Installed Convex environment target changed during rollback; leaving the conflicting file and recovery backup untouched");
          unlinkSync(replacement.targetPath);
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    for (const replacement of [...movedBackups].reverse()) {
      try {
        const targetMetadata = pathMetadata(replacement.targetPath);
        const backupMetadata = pathMetadata(replacement.backup);
        if (targetMetadata && backupMetadata) throw new Error("Convex environment rollback left an explicit recovery pair");
        if (!targetMetadata && backupMetadata) {
          assertReplacementSnapshot(replacement.backup, replacement.originalContent, replacement.originalMetadata, "Convex environment backup changed during rollback; leaving it untouched");
          renameSync(replacement.backup, replacement.targetPath);
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    for (const replacement of replacements) {
      try {
        const metadata = pathMetadata(replacement.temporary);
        if (metadata) {
          if (metadata.isDirectory() && !metadata.isSymbolicLink()) throw new Error("Convex temporary environment path became a directory");
          unlinkSync(replacement.temporary);
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    rollbackFailure(error, cleanupErrors, "Convex environment update failed and rollback was incomplete");
  }
  const temporaryCleanupErrors = [];
  for (const replacement of replacements) {
    try {
      if (pathMetadata(replacement.temporary)) unlinkSync(replacement.temporary);
    } catch (cleanupError) {
      temporaryCleanupErrors.push(cleanupError);
    }
  }
  if (temporaryCleanupErrors.length > 0) throw new AggregateError(temporaryCleanupErrors, "Could not remove Convex temporary environment files");
  // Cleanup happens only after every replacement is committed. A failed unlink
  // leaves both the authoritative target and a recovery backup; no original is lost.
  const backupCleanupErrors = [];
  for (const replacement of movedBackups) {
    try {
      if (pathMetadata(replacement.backup)) {
        assertReplacementSnapshot(replacement.backup, replacement.originalContent, replacement.originalMetadata, "Committed Convex environment backup changed; leaving it untouched");
        unlinkSync(replacement.backup);
      }
    } catch (cleanupError) {
      backupCleanupErrors.push(cleanupError);
    }
  }
  if (backupCleanupErrors.length > 0) throw new AggregateError(backupCleanupErrors, "Could not remove committed Convex recovery backups");
  removeGeneratedEnvironmentOutput(generatedContent, generatedMetadata);
} catch (error) {
  const cleanupErrors = [];
  try {
    // A failed ownership check must never turn the current pathname into a new
    // owned snapshot. Only the output originally read from Convex may be removed.
    if (generatedContent !== undefined) removeGeneratedEnvironmentOutput(generatedContent, generatedMetadata);
  } catch (cleanupError) {
    cleanupErrors.push(cleanupError);
  }
  rollbackFailure(error, cleanupErrors, "Convex bootstrap output was rejected and could not be removed");
}
}

const releaseEnvironmentLifecycleLock = acquireEnvironmentLifecycleLock();
try {
  if (releaseEnvironmentLifecycleLock.ownsLock) {
    recoverWorkerHiddenEnvironment();
    cleanupStaleConvexEnvironmentFiles();
  } else {
    releaseEnvironmentLifecycleLock.verify();
  }
  await executeConvexAction(releaseEnvironmentLifecycleLock);
} catch (error) {
  try {
    releaseEnvironmentLifecycleLock();
  } catch (releaseError) {
    throw new AggregateError(
      [error, releaseError],
      "Convex action failed and Worker environment lock cleanup was incomplete",
    );
  }
  throw error;
}
releaseEnvironmentLifecycleLock();
`;
}

function guideContent(projectName: string, profile: DeploymentProfile): string {
  const name = workerName(projectName);
  const cacheName = boundedCloudflareName(`${name}-cache`);
  const rootCommand = profile.mode === "monorepo" ? "bun run" : "bun run";
  const cache =
    profile.framework === "nextjs"
      ? `\nProvision the persistent incremental cache once before the first deploy:\n\n\`\`\`bash\n${profile.mode === "monorepo" ? "bun --cwd=apps/web x " : "bun x "}--no-install wrangler r2 bucket create ${cacheName}\n\`\`\`\n`
      : "";
  const convexFunctionEnvironment =
    profile.database === "convex"
      ? `## Convex deployment environment

The Worker/build environment and Convex function environment are separate.
\`.dev.vars\` selects the local deployment but does not configure
\`process.env\` inside Convex functions. Configure each development and
production deployment independently in Convex Deployment Settings or with a
secret-safe interactive/stdin command (never put the value in argv):

\`\`\`bash
bun --env-file=.dev.vars x --no-install convex env set NAME
bun --env-file=.dev.vars x --no-install convex env set --prod NAME
\`\`\`

${profile.auth ? "Required for generated Convex auth: `BETTER_AUTH_SECRET`, `SITE_URL`, `BETTER_AUTH_URL`, and `CONVEX_SITE_URL`. Use the same auth secret and canonical site/auth origins as the corresponding Worker deployment. Every non-local production `BETTER_AUTH_URL` also requires `TRUSTED_PROXY=true`. Cloudflare generation emits an explicit trusted-runtime policy: non-loopback Worker auth requires one valid `CF-Connecting-IP` and replaces `X-Forwarded-For` before @convex-dev/better-auth; HTTP loopback development/preview uses a fixed `127.0.0.1`. Non-Cloudflare output never trusts Cloudflare headers or an attached `cf` property. Direct Convex ingress is separate. Optional Google/GitHub OAuth needs each selected client ID and secret.\n" : ""}${profile.email ? "Generated Convex auth email actions also require `RESEND_API_KEY` and `EMAIL_FROM`; set `APP_NAME` when the default label is not appropriate.\n" : ""}${profile.notifications ? "Generated Convex notification token protection also requires `NOTIFICATION_TOKEN_ENCRYPTION_KEY`; use the same self-issued value as the Worker deployment when both consume it.\n" : ""}${(profile.billing?.length ?? 0) > 0 ? "Generated Convex billing bridge actions use the same `BETTER_AUTH_SECRET`. Billing-provider API and webhook credentials remain Worker runtime values unless a Convex function explicitly reads them; do not copy `.dev.vars` wholesale.\n" : ""}
Run \`bun --env-file=.dev.vars x --no-install convex env list\` (and the
explicit \`--prod\` form) for both the intended development and production
deployment before release. GhostInit doctor can verify local declarations but
cannot attest remote Convex values without deployment access.

`
      : "";
  return `# Cloudflare Workers deployment

${profile.framework === "nextjs" ? "Next.js is packaged with the OpenNext Cloudflare adapter." : "TanStack Start uses the native Cloudflare Vite plugin."}

${profile.framework === "nextjs" ? "This Cloudflare profile sets `cacheComponents: false`. Next.js 16.3.3 with OpenNext Cloudflare 1.20.2 (AWS packager 4.1.0) reproducibly hangs on request-bound Suspense under workerd; the same generated workload returns complete responses with Cache Components disabled. OpenNext generally supports SSR, PPR, and composable caching, but this pinned combination has a compatibility defect. Re-enable only after the generated Worker runtime gate proves the affected routes. See https://github.com/opennextjs/opennextjs-cloudflare/issues/1225#issuecomment-5327479166 and https://github.com/opennextjs/opennextjs-cloudflare/pull/1318. The application `--cache redis` capability and the declared OpenNext R2/Durable Object cache bindings remain available. Other deployment targets retain their Next configuration.\n" : ""}

\`\`\`bash
${rootCommand} cf-typegen
${rootCommand} build
${rootCommand} preview
${rootCommand} deploy
\`\`\`
${cache}
Local values live only in the gitignored \`.dev.vars\`. Worker builds reject
runtime \`.env*\` files (documentation-only example/template variants are
allowed), scan output for server-only environment values, and
never write secrets to \`wrangler.jsonc\`. Configure runtime secrets with
\`wrangler secret put\` or the Workers dashboard. Variables needed by static
generation must also be configured separately as Workers Builds variables or
build secrets; build variables are not automatically available at runtime.
The generated GitHub workflow uses non-credential, step-scoped synthetic values
only to prove the build path. Configure real production values separately in
Workers Builds and the Workers dashboard; never commit or reuse CI fixtures.
Worker and Convex wrappers serialize local-environment access with the ignored
\`.dev.vars.ghostinit-build-lock\`. If an interrupted process leaves that lock,
first verify that the wrapper, its recorded child PID, and its entire process
group/tree have stopped. Only then remove the lock and rerun the command;
the new owner safely recovers any \`.dev.vars.ghostinit-build-hidden\` file.
Local dev/preview forwards handled interrupt/termination signals and verifies
child-tree exit before releasing the lock. Windows forced termination and POSIX
SIGKILL bypass handlers; the retained lock records the child for explicit recovery.
Automation can run \`bun run preview -- --ghostinit-stop-on-stdin-end\` with piped
stdin, then close the pipe and await a successful exit before restoring local
bindings. This opt-in control also supports dev and is never forwarded to the adapter.
Convex records a separate ignored \`.dev.vars.ghostinit-process-recovery-*\` marker
before child cleanup. Both wrappers block while such a marker exists; remove it
only after verifying its recorded process tree stopped. A failed Convex cleanup
never overwrites an application wrapper's environment lock.
If a hard-killed Convex wrapper leaves \`.dev.vars.ghostinit-convex-*\`, confirm
its Convex child has stopped before removing that one ignored temporary input.
Production build, dry-run, deploy, and upload require explicit \`SITE_URL\` and
${profile.framework === "nextjs" ? "`NEXT_PUBLIC_APP_URL`" : "`VITE_APP_URL`"} values naming the same non-loopback HTTPS origin. Local development and preview may use loopback values.

${profile.mode === "monorepo" && profile.apps.some((app) => app === "mobile" || app === "desktop") ? "The root `dev` command covers the Worker and every selected native app. The root `build` first produces the audited Worker, then Expo/Electron artifacts with only their public platform environment. Use the root `.dev.vars` for local native values or explicit CI/shell variables for production; do not create `.env.production.local`.\n\n" : ""}

${profile.database === "convex" ? "Run `bun run convex:bootstrap` once before ordinary Convex development. When using two terminals, start `bun run convex:dev` before `bun run dev`; the Convex wrapper validates and removes its transient `.env.local` before releasing the app-runtime lock, and the reverse start order is refused rather than exposing that file to a framework watcher. The wrapper keeps root and web `.dev.vars` key/value maps synchronized while allowing harmless comment and line-order differences.\n\n" : ""}

${profile.framework === "tanstack-start" ? "Vite preview loads its filtered local environment using temporary binding-name metadata after the build and artifact scans. It preserves empty values and restores the original output configuration after verified process cleanup; runtime secrets are never copied into build output. Every existing output config `vars` key or required secret name must also occur explicitly in the local `.dev.vars` snapshot. A retained `.dev.vars.ghostinit-process-recovery-preview-*` directory blocks subsequent operations until its recorded original configuration and process cleanup have been verified.\n\n" : ""}

${convexFunctionEnvironment}

Deploy uses \`--keep-vars\` so dashboard-managed plaintext variables are not
deleted by an empty local \`vars\` object. Encrypted secrets are managed
separately; non-secret R2, Durable Object, KV, D1, and service bindings must stay
declared in \`wrangler.jsonc\`. Run \`wrangler types\` after any resource change.
${profile.framework === "nextjs" ? "`NEXT_CACHE_DO_QUEUE` owns `DOQueueHandler` in immutable migration `v1`; `NEXT_TAG_CACHE_DO_SHARDED` owns `DOShardedTagCache` in additive migration `v2`.\n\n" : ""}

Supported databases are Convex and database-free projects. PostgreSQL requires
a request-scoped Hyperdrive adapter. Eve and server-side PDF are rejected until
Workers-native adapters are available.
`;
}

export function cloudflareDeploymentFiles(
  projectName: string,
  profile: DeploymentProfile,
): TemplateFile[] {
  if (
    !profile.apps.includes("web") ||
    profile.database === "postgres" ||
    profile.eve === true ||
    profile.pdf === true
  ) {
    throw new Error(
      "Cloudflare emitter received an unresolved unsupported profile; resolve capabilities before rendering",
    );
  }
  const base = profile.mode === "monorepo" ? "apps/web/" : "";
  const files = [
    file(`${base}wrangler.jsonc`, wranglerContent(projectName, profile)),
    file(`${base}scripts/cloudflare.mjs`, buildScriptContent(profile)),
    file("docs/CLOUDFLARE_DEPLOYMENT.md", guideContent(projectName, profile)),
    ...(profile.database === "convex"
      ? [file("scripts/cloudflare-convex.mjs", convexScriptContent(profile))]
      : []),
  ];
  if (profile.framework === "nextjs") {
    files.push(file(`${base}open-next.config.ts`, openNextConfigContent()));
    files.push(file(OPENNEXT_AWS_WINDOWS_PATCH_PATH, OPENNEXT_AWS_WINDOWS_PATCH_CONTENT));
  } else {
    files.push(
      file(`${base}scripts/cloudflare-preview-config.mjs`, cloudflarePreviewConfigContent()),
    );
    files.push(
      file(
        `${base}src/cloudflare-worker.ts`,
        workerContent(profile.database === "convex", profile.billing?.includes("paddle") === true),
      ),
    );
  }
  return files;
}
