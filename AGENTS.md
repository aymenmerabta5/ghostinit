# AGENTS.md — GhostInit Contributor Guide

## Essential Commands

```bash
bun install
bun run build          # scripts/build.ts: Bun.build dist/cli.js (external oxc-parser) + tsc -p src/tsconfig.json real d.ts
bun run check          # oxlint . && oxfmt --check . && tsc --noEmit  — required before test
bun run format         # oxfmt --write .
bun run typecheck      # tsc -b (project references)
bun run dev            # watch src/cli.ts
```

Tests (pretest auto-builds):

```bash
bun test --timeout 100000 tests/integration tests/unit          # official `bun run test`
bun test tests/unit/<file>.test.ts --timeout 100000              # single file
bun test tests/integration/<file>.test.ts --timeout 100000
bun run test:fixtures  # runner installs and fully checks all compatibility fixtures once
bun run test:generated # generate + install + format/check + architecture + typecheck + lint:all + root tests
bun run check:versions # every pinned + generated dependency version exists on npm
bun run test:workers   # four Cloudflare Worker build/dry-run/runtime corners
bun run test:convex-codegen # opt-in public anonymous-local Convex root/component codegen proof
bun run test:ci        # static + host/fixtures + Convex codegen + 24 generated corners + oRPC WS runtime + six audited production builds
```

For local checks under a strict RAM budget, use `bun --smol test <file>` and a
fresh guarded process per file. More frequent garbage collection reduces heap
retention; process isolation also releases module-level fixtures. Preserve the
complete test manifest and report interrupted files as failed verification.
CI retains the full workload without a local machine's memory limits.

Native Next configurations externalize only the selected billing SDKs through
`serverExternalPackages`, using the same provider/package map as dependency
emission. Keep Cloudflare Worker configurations bundled. Local Turbopack cache
eviction happens after filesystem snapshots and is not a process memory cap;
measure complete route workloads and retain installed runtime/build checks.

`test:convex-codegen` installs an isolated backend fixture with the catalog pins
and seven-day policy, audits it, and uses public Convex `init`/`env set`/`dev --once`/`codegen`
commands. A bounded `--start` helper retains one local backend while the explicit
codegen checks run. It checks actual generated auth/users/posts files and a local source
component, including deliberate type errors and restored successes. It requires
Node.js >=20 and network access for the first local-backend download. Backend
version/digest and process cleanup are recorded; this proves code generation and
types, not executed application functions. The ordinary generated-project gate
remains required independently.

Manual generation smoke:

```bash
rm -rf /tmp/gi-test && mkdir /tmp/gi-test
bunx ghostinit create demo --yes --no-install --cwd /tmp/gi-test --billing stripe,chargily --with-eve --with-i18n --apps web,desktop --preset saas
cd /tmp/gi-test/demo && bun run install:bootstrap && bun run typecheck && bun run lint:all
```

## Architecture

**Host vs Generated:**

- Host = this CLI repo. Single publishable package (`bin: dist/cli.js`, `private:false` intentional). `cli.ts` parses and dispatches; `commands/` orchestrates use cases; `domain/` resolves project policy and validates immutable plans; `application/ports/` defines rendering, formatting, and secret-materialization contracts. `generation/` implements the compiler boundary over `templates/`; `lib/` supplies filesystem, state, process, and diagnostic adapters. Domain code must not depend on commands, templates, or those adapters.
- Generated = output monorepo `apps/* + packages/* + tooling/*` with manifest-derived, capability-scoped `turbo.json` cache inputs and `bunfig.toml` hoist=true.

**Generated architecture** is enforced by `src/lib/architecture/index.ts` through `oxc-parser`. The six categories describe responsibilities, not a mandatory six-hop call chain:

- UI composes presentation and invokes the appropriate server or client boundary.
- Transport adapts HTTP, WebSocket, Server Actions, and platform IPC to application operations.
- Application services and use cases orchestrate domain behavior and adapters.
- Domain owns business types, policies, and provider-neutral contracts. It cannot depend on application services, vendors, or framework implementations.
- Vendor adapters implement inward-facing contracts and may import domain types.
- Supporting modules provide shared contracts, configuration, persistence, and tooling; additional purity, database, vendor, and client rules constrain their use.

The versioned edge matrix in `src/lib/architecture/rules/layer-policy.ts` is authoritative. Application-to-domain dependencies follow the same rules in monorepo `packages/modules/src/<module>` and single `src/server/modules/<module>` layouts. Module privacy and database isolation apply to both. A passing category edge does not bypass the more specific isolation rules.

**Tooling:**

- Host `bunfig.toml`: `isolated` + `hoist=false` (hermetic). Generated: `hoist=true` for the supported Next.js 16 TS resolution path. Both enforce the typed seven-day `supplyChain.minimumReleaseAgeSeconds` policy with an empty exclusion list; fixtures and temporary install probes must do the same.
- Generated dependency SSOT is `packages/versions/src/index.ts`; host and generated compiler policies are verified independently.
- Next development/build commands executed by Bun use the documented Webpack profile because Bun 1.4 cannot reliably resolve Turbopack's newly created external-package links on a cold start. Node keeps Turbopack. PDF-enabled Bun launchers preload their declared `@react-pdf/renderer` dependency before Next installs its require hook; React module conditions remain unchanged.
- Generated apps and shared tooling use the same `typescript` catalog pin
  (TypeScript 7). Next 16.3 uses its default project-local `tsc` CLI; never set
  `experimental.useTypeScriptCli` to `false`. TypeScript 7 does not provide the
  classic JavaScript compiler API. Changes to compiler consumers require real
  installed build/runtime gates; source inspection alone is not compatibility proof.
- Convex checks `convex/tsconfig.json` independently of the app's root config.
  Its generated strict config explicitly selects Node types for `process.env`,
  and the owning root manifest declares the catalog's `@types/node` dependency.
- Generated `turbo.json`: manifest-derived `globalEnv`, filtered to selected capabilities and app audiences — see the table below.

**Env vars — 5 places (keep in sync):**

| #   | Location                                     | Purpose                                     |
| --- | -------------------------------------------- | ------------------------------------------- |
| 1   | `src/lib/env-manifest.ts` `ENV_PLACEHOLDERS` | Placeholder values (`REPLACE_WITH_*`)       |
| 2   | `src/templates/shared/env.ts`                | `.env.example` / `.env.local` line emitters |
| 3   | `src/templates/root/turbo.ts` `turbo()`      | Generated `turbo.json` `globalEnv` list     |
| 4   | `turbo.json` (host) + generated `turbo.json` | Actual cache keys for host vs output        |
| 5   | `CONTRIBUTING.md` + `AGENTS.md`              | Docs / onboarding                           |

`src/lib/env-manifest.ts` is the key/placeholder SSOT; run
`bun run scripts/sync-turbo-env.ts` after changing it, then update generated
schema/runtime emitters and this documentation. Adapter-owned server variables
include `NOTIFICATION_TOKEN_ENCRYPTION_KEY`, `FEATURE_FLAG_TIMEOUT_MS`, and the
bounded `JOB_*` worker timings. Eve-enabled projects additionally declare
`AI_GATEWAY_API_KEY`, the self-issued server-only `EVE_INTERNAL_AUTH_SECRET`,
and `EVE_NEXT_PRODUCTION_ORIGIN`/`EVE_NEXT_PRODUCTION_PORT`; the latter two are
Next build cache inputs. Wildcards `NEXT_PUBLIC_*`, `VITE_*`,
`EXPO_PUBLIC_*` cover app-specific public prefixes; `DESKTOP_*` remains a
main-process/server family and is never exposed through Vite. Generated
env files and Turbo cache keys include only the selected app audiences; prefer
explicit entries for server secrets.

**Public env entrypoints are audience-specific.** Generated `@repo/config`
exports `/server`, `/next`, `/vite`, and `/expo`; its root is a value-safe
type/metadata barrel. Next clients import `/next` (`NEXT_PUBLIC_`), TanStack and
desktop renderers import `/vite` (`VITE_`), and Expo imports `/expo`
(`EXPO_PUBLIC_`). Single mode mirrors these under `src/lib/env/`. Server secrets
exist only in the private server schema and `/server` runtime. Never re-export a
server env value from a client entry or expose `DESKTOP_*` via Vite.

**Generated packages need explicit `exports` and `types`.** `@repo/*` resolves to
each package's SOURCE via tsconfig `paths`, so a consumer typechecks its
dependency's files under its OWN `compilerOptions`. Two consequences, both of
which broke the generated typecheck:

- A package with no `exports` (and no `main`) has no entry point —
  `import { ok } from "@repo/kernel"` fails with TS2307. Every generated package
  needs `exports: { ".": "./src/index.ts" }`.
- Config subpaths need exact tsconfig mappings (`@repo/config/server|next|vite|expo`);
  a generic `@repo/*` substitution resolves subpaths incorrectly and must not
  expose the private `server-schema.ts`. Only declare ambient `@types` a package
  actually consumes.

**Never mint third-party credentials.** `buildSecrets()` mints only self-issued
secrets (`authSecret`, `postgresPassword`, `notificationTokenEncryptionKey`,
`eveInternalAuthSecret`). The production compiler renders placeholders and
declares selected self-issued secret operations in the plan; dry runs never mint
them. Vendor keys and webhook secrets (Stripe/Chargily/Paddle/Polar/Resend) stay
`REPLACE_WITH_*` in `.env.example` and local env files (`.env.local`, or
`.dev.vars` for Cloudflare) until real credentials are supplied. Public vendor
tokens retain their catalog placeholders such as `pk_test_REPLACE`. An invented
secret bypasses the `secret.startsWith("REPLACE_WITH")` unconfigured guard and
turns a clear setup error into an opaque signature failure.

## Project Structure

- `src/cli.ts` + `src/cli/index.ts` — arg registry, did-you-mean levenshtein, JSON envelope `{success, exitCode, data|error, command, durationMs}`
- `src/commands/` — `create.ts` (main orchestration), `add.ts`, `sync.ts`, `status.ts`, `check.ts`, `doctor.ts`, `types.ts` + subfolders `create/`, `doctor/`
- `src/lib/` — `errors.ts` (ExitCode, GhostinitError), `fs.ts` (FsTransaction atomic + staging `.ghostinit-staging` TTL 1h), `logger.ts` (secret-safe `SECRET_SUBSTRINGS`), `architecture/` (enforcer), `addons.ts` (parsers + `availableModes/Frameworks/Features/Databases`), `constants.ts` (BILLING_PROVIDERS, SECRET_SUBSTRINGS, RESERVED_WORKSPACE_PACKAGES, STAGING_*), `config.ts`, `interactive.ts`, `reserved.ts`, `json.ts`
- `src/generators/` — `module.ts`, `use-case.ts`, `procedure.ts`, `action.ts`, `shared.ts` (AST extraction)
- `src/templates/` — `root.ts`, `packages.ts`, `database.ts`, `auth.ts`, `api.ts`, `ui.ts`, `modules.ts`, `services.ts`, `email.ts`, `analytics.ts`, `i18n.ts`, `eve.ts`, `versions.ts`, `billing/{index,domain,schema,providers/{stripe,chargily,paddle,polar}/{client,checkout,customer,portal,webhook,subscriptions,mappers},webhooks/{factory→index},ui/billing-page.tsx}`, `apps/{core,pages,components,api,tests,tanstack-*}`, `modes/monorepo/{index,*-composer.ts,utils.ts}`, `modes/single/{index,config,composers/*}.ts` (Next/TanStack web and frontend-only Expo/Electron; `modes/single.ts` is a compatibility barrel), `shared/env.ts` (single source .env), `database/convex/{schema,auth,http,lib,posts,users,billing}.ts` (convex.ts was 1125 LOC; the content blocks were extracted verbatim), `template-loader.ts` (multi-root resolver — a naive `join(thisDir, rel)` always fails once bundled into `dist/cli.js`, which silently emitted barrels whose targets were never written)
- `packages/versions/src/index.ts` — SSOT for ALL deps + `ghostinitVersion`
- `tooling/` — `typescript-config/base.json` (ES2024, bundler, paths `@/*`, `@repo/*`), `lint/`
- `tests/` — `unit/`, `integration/`, `fixtures/compatibility/` (real installs)

## Conventions (Enforced)

- **<300 LOC guideline** — use `// @allow-long <LOC>: <reason>` escape hatch for legitimately complex files (e.g., core fragment 391 LOC combines security headers + postcss + orpc client). Guideline, not hard rule. Prefer splitting but allow escape with justification. Composers <5 imports guideline — `monorepo/index.ts` assembles via dedup+sort+`__PROJECT_NAME__` replace (intentional delegation obscures graph, acknowledged). Keep composers tiny; use escape hatch if needed with comment.
- **No `export *`** — explicit named re-exports only (tree-shaking, namespace safety). Check `billing/webhooks/index.ts`.
- **FsTransaction mandatory** for file writes. Always test `getStagedFiles()` in dry-run. Path traversal protection via `toAbsolute()` rejects `/`, `\\`, `C:`, `..`.
- **Secret-safe logger** — `SECRET_SUBSTRINGS=[secret,password,token,auth,bearer,cookie,credential,key,otp,session,signature,private]` + `SECRET_PATTERN` + `URL_SECRET_PARAM_PATTERN`. Same list in generated `packages/observability/src/logger.ts`.
- **Typed errors + JSON envelope** — use `ValidationError`, `ExitCode`, `envelope()`.
- **Package versions** — never hardcode `^x.y.z` in templates; import `* as v` from `./versions.js` (re-export of `@repo/versions`). Internal deps use `workspace:*`.
- **Billing flexibility** — any combo allowed: `none`, `stripe`, `chargily`, `chargily,stripe` (Algeria+Global), `all`. Parsing via `parseBillingInput()` case-insensitive deduped. Validation only blocks `billing + database=none`. Each provider needs 7 files (<300 LOC guideline each, `// @allow-long` escape if needed): `client.ts`, `checkout.ts`, `customer.ts`, `portal.ts`, `webhook.ts`, `subscriptions.ts`, `mappers.ts` + barrel `index.ts` + wiring in `billing/webhooks/factory.ts` + `shared/env.ts` + UI panel.
- **Modes/frameworks** — `availableModes=[monorepo,single]`, `availableFrameworks=[nextjs,tanstack-start]`, `availableDatabases=[postgres,convex,none]`, `availableFeatures=[eve,i18n]` (deprecated alias for `--with-eve/--with-i18n`; preferred flags `--with-eve --with-i18n`), `availableApps=[web,mobile,desktop]`, `availablePresets=[saas,frontend,custom]`, `availableDeployTargets=[vercel,fly,docker,cloudflare,none]`. Docker emits `Dockerfile`, `.dockerignore`, `compose.production.yml`, and lifecycle guidance; Fly adds `fly.toml`; Vercel adds `vercel.json`. Cloudflare emits a framework-aware Worker profile: Next.js through OpenNext and TanStack Start through `@cloudflare/vite-plugin`, supported in monorepo/single web modes with Convex or no database. PostgreSQL, Eve, and server-side PDF are rejected until request-scoped/Workers-native adapters exist. Vercel manages patches within valid `bunVersion: "1.4.x"`, while generated install/build commands invoke exact Bun `1.4.0`; Docker/Fly use the exact image tag. All deployment targets require a verified regular root `bun.lock` and reuse `scripts/require-bun-lock.mjs`. After `--no-install`, run `bun run install:bootstrap` with Bun `1.4.0` first. Container builds receive `.env.local` only through an ephemeral BuildKit secret, never `COPY`; Cloudflare local development instead uses gitignored `.dev.vars`, rejects runtime `.env*` files during Worker builds, separates build-time variables from runtime secrets, and scans output for server-only values. Parsers throw `ValidationError` on invalid (no silent fallback) except billing/features allow partial unknown for forward-compat but fully unknown throws.
- **Single native support boundary** — single Expo/Electron is frontend-only and permits client-local analytics/i18n. It has no generated backend or external host-selection contract; use monorepo `web,mobile` or `web,desktop` for server-backed capabilities.

## Version Sync Gotcha

Three files must stay identical on release:

- `packages/versions/src/index.ts` `ghostinitVersion`
- `package.json` `version`
- `src/templates/versions.ts` re-export

Build verifies `dist/cli.d.ts` real (not fake `export {}` stub) via declarationMap.

**Every pin must actually exist on npm.** `bun run check:versions` fetches the
registry and fails on any invented version; it runs as part of `bun run release`.
This exists because four pins had been fabricated (`posthog-js@1.233.2`,
`posthog-node@4.20.1`, `@clack/prompts@0.8.3`, plus a `biome` entry pointing at an
unrelated npm package) — the host build stayed green while `bun install` failed in
every generated project. Nothing else catches this: the host never installs what
it pins for the output.

## Adding Things (see CONTRIBUTING.md for full)

- New package: add to `packages/versions` catalog → `src/templates/<pkg>.ts` with `file()`, `packageJson()` → wire in `modes/monorepo/packages-composer.ts` + `root-composer.ts` → verify `bun run build && bun test && bun run check`.
- New billing provider: `versions` billing group + `BILLING_PROVIDERS` const + `src/domain/capabilities/billing-provider-operations.ts` and support-catalog schema + provider folder + barrels explicit + webhook factory + env SSOT + turbo globalEnv + billing UI. Effective client acceptance operations are the union supported by the selected providers; client controls and server portal admission consume the domain table. Never advertise Chargily portals or non-Chargily merchant payment links as implemented.
- New framework: `availableFrameworks` + `apps/myframework-*.ts` templates + router in `default.ts` + `monorepo/index.ts`.
- New deploy target: add the typed choice and support-catalog bindings, resolve unsupported database/capability combinations before generation, emit through the `GenerationPlan` with owners/provenance, update JSON Schemas and dependency evidence, and add installed build/runtime corners. Never mutate emitted files after compilation.

## Testing Quirks

- Timeout required: `--timeout 100000` (integration does heavy generation + verified dependency bootstraps).
- Fixtures in `tests/fixtures/compatibility/` use frozen locks and run a blocking `bun audit --audit-level=high` after each install — slow, skip on iteration unless touching oRPC/Drizzle, Next/Tailwind, Expo/Uniwind, or release policy.
- Prepublication architecture checker: `bun run build && bun ./dist/cli.js check --cwd <generated-project> --json`. Always use this exact local artifact in release gates; never use a registry fallback for an unpublished CLI.

### The generated-project gate (`bun run test:generated`)

`scripts/test-generated.ts` generates real projects, runs
`bun run install:bootstrap`, then blocks on the installed patch and
high-severity vulnerability audit for that corner, runs
`format` followed by `format:check`, applies the exact local `dist/cli.js`
architecture check to the normalized tree, then runs the project's own
`typecheck`, fail-closed `lint:all`, and the generated root `test` script. It does
not run a production build.
`test:ci` runs this gate with `--all`, proves the real typed oRPC WebSocket
runtime, then runs six representative production-build/start lifecycles through
`test:e2e-build`. Each lifecycle audits its installed graph at high severity,
then explicitly runs `typecheck` before fail-closed `lint:all` and the production build. Generated
runtime checks also require `/` and `/sign-in` to render HTML successfully; a
healthy API endpoint alone does not prove SSR works. The custom capability-heavy
corner combines single Next.js, Eve, and messaging to exercise their shared
server entrypoints. Generated
projects deliberately do not add an unpublished `ghostinit` dependency:
prepublication gates own the local CLI path, while consumers use the released
CLI they explicitly installed.

This exists because the host suite structurally cannot see the output: templates
are string arrays, so `bun run check` stayed green while generated projects
failed to install (invented dependency versions), failed to typecheck (`baseUrl`
on TS6, packages with no `exports`, UI components never emitted) and failed to
lint (`.oxlintrc.json` extended a file that was never written). Every one of
those was invisible to 399 passing unit tests.

- Default local corners are `next-monorepo` and `single-next`; CI passes `--all`.
- `--all` runs all 24 configured corners, including installed Node, TanStack + Convex,
  TanStack messaging, Redis, web+mobile+desktop, notifications, remote feature
  flags, jobs, standalone-storage slices, and four Cloudflare Worker profiles
  (slow: each is a full verified dependency bootstrap). `--workers` selects the Cloudflare
  Next/TanStack x monorepo/single subset; `bun run test:workers` is its package
  alias. Worker corners additionally build and independently secret-scan the
  artifact, run a Wrangler dry-run, and smoke `/`, `/api/health`, and
  `/api/rpc/health` under a bounded local Wrangler process with verified
  descendant cleanup. Both Convex monorepos select every reviewed Worker
  capability family; the database-free single profiles explicitly add the API
  capability. Monorepos select Bun while single profiles select Node so both
  advertised execution-runtime choices are exercised. CI also runs both single
  Worker adapters on Windows and macOS as a permanent portability contract.
  This is representative, not an exhaustive Cartesian product.
- `--only a,b` selects corners; `--keep` leaves the projects on disk to inspect.
- Every selected corner is release-blocking. Do not add expected-failure or
  allow-failure exceptions; keep a failing configuration out of release claims
  until its generate/install/format/architecture/typecheck/lint:all/test path is fixed.

`bun run release` never publishes. Its final `release:artifact` step uses Bun
1.4.0 to build and pack once, binds the packed-CLI test to that exact tarball,
and writes a SHA-256 sidecar under `.ghostinit-release/`. The checksum is an
integrity identifier, not registry provenance; Bun 1.4.0 has no provenance
attestation flag, so do not add a false `publishConfig.provenance` claim. If a
release is approved, publish the already-tested tarball path rather than
repacking the tree.

Use it whenever you touch dependency versions, tsconfig emission, package
manifests, or anything under `apps/`.

### Generation matrix (read this before adding a template)

`tests/unit/generation-matrix.test.ts` is the guard against variant drift. Every
other billing/app test drives only the DEFAULT config (monorepo + Next.js +
Drizzle), so bugs used to ship freely in the TanStack and Convex variants while
the suite stayed green. The matrix test generates 12 representative corners
across mode, framework, database, app, and billing choices in memory and asserts
structural invariants:

- **every emitted `.ts`/`.tsx` parses** (via oxc-parser). Templates are assembled
  as string arrays, so nothing else typechecks the OUTPUT — this catches
  unbalanced quotes, stray braces and botched interpolation.
- **every relative import resolves** to a file that was actually emitted.
  `convex/_generated/*` and `routeTree.gen` are the only allowed
  not-yet-generated targets, and convex specifiers must land on the ROOT
  `convex/_generated/*` — never inside the app tree.
- **no feature leakage**: no `eve` import unless the eve feature is on, no
  `next`/`next/*` import anywhere in a TanStack Start project, no webhook file
  for an unselected provider.
- **`.env.local` never invents third-party credentials** — vendor keys stay
  `REPLACE_WITH_*` placeholders; only self-issued secrets are minted.

If you add a template, it must satisfy all configured corners. Prefer fixing the
generator over relaxing an assertion.

## TanStack Start gate expectations

A TanStack corner is verified only after its generated project installs,
typechecks, and lints successfully on the final tree. `typecheck` runs
`tsr generate` first so `src/routeTree.gen.ts` exists.

- Server route handlers for TanStack now correctly destructure `{ request }: { request: Request }`
  (Next.js handlers keep `request: Request`), matching `RouteMethodHandlerFn`.
- `src/routes/admin*` routes (`/admin`, `/admin/users`, `/admin/users/create`) are generated
  for both `monorepo` and `single` modes, so typed `Link to="/admin"` is valid.
- `src/routes/billing.tsx` / `dashboard.tsx` / `settings.tsx` use typed
  `Route.useRouteContext() as { session: { user: ... } }` with `getSessionFn` via
  `auth as unknown as { api: { getSession } }`, no `as any`.
- `database=none` now emits a stub `packages/database` so `import { db } from "@repo/database"`
  resolves and `packages/auth` typechecks (stub `db: any` proxy).

Do not promote a past green subset to a release claim. Record the exact
configurations, final-tree status, commands, and exit codes for each run.

## References

- [CONTRIBUTING.md](./CONTRIBUTING.md) — onboarding, structure, how-to-add guides, build/code style/testing/release
- [Architecture](#architecture) — generated architecture graph, host/output boundary, billing model, oRPC, and security invariants
- [V1-to-V2 compatibility ledger](./evidence/compatibility/v1-to-v2.json) + [schema](./evidence/compatibility/v1-to-v2.schema.json) — machine-readable V1 surface and V2 migration decisions
- [Design evidence and policy gates](./DESIGN.md#evidence-and-policy-gates) + [frontend engineering records](./docs/engineering/frontend-task-records/) — design-system policy and versioned frontend engineering evidence
- `.opencode/` — currently empty; no `opencode.json`
- `.claude/AGENTS.md` — subagent role manifest (not OpenCode instructions)
