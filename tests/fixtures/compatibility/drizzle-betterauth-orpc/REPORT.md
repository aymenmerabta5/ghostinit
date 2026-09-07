# Compatibility Fixture Report: Drizzle + Better Auth + oRPC

Fixture: `tests/fixtures/compatibility/drizzle-betterauth-orpc/`

- Current toolchain target: repository `runtime.bun`
- Original audit date: 2026-07-12
- Current verification refreshed: 2026-08-30 on Windows with the repository-pinned Bun version

## Goal

Keep a reproducible compatibility fixture for the exact pinned Drizzle, Better
Auth, oRPC, Zod, and TypeScript versions used by GhostInit. The committed
fixture is exercised through frozen dependency installation, fixture-local
TypeScript checking, targeted Bun tests, and explicit runtime probes.

## Current Pinned Versions

| Package          | Version |
| ---------------- | ------- |
| Bun              | `runtime.bun` |
| `bun-types`      | `runtime.bun` |
| `drizzle-orm`    | 0.45.2  |
| `drizzle-kit`    | 0.31.10 |
| `pg`             | 8.23.0  |
| `better-auth`    | 1.6.30  |
| `@orpc/server`   | 1.15.0  |
| `@orpc/contract` | 1.15.0  |
| `@orpc/client`   | 1.15.0  |
| `@orpc/openapi`  | 1.15.0  |
| `@orpc/zod`      | 1.15.0  |
| `zod`            | 4.4.3   |
| `@types/pg`      | 8.23.1  |
| TypeScript       | 7.0.2   |

## Current Root Fixture Runner

From the repository root, run:

```bash
bun run test:fixtures
```

The command runs `scripts/test-fixtures.ts`. The bounded runner requires Bun
the repository-pinned Bun version and gives every stage a bounded timeout. For this fixture it performs, in
order, `bun install --frozen-lockfile`, `bun run typecheck`, the fixture's Bun
test suite, and `bun run check:runtime`. The same runner also fully exercises
the committed Next/Oxlint/Oxfmt and Expo/Uniwind fixtures; do not prepend a
separate install.

The Bun test stage discovers two test files in this fixture:

- `tests/fixture.test.ts` defines five module, oRPC/OpenAPI, and Better Auth
  access-plugin checks.
- `tests/orpc-error-contract.test.ts` defines two structured-error checks.

The current fixture suite therefore defines seven Bun tests.

The `check:runtime` package script owns the standalone runtime probes: direct
fetch/OpenAPI/error checks plus a typed oRPC client-to-handler round trip. Keep
those probes wired through that package script so the root runner remains the
single compatibility entry point.

## Current Files and Coverage

- `package.json` and `bun.lock` pin the isolated dependency graph.
- `tsconfig.json` includes `src/**/*` and `tests/**/*` for the separate
  `bun run typecheck` command.
- `src/db/schema.ts` defines the Better Auth-compatible PostgreSQL tables.
- `src/db/index.ts` creates a no-op pool and Drizzle instance without requiring
  a live PostgreSQL server.
- `src/auth.ts` constructs Better Auth with the built-in Drizzle adapter.
- `src/orpc.ts` constructs the contract, router, typed client, and OpenAPI
  generator.
- `src/orpc-error-contract.ts` exercises structured oRPC error data.
- The two files under `tests/` provide the seven tests run by the root
  fixture command.

## Last Pre-Modernization Verification Record

The 2026-08-30 root-runner verification completed with exit code 0 before the
catalog modernization above. Regenerate the lock with Bun 1.4.0 and rerun the
fixture gate before treating the new pins as verified:

- Frozen install: 90 installs checked across 182 packages, no changes.
- TypeScript check: exit 0.
- Bun tests: seven passed, zero failed, 19 assertions.
- Standalone oRPC/OpenAPI and typed-client runtime probes: exit 0.
- The complete runner also passed the Next production-build and Expo
  compatibility stages.

## Earlier Historical Record

The original 2026-07-12 snapshot used Bun 1.3.14 and reported:

- `bun install`: exit 0, 89 packages installed.
- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0, three tests passed.

Those results are retained only as historical context. The fixture has since
moved to Bun and repository-matched `bun-types` and expanded to seven tests plus explicit
runtime probes, so the old output does not verify the current tree.

## Dependency and Runtime Notes

- Better Auth 1.6.30 exposes the built-in
  `better-auth/adapters/drizzle` entry point used here.
- `@orpc/zod` is pinned explicitly for `ZodToJsonSchemaConverter`.
- No peer-dependency override or legacy install mode is part of the fixture.
- Tests construct a no-op PostgreSQL pool; they do not contact a real database.
