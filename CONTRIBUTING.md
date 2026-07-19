# Contributing to Ghostinit

> Production-grade CLI that scaffolds well-structured monorepos with architectural linting (inspired by modular monolith, build-time enforcement via oxc-parser, not runtime isolation, single DB shared, separate deployables) for Next.js/TanStack Start. This guide is the 10/10 DX onboarding for contributors.

## Architecture Overview

### Host vs Generated Distinction

**Host** = this CLI package (`ghostinit`). Single package with internal **composers** (not god file). It generates projects, it is not the project.

**Generated** = output monorepo (exemplary GhostInit Layered Architecture UI->Supporting pragmatic inspired by DDD — well-structured monorepo with architectural linting, build-time only via oxc-parser, single DB shared, separate deployables, not runtime isolation): `apps/*`, `packages/*`, `tooling/*` with `turbo.json`, `bunfig.toml` (hoist=true), oRPC contract-first, Better Auth, Drizzle.

```
Host (ghostinit CLI)                Generated (your scaffolded app)
----------------                    --------------------------------
src/cli.ts + commands/              apps/web (UI), apps/api (optional transport)
src/lib/ (FsTransaction, logger)    packages/database, auth, api, ui, billing
src/templates/ (vendors/composers)  packages/modules/src/<bounded-context>
src/generators/                     packages/services (capabilities)
packages/versions (SSOT)            tooling/* shared configs
```

### Host Internal Layering

```
cli.ts (Presentation)
   ↓ parses args → dispatches registry
commands/ (Application): create, add, sync, status, check, doctor
   ↓ uses
lib/ (Supporting): errors, fs, logger, architecture, addons, constants, config
   ↓ + uses
templates/ + generators/ (Vendors = generation composers):
   modes/monorepo/*, modes/single/*, billing/providers/*, apps/*, shared/env.ts
```

**Enforcer:** `src/lib/architecture.ts` ~1330 LOC via `oxc-parser` (no TS compiler). Checks domain/application purity, vendor-isolation, capability-isolation, GhostInit Layered Architecture dependency (6 layers pragmatic UI->Supporting inspired by DDD, NOT canonical DDD), client-boundary, database-isolation.

### GhostInit Layered Architecture (pragmatic UI->Supporting, inspired by DDD)

Pragmatic linear chain, NOT canonical DDD where Domain is center. UI(1) top depends on everything downwards, Supporting(6) bottom depends on nothing. Allowed downward only (source.level <= target.level), forbidden upward (source.level > target.level). Domain at 3 CAN import Capabilities at 4 (3→4 allowed) — inverted vs canonical DDD where Application → Domain. Intentionally inverted: cross-package Capabilities→Domain (4→3) is FORBIDDEN by checker to enforce isolation via @repo/contracts and Supporting. Intra-module same bounded context skip (e.g., application/ports → ../domain/types within same module) is allowed. See `docs/ARCHITECTURE.md` for full rationale.

```
1. UI          apps/web/src/*, src/routes/* (tanstack) — React components
   ↓ imports (allowed downward)
2. Transport   apps/api/src/*, packages/api/src/*, apps/web/src/app/api/*, src/routes/api/* — oRPC routers
   ↓ imports
3. Domain      **/domain/*, @repo/modules/<m>/domain, packages/core — entities, value objects, pure logic
   ↓ imports (3→4 allowed intentional inversion, intra-module skip)
4. Capabilities packages/services/*, packages/billing (non-providers), packages/email, **/application/*
   ↓ imports
5. Vendors      packages/billing/src/providers/*, stripe, @chargily/chargily-pay, @paddle, @polar-sh — SDK wrappers
   ↓ imports
6. Supporting   packages/database, config, kernel, observability, contracts, ui, typescript-config, tooling/*

Allowed flow: 1→2→3→4→5→6 — NO upward imports (downward only, upward forbidden).
Design choice: UI->Transport->Domain->Capabilities->Vendors->Supporting linear for simplicity, not hexagonal center. Cross-package Capabilities->Domain forbidden via contracts/Supporting, intra-module same BC skipped.
```

Violation examples:

- `UI` importing `stripe` directly → `vendor-isolation` HIGH — must go via `@repo/billing` capabilities.
- `services/billing` importing `services/email` → `capability-isolation` HIGH — must go via `@repo/services` stable API.
- `apps/web` (level 1) importing `@repo/database` → `client-boundary` HIGH.
- `domain/` importing `react` → `domain-purity` HIGH.

Run: `ghostinit check` or `bun run build && node dist/cli.js check`.

---

## Project Structure (Host)

```
src/cli.ts                       Entry + arg registry + did-you-mean + JSON envelope
src/commands/
  create.ts                      Main generator orchestration
  add.ts                         Module/use-case/procedure/action adders
  sync.ts, status.ts, check.ts, doctor.ts, types.ts
src/lib/
  errors.ts                      ExitCode, GhostinitError, envelope
  fs.ts                          FsTransaction atomic FS + cleanupStaleStaging
  logger.ts                      Secret-safe logger (SECRET_SUBSTRINGS)
  architecture.ts                6-layer enforcer via oxc-parser
  addons.ts                      SSOT for modes, billing, features, frameworks, databases
  constants.ts                   BILLING_PROVIDERS, SECRET_SUBSTRINGS, RESERVED_WORKSPACE_PACKAGES, STAGING_*
  config.ts, interactive.ts, reserved.ts, json.ts
src/generators/
  module.ts, use-case.ts, procedure.ts, action.ts, shared.ts (AST extraction)
src/templates/
  root.ts                        package.json, turbo.json, bunfig.toml (generated hoist=true), oxlint, env via shared/env.ts
  packages.ts, database.ts, auth.ts, api.ts, ui.ts, modules.ts, services.ts, email.ts, analytics.ts, i18n.ts, eve.ts, agentic.ts
  versions.ts                    Re-exports from @repo/versions ghostinitVersion
  billing/
    index.ts, domain/, schema/, providers/{stripe,paddle,chargily,polar}/{client,checkout,customer,portal,webhook,subscriptions,mappers}.ts
    webhooks/{factory.ts→index.ts + stripe,chargily,paddle,polar}.ts + ui/billing-page.tsx
  apps/
    core.ts, pages.ts, components.ts, api.ts, tests.ts
    tanstack-{core,pages,api,components}.ts  — TanStack Start variant
  modes/monorepo/
    index.ts                     monorepoFiles() assembler → dedup + sort + __PROJECT_NAME__ replace
    {root,packages,database,auth,api,ui,modules,apps,billing,services,agents,core-services,eve}-composer.ts
    utils.ts                     buildSecrets(), selectedBillingFromAddons()
  modes/single.ts                Flat Next.js no workspaces
  shared/
    env.ts                       Single source for .env (.example + .local) — billingEnvLines, filteredEnv*
    billing-env.ts (legacy shim), analytics-env.ts
  default.ts                     generateProjectFiles() router — mode switch → monorepoFiles vs singleFiles
packages/versions/src/index.ts   Real @repo/versions package, SSOT for ALL dependency versions + ghostinitVersion
tooling/
  typescript-config/base.json    Strict ES2024, bundler, composite, paths @/* + @repo/*
  lint/ (shared oxlint/oxfmt)
tests/
  unit/, integration/, fixtures/compatibility/
scripts/build.ts                 Bun.build js + tsc -p src/tsconfig.json real d.ts (not fake export {})
```

---

## How to Add New Package

All workspace package versions must come from `@repo/versions`.

1. **Add version to catalog** `packages/versions/src/index.ts` in correct group (e.g., `analytics`, `email`):

   ```ts
   export const myGroup = { "my-lib": "1.0.0" } as const;
   // then include in catalog spread
   ```

2. **Create template file** `src/templates/mypackage.ts` or folder `src/templates/myfeature/` with explicit named exports (no `export *`):

   ```ts
   import { file, packageJson } from "./shared.js";
   import * as v from "./versions.js";
   export function myPackageFiles() {
     return [file("packages/my/src/index.ts", "...")];
   }
   ```

3. **Package.json with workspace:***  
   Use `workspace:*` for internal deps:

   ```ts
   packageJson({ name: "@repo/my", dependencies: { "@repo/kernel": "workspace:*" } });
   ```

4. **TS paths** Add mapping in `tooling/typescript-config/base.json` if new `@repo/<name>`: usually covered by glob, but ensure `packages/<name>/src` exists path via base.

5. **Wire to composers** Update `src/templates/modes/monorepo/packages-composer.ts` and `root-composer.ts` to emit new package:

   ```ts
   import { myPackageFiles } from "../../mypackage.js";
   export function packagesComposerFiles() {
     return [...existing, ...myPackageFiles()];
   }
   ```

6. **Verify**
   ```bash
   bun run build
   bun test --timeout 100000
   bun run check
   ```

## How to Add New Billing Provider

Architecture goal: each file <300 LOC guideline (<5 imports for composers), DRY via factory. Use `// @allow-long <LOC>: <reason>` escape hatch when legitimately complex (e.g., fragments bundling multiple template helpers) — guideline, not hard rule. Prefer splitting.

1. **Version** Add to `packages/versions/src/index.ts` `billing` group:

   ```ts
   billing: { ..., "my-pay-sdk": "1.0.0" }
   ```

2. **Constant** Add to `BILLING_PROVIDERS` in `src/lib/constants.ts`:

   ```ts
   export const BILLING_PROVIDERS = [
     "stripe",
     "chargily",
     "paddle",
     "polar",
     "myprovider",
   ] as const;
   ```

3. **Provider folder** `src/templates/billing/providers/<name>/` with explicit files (<300 LOC each):
   - `client.ts` — server-only SDK init, throws if key is placeholder
   - `checkout.ts` — create checkout session
   - `customer.ts` — get/create customer
   - `portal.ts` — billing portal (if supported, else throw "checkout-only")
   - `webhook.ts` — raw body verification `Buffer.from(await request.arrayBuffer())`
   - `subscriptions.ts` — list/cancel
   - `mappers.ts` — to internal `BillingSubscription` domain type

   Reference existing `src/templates/billing/providers/stripe/client.ts` as pattern.

4. **Barrels** Add explicit named re-exports (NEVER `export *`) in `src/templates/billing/providers/<name>/index.ts` and update `src/templates/billing/index.ts`.

5. **Webhook factory** Add entry in `src/templates/billing/webhooks/factory.ts` (or `index.ts`):

   ```ts
   export function billingWebhookFilesByProvider(p: BillingProviderName) {
     switch (p) {
       case "myprovider":
         return myProviderWebhookFiles();
     }
   }
   ```

6. **Env vars** Add placeholders to `src/lib/constants.ts` `ENV_PLACEHOLDERS`, and to `src/templates/shared/env.ts` `billingEnvLines()` and `billingEnvLocalLinesFiltered()`. Update `turbo.json` `globalEnv` and `src/templates/root.ts` `turbo()` — both exhaustive list of 50+ vars.

7. **UI** Update `src/templates/billing/ui/billing-page.tsx` provider panel — conditional rendering via `selectedBilling`.

8. **Test**
   ```bash
   bun test tests/unit/billing-*.test.ts --timeout 100000
   bun test tests/unit/addons.test.ts
   # smoke
   mkdir /tmp/gi-test && bunx ghostinit create demo --billing myprovider --yes --no-install --cwd /tmp/gi-test
   ```

## How to Add New Mode / Framework

Example: we already have `monorepo` vs `single` + `nextjs` vs `tanstack-start` (framework).

1. **Add to addons** `src/lib/addons.ts`:

   ```ts
   export const availableFrameworks = ["nextjs", "tanstack-start", "myframework"] as const;
   ```

2. **Create app templates** Look at `src/templates/apps/tanstack-*` as reference for new framework:
   - `src/templates/apps/myframework-core.ts`
   - `myframework-api.ts`, `myframework-pages.ts`, `myframework-components.ts`

3. **Fragments for DRY** Create `src/templates/apps/fragments/` or reuse logic via shared helpers — extract common oRPC client, auth guards, to avoid duplication between Next and TanStack.

4. **Router** Update `src/templates/default.ts` `generateProjectFiles()` and `src/templates/modes/monorepo/index.ts` to handle new framework:

   ```ts
   if (effectiveFramework === "myframework") return [...myFrameworkFiles()];
   ```

5. **Env branching** If framework uses `VITE_*` vs `NEXT_PUBLIC_*`, ensure `shared/env.ts` already emits both — it does (dual). Add outputs to turbo: `.output`, `.vinxi`, etc are already covered.

6. **Docs** Update README framework list, and this CONTRIBUTING.

## How to Add New Feature (eve, i18n)

Same pattern as billing but simpler — feature flags.

1. Add to `availableFeatures` in `src/lib/addons.ts`:

   ```ts
   export const availableFeatures = ["eve", "i18n", "myfeature"] as const;
   ```

2. Create template folder `src/templates/myfeature/` or file `src/templates/myfeature.ts` with explicit named exports.

3. Add composer wiring in `src/templates/modes/monorepo/services-composer.ts` or `core-services-aggregator.ts` or new `myfeature-aggregator.ts`.

4. Env vars: add via `shared/env.ts` if needed.

5. Tests: add case in `tests/unit/features.test.ts`.

---

## Build System

- **`scripts/build.ts`** Does 2-step:
  1. `Bun.build({ entrypoints: ["./src/cli.ts"], outdir: "dist", target: "node", external: ["oxc-parser"] })` → `dist/cli.js` keeps shebang, external sourcemap.
  2. `bunx tsc -p src/tsconfig.json` emits real `.d.ts` + `.d.ts.map` + `.tsbuildinfo`. **Not fake `export {}`**. Verifies `dist/cli.d.ts` size >10 bytes.

- **`turbo.json`** (host) — used for GH CI locally? Actually host uses oxlint/oxfmt + tsc. Generated turbo.json has comprehensive `globalEnv` 50+ vars (DATABASE_URL, BETTER_AUTH_SECRET, STRIPE__, CHARGILY__, PADDLE__, POLAR__, RESEND__, POSTHOG__, NEXT_PUBLIC__, VITE__), `inputs: [$TURBO_DEFAULT$, .env*]`, `outputs: [dist/**, .next/**, .vinxi/**, .output/**]`.

- **`bunfig.toml`**
  - Host: `linker = "isolated", hoist = false, frozenLockfile = false` — hermetic reproducibility.
  - Generated: `hoist = true` (default, explicit comment) — because Next.js 16.2.10 TS resolution breaks with isolated linker (`"It looks like you're trying to use TypeScript but do not have the required package(s) installed"` + workspace:* npm fallback). See `src/templates/root.ts` `bunfig()`.

- **tsconfig hierarchy** `src/tsconfig.json` extends `../tsconfig.base.json` with `composite:true`, `emitDeclarationOnly:true`, `outDir:../dist`, `rootDir:.` Plus `tooling/typescript-config/base.json` has `target ES2024, module ESNext, moduleResolution bundler, strict:true, paths: {"@/*": ["src/*"], "@repo/*": ["packages/*/src"]}`. Host uses project references. Generated uses same base.

## Code Style (Enforced)

- **<300 LOC guideline** — use `// @allow-long <LOC>: <reason>` as escape hatch for legitimately complex files (e.g., core fragment 391 LOC combines security headers + postcss + orpc client). Guideline, not hard rule. Prefer splitting but allow escape with justification. Composers <5 imports guideline, same escape hatch. Enforced culturally via PR review, not hard checker — see `docs/ARCHITECTURE.md`.
- **No `export *` barrels** — use explicit named re-exports to avoid namespace leakage and tree-shaking issues. Example `src/templates/billing/webhooks/index.ts`.
- **No god files / composers <5 imports guideline** — `monorepo/index.ts` assembles via dedup+sort+`__PROJECT_NAME__` replace; intentional delegation may exceed <15 imports but each composer stays <5. Obscures graph acknowledged — keep composers tiny, use escape hatch if needed with comment.
- **DRY: fragments + factory** — `apps/tanstack-*` shares via fragments, `billing/providers/` shares via `webhooks/factory.ts`. Don't duplicate Next vs TanStack logic.
- **Secret-safe logger** via `SECRET_SUBSTRINGS` in `constants.ts` (`secret,password,token,auth,bearer,cookie,credential,key,otp,session,signature,private`) + `SECRET_PATTERN` regex. `src/lib/logger.ts` redacts, `packages/observability/src/logger.ts` (generated) mirrors same list.
- **FsTransaction for atomic FS** — always batch writes via `FsTransaction`, cleanup stale staging `.ghostinit-staging` TTL 1h, path traversal protection, unsafe absolute rejection. Test `getStagedFiles()` before commit in dry-run.
- **Package versions SSOT** — never hardcode `^x.y.z` in templates except via `v.*` from `packages/versions`. `ghostinitVersion` canonical single source must match `package.json` `version`.
- **Typed errors + JSON envelope** — `src/lib/errors.ts` `ExitCode` + `ValidationError`. CLI JSON mode `envelope({ success, exitCode, data|error, command, durationMs })`.

Format/lint: `bun run format` (oxfmt), `bun run check` (oxlint + oxfmt --check + tsc --noEmit).

## Testing

```bash
bun install
bun run build
bun run check          # oxlint + oxfmt check + tsc

# Unit + integration
bun test tests/unit --timeout 100000
bun test tests/integration --timeout 100000
bun test --timeout 100000 tests/integration tests/unit   # official script

# Fixtures
bun run pretest:fixtures   # installs fixture projects
bun run test:fixtures

# Full CI
bun run test:ci
```

**Fixtures:** `tests/fixtures/compatibility/` — real compatibility matrices (e.g., drizzle+better-auth+oRPC, next+tailwind).

**Generation smoke test (manual QA):**

```bash
rm -rf /tmp/gi-test && mkdir /tmp/gi-test
bunx ghostinit create demo --yes --no-install --cwd /tmp/gi-test --billing stripe,chargily --features eve,i18n
cd /tmp/gi-test/demo
cat turbo.json | grep globalEnv
cat bunfig.toml
ls packages/ packages/billing/src/providers/
bun install && bun run typecheck && bun run lint
```

Checks: `turbo.json` globalEnv includes billing vars, `bunfig.toml` hoist=true, `packages/versions` catalog used, no `export *` in billing barrels.

## Release

- Version source of truth **must stay synced**:
  - `packages/versions/src/index.ts` `ghostinitVersion`
  - `package.json` `version`
  - `src/templates/versions.ts` re-exports canonical

- Steps:

  ```bash
  # edit packages/versions/src/index.ts ghostinitVersion = "0.x.y"
  # edit package.json version = same
  bun run build          # produces dist/cli.js + dist/**/*.d.ts real
  npm pack               # via bun run release script
  # verify tarball contains dist/cli.js, src/**, schemas/, README, LICENSE
  npm publish --access public --provenance   # CI does this
  ```

- `CHANGELOG.md` — keep updated per release.

## Links

- README: project usage
- `docs/ARCHITECTURE.md`: deep GhostInit Layered Architecture (6-layer pragmatic inspired by DDD) + dependency graph + oRPC contract-first + billing flexibility
- `docs/RESEARCH.md`: dependency version research from official registries + Context7
- LICENSE: MIT
