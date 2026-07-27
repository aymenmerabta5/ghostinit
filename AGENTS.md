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
bun run pretest:fixtures && bun run test:fixtures                # compatibility matrices
bun run test:generated # generate + bun install + typecheck + lint real projects
bun run check:versions # every pinned + generated dependency version exists on npm
bun run test:ci        # test + fixtures + generated
```

Manual generation smoke:

```bash
rm -rf /tmp/gi-test && mkdir /tmp/gi-test
bunx ghostinit create demo --yes --no-install --cwd /tmp/gi-test --billing stripe,chargily --features eve,i18n
cd /tmp/gi-test/demo && bun install && bun run typecheck && bun run lint
```

## Architecture

**Host vs Generated:**

- Host = this CLI repo. Single publishable package (`bin: dist/cli.js`, `private:false` intentional). Internal layering: `cli.ts` → `commands/` (Application) → `lib/` (Supporting) → `templates/`+`generators/` (Vendors/composers).
- Generated = output monorepo `apps/* + packages/* + tooling/*` with `turbo.json` 50+ globalEnv, `bunfig.toml` hoist=true.

**GhostInit Layered Architecture (pragmatic UI->Supporting)** inspired by DDD enforced by `src/lib/architecture/index.ts` via `oxc-parser` (not TS compiler):
1 UI (`apps/web`, `src/routes`) → 2 Transport (`packages/api`, `apps/web/src/app/api`, `src/routes/api`, oRPC) → 3 Domain (`**/domain/*`, `packages/core`) → 4 Capabilities (`packages/services/*`, `packages/billing` non-provider, `**/application/*`) → 5 Vendors (`billing/providers/*`, SDKs) → 6 Supporting (`database`, `config`, `kernel`, `observability`, `tooling/*`). No upward imports.

**Tooling quirks:**

- `bunfig.toml` host: `linker=isolated, hoist=false` (hermetic). Generated: `hoist=true` required for Next.js 16.2.10 TS resolution (TS7 Go port lacks `lib/typescript.js` + breaks on `workspace:*`).
- TS version SSOT is `packages/versions/src/index.ts`: TS `6.0.3` stable (not 7) — see `docs/ARCHITECTURE.md`.
- `turbo.json` host vs generated: generated must have exhaustive `globalEnv` 50+ vars (`DATABASE_URL`, `BETTER_AUTH_*`, `STRIPE_*`, `CHARGILY_*`, `PADDLE_*`, `POLAR_*`, `RESEND_*`, `POSTHOG_*`, `NEXT_PUBLIC_*`, `VITE_*`). Any new env var needs updates in 5 places: `src/lib/constants.ts` ENV_PLACEHOLDERS + `src/templates/shared/env.ts` + `src/templates/root.ts` turbo() + root `turbo.json` globalEnv + docs.

**Public env prefix is framework-specific.** `@repo/config` uses
`@t3-oss/env-nextjs` (implicit `NEXT_PUBLIC_` prefix) for Next.js and
`@t3-oss/env-core` with `clientPrefix: "VITE_"` for TanStack Start, and emits only
that framework's public vars — see `src/templates/packages/config.ts`. t3-env
type-errors on any `client` key lacking the prefix, so listing both families
together does not compile.

**Generated packages need explicit `exports` and `types`.** `@repo/*` resolves to
each package's SOURCE via tsconfig `paths`, so a consumer typechecks its
dependency's files under its OWN `compilerOptions`. Two consequences, both of
which broke the generated typecheck:

- A package with no `exports` (and no `main`) has no entry point —
  `import { ok } from "@repo/kernel"` fails with TS2307. Every generated package
  needs `exports: { ".": "./src/index.ts" }`.
- Anything that (transitively) pulls in `@repo/config` compiles its `env.ts`,
  which uses `process`, so it needs `types: ["node"]`. Only declare `@types`
  the package actually depends on — listing `react` on the tokens-only `@repo/ui`
  fails with TS2688.

**Never mint third-party credentials.** `buildSecrets()` mints only self-issued
secrets (`authSecret`, `postgresPassword`). Vendor keys (Stripe/Chargily/Paddle/
Polar/Resend) stay `REPLACE_WITH_*` in both `.env.example` and `.env.local`. A
generated value satisfies every webhook's `secret.startsWith("REPLACE_WITH")`
guard, so the clear 400 "not configured" path never fires and the user instead
debugs an opaque 403 signature failure (and the Stripe SDK throws outright on a
key with no `sk_` prefix).

## Project Structure

- `src/cli.ts` + `src/cli/index.ts` — arg registry, did-you-mean levenshtein, JSON envelope `{success, exitCode, data|error, command, durationMs}`
- `src/commands/` — `create.ts` (main orchestration), `add.ts`, `sync.ts`, `status.ts`, `check.ts`, `doctor.ts`, `types.ts` + subfolders `create/`, `doctor/`
- `src/lib/` — `errors.ts` (ExitCode, GhostinitError), `fs.ts` (FsTransaction atomic + staging `.ghostinit-staging` TTL 1h), `logger.ts` (secret-safe `SECRET_SUBSTRINGS`), `architecture/` (enforcer), `addons.ts` (parsers + `availableModes/Frameworks/Features/Databases`), `constants.ts` (BILLING_PROVIDERS, SECRET_SUBSTRINGS, RESERVED_WORKSPACE_PACKAGES, STAGING_*), `config.ts`, `interactive.ts`, `reserved.ts`, `json.ts`
- `src/generators/` — `module.ts`, `use-case.ts`, `procedure.ts`, `action.ts`, `shared.ts` (AST extraction)
- `src/templates/` — `root.ts`, `packages.ts`, `database.ts`, `auth.ts`, `api.ts`, `ui.ts`, `modules.ts`, `services.ts`, `email.ts`, `analytics.ts`, `i18n.ts`, `eve.ts`, `versions.ts`, `billing/{index,domain,schema,providers/{stripe,chargily,paddle,polar}/{client,checkout,customer,portal,webhook,subscriptions,mappers},webhooks/{factory→index},ui/billing-page.tsx}`, `apps/{core,pages,components,api,tests,tanstack-*}` , `modes/monorepo/{index,*-composer.ts,utils.ts}`, `modes/single.ts`, `shared/env.ts` (single source .env), `database/convex/{schema,auth,http,lib,posts,users,billing}.ts` (convex.ts was 1125 LOC; the content blocks were extracted verbatim), `template-loader.ts` (multi-root resolver — a naive `join(thisDir, rel)` always fails once bundled into `dist/cli.js`, which silently emitted barrels whose targets were never written)
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
- **Modes/frameworks** — `availableModes=[monorepo,single]`, `availableFrameworks=[nextjs,tanstack-start]`, `availableDatabases=[postgres,convex,none]`, `availableFeatures=[eve,i18n]`. Parsers throw `ValidationError` on invalid (no silent fallback) except billing/features allow partial unknown for forward-compat but fully unknown throws.

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
- New billing provider: `versions` billing group + `BILLING_PROVIDERS` const + 7-file provider folder + barrels explicit + webhook factory + env SSOT + turbo globalEnv + `billing/ui/billing-page.tsx`.
- New framework: `availableFrameworks` + `apps/myframework-*.ts` templates + router in `default.ts` + `monorepo/index.ts`.

## Testing Quirks

- Timeout required: `--timeout 100000` (integration does heavy generation + `bun install`).
- Fixtures in `tests/fixtures/compatibility/` need separate `bun install` per fixture — slow, skip on iteration unless touching oRPC/Drizzle/Next compat.
- Architecture checker: `bun run build && node dist/cli.js check` or `ghostinit check` in generated project. Run after template changes.

### The generated-project gate (`bun run test:generated`)

`scripts/test-generated.ts` generates real projects, runs `bun install` in each,
then runs that project's own `typecheck` and `lint`. It is part of `test:ci`.

This exists because the host suite structurally cannot see the output: templates
are string arrays, so `bun run check` stayed green while generated projects
failed to install (invented dependency versions), failed to typecheck (`baseUrl`
on TS6, packages with no `exports`, UI components never emitted) and failed to
lint (`.oxlintrc.json` extended a file that was never written). Every one of
those was invisible to 399 passing unit tests.

- Default corners are `next-monorepo` and `single-next` — CI blocks on these.
- `--all` runs every corner (slow: each is a full `bun install`).
- `--only a,b` selects corners; `--keep` leaves the projects on disk to inspect.
- A corner may declare `expectedFailures` for a documented known gap (currently
  `tanstack` → `typecheck`); those report as KNOWN and do not fail the run. When
  you fix the gap, delete the entry so it starts blocking.

Use it whenever you touch dependency versions, tsconfig emission, package
manifests, or anything under `apps/`.

### Generation matrix (read this before adding a template)

`tests/unit/generation-matrix.test.ts` is the guard against variant drift. Every
other billing/app test drives only the DEFAULT config (monorepo + Next.js +
Drizzle), so bugs used to ship freely in the TanStack and Convex variants while
the suite stayed green. The matrix test generates all eight corners
(monorepo/single × nextjs/tanstack-start × postgres/convex/none × billing on/off)
in memory and asserts structural invariants:

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

If you add a template, it must satisfy these for all eight corners. Prefer fixing
the generator over relaxing an assertion.

## Known gap: TanStack Start route typing

`--framework tanstack-start` generates, installs, and lints cleanly, and its
`typecheck` script runs `tsr generate` first so `src/routeTree.gen.ts` exists. What
is still outstanding is API drift against TanStack Start itself:

- Server route handlers are emitted as `async function handle(request: Request)`,
  but `RouteMethodHandlerFn` passes a context object. The fix is to destructure
  (`{ request }`) in the TanStack branches ONLY — the Next.js App Router handlers
  in the same files legitimately take a bare `Request`, and a blanket replace
  regresses them. Verify per-branch before landing.
- `src/components/header.tsx` and `src/routes/dashboard.tsx` link to `/admin`,
  but no `src/routes/admin*` route is generated, so the typed `Link` rejects it.
  Either port the admin pages to TanStack or drop the link.
- `src/routes/billing.tsx` reads `user` off the route context, which the root
  route does not declare.

Next.js (monorepo and single) is fully green end to end: install, `turbo run
typecheck`, and `turbo run lint` all pass.

## References

- `CONTRIBUTING.md` — onboarding, structure, how-to-add guides, build/code style/testing/release
- `docs/ARCHITECTURE.md` — deep GhostInit Layered Architecture (6-layer pragmatic inspired by DDD, well-structured monorepo with architectural linting build-time only) graph, host vs generated, billing model, oRPC contract-first, security, DRY strategy
- `.opencode/` — currently empty; no `opencode.json`
- `.claude/AGENTS.md` — subagent role manifest (not OpenCode instructions)
