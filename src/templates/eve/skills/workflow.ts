import { file, type TemplateFile } from "../../shared.js";

export function skillGhostinitWorkflow(): TemplateFile {
  return file(
    "apps/eve/agent/skills/ghostinit-workflow.md",
    `---
description: Use when user needs to scaffold GhostInit DDD modules, use-cases, procedures, actions, run sync/check.
---
# GhostInit Workflow
## Steps
1. Create project: ghostinit create <name> --cwd <parent-directory> --no-install --force --json
2. Env: review the generated .env.local vendor placeholders without copying over its self-issued secrets, then run bun install, docker compose --env-file .env.local up -d, and bun run db:generate/migrate/dev
3. Scaffold module: ghostinit add module <name> --json
4. Add use-case: ghostinit add use-case <module> <name> --kind command|query
5. Add procedure: ghostinit add procedure <module> <name>
6. Add action: ghostinit add action <module> <name>
7. Sync: ghostinit sync --check / sync --json
8. Quality gates: typecheck, lint, test, build, check, sync --check
9. Eve diagnostics: from the project root run bun run eve:dev; never run it beside integrated bun run dev
10. Common pitfalls: domain purity, module isolation, client boundary, reserved names, cycles
`,
  );
}
