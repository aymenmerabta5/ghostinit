# Architecture — Ghostinit Deep Dive

This document supplements `CONTRIBUTING.md` with exhaustive GhostInit Layered Architecture (6-layer, pragmatic UI->Supporting, inspired by DDD — NOT canonical DDD), host code generation, and dependency graphs.

## Host vs Generated

| Concern            | Host (this repo)                                                                                                       | Generated (output)                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose            | CLI that scaffolds                                                                                                     | Product code you ship                                                                                                                                                                                                                             |
| Type               | Single `ghostinit` package, composers <5 imports guideline each, <300 LOC guideline with `// @allow-long` escape hatch | Well-structured monorepo with architectural linting (inspired by modular monolith, build-time only via oxc-parser, single DB shared, separate deployables in monorepo, not single binary nor runtime isolation) `apps/* + packages/* + tooling/*` |
| Build              | `scripts/build.ts`: `Bun.build` JS + `tsc -p src/tsconfig.json` real d.ts                                              | Turborepo + Next/TanStack                                                                                                                                                                                                                         |
| Package manager    | `bunfig.toml` `linker=isolated, hoist=false` — hermetic                                                                | `bunfig.toml` `hoist=true` default — Next TS resolution                                                                                                                                                                                           |
| Version source     | `packages/versions/src/index.ts` `ghostinitVersion + catalog`                                                          | inherits catalog versions                                                                                                                                                                                                                         |
| Runtime validation | `parseBillingInput`, `parseModeInput` strict `ValidationError`                                                         | t3env zod runtime + Better Auth                                                                                                                                                                                                                   |
| Atomic FS          | `FsTransaction` staging `.ghostinit-staging` TTL 1h                                                                    | n/a                                                                                                                                                                                                                                               |
| Logging            | Secret-safe `SECRET_SUBSTRINGS` redacting                                                                              | Same list in `@repo/observability` logger                                                                                                                                                                                                         |

Host internal diagram (enforced at build time via `bun run check`):

```
cli.ts (Presentation)
  │ parseArgs, did-you-mean (levenshtein <40% ratio), COMMAND_REGISTRY Map
  │ envelope JSON {success, exitCode, data|error, command, durationMs}
  ▼
commands/* (Application)
  create → template composition + interactive prompts
  add    → module/use-case/procedure/action generators AST
  sync   → rebuild deterministic registries
  status/check/doctor → fs inspection + architecture checker
  ▼
lib/* (Supporting)
  errors: ExitCode, GhostinitError
  fs: FsTransaction, cleanupStaleStaging, path traversal protection
  logger: secret-safe redaction via constants SECRET_SUBSTRINGS
  architecture: oxc-parser checks — modular 23 files each <200 LOC guideline, refactored from 1204→1330 god file (collectors/parsers/rules/graph); guideline with escape hatch `// @allow-long`
  addons: single source billing/providers/features/databases/frameworks + parsers
  constants: BILLING_PROVIDERS, RESERVED_WORKSPACE_PACKAGES, SECRET_*, STAGING_*
  config: ProjectConfig schema zod, lock file
  ▼
templates/* + generators/* (Vendors-ish = external composers that produce @repo/*)
  templates/default.ts router mode → monorepoFiles vs singleFiles
  modes/monorepo/*-composer.ts each <5 imports delegate to billingFiles/appsFiles etc
  billing/providers/<name>/client, checkout, customer, portal, webhook, subscriptions, mappers
  billing/webhooks/factory via webhooks/index.ts explicit named re-exports (no export *)
  shared/env.ts single source for .env .example + .local — 50+ vars
  shared/fragments DRY for Next vs TanStack
```

## GhostInit Layered Architecture (inspired by DDD, pragmatic UI->Supporting) — Well-Structured Monorepo with Architectural Linting

> Terminology decision — Option (c) from pushback adopted: called GhostInit Layered Architecture, not 6-Layer DDD. This is NOT canonical DDD — canonical DDD has Domain at center with inward dependencies. GhostInit uses pragmatic linear chain for simplicity and build-time isolation via @repo/contracts. Enforcement is build-time only via oxc-parser, not runtime isolation. Single DB shared, separate deployables in monorepo (apps/* + packages/*), not single binary. Inspired by modular monolith ideas but NOT true modular monolith with runtime boundaries.

Invented for Ghostinit to guarantee architecture checker passes on generated projects while allowing flexible billing/features.
Pragmatic linear chain UI(1) top → Supporting(6) bottom, not hexagonal/clean where Domain is center.

This is NOT canonical DDD. Canonical DDD/Clean has Domain at center with inward dependencies. GhostInit uses pragmatic UI(1) top → Supporting(6) bottom:

- UI (1) top may depend on everything downwards.
- Supporting (6) bottom depends on nothing (foundations only). Any 6→1-5 is upward violation.
- Allowed flow is downward only: source.level <= target.level. Forbidden is upward: source.level > target.level.

Inversion vs canonical: Domain is at level 3, Capabilities (Application) at level 4, so Domain CAN import Capabilities (3→4 allowed downward). In canonical DDD Application → Domain would be allowed, but GhostInit intentionally FORBIDS cross-package Capabilities→Domain (4→3) to enforce isolation via @repo/contracts and Supporting. Services use contracts instead of direct domain coupling. This is intentional for simplicity. Option (c) from pushback adopted: called Ghostinit Layered Architecture, not 6-Layer DDD.

### Intra-Module Exception

Same bounded context imports are skipped — the checker does NOT flag imports within the same BC, to allow application/ports → ../domain/types without violating 4→3 cross-package rule.

Example allowed (same BC `identity`):

```ts
// packages/modules/src/identity/application/ports/user-repository.ts
import type { User } from "../domain/types"; // same module identity, skipped by checker
// packages/modules/src/identity/application/use-cases/create-user.ts
import { UserRepository } from "../ports/user-repository"; // intra-module, allowed
```

Example forbidden (cross-package):

```ts
// packages/services/src/billing/application/process-subscription.ts
import { User } from "@repo/modules/identity/domain/types"; // 4→3 cross-package FORBIDDEN
// Fix: import contract from @repo/contracts instead
import type { UserContract } from "@repo/contracts";
```

See `src/lib/architecture/rules/layered.ts` `checkLayeredDependency` and `isSameBoundedContext` heuristic.

### Modular Monolith Clarification (Well-Structured Monorepo)

What we mean by "modular monolith inspired": well-structured monorepo with architectural linting (build-time only via oxc-parser), NOT true modular monolith with runtime isolation:

- Enforcement: build-time only, `ghostinit check` + `bun run check`, no runtime boundaries.
- DB: single DB shared across bounded contexts (schema per module via drizzle, not separate DBs).
- Deployables: separate deployables in monorepo (`apps/web`, `apps/api` via turbo), not single binary with in-process modules isolated at runtime.
- Isolation mechanism: `@repo/contracts` + Supporting layer + capability-isolation rule, not process isolation or runtime container.
- When to use real modular monolith runtime isolation is out of scope; GhostInit provides linted structure as starting point.

### Layer Definition (Level = downward allowed, upward forbidden)

```
Level 1 — UI
  Path: apps/web/src/{components,app,routes}, src/routes (TanStack single)
        also apps/web is generic heuristic, src/routes considered UI
  May import: Transport (2), Domain (3), Capabilities (4), Vendors (5), Supporting (6)
  Forbidden: UI importing vendor directly → vendor-isolation HIGH, must go via capability. UI → @repo/billing → Vendors.
  Example: apps/web/src/app/(dashboard)/billing/page.tsx → @repo/billing (capability)

Level 2 — Transport
  Path: apps/api/, packages/api/, apps/web/src/app/rpc, apps/web/src/lib/orpc,
        src/routes/api, apps/web/src/routes/api, /routes/api/ generic
  Responsibility: oRPC contract-first — contract in @repo/contracts / @repo/api, handlers via RPCHandler
                route handlers raw body Buffer.from(await request.arrayBuffer()) for webhooks
  May import: Domain (3), Capabilities (4), Vendors (5), Supporting (6)
  Forbidden: Transport importing UI (2>1 upward violation)
  Example: packages/api/src/routers/billing.ts → @repo/services/billing (capability)
  Exception: Framework entry points __root.tsx, router.tsx allowed to import anything (isFrameworkEntryPoint)

Level 3 — Domain
  Path: **/domain/*, packages/core/, @repo/modules/<m>/domain
  Responsibility: entities, value objects, domain events, pure invariants — no framework imports
  Checks: domain-imports-framework HIGH if imports react,next,drizzle-orm,better-auth,@orpc/*,@tanstack/*,pg etc
  May import: Capabilities (4), Vendors (5), Supporting (6) — downward allowed. Inverted vs canonical DDD but intentional for GhostInit linear chain.
  Forbidden: Domain importing UI (3>1) or Transport (3>2) → upward violation.
  Example violation: domain/foo.ts importing apps/web/components/Button → forbidden.

Level 4 — Capabilities (Application)
  Path: packages/services/src/<cap>/, src/server/services/<cap>/, packages/billing (non-provider), packages/email/, **/application/, packages/modules/src/<m>/application
  Responsibility: use-cases, commands/queries, services orchestration
  Design choice: We use linear chain UI->Transport->Domain->Capabilities->Vendors->Supporting for simplicity, not hexagonal center. Cross-package Capabilities->Domain is FORBIDDEN by checker to enforce isolation via contracts/Supporting, intra-module same BC skipped. This avoids direct capability->domain coupling, services use @repo/contracts instead.
  Checks: application-imports-framework HIGH, capability-isolation HIGH (cap imports other cap directly must go via @repo/services stable barrel)
  May import: Vendors (5), Supporting (6), plus other capabilities via @repo/services root stable API
  Forbidden: Capabilities importing Domain cross-package (4>3 upward violation), e.g., @repo/services/billing → @repo/modules/identity/domain flagged. Intra-module same bounded context skip allows ports → domain within same module.

Level 5 — Vendors
  Path: packages/billing/src/providers/*, billing/providers/*, /vendors/, vendor SDKs stripe, @chargily/chargily-pay, @paddle/paddle-node-sdk, @polar-sh/sdk
  Responsibility: SDK wrappers, must be server-only ("Chargily meant to be ONLY used in server-side" per docs)
  Checks: vendor-isolation HIGH if UI imports vendor directly
  May import: Supporting only (5→6 allowed)
  Forbidden: Vendors importing Capabilities (5>4), Domain (5>3), Transport (5>2), UI (5>1)

Level 6 — Supporting
  Path: packages/database, config, kernel, observability, contracts, typescript-config, ui, tooling/*
  Responsibility: foundations, ORM, observability, t3env validation, shared UI primitives
  May import: Supporting peer or external packages only. Any import to 1-5 is violation (6>1..5).
  Forbidden examples: @repo/database importing @repo/billing (6>4), @repo/config importing apps/web (6>1)
```

Visual dependency DAG — GhostInit Layered Architecture (downward allowed, upward forbidden):

```
┌──────────────────────────────────────────────────────────────────────┐
│ UI (1)   apps/web, src/routes             Allowed → downwards only  │
│  ↓ allowed                                                            │
│ Transport (2)  packages/api, apps/web/app/api, src/routes/api          │
│  ↓ allowed                                                            │
│ Domain (3)  **/domain/, modules domain, packages/core                  │
│  ↓ allowed (inverted vs canonical DDD; intra-module same BC skipped)  │
│ Capabilities (4)  services/*, billing (non-provider), email, app       │
│  ↓ allowed                                                            │
│ Vendors (5)  billing/providers/*, stripe, chargily, paddle, polar      │
│  ↓ allowed                                                            │
│ Supporting (6)  database, config, kernel, observability, etc           │
└──────────────────────────────────────────────────────────────────────┘
Forbidden = any upward arrow (e.g., Capabilities(4)→Domain(3), Supporting(6)→Vendors(5), Domain(3)→UI(1))
Example violations: services/billing → modules/identity/domain (4>3), database → billing/providers (6>5), UI → stripe directly
Allowed flow is downward only, forbidden upward.
```

### Additional Architecture Rules (architecture/* modular — 23 files each <200 LOC, refactored from 1204→1330 LOC god file)

- **domain-purity** HIGH — domain imports framework package
- **application-purity** HIGH — application layer same
- **private-paths** MEDIUM — import contains `/private/` or `/_/`
- **database-isolation** HIGH — module imports `drizzle-orm/pg/@repo/database` outside `infrastructure/database/`
- **module-isolation** HIGH — module imports another `@repo/modules/<other>`
- **client-boundary** HIGH — `use client` file imports server-only: `@repo/database, @repo/auth, @repo/modules, @repo/api` or billing SDKs server-only
  - Chargily explicitly flagged because docs says server-only. Relative UI imports `./providers/chargily-panel` excluded to avoid false positives.
- **undeclared-dependency** MEDIUM — package imports package not declared in package.json dependencies
- **reserved-module-name** BLOCKER — module name clashes with `node_modules,dist,api,auth,database,config,ui,observability,contracts,typescript-config,modules,workflows`
- **package-dependency-cycle** BLOCKER — workspace dependency graph cycle detection via DFS
- **parseable-source** LOW — parse error fallback

### Billing Flexibility Model (Algeria + Global)

Single source truth `BILLING_PROVIDERS = ["stripe","chargily","paddle","polar"]` in `constants.ts` and re-exported via `addons.ts`.

```ts
parseBillingInput:
  "none"/"" → []
  "all" → all 4
  "both" legacy → ["stripe","chargily"]
  comma-separated deduped case-insensitive any combo allowed:
    "chargily" → [chargily] Algeria EDAHABIA/CIB checkout-only server-only
    "stripe" → [stripe] global cards subscription-native
    "chargily,stripe" → [chargily,stripe] Algeria + Global dual market
    "paddle,polar" → global multi MoR
    "chargily,paddle,polar,stripe" == "all"
```

No validation blocks chargily+global combo — intentional dual market support. Validation only checks `billing && database=none` → invalid (needs DB for subscriptions table).

Each provider folder (<300 LOC guideline per file, `// @allow-long` escape when legitimately complex) pattern:

```
billing/providers/stripe/
  client.ts        getStripeClient() validates key not placeholder, STRIPE_API_VERSION basil
  checkout.ts      createCheckoutSession(userId, priceId)
  customer.ts      getOrCreateCustomer
  portal.ts        createPortalSession
  webhook.ts       verify raw Buffer + constructEvent
  subscriptions.ts list/cancel mapped to internal type
  mappers.ts       Stripe subscription → BillingSubscription domain
  index.ts         explicit named re-exports only (no export *)
```

Webhook factory: `billing/webhooks/index.ts` → `allWebhookFiles()`, `billingWebhookFilesByProvider(provider)` switch.

Nitro raw body verified via arrayBuffer() — same Fetch API Request object as Next, no special config needed. Both use Buffer.from(await request.arrayBuffer()) for webhook verification. TanStack Start uses Nitro under the hood but the request is standard Fetch API Request; `request.arrayBuffer()` works identically in Next.js route handlers and Nitro event handlers. No need for `readRawBody()` or special Nitro hooks — verified: both frameworks expose raw body via same API. Single port 3000, no Elysia (removed per RESEARCH.md pure oRPC only decision), no dual RPC duplication `treaty<App>` vs `@orpc/client`.

Env: server-only secrets `STRIPE_SECRET_KEY`, `CHARGILY_*`, `PADDLE_API_KEY`, `POLAR_ACCESS_TOKEN` never client. Client safe: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `VITE_*`. All emitted via `shared/env.ts` single source `billingEnvLines()`. Turbo `globalEnv` includes all plus wildcard `NEXT_PUBLIC_*`, `VITE_*`.

UI: `billing/ui/billing-page.tsx` conditional panels per selected provider — checkout-only providers show no portal tab.

### Framework Matrix

```
availableModes = ["monorepo","single"]
availableFrameworks = ["nextjs","tanstack-start"]
availableDatabases = ["postgres","convex","none"]
availableFeatures = ["eve","i18n"]
```

- **monorepo** → workspaces `apps/*, packages/*, tooling/*`, turbo tasks, root composer 12+ groups
- **single** → flat Next.js no workspaces via `modes/single.ts`
- **nextjs** → `apps/` + `pages.ts`, `NEXT_PUBLIC_*` client vars, outputs `.next/**`
- **tanstack-start** → `tanstack-core.ts`, `tanstack-pages.ts`, `tanstack-api.ts` using `createServerFn`, `getRequestHeaders`, routes `src/routes`, Vite + Nitro outputs `.vinxi/**, .output/**, dist/**`

DRY strategy: fragments `src/templates/apps/fragments/` — common oRPC client, auth guards, marketing, header, layout extracted.

**Fragment extraction trigger:** When TanStack files exceed 300 LOC guideline per file (host guideline, not checker-enforced for generated output, escape via `// @allow-long <LOC>: <reason>`) or third framework added, extract shared logic to `src/templates/apps/fragments/` with `RouterType` param branching. Each fragment file <300 LOC guideline; if legitimately complex, use `// @allow-long` shim re-exporting from split folder.

Explicit trigger doc:

- **When to extract:** `apps/tanstack-*` files approaching 300 LOC guideline, or duplication across Next/TanStack >30% lines, or new `availableFrameworks` entry added, or inline route >50 LOC duplicated. Fragment shim files (`core.ts`, `marketing.ts`, `header.ts`) act as backwards-compatible barrels re-exporting from `core/`, `marketing/`, `header/` subfolders to keep each sub-file <300 LOC.
- **How to extract:** Create `fragments/<area>/` with `page.ts` exporting `export function <area>PageContent(router: RouterType): string` and `export function <area>Page(router: RouterType): TemplateFile` choosing path based on router. For new area with no fragment (e.g., billing), create `fragments/billing/page.ts` + `index.ts` exporting `billingFiles(router)` and `billingPageContent(router)`. Reuse `fragments/auth/tanstack-guard.ts` helpers `tanstackGetSessionFnContent()` + `tanstackAuthBeforeLoadContent()` instead of reimplementing `getSessionFn` + `beforeLoad` per route.
- **Refactor pattern:** `pages.ts` already delegates via `...settingsFiles()`, `...recoveryFiles()`. `tanstack-pages.ts` must mirror: `...recoveryFiles("tanstack")`, `...settingsFiles("tanstack")`, `...billingFiles("tanstack")`. No inline 66 LOC route definitions allowed — all routes go through fragments like `buildMarketingPageContent("tanstack")`, `signInPageContent("tanstack")`, `forgotPasswordPageContent("tanstack")`, `tanstackSettingsPageContent()`, `billingPageContent("tanstack")`.
- **Verification:** After extraction, `tanstack-pages.ts` ~60 LOC parity with `pages.ts` (70 LOC). Each fragment file <150 LOC. `settingsFiles("tanstack")` returns 1 file, `billingFiles("tanstack")` returns 1 file, `recoveryFiles("tanstack")` returns 2. Guard duplication eliminated via `tanstack-guard` helpers.
- **History:** 2026-07-19 Yellow #3 — extracted forgot-password (66 LOC), reset-password (80 LOC), settings (78 LOC), billing (66 LOC) inline from `tanstack-pages.ts` (357 LOC → 65 LOC) into `fragments/recovery/` (RouterType), `fragments/settings/tanstack-page.ts` using guard helpers, `fragments/billing/` new dir. Achieved DRY parity.

### Build / TS / Bun Policies

**Host:**

- `bunfig.toml` `linker=isolated, hoist=false, frozenLockfile=false` — hermetic, Context7 oven-sh/bun isolated-installs best practice
- Project references composite `src/tsconfig.json` → `tooling/typescript-config/base.json` ES2024 bundler strict
- `scripts/build.ts` Bun.build external `oxc-parser` + tsc real d.ts declarationMap verification

**Generated:**

- `bunfig.toml` hoist=true default (explicit comment explains Next 16.2.10 TS7 break with isolated)
- TS6 `6.0.3` stable for Next 16.2.10 (TS7 Go port lacks lib/typescript.js + npm workspace:* fallback)
- `tooling/typescript-config/base.json` shared, paths `@/* → ./src/*`, `@repo/* → ./packages/*/src`
- `turbo.json` generated: globalEnv 50+ vars exhaustive, inputs `$TURBO_DEFAULT$, .env* !.env.*local`, outputs `dist/**, .next/**, .output/**, .vinxi/**, .vercel/**`

### oRPC Contract-First (Pure, No Elysia)

Per `docs/RESEARCH.md` 2026-07-18 decision: Elysia removed, pure oRPC only, no websocket double RPC duplication treaty vs @orpc/client.

- Contracts: `packages/contracts` or `packages/api`? Actually `packages/api` holds contract + router
- RPCHandler in Next.js route handler
- Webhooks via Next.js routes raw buffer `Buffer.from(await request.arrayBuffer())` single port 3000
- Client: `@repo/api` typed client `@orpc/client` + `@orpc/react-query`

### Security — Secret-Safe Logger

Constants SSOT `SECRET_SUBSTRINGS = [secret,password,token,auth,bearer,cookie,credential,key,otp,session,signature,private]` + `SECRET_PATTERN = /\b(apikey|api_key|jwt|private_key|database_url|...)\b/i` + `URL_SECRET_PARAM_PATTERN`.

`FsTransaction` path traversal protection via `toAbsolute()` rejects `/`, `\\`, `C:`, `..` segments, escapes root check via `resolve`. Staging file cleanup TTL 1h `cleanupStaleStaging()` background fire-and-forget + commit proactively + rollback final safety. No accumulation after crashes.

### Testing Strategy

- Unit: `tests/unit` — parsing billing/features, addons map, reserved names, secret detection, FsTransaction
- Integration: `tests/integration` — actual generation + architecture checker `gh built-in`? Actually runs `generateProjectFiles` dryRun? plus checks turbo.json, env files, composers
- Fixtures: `tests/fixtures/compatibility` — real compatibility matrices `drizzle-betterauth-orpc`, `next-tailwind-biome` etc, each `bun install` tested.

Run: `bun test --timeout 100000`, `bun run test:ci`, `bun run pretest:fixtures && bun run test:fixtures`.

### Release Version Sync

Single source `ghostinitVersion` in `@repo/versions` must match `package.json` version and `src/templates/versions.ts` re-export. `bun run build` emits real d.ts, `npm pack` includes dist/cli.js + src/** + schemas/project-config.json + README + LICENSE.

### Adding Example — Complete Decision Tree

```
Want new billing provider?
  → versions billing group + BILLING_PROVIDERS const + provider folder 7 files <300 LOC guideline (use `// @allow-long <LOC>: <reason>` if legitimately complex, e.g., stripe webhook idempotency+multi-event)
  → barrels explicit named + webhook factory + env SSOT + turbo globalEnv + UI panel

Want new package @repo/foo?
  → versions catalog + template packages.ts + tsconfig path + root+packages composer

Want new framework vite-custom?
  → availableFrameworks + apps/vite-custom-* templates + fragments DRY + default.ts router

Want new feature?
  → availableFeatures + template folder/file + composer wiring + env if needed

All changes must:
  bun run build && bun test && bun run check (oxlint+oxfmt+tsc)
  manual smoke: mkdir /tmp/test && bunx ghostinit create app --yes --no-install
  ensure no <300 LOC guideline violations without `// @allow-long <LOC>: <reason>` justification, no export * , composers <5 imports guideline (escape hatch with comment if needed)
```
