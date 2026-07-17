# GhostInit

Production-grade CLI that scaffolds opinionated modular-monolith Next.js projects on Bun.

## Quick Start

```bash
bun add -g ghostinit
ghostinit create my-app
```

## Commands

- `ghostinit create <name> [--cwd dir] [--no-install] [--force]` – generate a new monorepo
- `ghostinit status` – show project metadata and lock state
- `ghostinit doctor` – verify host tooling and environment
- `ghostinit check` – run the architecture checker
- `ghostinit sync [--check]` – rebuild deterministic registries
- `ghostinit add module <name>` – add an empty bounded-context module

## Development

```bash
bun install
bun run check   # lint + format-check + typecheck
bun run test
bun run build
```

## Stack

- Bun runtime and package manager
- Next.js 16 + React 19
- TypeScript 7
- Drizzle ORM + PostgreSQL
- Better Auth (email/password, 2FA, admin plugin)
- oRPC contract-first RPC + OpenAPI
- TanStack Query / Form
- Tailwind CSS v4 + Base UI + shadcn/ui style components
- oxlint + oxfmt
- Turborepo
