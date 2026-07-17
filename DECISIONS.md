# GhostInit v0.1 Architectural Decisions

## Format

- Decision ID
- Date
- Context
- Decision
- Consequences
- Related Deviations

## D1

- **Date**: 2026-07-12
- **Context**: Repository just initialized; tooling versions pending research.
- **Decision**: Use Bun as the primary runtime and package manager for GhostInit itself. Generated projects must support both Bun and Node runtimes via `--runtime=node|bun`.
- **Consequences**: CLI sources are compiled/transpiled with `bun build`. Generated projects may use Bun or Node depending on flag.
- **Related Deviations**: None yet.

## D2

- **Date**: 2026-07-12
- **Context**: Spec requires TypeScript 7 but TypeScript 6 sidecar compatibility.
- **Decision**: Use TypeScript 7 (latest stable `typescript@^7`) for tool-generated configuration. Provide a generated-sidecar package `packages/tsconfig-legacy` only if a generated module explicitly targets a legacy consumer; default generated apps use TS 7 only.
- **Consequences**: Need to verify current stable TypeScript 7 version and confirm compatibility with Next.js, Drizzle, oRPC, etc.
- **Related Deviations**: None yet.

## D3

- **Date**: 2026-07-12
- **Context**: Tech stack stack (Next.js, Drizzle, Better Auth, oRPC, TanStack Query/Form, shadcn/ui Base UI, Tailwind, Biome, Bun test, Playwright).
- **Decision**: Research and use current stable major versions for every dependency. Pin exact versions in catalogs. No `latest` or floating tags in generated `package.json` files. Track chosen versions in `packages/versions.ts` registry.
- **Consequences**: Requires comprehensive Phase 1 compatibility matrix before template generation.
- **Related Deviations**: None yet.
