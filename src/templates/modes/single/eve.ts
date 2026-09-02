import type { BillingProviderName, FrameworkName } from "../../../lib/addons.js";
import { eveFiles as monorepoEveFiles } from "../../eve.js";
import type { TemplateFile } from "../../shared.js";

const EVE_APPLICATION_PREFIX = "apps/eve/";
const SINGLE_EVE_ROOT_PREFIXES = ["agent/", "evals/", "examples/", "lib/"] as const;
const SINGLE_EVE_ROOT_FILES = new Set(["nitro.config.mjs"]);

function singleEveInstructions(projectName: string, framework: FrameworkName): string {
  const frameworkDescription =
    framework === "tanstack-start" ? "TanStack Start with Vite" : "Next.js App Router";
  const integrationDescription =
    framework === "tanstack-start"
      ? "TanStack Start mounts the same-origin authenticated application facade at /api/agent. The raw Eve durable backend remains private at EVE_NEXT_PRODUCTION_ORIGIN."
      : "Next.js mounts Eve's HTTP routes on the application origin through withEve(config). Eve still runs as a separate durable backend runtime.";

  return `# Identity
You are ${projectName}'s durable backend agent, built with Eve's filesystem-first agent framework.

## Purpose
Help developers working on ${projectName} scaffold DDD modules, run architecture checks, sync deterministic registries, manage workflows, and understand the single-package application structure.

## Application Context
- This is one Bun package using ${frameworkDescription}, Better Auth, oRPC, and the selected database adapter.
- The project root is the Eve application root. Authored agent files live under \`agent/\`.
- UI code lives under \`src/\`; backend capabilities live under \`src/server/\`.
- ${integrationDescription}
- Run project and Eve commands from the project root.
- Quality gates: \`bun run typecheck\`, \`bun run lint\`, \`bun test\`, \`bun run build\`, \`ghostinit check\`, and \`ghostinit sync --check\`.

## Capabilities
- Scaffold modules via \`ghostinit add module <name>\`.
- Add use-cases, procedures, and actions.
- Sync registries, check architecture, and manage database migrations.
- Use the \`scaffold_module\`, \`check_architecture\`, \`sync_registries\`, \`list_modules\`, and \`db_migrate\` tools when appropriate.
- Load the \`ghostinit-workflow\` and \`module-design\` skills when relevant.

## Behavior
- Be concise but thorough.
- Ask clarifying questions one at a time.
- Before writing Eve code, read the relevant guide under \`node_modules/eve/docs/\`.
- Require human approval for sensitive actions.
- Do not leak secrets.
`;
}

function toSingleEvePath(path: string, framework: FrameworkName): string | undefined {
  if (!path.startsWith(EVE_APPLICATION_PREFIX)) return undefined;
  const relativePath = path.slice(EVE_APPLICATION_PREFIX.length);
  if (SINGLE_EVE_ROOT_FILES.has(relativePath)) {
    // TanStack Start already owns nitro.config.ts. Its composer injects the
    // same cross-platform resolver hook into that canonical config instead.
    return framework === "tanstack-start" ? undefined : relativePath;
  }
  return SINGLE_EVE_ROOT_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
    ? relativePath
    : undefined;
}

function singleEveContent(
  path: string,
  content: string,
  projectName: string,
  framework: FrameworkName,
): string {
  if (path === "agent/instructions.md") {
    return singleEveInstructions(projectName, framework);
  }

  const rewritten = content
    .replaceAll("GhostInit monorepo", "GhostInit single-package application")
    .replaceAll("the GhostInit monorepo", "the GhostInit single-package application")
    .replaceAll("packages/modules/src/", "src/server/modules/")
    .replaceAll("packages/api/src/", "src/server/api/")
    .replaceAll(
      "cd apps/eve && bun install && bunx --no-install eve dev",
      "bunx --no-install eve dev",
    )
    .replaceAll("parent GhostInit project root", "GhostInit project root")
    .replaceAll("--env-file=../../.env.local", "--env-file=.env.local");

  if (framework === "tanstack-start" && path === "agent/skills/ghostinit-workflow.md") {
    return rewritten.replace(
      "Eve diagnostics: from the project root run bun run eve:dev; never run it beside integrated bun run dev",
      "Eve: run bun run eve:dev as the private backend for TanStack Start's authenticated /api/agent facade",
    );
  }

  return rewritten;
}

/**
 * Reuses the authored Eve surface while making the generated project root the
 * Eve application root. Package, tsconfig, README, and ignore files belong to
 * the standalone monorepo app and must not create a nested project in single
 * mode.
 */
export function singleEveFiles(
  projectName: string,
  runtime: "node" | "bun",
  framework: FrameworkName,
  selectedBilling: BillingProviderName[],
): TemplateFile[] {
  return mapSingleEveApplicationFiles(
    monorepoEveFiles(projectName, runtime, selectedBilling),
    projectName,
    framework,
  );
}

export function mapSingleEveApplicationFiles(
  sourceFiles: readonly TemplateFile[],
  projectName: string,
  framework: FrameworkName,
): TemplateFile[] {
  const files: TemplateFile[] = [];
  for (const sourceFile of sourceFiles) {
    const path = toSingleEvePath(sourceFile.path, framework);
    if (path === undefined) continue;
    files.push({
      path,
      content: singleEveContent(path, sourceFile.content, projectName, framework),
    });
  }
  return files;
}
