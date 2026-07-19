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
bun run test:ci        # test + fixtures
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

## Project Structure

- `src/cli.ts` + `src/cli/index.ts` — arg registry, did-you-mean levenshtein, JSON envelope `{success, exitCode, data|error, command, durationMs}`
- `src/commands/` — `create.ts` (main orchestration), `add.ts`, `sync.ts`, `status.ts`, `check.ts`, `doctor.ts`, `types.ts` + subfolders `create/`, `doctor/`
- `src/lib/` — `errors.ts` (ExitCode, GhostinitError), `fs.ts` (FsTransaction atomic + staging `.ghostinit-staging` TTL 1h), `logger.ts` (secret-safe `SECRET_SUBSTRINGS`), `architecture/` (enforcer), `addons.ts` (parsers + `availableModes/Frameworks/Features/Databases`), `constants.ts` (BILLING_PROVIDERS, SECRET_SUBSTRINGS, RESERVED_WORKSPACE_PACKAGES, STAGING_*), `config.ts`, `interactive.ts`, `reserved.ts`, `json.ts`
- `src/generators/` — `module.ts`, `use-case.ts`, `procedure.ts`, `action.ts`, `shared.ts` (AST extraction)
- `src/templates/` — `root.ts`, `packages.ts`, `database.ts`, `auth.ts`, `api.ts`, `ui.ts`, `modules.ts`, `services.ts`, `email.ts`, `analytics.ts`, `i18n.ts`, `eve.ts`, `versions.ts`, `billing/{index,domain,schema,providers/{stripe,chargily,paddle,polar}/{client,checkout,customer,portal,webhook,subscriptions,mappers},webhooks/{factory→index},ui/billing-page.tsx}`, `apps/{core,pages,components,api,tests,tanstack-*}` , `modes/monorepo/{index,*-composer.ts,utils.ts}`, `modes/single.ts`, `shared/env.ts` (single source .env)
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

## Adding Things (see CONTRIBUTING.md for full)

- New package: add to `packages/versions` catalog → `src/templates/<pkg>.ts` with `file()`, `packageJson()` → wire in `modes/monorepo/packages-composer.ts` + `root-composer.ts` → verify `bun run build && bun test && bun run check`.
- New billing provider: `versions` billing group + `BILLING_PROVIDERS` const + 7-file provider folder + barrels explicit + webhook factory + env SSOT + turbo globalEnv + `billing/ui/billing-page.tsx`.
- New framework: `availableFrameworks` + `apps/myframework-*.ts` templates + router in `default.ts` + `monorepo/index.ts`.

## Testing Quirks

- Timeout required: `--timeout 100000` (integration does heavy generation + `bun install`).
- Fixtures in `tests/fixtures/compatibility/` need separate `bun install` per fixture — slow, skip on iteration unless touching oRPC/Drizzle/Next compat.
- Architecture checker: `bun run build && node dist/cli.js check` or `ghostinit check` in generated project. Run after template changes.

## References

- `CONTRIBUTING.md` — onboarding, structure, how-to-add guides, build/code style/testing/release
- `docs/ARCHITECTURE.md` — deep GhostInit Layered Architecture (6-layer pragmatic inspired by DDD, well-structured monorepo with architectural linting build-time only) graph, host vs generated, billing model, oRPC contract-first, security, DRY strategy
- `.opencode/` — currently empty; no `opencode.json`
- `.claude/AGENTS.md` — subagent role manifest (not OpenCode instructions)
