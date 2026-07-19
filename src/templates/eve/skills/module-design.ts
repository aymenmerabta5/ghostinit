import { file, type TemplateFile } from "../../shared.js";

export function skillModuleDesign(): TemplateFile {
  return file(
    "apps/eve/agent/skills/module-design.md",
    `---
description: Use when designing DDD bounded-context modules in GhostInit monorepo.
---
# DDD Module Design
## Structure
<name>/ domain/types.ts Entity {id}, domain/index.ts barrel, application/<usecase>.<kind>.ts Input/Output/Deps/UseCase, index.ts version, ports/index.ts Port interface, index.ts barrel.
Plus DB schema and tests.
## Domain Layer MUST NOT import frameworks
Forbidden: react, next, drizzle-orm, pg, better-auth, @orpc/*, etc.
## Application Layer MUST NOT import frameworks
Use-cases command=writes, query=reads, auth in Deps.
## Ports isolation
Modules must NOT import other modules directly, use ports.
## DB Schema
pgTable pluralized, userId FK cascade.
## Naming
Regex ^[a-z][a-z0-9-]*$, not reserved, not JS keywords.
`,
  );
}
