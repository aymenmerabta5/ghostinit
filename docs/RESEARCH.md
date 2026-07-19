# GhostInit Dependency Research Summary

Date: 2026-07-12

## Toolchain

| Tool          | Version     | Notes                                                                                                 |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| Bun           | 1.3.14      | Current stable latest; local matches.                                                                 |
| Node (target) | 24.18.0 LTS | Local v25.8.0 is EOL; target LTS for generated apps.                                                  |
| TypeScript    | 7.0.2       | Stable; no programmatic compiler API until 7.1. Use TS 6.0.3 sidecar only if a tool requires the API. |

## Generated Application Stack

| Package                  | Version | Source                           |
| ------------------------ | ------- | -------------------------------- |
| next                     | 16.2.10 | npm registry                     |
| react                    | 19.2.7  | npm registry                     |
| react-dom                | 19.2.7  | npm registry                     |
| @types/react             | 19.2.17 | npm registry                     |
| @types/react-dom         | 19.2.3  | npm registry                     |
| drizzle-orm              | 0.45.2  | npm registry                     |
| drizzle-kit              | 0.31.10 | npm registry                     |
| pg                       | 8.22.0  | npm registry                     |
| @types/pg                | 8.11.14 | npm registry                     |
| better-auth              | 1.6.23  | npm registry                     |
| @orpc/server             | 1.14.7  | npm registry                     |
| @orpc/contract           | 1.14.7  | npm registry                     |
| @orpc/client             | 1.14.7  | npm registry                     |
| @orpc/openapi            | 1.14.7  | npm registry                     |
| @orpc/react-query        | 1.14.7  | npm registry                     |
| zod                      | 4.4.3   | npm registry                     |
| @tanstack/react-query    | 5.101.2 | npm registry                     |
| @tanstack/react-form     | 1.33.1  | npm registry                     |
| tailwindcss              | 4.3.2   | npm registry                     |
| @tailwindcss/postcss     | 4.3.2   | npm registry                     |
| postcss                  | 8.5.17  | npm registry                     |
| shadcn                   | 4.13.0  | npm registry                     |
| @base-ui/react           | 1.6.0   | npm registry                     |
| clsx                     | 2.1.1   | npm registry                     |
| tailwind-merge           | 3.6.0   | npm registry                     |
| class-variance-authority | 0.7.1   | npm registry                     |
| @biomejs/biome           | 2.5.3   | npm registry                     |
| turbo                    | 2.10.4  | npm registry                     |
| @playwright/test         | 1.61.1  | npm registry                     |
| postgres Docker          | 18.4    | Docker Hub / PostgreSQL official |

## Important Compatibility Notes

- **TypeScript 7.0.2** has no programmatic compiler API. The architecture checker
  therefore must be parser-independent (per spec). Any generator that needs to
  inspect TypeScript source must use AST parsing libraries (e.g., `@babel/parser`,
  `typescript` TS 6 sidecar) only where strictly required.
- **@orpc/next@0.27.0** peers with **@orpc/server 0.27.0**, conflicting with the
  stable core line 1.14.7. GhostInit avoids `@orpc/next` entirely and exposes
  oRPC via `RPCHandler` route handlers. Server Actions remain plain Next.js
  actions.
- **Better Auth** requires `drizzle-orm ^0.45.2` and `pg ^8.0.0`; pinned versions
  satisfy this exactly.
- **Tailwind v4** uses `@tailwindcss/postcss` and does not need `autoprefixer`.
- **Biome v2.5.3** replaces `linter.recommended` with `linter.preset`; generated
  config must use the new format.
- **Next.js 16** defaults to Turbopack and removes `next lint`. Generated apps
  use Biome for linting/formatting instead.

## Pure oRPC Only - Elysia Removed Decision (2026-07-18)

### Context7 Verification URLs

- **oRPC contract-first RPCHandler fetch adapter**: `/dinwwwh/orpc` (ID resolved via context7_resolve-library-id) — docs:
  - `https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/rpc/handler.md` — RPCHandler with fetch adapter `new RPCHandler(router)` + `handler.handle(request, {prefix, context})` returning `{response}`
  - `https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/migrations/from-trpc.md` — client setup `createORPCClient` + `RPCLink` origin url `/api/orpc` interceptors onError
  - `https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/contract/implementation.md` — `implement(contract).$context<...>()`
  - `https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/openapi/specification.md` — `OpenAPIGenerator` with `converters: [new ZodToJsonSchemaConverter()]` generates spec
  - `https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/openapi/routing.md` — `os.prefix("/api")` + `os.meta(openapi({prefix}))`
- **Next.js Route Handlers raw body Buffer webhook**: `/vercel/next.js` (ID resolved) — docs:
  - `https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/route.mdx` — webhook POST handler example `await request.text()` try catch 400 success 200
  - Next.js App Router does NOT require bodyParser config unlike Pages Router — raw body accessible via `request.arrayBuffer()` / `request.text()`
  - Pattern `Buffer.from(await request.arrayBuffer())` is native Web API, avoids `req.json()` which consumes stream and breaks signature verification causing 403
  - Stripe: header `stripe-signature` missing 400, `constructEvent(buf, sig, secret)` 400 Webhook Error, idempotent `onConflictDoNothing`
  - Chargily: header `signature` HMAC-SHA256 `verifySignature(payload Buffer, sig, secret)` timingSafeEqual throws, 400 missing 403 invalid 200 ok server-only
  - Paddle: header `paddle-signature` raw string `unmarshal(buf.toString(), secret, sig)` EventName TransactionCompleted, 400 missing 403 invalid
  - Polar: whsec base64 secret `validateEvent(buf, headers, secret)` WebhookVerificationError 403, `@polar-sh/nextjs` internally `Buffer.from(await req.arrayBuffer())`
- **Elysia Eden Treaty duplication**: `/elysiajs/elysia` and `/elysiajs/eden` (IDs resolved):
  - `treaty<App>('localhost:3000')` creates proxy client `{data, error, status}` chain per segment, path params as function call
  - Duplication rationale: Elysia + Eden + oRPC = double RPC, double type client, double port (3000 Next + 3001 Elysia), websocket not needed, spec non-negotiable oRPC contract-first
  - Raw body can be done in Next.js single port via `request.arrayBuffer()` — no need for separate Elysia backend for webhooks

### Rationale

- Spec non-negotiable oRPC contract-first — oRPC already provides RPCHandler fetch adapter + OpenAPI generation + typed client `@orpc/client`
- Eden Treaty `treaty<App>` duplicates oRPC client functionality — two typed clients for same services layer violates single abstraction
- Double RPC: Next.js oRPC + Elysia Elysia — double maintenance, double deploy, double port
- No websocket requirement — Elysia websocket not used in spec
- Raw body handling for webhooks verified can be done in Next.js Route Handlers via `Buffer.from(await request.arrayBuffer())` per `/vercel/next.js` docs — no need for Elysia separate backend
- Single port 3000 simplifies deployment, auth cookie sharing (Better Auth), and DX
- Pure oRPC architecture: `apps/web` Next.js ONLY + oRPC contract-first — Elysia removed pure oRPC — webhooks via Next routes raw Buffer

### Implementation

- `src/templates/modes/monorepo.ts`: removed import backendFiles, removed files.push(...backendFiles), added comment Elysia removed pure oRPC only webhooks via Next routes raw Buffer, removed apps/api tsconfig, transpilePackages only @repo/*, updated AGENTS.md text from "apps/api MUST Elysia" to "apps/web Next.js ONLY + oRPC contract-first - Elysia removed pure oRPC - webhooks via Next routes raw Buffer"
- `src/templates/backend/elysia.ts`: DELETED entirely on 2026-07-18 fix — file no longer exists. Previously kept for historical reference with deprecation comment, now removed per DEPRECATED_ELYSIA_CODEGEN_STILL_PRESENT. No file in src/templates may import backend/elysia.
- `src/templates/apps/core.ts`: ensured NO elysia deps, only @orpc/*, comment pure oRPC. Fixed WEB_PACKAGE_UNCONDITIONAL_EVE_DEP: webPackage now takes hasEve boolean and conditionally includes eve dep only when hasEve true. appsFilesWithConditionalEve passes hasEve.
- `src/templates/apps/api.ts`: webhook routes use raw body `Buffer.from(await request.arrayBuffer())` NOT `req.json()` for 4 providers, each 400 missing 403 invalid 200 ok idempotent onConflictDoNothing, no elysia eden import
- `src/templates/api.ts`: healthContract meContract contract uses oc.route router uses os.prefix("/api") implement openapi OpenAPIGenerator ZodToJsonSchemaConverter per Context7, NO treaty
- `src/templates/apps/components.ts`: removed treaty<App> createApiClient, replaced with @orpc/client usage `createORPCClient` + `RPCLink`
- `packages/versions.ts`: added DEPRECATED comment Elysia removed pure oRPC kept for reference not used
- `src/templates/default.ts`: updated comment line 8 from "backendFiles Elysia must" to "pure oRPC only webhooks via Next.js routes" — file deletion documented
- `src/lib/addons.ts`: fixed FEATURES_PARSER_SILENT_FALLBACK — parseFeaturesInput now throws ValidationError on fully unknown tokens mirroring parseBillingInput logic

## Documents Consulted

- https://registry.npmjs.org/ (live package metadata)
- https://bun.sh/blog/bun-v1.3.14
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
- https://tailwindcss.com/docs/upgrade-guide
- https://base-ui.com/react/overview/releases
- https://biomejs.dev/guides/getting-started/
- https://turborepo.dev/repo/docs/getting-started/installation
- https://playwright.dev/docs/release-notes
- https://orm.drizzle.team/docs
- https://www.better-auth.com/docs/introduction
- https://github.com/dinwwwh/orpc
- Context7 MCP verification:
  - /dinwwwh/orpc — contract-first RPCHandler fetch adapter OpenAPI generation
  - /vercel/next.js — Route Handlers request.arrayBuffer raw body webhook Stripe signature
  - /elysiajs/elysia — raw body webhook Buffer.from await request.arrayBuffer() Eden Treaty
  - /elysiajs/eden — treaty<App> typed client duplication
