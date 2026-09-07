# GhostInit

Production-grade CLI that scaffolds well-structured monorepos with architectural linting (inspired by modular monolith, enforcement build-time via oxc-parser) for Next.js/TanStack Start.

> Start with **[VISION.md](./VISION.md)** for the product boundary, then see
> **[CONTRIBUTING.md](./CONTRIBUTING.md)** and the contributor
> **[architecture guide](./AGENTS.md#architecture)** for the dependency graph,
> oRPC contract-first transport, and billing model.

## Overview

The CLI compiles a validated project specification into an owned, transactional file plan. Generated projects separate UI, transport, application services, domain contracts, vendor adapters, and supporting infrastructure. Application and adapter dependencies point toward domain contracts; domain code cannot depend on their implementations. `ghostinit check` enforces these boundaries with resolved imports and `oxc-parser`. Single and monorepo modes share the same logical rules; monorepos package them under `apps/* + packages/* + tooling/*`. See [the architecture guide](./CONTRIBUTING.md#generated-application-boundaries).

## Quick Start

```bash
bun add -g ghostinit
ghostinit create my-app
# flexible billing: --billing chargily,stripe  (Algeria + Global)
# framework: --framework tanstack-start
```

## Commands

- `ghostinit create <name> [--cwd dir] [--no-install] [--force]` – generate a new monorepo
- `ghostinit init [name]` – generate into the current directory (same pipeline as create)
- `ghostinit upgrade [--dry-run]` – hash-gated transactional desired-state upgrade/re-render; preserves user-owned seed edits and stops on managed-file conflicts
- `ghostinit status` – show project metadata and lock state
- `ghostinit doctor` – verify host tooling and environment
- `ghostinit check` – run the architecture checker (GhostInit Layered 6-layer + vendor/capability isolation)
- `ghostinit sync [--check|--dry-run]` – reconcile pending desired configuration, then rebuild deterministic registries
- `ghostinit add module <name>` – add an empty bounded-context module
- `create` options: `--mode monorepo|single --framework nextjs|tanstack-start --billing stripe,chargily,paddle,polar|both|all|none --database postgres|convex|none --apps web,mobile,desktop|both|all --preset saas|frontend|custom --with-eve --with-i18n --cache redis|none --deploy vercel|fly|docker|cloudflare|none` (`--features eve,i18n` deprecated alias for `--with-eve/--with-i18n`)

Deployment artifacts keep Bun package management on exact catalog version `1.4.0`. Vercel's `bunVersion: "1.4.x"` is a provider-managed function-runtime patch line, while its install/build commands still invoke exact Bun `1.4.0`; use Docker or Fly when the execution runtime itself must remain byte-exact. Vercel, Docker, Fly, and Cloudflare require a verified regular root `bun.lock`: after `--no-install`, run `bun run install:bootstrap` with Bun `1.4.0` to resolve without lifecycle scripts, attest public-registry integrity and release age, then perform a frozen install and vulnerability audit. Vercel runs the shared lock guard before both dependency installation and application build; Docker/Fly and the Cloudflare Worker build wrapper run it before their frozen build path rather than trusting Bun's missing-lock behavior. Docker emits a BuildKit-secret build, health check, 30-second graceful-stop Compose contract, and explicit named Eve Workflow volume when selected. The local Postgres 18 Compose path mounts `/var/lib/postgresql` so its versioned data directory persists.

`--deploy cloudflare` packages Next.js with OpenNext and TanStack Start with Cloudflare's native Vite plugin. It is supported in monorepo and single web projects with Convex or no database; PostgreSQL, Eve, and server-side PDF are rejected until request-scoped/Workers-native adapters exist. Local Worker values live in the gitignored `.dev.vars`, while production build variables and runtime Worker secrets are configured separately. Production builds require matching explicit `SITE_URL` and framework app origins over non-loopback HTTPS. The generated build wrapper rejects runtime `.env*` files, scans its output for server-only values, and performs a Wrangler dry run in generated CI. Next.js projects also declare the production R2 incremental cache, Durable Object revalidation queue, and sharded Durable Object tag cache; provision the named R2 bucket before the first deploy. See the [Cloudflare Workers contract](./docs/engineering/CLOUDFLARE_WORKERS.md).

Host, generated-project, deployment, and compatibility-fixture installs enforce a seven-day (`604800` second) minimum package release age through `bunfig.toml`. The exclusion list is empty by default; update the typed supply-chain policy deliberately rather than bypassing it per package.

Production API mutations require `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for atomic shared rate limiting, even when the optional cache package is not selected. Generated placeholders enable only the bounded process-local development/test fallback; production fails closed when either value is absent or invalid.

Electron production builds require `DESKTOP_API_URL=https://api.example.com` in the build environment or the generated `.env.production.local`. electron-vite validates and embeds only that non-secret origin before electron-builder packages the app. Managed launches may override it with a runtime `DESKTOP_API_URL`; ordinary Explorer/Finder launches use the embedded origin. Credentials, query strings, fragments, non-HTTPS production URLs, and server secrets are rejected or excluded, and only development may fall back to `http://localhost:3000`. Generated desktop projects include a dedicated packaging guide.

- Single-mode Expo/Electron is frontend-only: no backend host or external remote-host contract is generated. Use monorepo `web,mobile` or `web,desktop` for auth, API, billing, messaging, storage, and other server-backed capabilities.

## Development

```bash
bun install
bun run check   # lint + format-check + typecheck
bun run test    # unit + integration --timeout 100000
bun run build   # Bun.build js + tsc real d.ts
bun run release # verify all gates, then pack/test/digest once; never publishes
```

Release preparation writes the exact tested tarball and SHA-256 sidecar under
`.ghostinit-release/`; see [CONTRIBUTING.md](./CONTRIBUTING.md#release). The
checksum identifies artifact bytes but is not a registry provenance attestation.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- How to add new package / billing provider / mode / feature
- Build system (scripts/build.ts, turbo.json globalEnv, bunfig.toml isolated vs hoist)
- Code style (<300 LOC, no export *, composers <5 imports, FsTransaction, secret-safe logger)
- Testing (fixtures, smoke test)

## Stack

- Bun version sourced from `packages/versions` + retained Node runtime target, isolated linker host vs hoist=true generated
- Next.js 16 + React 19 + TanStack Start 1.x (exact pins in `packages/versions`)
- TypeScript 7.0.2 across generated apps and shared tooling, including Next 16.3's project-local tsc CLI
- Drizzle ORM + PostgreSQL / Convex
- Better Auth (email/password, 2FA, admin)
- oRPC 1.15 contract-first + OpenAPI (pure, no Elysia dual RPC)
- Billing flexible any combo: stripe, chargily (Algeria EDAHABIA/CIB server-only), paddle, polar
- TanStack Query / Form, Tailwind v4 + Base UI + shadcn
- oxlint + oxfmt, Turborepo 2.10, t3env validation
- Architecture enforcer via catalog-pinned oxc-parser
- Cloudflare Workers: OpenNext for Next.js; native `@cloudflare/vite-plugin` for TanStack Start

## Docs

- [VISION.md](./VISION.md) — durable product direction: opinionated project infrastructure, internal architecture compiler, framework-native semantics, and explicit non-goals
- [CONTRIBUTING.md](./CONTRIBUTING.md) — onboarding, project structure, how to add packages/billing/modes/features, build, code style, testing, release (<500 lines concise)
- [AGENTS.md — Architecture](./AGENTS.md#architecture) — generated dependency graph, capability isolation, transport, security, and release invariants
- [AGENTS.md — Version Sync Gotcha](./AGENTS.md#version-sync-gotcha) — dependency/version verification and registry policy
- [External readiness contracts](./docs/engineering/EXTERNAL_READINESS.md) — credential-free CI versus protected, manual sandbox and staging evidence
- [Cloudflare Workers contract](./docs/engineering/CLOUDFLARE_WORKERS.md) — supported combinations, environment boundary, cache bindings, commands, and blocking evidence
- [V1-to-V2 compatibility ledger](./evidence/compatibility/v1-to-v2.json) and [schema](./evidence/compatibility/v1-to-v2.schema.json) — machine-readable command, option, exit-code, protocol, configuration, and migration decisions
- [DESIGN.md — Evidence and policy gates](./DESIGN.md#evidence-and-policy-gates) and the [initial frontend engineering record](./docs/engineering/frontend-task-records/design-system-contract-v1.json) — versioned design-system evidence and review provenance
