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

Pragmatic linear chain, NOT canonical DDD where Domain is center. UI(1) top depends on everything downwards, Supporting(6) bottom depends on nothing. Allowed downward only (source.level <= target.level), forbidden upward (source.level > target.level). Domain at 3 CAN import Capabilities at 4 (3→4 allowed) — inverted vs canonical DDD where Application → Domain. Intentionally inverted: cross-package Capabilities→Domain (4→3) is FORBIDDEN by checker to enforce isolation via @repo/contracts and Supporting. Intra-module same bounded context skip (e.g., application/ports → ../domain/types within same module) is allowed. See the [contributor architecture guide](./AGENTS.md#architecture) for the full rationale.

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
  modes/single/                   Next/TanStack web or frontend-only Expo/Electron; no workspaces
  shared/
    env.ts                       Single source for .env (.example + .local) — billingEnvLines, filteredEnv*
    billing-env.ts (legacy shim), analytics-env.ts
  default.ts                     buildProjectGenerationPlan() typed plan; legacy mode dispatcher for emitters
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

6. **Env vars** Add keys and placeholders to the `src/lib/env-manifest.ts` SSOT, wire the relevant `src/templates/shared/env.ts` builders, and run `bun run scripts/sync-turbo-env.ts`. Generated `turbo.json` cache inputs are derived from that manifest and filtered to the selected capabilities and app audiences.

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

5. **Env branching** Keep runtime entrypoints isolated: `@repo/config/next` uses `NEXT_PUBLIC_*`, `/vite` uses `VITE_*` for TanStack and desktop renderers, `/expo` uses `EXPO_PUBLIC_*`, and `/server` alone owns secrets plus main-process `DESKTOP_*`. Single mode mirrors these under `src/lib/env/`. Update the env manifest, shared emitters, exact tsconfig aliases, generated Turbo filtering, host `turbo.json` via `bun run scripts/sync-turbo-env.ts`, and contributor docs together.

   Electron is the one generated client with a privileged main-process deployment value. `electron.vite.config.ts` reads only `DESKTOP_API_URL`, validates an HTTPS origin with no userinfo/query/fragment, and embeds that non-secret origin in `dist/main.js` before electron-builder runs. The generated runtime resolver uses runtime `DESKTOP_API_URL` first (for managed deployment overrides), then the embedded value; it permits the localhost default only when `app.isPackaged` is false and otherwise fails closed. Do not expose `DESKTOP_*` through Vite or place server credentials in the main bundle. Keep this behavior identical in monorepo/single and Next/TanStack generation paths, and cover a packaged launch with `DESKTOP_API_URL` removed from the launch environment.

6. **Docs** Update README framework list, and this CONTRIBUTING.

## Cloudflare Workers Deployment Target

Cloudflare is a resolved deployment binding, not a post-generation rewrite. Keep
`DesiredProjectConfig` -> `ResolvedProjectConfig` -> `GenerationPlan` as the
authoritative path so support validation, file ownership, provenance, checksums,
and dry-run output all describe the same project.

- Next.js uses `@opennextjs/cloudflare`; TanStack Start uses the native
  `@cloudflare/vite-plugin` plus `vite-tsconfig-paths`.
- Both frameworks support monorepo and single web modes with Convex or no
  database. PostgreSQL requires a request-scoped Hyperdrive adapter, Eve needs a
  Workers-native runtime, and server-side PDF needs shared admission control;
  the resolver rejects those combinations rather than emitting a partial app.
- The target emits `wrangler.jsonc`, `scripts/cloudflare.mjs`,
  `docs/CLOUDFLARE_DEPLOYMENT.md`, framework-specific Worker configuration, and
  root/package scripts for type generation, build, preview, dry-run, and deploy.
- Local runtime values belong only in the gitignored `.dev.vars`. The build
  wrapper rejects runtime `.env*` files before OpenNext/Vite runs, requires the
  regular root `bun.lock`, and scans the bounded Worker artifact for non-public
  server values without logging them. Production build variables and runtime
  Worker secrets are separate Cloudflare settings; deploy preserves
  dashboard-managed variables with `--keep-vars`.
- OpenNext's production cache uses the `NEXT_INC_CACHE_R2_BUCKET` R2 binding,
  `NEXT_CACHE_DO_QUEUE` Durable Object queue, and
  `NEXT_TAG_CACHE_DO_SHARDED` tag cache. The immutable `v1` migration owns
  `DOQueueHandler`; additive `v2` owns `DOShardedTagCache`. The named R2 bucket
  must be created once before the first deploy.

Any Cloudflare template change must run the four release-blocking Worker corners
with `bun run test:workers`. They cover Next/TanStack x monorepo/single across
Convex and database-free profiles. Both Convex monorepos select the full reviewed
all four billing providers, i18n, messaging/storage, notifications, feature-flags, jobs, and
Redis-cache surface; the monorepos select Bun and the single projects select Node.
Each corner must install, audit, format, pass architecture, typecheck, lint and
test; then build/secret-scan, run `wrangler deploy --dry-run`, and return HTTP
200 for `/`, `/api/health`, and `/api/rpc/health` under a bounded local Wrangler
preview. Convex monorepos avoid external-service calls; the database-free single
projects explicitly add the framework-neutral API capability. The
canonical release gate remains `bun run test:generated -- --all`.

See [the operational and evidence contract](./docs/engineering/CLOUDFLARE_WORKERS.md).

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

- **`turbo.json`** (host) — used for GH CI locally? Actually host uses oxlint/oxfmt + tsc. Generated turbo.json derives comprehensive cache inputs from the environment manifest, then filters them to selected capabilities and app audiences (for example DATABASE_URL, BETTER_AUTH_SECRET, provider keys, Eve's `AI_GATEWAY_API_KEY`/`EVE_*`, and the applicable public prefix), with `inputs: [$TURBO_DEFAULT$, .env*]` and `outputs: [dist/**, .next/**, .vinxi/**, .output/**]`.

- **`bunfig.toml`**
  - Host: `linker = "isolated", hoist = false, frozenLockfile = true` — hermetic reproducibility.
  - Generated: `hoist = true` (default, explicit comment) — because the supported Next.js 16 TS resolution path breaks with the isolated linker (`"It looks like you're trying to use TypeScript but do not have the required package(s) installed"` + workspace:* npm fallback). See `src/templates/root/package.ts` `bunfig()`.
  - Host, generated, deployment, temporary-test, and compatibility-fixture installs use the typed `supplyChain.minimumReleaseAgeSeconds` policy: seven days (`604800` seconds), with `minimumReleaseAgeExcludes = []` so there is no default bypass.

- **tsconfig hierarchy** `src/tsconfig.json` extends `../tsconfig.base.json` with `composite:true`, `emitDeclarationOnly:true`, `outDir:../dist`, `rootDir:.` Plus `tooling/typescript-config/base.json` has `target ES2024, module ESNext, moduleResolution bundler, strict:true, paths: {"@/*": ["src/*"], "@repo/*": ["packages/*/src"]}`. Host uses project references. Generated uses same base.

## Code Style (Enforced)

- **<300 LOC guideline** — use `// @allow-long <LOC>: <reason>` as escape hatch for legitimately complex files (e.g., core fragment 391 LOC combines security headers + postcss + orpc client). Guideline, not hard rule. Prefer splitting but allow escape with justification. Composers <5 imports guideline, same escape hatch. Enforced culturally via PR review; see [AGENTS.md](./AGENTS.md#conventions-enforced).
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

# Fixtures (frozen install + high-severity lock audit + fixture-specific checks)
bun run test:fixtures

# Real generated projects: verified bootstrap + installed dependency audit + format/check + architecture + typecheck + lint:all + root tests
bun run test:generated -- --all # all 24 configured representative corners
bun run test:workers            # four Cloudflare Worker build/dry-run/runtime corners

# Full CI
bun run test:ci # static + host/fixtures + generated --all + oRPC WS runtime + six audited production builds
```

GitHub CI runs `bun run check` plus the Bun-version, installer, generated
supervisor, process-tree, and filesystem portability suites on `ubuntu-latest`,
`windows-latest`, and `macos-latest`. Expensive fixture, generated-project,
packed-artifact, runtime, and production-build acceptance remains single-run on
Linux rather than being triplicated across operating systems.
The dedicated Cloudflare portability job additionally builds and runs both the
OpenNext and native Vite single-Worker profiles on Windows and macOS.

**Fixtures:** `tests/fixtures/compatibility/` — frozen-install compatibility matrices for
Drizzle + Better Auth + oRPC runtime contracts, a Next production build, and Expo
type/tooling probes.

`test:generated` defaults to `next-monorepo` and `single-next`; `--all` runs 24
configured representative corners rather than an exhaustive Cartesian product.
Every generated corner and every frozen fixture lock runs a blocking
`bun audit --audit-level=high`. The separate heavy `test:e2e-build` lifecycle
also audits each installed dependency graph, then verifies
format, an explicit typecheck, fail-closed `lint:all`, production build/start,
health, and the exact local CLI architecture check across default, billing-all,
TanStack messaging, TanStack Convex, custom capability-heavy, and web/Expo/Electron projects.
`test:ci` also runs the real typed oRPC WebSocket runtime probe.

**Generation smoke test (manual QA):**

```bash
rm -rf /tmp/gi-test && mkdir /tmp/gi-test
bunx ghostinit create demo --yes --no-install --cwd /tmp/gi-test --billing stripe,chargily --features eve,i18n
cd /tmp/gi-test/demo
cat turbo.json | grep globalEnv
cat bunfig.toml
ls packages/ packages/billing/src/providers/
bun run install:bootstrap && bun run typecheck && bun run lint:all && bun run test
```

For `--deploy vercel`, `--deploy docker`, `--deploy fly`, or
`--deploy cloudflare`, a `--no-install` project is not yet deployable: run
`bun run install:bootstrap` with Bun 1.4.0 to create and attest the regular root
`bun.lock` before lifecycle scripts run. Vercel runs
the shared guard before both dependency installation and application build; the
generated Dockerfile and Cloudflare build wrapper verify the same lock before
their build paths. Missing and non-regular locks fail with corrective guidance
before project dependency resolution.

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
  bun run release
  # Output: .ghostinit-release/ghostinit-<version>.tgz and its .sha256 sidecar
  ```

  `release:artifact` requires Bun 1.4.0, builds into a verified replacement
  `dist/`, packs once, and reruns `tests/integration/packed-cli.test.ts` with
  `GHOSTINIT_PACKED_TARBALL` bound to that exact tarball. The packed test rejects
  paths outside the source allowlist and rejects any `dist/` file not derived
  from a currently packed source. The sidecar is a SHA-256 integrity record, not
  registry provenance. Bun 1.4.0 does not provide a provenance-attestation flag,
  so `publishConfig` deliberately makes no provenance claim and the release
  command deliberately does not publish.

  After independent approval, publish the already-tested path rather than
  repacking the working tree:

  ```bash
  bun publish --access public .ghostinit-release/ghostinit-0.x.y.tgz
  ```

- `CHANGELOG.md` — keep updated per release.

## Links

- [README.md](./README.md): project usage
- [AGENTS.md — Architecture](./AGENTS.md#architecture): dependency graph, oRPC, security, version, and generated-project invariants
- [V1-to-V2 compatibility ledger](./evidence/compatibility/v1-to-v2.json) and [schema](./evidence/compatibility/v1-to-v2.schema.json): machine-readable compatibility and migration decisions
- [DESIGN.md — Evidence and policy gates](./DESIGN.md#evidence-and-policy-gates) and [frontend engineering records](./docs/engineering/frontend-task-records/): design-system evidence and review provenance
- [`packages/versions/src/index.ts`](./packages/versions/src/index.ts): dependency single source of truth, verified by `bun run check:versions`
- [LICENSE](./LICENSE): MIT
