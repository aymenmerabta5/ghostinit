# GhostInit

Production-grade CLI that scaffolds well-structured monorepos with architectural linting (inspired by modular monolith, enforcement build-time via oxc-parser) for Next.js/TanStack Start.

> New contributor? Start with **[CONTRIBUTING.md](./CONTRIBUTING.md)** (host vs generated, GhostInit Layered Architecture UI->Supporting inspired by DDD, how to add packages/billing/modes) and deep dive **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** for dependency graph, oRPC contract-first, billing flexibility.

## Overview

Host (`ghostinit` CLI) generates GhostInit Layered Architecture (UI->Supporting, inspired by DDD, pragmatic linear chain — NOT canonical DDD — build-time enforced via oxc-parser, well-structured monorepo with architectural linting, not runtime isolation, single DB shared, separate deployables, not single binary): UI(1) → Transport(oRPC 2) → Domain(3) → Capabilities(4) → Vendors(5) → Supporting(6) enforced by `src/lib/architecture.ts` via `oxc-parser`. Host is single package with composers (<300 LOC/file host-only goal, no `export *`), generated is `apps/* + packages/* + tooling/*` with `turbo.json` globalEnv 50+ vars, `bunfig.toml` hoist policy split (host isolated, generated hoist=true for Next compat).

## Quick Start

```bash
bun add -g ghostinit
ghostinit create my-app
# flexible billing: --billing chargily,stripe  (Algeria + Global)
# framework: --framework tanstack-start
```

## Commands

- `ghostinit create <name> [--cwd dir] [--no-install] [--force]` – generate a new monorepo
- `ghostinit status` – show project metadata and lock state
- `ghostinit doctor` – verify host tooling and environment
- `ghostinit check` – run the architecture checker (GhostInit Layered 6-layer + vendor/capability isolation)
- `ghostinit sync [--check]` – rebuild deterministic registries
- `ghostinit add module <name>` – add an empty bounded-context module
- `create` options: `--mode monorepo|single --framework nextjs|tanstack-start --billing stripe,chargily,paddle,polar|both|all|none --database postgres|convex|none --apps web,mobile,desktop|both|all --preset saas|frontend|custom --with-eve --with-i18n --cache redis|none` (`--features eve,i18n` deprecated alias for `--with-eve/--with-i18n`)

## Development

```bash
bun install
bun run check   # lint + format-check + typecheck
bun run test    # unit + integration --timeout 100000
bun run build   # Bun.build js + tsc real d.ts
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- How to add new package / billing provider / mode / feature
- Build system (scripts/build.ts, turbo.json globalEnv, bunfig.toml isolated vs hoist)
- Code style (<300 LOC, no export *, composers <5 imports, FsTransaction, secret-safe logger)
- Testing (fixtures, smoke test)

## Stack

- Bun 1.3.14 + Node 24 target, isolated linker host vs hoist=true generated
- Next.js 16.2.10 + React 19 + TanStack Start 1.168
- TypeScript 6.0.3 (TS7 7.0-dev preview, blocked for Next 16.2.10 detection)
- Drizzle ORM + PostgreSQL / Convex
- Better Auth (email/password, 2FA, admin)
- oRPC 1.14.7 contract-first + OpenAPI (pure, no Elysia dual RPC)
- Billing flexible any combo: stripe, chargily (Algeria EDAHABIA/CIB server-only), paddle, polar
- TanStack Query / Form, Tailwind v4 + Base UI + shadcn
- oxlint + oxfmt, Turborepo 2.10, t3env validation
- Architecture enforcer via oxc-parser 0.139

## Docs

- [CONTRIBUTING.md](./CONTRIBUTING.md) — onboarding, project structure, how to add packages/billing/modes/features, build, code style, testing, release (<500 lines concise)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — deep GhostInit Layered Architecture (6-layer pragmatic inspired by DDD) dependency graph, host vs generated, billing flexibility model, vendor isolation, capability isolation, oRPC contract-first, security logger, FsTransaction, release version sync
- [docs/RESEARCH.md](./docs/RESEARCH.md) — dependency version research (Context7 + npm registry)
