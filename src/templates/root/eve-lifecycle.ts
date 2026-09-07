import { file, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import { developmentProcessSupervisorContent } from "./process-supervisor.js";

interface IntegratedEveProfile {
  readonly mode?: "monorepo" | "single";
  readonly framework?: string;
  readonly apps?: readonly string[];
  readonly eve?: boolean;
}

export function hasHostedWebEve(profile?: IntegratedEveProfile): boolean {
  return profile?.eve === true && (profile.apps ?? ["web"]).includes("web");
}

export function hasIntegratedNextEve(profile?: IntegratedEveProfile): boolean {
  return hasHostedWebEve(profile) && (profile?.framework ?? "nextjs") === "nextjs";
}

export function eveApplicationRoot(profile: IntegratedEveProfile): "." | "apps/eve" {
  return profile.mode === "single" ? "." : "apps/eve";
}

export function eveWorkflowDataPath(profile: IntegratedEveProfile): string {
  return profile.mode === "single"
    ? "/app/.eve/.workflow-data"
    : "/app/apps/eve/.eve/.workflow-data";
}

function buildWithEveContent(projectName: string, profile: IntegratedEveProfile): string {
  const mode = profile.mode === "single" ? "single" : "monorepo";
  const framework = profile.framework === "tanstack-start" ? "tanstack-start" : "nextjs";
  const evePackageName = `${projectName}-eve`;
  return `import { spawnSync } from "node:child_process";

const EXPECTED_BUN_VERSION = ${JSON.stringify(v.runtime.bun)};
const MODE = ${JSON.stringify(mode)};
const FRAMEWORK = ${JSON.stringify(framework)};
const EVE_PACKAGE_NAME = ${JSON.stringify(evePackageName)};

if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  throw new Error(
    "The Eve-aware build requires Bun " + EXPECTED_BUN_VERSION +
      "; received " + (typeof Bun === "undefined" ? "a non-Bun runtime" : Bun.version),
  );
}

function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Command failed with exit code " + String(result.status ?? 1));
}

const isVercel = Boolean(process.env.VERCEL);
if (MODE === "monorepo") {
  // Outside Vercel, withEve starts the previously built .output server, so
  // finish Eve before Next begins its production build. On Vercel, withEve
  // owns the generated service build and a standalone Eve build is redundant.
  if (!isVercel || FRAMEWORK === "tanstack-start") {
    run(["x", "--no-install", "turbo", "run", "build", "--filter=" + EVE_PACKAGE_NAME]);
  }
  run(["x", "--no-install", "turbo", "run", "build", "--filter=!" + EVE_PACKAGE_NAME]);
} else {
  if (FRAMEWORK === "tanstack-start") {
    run(["run", "eve:build"]);
  } else if (!isVercel) {
    run(["run", "eve:build"]);
  }
  run(["run", "build:web"]);
}
`;
}

function singleTanStackEveCommandContent(): string {
  return `import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const WEB_OUTPUT = resolve(ROOT, ".output");
const EVE_OUTPUT = resolve(ROOT, ".eve", "runtime-output");
const VITE_CONFIG = resolve(ROOT, "vite.config.ts");
const command = process.argv[2];
if (command !== "build" && command !== "start") {
  throw new Error("Expected Eve command build or start");
}

function assertInsideRoot(path) {
  const candidate = relative(ROOT, path);
  if (candidate === "" || candidate === ".." || candidate.startsWith("..\\\\") || candidate.startsWith("../")) {
    throw new Error("Eve output path escaped the generated project root");
  }
}

function run(args, env = process.env, executable = process.execPath) {
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Command failed with exit code " + String(result.status ?? 1));
}

const eveEnvironment = { ...process.env, GHOSTINIT_EVE_RUNTIME: "1" };
if (command === "start") {
  const entrypoint = resolve(EVE_OUTPUT, "server", "index.mjs");
  if (!existsSync(entrypoint)) throw new Error("Run bun run eve:build before starting Eve");
  run([entrypoint], eveEnvironment, "node");
  process.exit(0);
}

assertInsideRoot(WEB_OUTPUT);
assertInsideRoot(EVE_OUTPUT);
assertInsideRoot(VITE_CONFIG);
mkdirSync(dirname(EVE_OUTPUT), { recursive: true });
const savedWebOutput = existsSync(WEB_OUTPUT)
  ? resolve(ROOT, ".eve", "web-output-backup-" + randomUUID())
  : null;
if (savedWebOutput) renameSync(WEB_OUTPUT, savedWebOutput);
const savedViteConfig = existsSync(VITE_CONFIG)
  ? resolve(ROOT, ".eve", "vite-config-backup-" + randomUUID() + ".ts")
  : null;
if (savedViteConfig) renameSync(VITE_CONFIG, savedViteConfig);
let built = false;
try {
  run(["x", "--no-install", "eve", "build"], eveEnvironment);
  const stagedEveOutput = resolve(ROOT, ".eve", "runtime-output-next-" + randomUUID());
  renameSync(WEB_OUTPUT, stagedEveOutput);
  const previousEveOutput = existsSync(EVE_OUTPUT)
    ? resolve(ROOT, ".eve", "runtime-output-previous-" + randomUUID())
    : null;
  if (previousEveOutput) renameSync(EVE_OUTPUT, previousEveOutput);
  try {
    renameSync(stagedEveOutput, EVE_OUTPUT);
    if (previousEveOutput) rmSync(previousEveOutput, { force: true, recursive: true });
  } catch (error) {
    if (previousEveOutput && !existsSync(EVE_OUTPUT)) renameSync(previousEveOutput, EVE_OUTPUT);
    throw error;
  }
  built = true;
} finally {
  if (savedViteConfig && existsSync(savedViteConfig) && !existsSync(VITE_CONFIG)) {
    renameSync(savedViteConfig, VITE_CONFIG);
  }
  if (savedWebOutput && existsSync(savedWebOutput) && !existsSync(WEB_OUTPUT)) {
    renameSync(savedWebOutput, WEB_OUTPUT);
  }
}
if (!built) process.exit(1);
`;
}

function eveDevelopmentCommandContent(profile: IntegratedEveProfile): string {
  const applicationRoot = profile.mode === "single" ? "../" : "../apps/eve/";
  return `import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (typeof Bun !== "undefined") throw new Error("Eve's development worker requires Node.js");
const appRoot = fileURLToPath(new URL(${JSON.stringify(applicationRoot)}, import.meta.url));
const require = createRequire(pathToFileURL(join(appRoot, "package.json")));
const cli = join(dirname(require.resolve("eve/package.json")), "bin", "eve.js");
const port = process.env.EVE_NEXT_PRODUCTION_PORT?.trim() || "4274";
if (!/^[1-9]\\d{0,4}$/.test(port) || Number(port) > 65535) {
  throw new Error("EVE_NEXT_PRODUCTION_PORT must be an integer between 1 and 65535");
}
const result = spawnSync(process.execPath, [cli, "dev", "--no-ui", "--host", "127.0.0.1", "--port", port], {
  cwd: appRoot,
  env: { ...process.env, NODE_ENV: "development", GHOSTINIT_EVE_RUNTIME: "1" },
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
`;
}

function selfHostingGuide(profile: IntegratedEveProfile): string {
  const appRoot = eveApplicationRoot(profile);
  const workflowPath =
    profile.mode === "single" ? ".eve/.workflow-data" : "apps/eve/.eve/.workflow-data";
  const framework = profile.framework === "tanstack-start" ? "TanStack Start" : "Next.js";
  const integration =
    profile.framework === "tanstack-start"
      ? "The generated TanStack Start application exposes an authenticated `/api/agent` facade and supervises a private loopback Eve process."
      : "The generated Next.js application uses `withEve` for routing and the production supervisor owns one private loopback Eve process.";
  return `# Eve self-hosting contract

${integration}

## Build and process ownership

- \`bun run dev\` supervises Next.js and its private Eve companion together. TanStack Start runs \`bun run eve:dev\` separately.
- Eve runs on Node.js ${v.runtime.node} in development and production; the web app keeps its selected execution runtime. Next receives the development companion's loopback origin through \`EVE_BASE_URL\` and does not start a second Eve process.
- \`bun run build\` builds Eve before ${framework}. On Vercel, Next/\`withEve\` owns the generated service build.
- \`bun run start\` loads the local root environment and delegates to the hardened production supervisor. Injected production environments use \`bun run start:production\` directly when no \`.env.local\` exists.
- The supervisor starts exactly one web process and one loopback Eve process, validates distinct ports, waits for both listeners, and propagates failure and shutdown to both trees.
- \`bun run eve:dev\` and \`bun run eve:start\` remain explicit diagnostics. Do not run them beside the supervised production lifecycle.
- The Eve application root is \`${appRoot}\`.

## Durable workflow state

Self-hosted Eve stores local Workflow state under \`${workflowPath}\`. That directory must be persistent before accepting traffic. The generated \`compose.production.yml\` and Fly target mount stable named volumes, but those volumes are machine-local. The bare Dockerfile intentionally does not declare an anonymous volume; follow \`docs/DOCKER_DEPLOYMENT.md\` so standalone replacement containers reuse the explicit named volume. Fly keeps one application machine warm so authored schedules can fire even without HTTP traffic. Run one Eve/web replica or configure a Workflow world backed by shared durable storage before scaling horizontally. Never bake an existing \`.eve\` directory into an image.

## Reverse proxy and separate-service deployments

The integrated process exposes browser traffic through the Next.js origin. If Eve is moved behind a separate origin, set \`EVE_NEXT_PRODUCTION_ORIGIN\` during the Next.js build and preserve both route families at the Eve ingress without rewriting them:

- \`/eve/\` for health, sessions, streams, tools, channels, and subagents
- \`/.well-known/workflow/\` for Workflow callbacks

Set \`AI_GATEWAY_API_KEY\` on non-Vercel hosts when the agent uses a string model ID. Replace the generated placeholder through the host secret manager.
`;
}

export function integratedEveLifecycleFiles(
  projectName: string,
  profile: IntegratedEveProfile,
): TemplateFile[] {
  if (!hasHostedWebEve(profile)) return [];
  return [
    file("scripts/build-with-eve.mjs", buildWithEveContent(projectName, profile)),
    file("scripts/eve-dev.mjs", eveDevelopmentCommandContent(profile)),
    ...(hasIntegratedNextEve(profile)
      ? [
          file(
            profile.mode === "single"
              ? "scripts/start-development.mjs"
              : "apps/web/scripts/start-development.mjs",
            developmentProcessSupervisorContent(["eve:dev", "dev:web"], {
              hostedEve: { eveScript: "eve:dev", webScript: "dev:web" },
            }),
          ),
        ]
      : []),
    ...(profile.mode === "single" && profile.framework === "tanstack-start"
      ? [file("scripts/eve-command.mjs", singleTanStackEveCommandContent())]
      : []),
    file("docs/EVE_SELF_HOSTING.md", selfHostingGuide(profile)),
  ];
}
