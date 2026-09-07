import * as v from "../versions.js";

export const DEPLOY_STOP_GRACE_SECONDS = 30;
export const DEPLOY_HEALTH_PATH = "/api/health";
export const DEPLOY_LOCKFILE_GUARD_PATH = "scripts/require-bun-lock.mjs";

export function deploymentLockfileGuardContent(expectedBunVersion: string): string {
  const guidance = `Deployment requires a verified regular root bun.lock; run bun run install:bootstrap using Bun ${expectedBunVersion} in fresh --no-install output before Vercel, Docker, Fly, or Cloudflare.`;
  return `import { lstatSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_BUN_VERSION = ${JSON.stringify(expectedBunVersion)};
const GUIDANCE = ${JSON.stringify(guidance)};
const lockfilePath = resolve(process.cwd(), "bun.lock");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  fail(
    "Deployment lock verification requires Bun " + EXPECTED_BUN_VERSION +
      "; received " + (typeof Bun === "undefined" ? "a non-Bun runtime" : "Bun " + Bun.version),
  );
}

let lockfile;
try {
  lockfile = lstatSync(lockfilePath);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    fail(GUIDANCE);
  }
  throw error;
}

if (!lockfile.isFile() || lockfile.isSymbolicLink()) fail(GUIDANCE);
`;
}

function dockerName(projectName: string): string {
  return projectName.replace(/[^a-z0-9_.-]/gi, "-").toLowerCase();
}

/**
 * Build with runtime configuration supplied as an ephemeral BuildKit secret.
 * Neither the raw file nor its base64 Fly representation is committed to a
 * layer. Requiring one of the two prevents a build from silently compiling
 * with missing or invented production configuration.
 */
export function dockerBuildInstruction(buildCommand = "run build"): string {
  return `RUN --mount=type=secret,id=ghostinit_env,required=false \\
    --mount=type=secret,id=ghostinit_env_b64,required=false \\
    set -eu; \\
    build_env=/tmp/ghostinit-build.env; \\
    trap 'rm -f "$build_env"' EXIT; \\
    if [ -s /run/secrets/ghostinit_env ]; then \\
      bun --env-file=/run/secrets/ghostinit_env ${buildCommand}; \\
    elif [ -s /run/secrets/ghostinit_env_b64 ]; then \\
      bun -e 'await Bun.write(process.argv[1], Buffer.from(await Bun.file(process.argv[2]).text(), "base64"))' "$build_env" /run/secrets/ghostinit_env_b64; \\
      bun --env-file="$build_env" ${buildCommand}; \\
    else \\
      echo "Build secret ghostinit_env (or ghostinit_env_b64 on Fly) is required" >&2; \\
      exit 1; \\
    fi`;
}

export function dockerHealthcheckInstruction(): string {
  return `HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["bun", "-e", "const response = await fetch('http://127.0.0.1:3000${DEPLOY_HEALTH_PATH}'); if (!response.ok) process.exit(1)"]`;
}

export function productionComposeContent(projectName: string, eveWorkflowPath?: string): string {
  const name = dockerName(projectName);
  const appVolume = eveWorkflowPath
    ? `    volumes:\n      - eve_workflow_data:${eveWorkflowPath}\n`
    : "";
  const topLevelVolume = eveWorkflowPath
    ? `volumes:\n  eve_workflow_data:\n    # Stable across container replacement; do not remove it with compose down -v.\n    name: "\${COMPOSE_PROJECT_NAME:-${name}}_eve_workflow_data"\n`
    : "";
  return `# Production application Compose file. The development Postgres service remains in docker-compose.yml.
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      secrets:
        - ghostinit_env
    restart: unless-stopped
    env_file:
      - .env.local
    environment:
      # Match the image's fail-closed production default even when development
      # .env.local contains STORAGE_DRIVER=local.
      STORAGE_DRIVER: s3
    ports:
      - "\${APP_BIND_ADDRESS:-127.0.0.1}:\${APP_PORT:-3000}:3000"
    # The generated supervisor reserves 20s for SIGTERM and 5s before escalation.
    stop_grace_period: ${DEPLOY_STOP_GRACE_SECONDS}s
${appVolume}secrets:
  ghostinit_env:
    # BuildKit mounts this ephemerally for validation/build; it is never copied.
    file: .env.local
${topLevelVolume}`;
}

export function dockerDeploymentGuideContent(
  projectName: string,
  expectedBunVersion: string,
  eveWorkflowPath?: string,
  singleReplica = false,
): string {
  const name = dockerName(projectName);
  const composeVolume = eveWorkflowPath
    ? `\nThe Compose file mounts the stable named volume \`${name}_eve_workflow_data\` at \`${eveWorkflowPath}\`. \`docker compose down\` preserves it; never use \`down -v\` unless deleting Workflow state is intentional.\n`
    : "";
  const standaloneVolume = eveWorkflowPath
    ? ` \\\n  --mount type=volume,src=${name}_eve_workflow_data,dst=${eveWorkflowPath}`
    : "";
  const replicaRule = singleReplica
    ? "\nThis profile uses process-local admission or Workflow state. Run exactly one application replica until a shared transactional adapter is configured.\n"
    : "";
  return `# Docker production contract

The image build requires BuildKit and mounts \`.env.local\` as the ephemeral
\`ghostinit_env\` build secret. The Dockerfile never copies \`.env*\` into a
layer. Runtime secrets are injected separately through Compose \`env_file\`.
Replace every required \`REPLACE_WITH_*\` value before building; schema
validation intentionally fails closed for selected providers such as Redis.

The build also requires a regular root \`bun.lock\`. If this project was created
  with \`--no-install\`, run \`bun run install:bootstrap\` using Bun \`${expectedBunVersion}\` before
building. The Dockerfile checks this before its frozen install and rejects a
missing lock, directory, or symbolic link with corrective guidance.
Both container installs read the generated \`bunfig.toml\`, enforcing a
${v.supplyChain.minimumReleaseAgeSeconds}-second minimum package age with no exclusions.

## Compose (recommended)

\`\`\`bash
docker compose --env-file .env.local -f compose.production.yml up -d --build
docker compose -f compose.production.yml ps
\`\`\`

The application service sets \`stop_grace_period: ${DEPLOY_STOP_GRACE_SECONDS}s\` and inherits the image health check at \`${DEPLOY_HEALTH_PATH}\`.
${composeVolume}${replicaRule}
## Standalone Docker

These commands work from PowerShell, cmd, bash, and zsh (enter the \`docker run\` command on one line where shell continuation differs):

\`\`\`bash
docker build --secret id=ghostinit_env,src=.env.local -t ${name} .
docker run -d --name ${name} --env-file .env.local -p 127.0.0.1:3000:3000${standaloneVolume} ${name}
docker inspect --format "{{json .State.Health}}" ${name}
docker stop --time ${DEPLOY_STOP_GRACE_SECONDS} ${name}
\`\`\`

\`STOPSIGNAL SIGTERM\` selects the signal but does not extend Docker's default
10-second timeout. Always retain the Compose grace period or use
\`docker stop --time ${DEPLOY_STOP_GRACE_SECONDS}\` for standalone containers.
`;
}

export function flyDeploymentGuideContent(
  expectedBunVersion: string,
  singleReplica = false,
): string {
  const replicaRule = singleReplica
    ? "\nKeep one application machine until process-local admission or Workflow state is replaced by a shared transactional adapter.\n"
    : "";
  return `# Fly.io production contract

The Docker build requires the base64-encoded \`.env.local\` as an ephemeral
BuildKit secret. It is decoded only inside one build step and is never retained
in an image layer.
Replace every required \`REPLACE_WITH_*\` value before deploying; selected
provider schemas intentionally fail closed when configuration is incomplete.

Fly uses the generated Dockerfile and requires a regular root \`bun.lock\`.
After \`--no-install\`, run \`bun run install:bootstrap\` using Bun \`${expectedBunVersion}\` before
\`fly deploy\`; the image build fails before dependency installation otherwise.
The generated \`bunfig.toml\` applies the ${v.supplyChain.minimumReleaseAgeSeconds}-second
minimum package age to both image installs with no exclusions.

POSIX shell:

\`\`\`bash
fly deploy --build-secret "ghostinit_env_b64=$(base64 < .env.local | tr -d '\\r\\n')"
\`\`\`

PowerShell:

\`\`\`powershell
$encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path '.env.local')))
fly deploy --build-secret "ghostinit_env_b64=$encoded"
\`\`\`

Configure runtime values separately with \`fly secrets\`. The generated service
checks \`${DEPLOY_HEALTH_PATH}\` before routing traffic and grants
${DEPLOY_STOP_GRACE_SECONDS} seconds after SIGTERM for graceful shutdown.
${replicaRule}`;
}

export function vercelDeploymentGuideContent(selector: string, exactBun: string): string {
  return `# Vercel Bun version contract

Vercel accepts \`${selector}\` and manages its patch version automatically.
The generated install and build commands still execute exact Bun \`${exactBun}\`.
Vercel deployment requires a regular root \`bun.lock\`. Both commands first run
\`${DEPLOY_LOCKFILE_GUARD_PATH}\` through that exact toolchain, so a missing,
non-regular, or symbolic-link lock fails before project dependency resolution or
application build. If this project was created with \`--no-install\`, run
\`bun run install:bootstrap\` using Bun \`${exactBun}\` before deploying.
That install reads the generated \`bunfig.toml\` and enforces a
${v.supplyChain.minimumReleaseAgeSeconds}-second minimum package age with no exclusions.

Function execution can advance within the Bun 1.4 patch line when Vercel updates
its managed runtime; Docker and Fly remain the targets for a byte-exact runtime.
`;
}
