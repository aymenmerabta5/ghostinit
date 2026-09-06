// @allow-long 750: deployment matrix keeps Docker, Fly, runtime-loader, and process supervision semantics together
import type {
  AppName,
  DatabaseProvider,
  DeployTarget,
  FrameworkName,
  ProjectMode,
} from "../../lib/addons.js";
import { file, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import { productionProcessSupervisorContent } from "./process-supervisor.js";
import { healthFileContent } from "../apps/fragments/api.js";
import {
  DEPLOY_HEALTH_PATH,
  DEPLOY_LOCKFILE_GUARD_PATH,
  DEPLOY_STOP_GRACE_SECONDS,
  deploymentLockfileGuardContent,
  dockerBuildInstruction,
  dockerDeploymentGuideContent,
  dockerHealthcheckInstruction,
  flyDeploymentGuideContent,
  productionComposeContent,
  vercelDeploymentGuideContent,
} from "./deploy-guides.js";
import {
  eveWorkflowDataPath,
  hasHostedWebEve,
  integratedEveLifecycleFiles,
} from "./eve-lifecycle.js";
import { cloudflareDeploymentFiles } from "./cloudflare.js";

export interface DeploymentProfile {
  mode: ProjectMode;
  database: DatabaseProvider;
  framework: FrameworkName;
  apps: readonly AppName[];
  messaging: boolean;
  jobs: boolean;
  storage: boolean;
  notifications: boolean;
  cache: boolean;
  billing?: readonly string[];
  email?: boolean;
  api?: boolean;
  auth?: boolean;
  pdf?: boolean;
  eve?: boolean;
}

const DEFAULT_DEPLOYMENT_PROFILE: DeploymentProfile = {
  mode: "monorepo",
  database: "postgres",
  framework: "nextjs",
  apps: ["web"],
  messaging: false,
  jobs: false,
  storage: false,
  notifications: false,
  cache: false,
  billing: [],
  email: false,
  api: true,
  auth: true,
  pdf: false,
  eve: false,
};

function deploymentProfile(profile?: Partial<DeploymentProfile>): DeploymentProfile {
  return { ...DEFAULT_DEPLOYMENT_PROFILE, ...profile };
}

export function usesCustomNextServer(profile?: Partial<DeploymentProfile>): boolean {
  const effective = deploymentProfile(profile);
  return (
    effective.messaging &&
    effective.database === "postgres" &&
    effective.framework === "nextjs" &&
    effective.apps.includes("web")
  );
}

export function hasPersistentPostgresJobs(profile?: Partial<DeploymentProfile>): boolean {
  const effective = deploymentProfile(profile);
  return effective.jobs && effective.database === "postgres";
}

export function hasPersistentPostgresStorage(profile?: Partial<DeploymentProfile>): boolean {
  const effective = deploymentProfile(profile);
  return effective.storage && effective.database === "postgres";
}

export function typescriptRuntimeCommand(runtime: "node" | "bun", entrypoint: string): string {
  return runtime === "bun"
    ? `bun --conditions=react-server ${entrypoint}`
    : `node --import ./scripts/typescript-runtime-loader.mjs --conditions=react-server --experimental-strip-types ${entrypoint}`;
}

function packageRunner(): "bun" {
  return "bun";
}

function productionWebScript(profile: DeploymentProfile): "start" | "start:web" {
  return hasPersistentPostgresJobs(profile) || hasHostedWebEve(profile) ? "start:web" : "start";
}

const VERCEL_BUN_RUNTIME_SELECTORS: Readonly<Record<string, string>> = {
  "1.4": "1.4.x",
};

export function nodeEngineSelector(version: string = v.runtime.node): string {
  const parsed = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!parsed) throw new Error(`Invalid canonical Node version: ${version}`);
  return `${parsed[1]}.x`;
}

export function vercelBunRuntimeSelector(version: string = v.runtime.bun): string {
  // Vercel currently accepts 1.4.x and 1.x and manages patch upgrades. This
  // selector controls the function runtime line; install/build still execute
  // the exact catalog pin through bunx below.
  const parsed = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!parsed) {
    throw new Error(`Invalid canonical Bun version for Vercel: ${version}`);
  }
  const minor = `${parsed[1]}.${parsed[2]}`;
  const selector = VERCEL_BUN_RUNTIME_SELECTORS[minor];
  if (!selector) {
    throw new Error(`Vercel does not declare support for the Bun ${minor}.x runtime line`);
  }
  return selector;
}

function vercelBunCommand(command: string): string {
  return `bunx bun@${v.runtime.bun} ${command}`;
}

function vercelGuardedBunCommand(command: string): string {
  return `${vercelBunCommand(DEPLOY_LOCKFILE_GUARD_PATH)} && ${vercelBunCommand(command)}`;
}

function vercelGuardedInstallCommand(): string {
  return [
    vercelBunCommand(DEPLOY_LOCKFILE_GUARD_PATH),
    vercelBunCommand("run audit:lock"),
    vercelBunCommand("install --frozen-lockfile"),
  ].join(" && ");
}

function deploymentBuildCommand(profile: DeploymentProfile): string {
  return profile.mode === "monorepo" ? "scripts/build-deployment.mjs" : "run build";
}

function deploymentBuildScriptContent(projectName: string, profile: DeploymentProfile): string {
  const evePackageName = `${projectName}-eve`;
  return `import { spawnSync } from "node:child_process";

const EXPECTED_BUN_VERSION = ${JSON.stringify(v.runtime.bun)};
const FRAMEWORK = ${JSON.stringify(profile.framework)};
const HAS_HOSTED_EVE = ${hasHostedWebEve(profile)};
const EVE_PACKAGE_NAME = ${JSON.stringify(evePackageName)};

if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  throw new Error(
    "Deployment builds require Bun " + EXPECTED_BUN_VERSION +
      "; received " + (typeof Bun === "undefined" ? "a non-Bun runtime" : "Bun " + Bun.version),
  );
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Next/withEve owns its service build on Vercel. Every other hosted Eve
// topology needs the standalone agent artifact before the web build starts.
if (HAS_HOSTED_EVE && (!process.env.VERCEL || FRAMEWORK === "tanstack-start")) {
  run(["x", "--no-install", "turbo", "run", "build", "--filter=" + EVE_PACKAGE_NAME]);
}

// Deploying the web host must never package sibling Expo/Electron clients.
// The trailing ellipsis includes the web package's complete dependency closure.
const filters = ["--filter=web..."];
if (HAS_HOSTED_EVE) filters.push("--filter=!" + EVE_PACKAGE_NAME);
run(["x", "--no-install", "turbo", "run", "build", ...filters]);
`;
}

function deploymentBuildFiles(
  projectName: string,
  deploy: DeployTarget,
  profile: DeploymentProfile,
): TemplateFile[] {
  if (deploy === "none" || profile.mode !== "monorepo" || !profile.apps.includes("web")) {
    return [];
  }
  return [file("scripts/build-deployment.mjs", deploymentBuildScriptContent(projectName, profile))];
}

export const DEPLOY_WEB_RUNTIME_GUARD_PATH = "scripts/assert-web-runtime-boundary.mjs";

function webRuntimeDependencyGuardContent(): string {
  return `import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ROOT_NODE_MODULES = join(ROOT, "node_modules");
const NATIVE_ONLY_NAMES = new Set([
  "@better-auth/expo",
  "electron",
  "electron-builder",
  "electron-store",
  "electron-updater",
  "electron-vite",
  "expo",
  "react-native",
  "uniwind",
]);
const NATIVE_ONLY_PREFIXES = [
  "@electron/",
  "@expo/",
  "@react-native/",
  "@react-native-",
  "expo-",
  "react-native-",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function packageManifests(packageRoot) {
  if (!existsSync(packageRoot)) return [];
  const manifests = [];
  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".bun") continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith("@")) {
      const scopeRoot = join(packageRoot, entry.name);
      if (!existsSync(scopeRoot)) continue;
      for (const scoped of readdirSync(scopeRoot, { withFileTypes: true })) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          manifests.push(join(scopeRoot, scoped.name, "package.json"));
        }
      }
    } else {
      manifests.push(join(packageRoot, entry.name, "package.json"));
    }
  }
  return manifests;
}

if (!existsSync(ROOT_NODE_MODULES)) {
  fail("Web runtime dependency boundary is missing node_modules");
}

const packageRoots = [ROOT_NODE_MODULES];
for (const parent of ["apps", "packages", "tooling"]) {
  const parentRoot = join(ROOT, parent);
  if (!existsSync(parentRoot)) continue;
  for (const workspace of readdirSync(parentRoot, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    const packageRoot = join(parentRoot, workspace.name, "node_modules");
    if (existsSync(packageRoot)) packageRoots.push(packageRoot);
  }
}

const manifests = new Set();
for (const packageRoot of packageRoots) {
  for (const manifest of packageManifests(packageRoot)) manifests.add(manifest);
  const store = join(packageRoot, ".bun");
  if (!existsSync(store)) continue;
  for (const entry of readdirSync(store, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const manifest of packageManifests(join(store, entry.name, "node_modules"))) {
      manifests.add(manifest);
    }
  }
}

const nativeOnly = new Set();
for (const manifest of manifests) {
  if (!existsSync(manifest)) continue;
  const parsed = JSON.parse(readFileSync(manifest, "utf8"));
  if (!parsed || typeof parsed.name !== "string") {
    fail("Installed package has an invalid manifest: " + manifest);
  }
  const name = parsed.name;
  if (
    NATIVE_ONLY_NAMES.has(name) ||
    NATIVE_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix))
  ) {
    nativeOnly.add(name);
  }
}

if (nativeOnly.size > 0) {
  fail(
    "Web runtime dependency boundary contains native-only packages: " +
      [...nativeOnly].sort().join(", "),
  );
}
`;
}

function dockerProductionInstallInstruction(
  projectName: string,
  profile: DeploymentProfile,
): string {
  const filters =
    profile.mode === "monorepo"
      ? [
          "./",
          "web...",
          ...(hasPersistentPostgresJobs(profile) ? ["@repo/jobs-runtime..."] : []),
          ...(hasPersistentPostgresStorage(profile) ? ["@repo/api..."] : []),
          ...(hasHostedWebEve(profile) ? [`${projectName}-eve...`] : []),
        ]
      : [];
  const filterArguments = filters
    .map((filter) => ` --filter='${filter.replaceAll("'", "'\\''")}'`)
    .join("");
  return `# The build install contains every workspace so Turbo can compile the selected graph.
# Recreate node_modules from the frozen production graph: Bun does not remove
# already-installed dev or excluded-workspace packages when --production is rerun.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules tooling/*/node_modules
# Husky is a root development prepare hook. Remove only that hook so Bun can
# still run trusted production dependency lifecycle scripts during the reinstall.
RUN bun pm pkg delete scripts.prepare
RUN bun run audit:lock
RUN bun install --production --frozen-lockfile${filterArguments}
RUN bun ${DEPLOY_WEB_RUNTIME_GUARD_PATH}
`;
}

function dockerfileContent(
  projectName: string,
  runtime: "node" | "bun",
  profile: DeploymentProfile,
): string {
  const supervised =
    hasPersistentPostgresJobs(profile) ||
    hasPersistentPostgresStorage(profile) ||
    hasHostedWebEve(profile);
  const runtimeUser = "1000:1000";
  const webApplicationRoot = profile.mode === "single" ? "/app" : "/app/apps/web";
  const writablePaths = [
    ...(profile.apps.includes("web") && profile.framework === "nextjs"
      ? [
          `${webApplicationRoot}/.next/cache`,
          `${webApplicationRoot}/.next/server/app`,
          `${webApplicationRoot}/.next/server/pages`,
        ]
      : []),
    ...(hasPersistentPostgresStorage(profile) ? ["/app/data/uploads"] : []),
    ...(hasHostedWebEve(profile)
      ? [
          eveWorkflowDataPath(profile).replace(/\/\.workflow-data$/, ""),
          eveWorkflowDataPath(profile),
        ]
      : []),
  ];
  const writableSetup =
    writablePaths.length > 0
      ? `RUN mkdir -p ${writablePaths.join(" ")} && chown -R ${runtimeUser} ${writablePaths.join(" ")}\n`
      : "";
  const eveRuntimeEnv = hasHostedWebEve(profile) ? "ENV EVE_NEXT_PRODUCTION_PORT=4274\n" : "";
  const storageRuntimeEnv = hasPersistentPostgresStorage(profile)
    ? "ENV UPLOADS_DIR=/app/data/uploads\n"
    : "";
  const nativeApplicationRoots = [
    ...(profile.apps.includes("mobile") ? ["apps/mobile"] : []),
    ...(profile.apps.includes("desktop") ? ["apps/desktop"] : []),
  ];
  const nativeApplicationPrune =
    nativeApplicationRoots.length > 0
      ? `# Native clients are separate deliverables and never belong in the web runtime image.\nRUN rm -rf ${nativeApplicationRoots.join(" ")}\n`
      : "";
  const productionInstall = dockerProductionInstallInstruction(projectName, profile);
  const pdfReplicaInvariant = profile.pdf
    ? "# PDF admission is process-local. Run exactly one web replica unless you replace it with a shared transactional adapter.\n"
    : "";
  const command = supervised
    ? 'CMD ["bun", "scripts/start-production.mjs"]'
    : 'CMD ["bun", "run", "start"]';
  const lockfileGuard = `RUN bun ${DEPLOY_LOCKFILE_GUARD_PATH}`;
  const lockAudit = "RUN bun run audit:lock";
  if (runtime === "node") {
    return `# syntax=docker/dockerfile:1
FROM oven/bun:${v.runtime.bun} AS bun-runtime

FROM node:${v.runtime.node}-bookworm-slim AS base
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

# Stable Dockerfile syntax deliberately copies the complete workspace before
# installation. This preserves workspace paths and makes Bun read bunfig.toml
# without relying on experimental parent-preserving copy flags.
COPY . .
${lockfileGuard}
${lockAudit}
RUN bun install --frozen-lockfile

${dockerBuildInstruction(deploymentBuildCommand(profile))}
${productionInstall}${nativeApplicationPrune}

FROM node:${v.runtime.node}-bookworm-slim
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
STOPSIGNAL SIGTERM
# STOPSIGNAL selects SIGTERM only; it does not extend Docker's 10-second default.
# compose.production.yml grants ${DEPLOY_STOP_GRACE_SECONDS}s. For standalone containers use:
# docker stop --time ${DEPLOY_STOP_GRACE_SECONDS} <container>
# Container-local uploads are not durable or shared. Use S3/Tigris by default;
# configure STORAGE_BUCKET and credentials as runtime secrets. Override only
# when an explicitly managed single-instance volume is mounted.
# Storage-enabled profiles supervise their cleanup worker in this image.
ENV STORAGE_DRIVER=s3
COPY --from=base --chown=${runtimeUser} /app ./
${pdfReplicaInvariant}${writableSetup}${eveRuntimeEnv}${storageRuntimeEnv}USER ${runtimeUser}
EXPOSE 3000
${dockerHealthcheckInstruction()}
${command}
`;
  }
  return `# syntax=docker/dockerfile:1
FROM oven/bun:${v.runtime.bun} AS base
WORKDIR /app

# Stable Dockerfile syntax deliberately copies the complete workspace before
# installation. This preserves workspace paths and makes Bun read bunfig.toml
# without relying on experimental parent-preserving copy flags.
COPY . .
${lockfileGuard}
${lockAudit}
RUN bun install --frozen-lockfile

${dockerBuildInstruction(deploymentBuildCommand(profile))}
${productionInstall}${nativeApplicationPrune}

# Runtime — plain tag (slim/alpine variants lack toolchain needed by turbo)
FROM oven/bun:${v.runtime.bun}
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
STOPSIGNAL SIGTERM
# STOPSIGNAL selects SIGTERM only; it does not extend Docker's 10-second default.
# compose.production.yml grants ${DEPLOY_STOP_GRACE_SECONDS}s. For standalone containers use:
# docker stop --time ${DEPLOY_STOP_GRACE_SECONDS} <container>
# Container-local uploads are not durable or shared. Use S3/Tigris by default;
# configure STORAGE_BUCKET and credentials as runtime secrets. Override only
# when an explicitly managed single-instance volume is mounted.
# Storage-enabled profiles supervise their cleanup worker in this image.
ENV STORAGE_DRIVER=s3
COPY --from=base --chown=${runtimeUser} /app ./
${pdfReplicaInvariant}${writableSetup}${eveRuntimeEnv}${storageRuntimeEnv}USER ${runtimeUser}
EXPOSE 3000
${dockerHealthcheckInstruction()}
${command}
`;
}

function dockerignoreContent(): string {
  // Keep convex/_generated in the context: generated application modules import
  // it during the image build, and credentialed codegen must not run in Docker.
  return `node_modules
**/node_modules
dist
apps/*/dist
packages/*/dist
tooling/*/dist
.next
**/.next
.output
**/.output
out
apps/*/out
.expo
**/.expo
.eve
**/.eve
.turbo
**/.turbo
.git
.ghostinit
.ghostinit-staging
.ghostinit.lock
**/.ghostinit
**/.ghostinit-staging
**/.ghostinit.lock
.env*
**/.env*
.npmrc
**/.npmrc
.netrc
**/.netrc
data/uploads
`;
}

function flyTomlContent(projectName: string, profile: DeploymentProfile): string {
  const sanitized = projectName.replace(/[^a-z0-9-]/g, "-").toLowerCase();
  const runner = packageRunner();
  const hasWeb = profile.apps.includes("web");
  const hostedEve = hasHostedWebEve(profile);
  const keepsEveSchedulesWarm = hostedEve;
  const pdfMachineLimit = profile.pdf
    ? `  # PDF admission is process-local; keep the application at one machine until a shared adapter is configured.
  max_machines_running = 1
`
    : "";
  const processes = hostedEve
    ? [`  app = "${runner} run start:production"`]
    : [
        ...(hasWeb ? [`  app = "${runner} run ${productionWebScript(profile)}"`] : []),
        ...(hasPersistentPostgresJobs(profile) ? [`  jobs = "${runner} run jobs:start"`] : []),
        ...(hasPersistentPostgresStorage(profile)
          ? [`  storage_cleanup = "${runner} run storage:cleanup-worker"`]
          : []),
      ];
  const processGroups =
    hostedEve || processes.length > (hasWeb ? 1 : 0)
      ? `\n[processes]\n${processes.join("\n")}\n`
      : "";
  const webService = hasWeb
    ? `
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = ${keepsEveSchedulesWarm ? "false" : "true"}
  auto_start_machines = true
  min_machines_running = ${keepsEveSchedulesWarm ? "1" : "0"}
${pdfMachineLimit}  processes = ["app"]

[http_service.concurrency]
  type = "connections"
  hard_limit = 25
  soft_limit = 20

[[http_service.checks]]
  grace_period = "30s"
  interval = "30s"
  method = "GET"
  path = "${DEPLOY_HEALTH_PATH}"
  protocol = "http"
  timeout = "5s"
`
    : "";
  const eveMount = hostedEve
    ? `
[[mounts]]
  source = "eve_workflow_data"
  destination = "${eveWorkflowDataPath(profile)}"
  initial_size = "1gb"
  processes = ["app"]
`
    : "";
  const eveEnvironment = hostedEve ? '  EVE_NEXT_PRODUCTION_PORT = "4274"\n' : "";
  return `app = "${sanitized}"
primary_region = "iad"
kill_signal = "SIGTERM"
kill_timeout = "${DEPLOY_STOP_GRACE_SECONDS}s"

[build]
  dockerfile = "Dockerfile"
${processGroups}
[env]
  NODE_ENV = "production"
  PORT = "3000"
${eveEnvironment}  # Fly Volumes are machine-local, not shared across scaled processes. Default
  # to S3/Tigris so storage fails closed without a bucket. Configure
  # STORAGE_BUCKET and credentials with fly secrets before enabling storage.
  # Storage-enabled profiles schedule the cleanup worker as a separate process.
  STORAGE_DRIVER = "s3"
${eveMount}${webService}
`;
}

function vercelJsonContent(runtime: "node" | "bun", profile: DeploymentProfile): string {
  const isTanStack = profile.framework === "tanstack-start";
  return JSON.stringify(
    {
      $schema: "https://openapi.vercel.sh/vercel.json",
      framework: isTanStack ? null : "nextjs",
      ...(runtime === "bun" ? { bunVersion: vercelBunRuntimeSelector() } : {}),
      buildCommand: vercelGuardedBunCommand(deploymentBuildCommand(profile)),
      installCommand: vercelGuardedInstallCommand(),
      outputDirectory: isTanStack
        ? profile.mode === "single"
          ? ".vercel/output"
          : "apps/web/.vercel/output"
        : profile.mode === "single"
          ? ".next"
          : "apps/web/.next",
    },
    null,
    2,
  );
}

function typescriptRuntimeLoaderContent(): string {
  return `import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function sourceUrl(candidate) {
  const extension = extname(candidate);
  const paths = !extension
    ? [candidate + ".ts", candidate + ".tsx", candidate + "/index.ts", candidate + "/index.tsx"]
    : extension === ".js"
      ? [candidate.slice(0, -3) + ".ts", candidate.slice(0, -3) + ".tsx"]
      : extension === ".jsx"
        ? [candidate.slice(0, -4) + ".tsx"]
        : [candidate];
  for (const path of paths) {
    if (existsSync(path)) return pathToFileURL(path).href;
  }
  return null;
}

// Node's type stripper executes .ts but does not infer extensions or tsconfig
// aliases. Keep the hook deliberately narrow: relative source imports plus the
// single-mode @/ alias. Package exports still resolve through Node itself.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = sourceUrl(resolve(process.cwd(), "src", specifier.slice(2)));
      if (url) return { url, shortCircuit: true };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const url = sourceUrl(fileURLToPath(new URL(specifier, context.parentURL)));
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
`;
}

function productionScripts(profile: DeploymentProfile): string[] {
  return [
    ...(profile.apps.includes("web") ? [productionWebScript(profile)] : []),
    ...(hasHostedWebEve(profile) ? ["start:eve"] : []),
    ...(hasPersistentPostgresJobs(profile) ? ["jobs:start"] : []),
    ...(hasPersistentPostgresStorage(profile) ? ["storage:cleanup-worker"] : []),
  ];
}

function deploymentHealthFiles(profile: DeploymentProfile): TemplateFile[] {
  if (!profile.apps.includes("web") || profile.api !== false) return [];
  const root = profile.mode === "single" ? "" : "apps/web/";
  if (profile.framework === "tanstack-start") {
    return [file(`${root}src/routes/api/health.ts`, healthFileContent("tanstack"))];
  }
  return [file(`${root}src/app/api/health/route.ts`, healthFileContent("next"))];
}

export function deployFiles(
  projectName: string,
  deploy: DeployTarget = "none",
  runtime: "node" | "bun" = "bun",
  profileInput?: Partial<DeploymentProfile>,
): TemplateFile[] {
  const profile = deploymentProfile(profileInput);
  const supportFiles =
    runtime === "node" && usesCustomNextServer(profile)
      ? [file("scripts/typescript-runtime-loader.mjs", typescriptRuntimeLoaderContent())]
      : [];
  const eveLifecycleFiles = integratedEveLifecycleFiles(projectName, profile);
  const productionFiles =
    hasPersistentPostgresJobs(profile) ||
    hasPersistentPostgresStorage(profile) ||
    hasHostedWebEve(profile)
      ? [
          file(
            "scripts/start-production.mjs",
            productionProcessSupervisorContent(
              productionScripts(profile),
              hasHostedWebEve(profile)
                ? {
                    hostedEve: {
                      eveScript: "start:eve",
                      webScript: productionWebScript(profile),
                    },
                  }
                : {},
            ),
          ),
        ]
      : [];
  const operationalHealthFiles = deploymentHealthFiles(profile);
  const buildFiles = deploymentBuildFiles(projectName, deploy, profile);
  const lockfileGuardFiles =
    deploy === "none"
      ? []
      : [file(DEPLOY_LOCKFILE_GUARD_PATH, deploymentLockfileGuardContent(v.runtime.bun))];
  const webRuntimeGuardFiles =
    deploy === "docker" || deploy === "fly"
      ? [file(DEPLOY_WEB_RUNTIME_GUARD_PATH, webRuntimeDependencyGuardContent())]
      : [];
  const workflowPath = hasHostedWebEve(profile) ? eveWorkflowDataPath(profile) : undefined;
  const requiresSingleReplica = profile.pdf === true || workflowPath !== undefined;
  if (deploy === "none") return [...supportFiles, ...eveLifecycleFiles, ...productionFiles];
  if (deploy === "cloudflare") {
    return [
      ...lockfileGuardFiles,
      ...operationalHealthFiles,
      ...cloudflareDeploymentFiles(projectName, profile),
    ];
  }
  if (deploy === "docker") {
    return [
      ...supportFiles,
      ...eveLifecycleFiles,
      ...productionFiles,
      ...buildFiles,
      ...lockfileGuardFiles,
      ...webRuntimeGuardFiles,
      ...operationalHealthFiles,
      file("Dockerfile", dockerfileContent(projectName, runtime, profile)),
      file(".dockerignore", dockerignoreContent()),
      file("compose.production.yml", productionComposeContent(projectName, workflowPath)),
      file(
        "docs/DOCKER_DEPLOYMENT.md",
        dockerDeploymentGuideContent(
          projectName,
          v.runtime.bun,
          workflowPath,
          requiresSingleReplica,
        ),
      ),
    ];
  }
  if (deploy === "fly") {
    return [
      ...supportFiles,
      ...eveLifecycleFiles,
      ...productionFiles,
      ...buildFiles,
      ...lockfileGuardFiles,
      ...webRuntimeGuardFiles,
      ...operationalHealthFiles,
      file("Dockerfile", dockerfileContent(projectName, runtime, profile)),
      file(".dockerignore", dockerignoreContent()),
      file("fly.toml", flyTomlContent(projectName, profile)),
      file(
        "docs/FLY_DEPLOYMENT.md",
        flyDeploymentGuideContent(v.runtime.bun, requiresSingleReplica),
      ),
    ];
  }
  if (deploy === "vercel") {
    return [
      ...supportFiles,
      ...eveLifecycleFiles,
      ...buildFiles,
      ...lockfileGuardFiles,
      file("vercel.json", vercelJsonContent(runtime, profile)),
      ...(runtime === "bun"
        ? [
            file(
              "docs/VERCEL_DEPLOYMENT.md",
              vercelDeploymentGuideContent(vercelBunRuntimeSelector(), v.runtime.bun),
            ),
          ]
        : []),
    ];
  }
  return [...supportFiles, ...eveLifecycleFiles, ...productionFiles];
}
