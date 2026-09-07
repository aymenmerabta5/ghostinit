# Compatibility Audit Report: Drizzle + Better Auth + oRPC

Fixture: `tests/fixtures/compatibility/drizzle-betterauth-orpc/`
Date: 2026-07-12
Runtime: Bun 1.4.0
Platform: Windows 11 Pro 10.0.26200

## Goal

Verify that the exact pinned versions below can be installed and typechecked together under Bun with TypeScript 6.0.3:

- `drizzle-orm` 0.45.2
- `drizzle-kit` 0.31.10
- `pg` 8.22.0
- `better-auth` 1.6.23
- `@orpc/server/contract/client/openapi` 1.14.7
- `zod` 4.4.3
- `typescript` 6.0.3

## Files Created

- `package.json` — exact pinned versions, `type: "module"`, npm scripts.
- `tsconfig.json` — `module: ESNext`, `moduleResolution: bundler`, Bun types included.
- `src/db/schema.ts` — `users` table with uuid primary key and unique email; helper tables for Better Auth.
- `src/db/index.ts` — no-op `pg.Pool` subclass and `drizzle(pool, { schema })` instance.
- `src/auth.ts` — `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema: { ... } }) })`.
- `src/orpc.ts` — contract via `@orpc/contract`, implementation via `implement().router()`, typed client via `@orpc/client` + `RPCLink`, OpenAPI JSON generation via `@orpc/openapi` and `@orpc/zod`.
- `src/index.ts` — barrel exports.
- `tests/fixture.test.ts` — no-op tests that import every module.

## Commands, Exit Codes, and Output

### 1. `bun install`

- Exit code: `0`
- Installed 89 packages total. Top-level resolved pinned versions:

| Package          | Resolved version |
| ---------------- | ---------------- |
| `drizzle-orm`    | 0.45.2           |
| `drizzle-kit`    | 0.31.10          |
| `pg`             | 8.22.0           |
| `better-auth`    | 1.6.23           |
| `@orpc/server`   | 1.14.7           |
| `@orpc/contract` | 1.14.7           |
| `@orpc/client`   | 1.14.7           |
| `@orpc/openapi`  | 1.14.7           |
| `@orpc/zod`      | 1.14.7           |
| `zod`            | 4.4.3            |
| `@types/pg`      | 8.11.14          |
| `bun-types`      | 1.4.0            |
| `typescript`     | 6.0.3            |

### 2. `bunx tsc --noEmit`

- Exit code: `0`
- TypeScript 6.0.3 reports no errors across all source files with strict mode enabled.

### 3. `bun test`

- Exit code: `0`
- Output: `3 pass`, `0 fail`, `6 expect() calls`.
- Note: `better-auth` emits a `Base URL is not set` warning at runtime, which is expected because this fixture does not configure a `baseURL`.

## Dependency Notes and Conflicts

- `@better-auth/drizzle-adapter` is a separate package, but Better Auth 1.6.23 still ships the built-in `better-auth/adapters/drizzle` entry point. This fixture uses the built-in adapter per the package documentation to avoid an extra dependency.
- `@orpc/zod` is required for `ZodToJsonSchemaConverter` used by `@orpc/openapi`. It is not a dependency of `@orpc/openapi` itself, so it was explicitly installed at the same pinned 1.14.7 version.
- `bun-types` is required so `bun:test` and the Bun globals typecheck under `tsc --noEmit`.
- No peer dependency overrides or `--legacy-peer-deps` were needed.
- `@orpc/next` was intentionally omitted per the task rules.
- No runtime peer/dependency conflicts were reported by `bun install` or TypeScript.

## Test-Only Runtime Note

The Better Auth Drizzle adapter is configured with a no-op `pg.Pool`. During tests no real Postgres server is reached, so all schemas and connection types are verified statically. Better Auth's warning about a missing `baseURL` is benign for this fixture.
