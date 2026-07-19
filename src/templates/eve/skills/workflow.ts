import { file, type TemplateFile } from "../../shared.js";

export function skillGhostinitWorkflow(): TemplateFile {
  return file(
    "apps/eve/agent/skills/ghostinit-workflow.md",
    `---
description: Use when user needs to scaffold GhostInit DDD modules, use-cases, procedures, actions, run sync/check.
---
# GhostInit Workflow
## Steps
1. Create project: ghostinit create <name> --cwd D:/MyWork --no-install --force --json
2. Env: cp .env.example .env.local, bun install, docker compose up -d, bun run db:generate/migrate/dev
3. Scaffold module: ghostinit add module <name> --json
4. Add use-case: ghostinit add use-case <module> <name> --kind command|query
5. Add procedure: ghostinit add procedure <module> <name>
6. Add action: ghostinit add action <module> <name>
7. Sync: ghostinit sync --check / sync --json
8. Quality gates: typecheck, lint, test, build, check, sync --check
9. Eve: cd apps/eve && bun install && npx eve dev
10. Common pitfalls: domain purity, module isolation, client boundary, reserved names, cycles
`,
  );
}
