---
name: ghostinit-dev
description: This skill should be used when the user asks to "develop ghostinit", "modify ghostinit CLI", "add a package", "add a billing provider", "add a framework", "ghostinit internals", "host vs generated", "how to contribute", "FsTransaction", "add env var", "ghostinit template", or works on the host CLI repo src/, templates/, generators/, lib/.
---

# GhostInit Dev — Host CLI Contributor Guide

Host = this CLI repo (`ghostinit`), single publishable package `bin: dist/cli.js`, `private:false` intentional. Internal layering: `cli.ts` (Presentation) → `commands/` (Application) → `lib/` (Supporting) → `templates/`+`generators/` (Vendors/composers).

## Essential Commands

```bash
bun install
bun run build          # Bun.build dist/cli.js (external oxc-parser) + tsc -p src/tsconfig.json real d.ts >10 bytes verified
bun run check          # oxlint . && oxfmt --check . && tsc --noEmit — before test
bun run format         # oxfmt --write .
bun run typecheck      # tsc -b
bun run dev            # watch src/cli.ts
bun test --timeout 100000 tests/integration tests/unit
bun run test:ci        # + fixtures (per-fixture bun install slow)
bun run scripts/sync-turbo-env.ts --check   # verify turbo.json globalEnv matches src/lib/env-manifest.ts
bun run check:versions  # verify every pinned version exists on npm (needs network)
```

Pretest auto-builds. `--timeout 100000` required (generation heavy).

## Hard Conventions (Will Break CI)

- **FsTransaction mandatory**: never `fs.writeFileSync`/`mkdirSync`/`rmSync` direct. All via `FsTransaction` (`fs.ts`) staging `.ghostinit-staging` TTL 1h cleanup ctor fire-and-forget + commit sync + rollback safety, traversal `toAbsolute()` rejects `/`, `\`, `C:`, `..`, escapes root via `resolve`. Dry-run `getStagedFiles()` returns `files[]:{path,size,bytes}` + `totalBytes` for `create --dry-run --json`.
- **CLI flag validation**: `--fix` only on `check|doctor`, `--verbose` only on `status|check|doctor`, `--list` only on `add|status` — validated in `src/cli/main.ts` (`CREATE_ONLY_FLAGS` pattern). Adding a new flag → add to `CLI_OPTIONS` + `CreateParsed` + `GlobalOptions` + `help.ts` + validation gate + both skills.
- **<400 LOC**: `// @allow-long <LOC>: <reason>` escape with justification. Composers <5 imports, `monorepo/index.ts` dedup+sort+`__PROJECT_NAME__`.
- **No `export *`**: explicit named only, check `billing/webhooks/index.ts`.
- **Secret-safe**: `SECRET_SUBSTRINGS=[secret,password,token,auth,bearer,cookie,credential,key,otp,session,signature,private]` + `SECRET_PATTERN` + `URL_SECRET_PARAM_PATTERN`. Mirrored in generated `packages/observability/src/logger.ts`. Redact via `json.ts` before envelope. Never log raw env.
- **Typed errors+envelope**: `ValidationError`, `ExitCode`, `envelope()` → `{success,exitCode,data|error,meta:{command,durationMs}}`. Codes `0,1,2,8,16,17,18,19,20,21,22,23,130`. `printJson()` stdout parseable, logs stderr.
- **Versions SSOT**: never hardcode `^x.y.z`. Use `* as v from "./versions.js"` (`@repo/versions`). Internal deps `workspace:*`. Paths `@/* → src/*`, `@repo/* → packages/*/src`. Canonical `packages/versions/src/index.ts` `catalog` + `ghostinitVersion` synced x3: `packages/versions/` + `package.json` version + `src/templates/versions.ts` re-export.

## Adding Things — Decision Tree

### New Package `@repo/foo`

1. versions catalog group `packages/versions/src/index.ts`
2. `src/templates/<name>.ts` with `file()`, `packageJson()` via `v.*`
3. path `tooling/typescript-config/base.json` if new `@repo/<name>` (glob usually covers)
4. wire `modes/monorepo/packages-composer.ts` + `root-composer.ts`
5. verify `build && test && check`

### New Billing Provider (capability modules)

See `references/billing-provider.md` full steps with stripe reference.

1. versions billing group SDK dep
2. `BILLING_PROVIDERS` in `constants.ts`
3. `billing/providers/<name>/` small capability modules `<300 LOC`: start from the Stripe reference (`api-version.ts`, `client.ts`, `checkout.ts`, `customer.ts`, `portal.ts`, `webhook.ts`, `subscriptions.ts`, `mappers.ts`) and add only provider-specific modules that its capabilities require. Webhook routes must preserve a bounded raw `Buffer`; Stripe verification must `await stripe.webhooks.constructEventAsync(...)`. Keep provider barrels explicit and do not emit host-only declaration shims.
4. barrels explicit + `billing/index.ts` switch + `BILLING_PROVIDER_NAMES`
5. webhook factory `billing/webhooks/factory.ts` + `webhooks/providers/<name>.ts`
6. `shared/env/billing.ts` `billingEnvLines()` + `ENV_PLACEHOLDERS` `constants.ts`
7. environment-manifest ownership + exact capability-scoped generated `globalEnv`
8. UI `billing/ui/billing-page.tsx` conditional panel

### New Framework

1. `availableFrameworks` in `addons.ts`
2. `apps/myframework-*.ts` templates: `core`, `api`, `pages`, `components` — see `tanstack-*`
3. fragments DRY `apps/fragments/` with `RouterType` param — extract if >300 LOC or >30% duplication
4. router `default.ts` `generateProjectFiles()` + `monorepo/index.ts`
5. env already dual `NEXT_PUBLIC_*` + `VITE_*`
6. turbo outputs `.next/** .vinxi/** .output/** dist/** .vercel/**`

### Expo RNR + Uniwind (Host Template)

- Templates live in `src/templates/apps/fragments/expo/rnr/` — deterministic, no `npx @rnr/cli` runtime in generated. Each file exports `function rnrXxxContent(): string` returning typed component string using `tv()` + `cn()` + `className`, no `StyleSheet`, fully typed.
- Adding new RNR component: create file in `rnr/` folder exporting function returning string content using `tv()` + `cn()` + `className`, no `StyleSheet`, fully typed. Update `rnr/index.ts` `rnrAllFiles()` aggregator.
- Update `expo-components.ts` to include new file path `apps/mobile/src/components/ui/<name>.tsx` via `rnrAllFiles()` (auto) or explicit.
- Web UI local lives in `src/templates/apps/fragments/web-ui/` — primitives moved from old `@repo/ui` (now tokens-only).
- Theme single source: `src/templates/ui/theme.ts` generates `packages/ui/src/theme.css` OKLCH + `@theme inline` + `@layer theme @variant` for Uniwind. `src/templates/apps/fragments/css.ts` `globalCssContent()` imports `@repo/ui/theme.css`, `mobileGlobalCssContent()` imports `tailwindcss`, `uniwind`, `@repo/ui/theme.css`.
- Expo core: `expo-core.ts` `babelConfigContent()` → `['uniwind/babel', { cssEntryFile: './global.css' }]` before `babel-preset-expo`. `metroConfigContent()` → `withUniwindConfig(config, { cssEntryFile: './global.css', dtsFile: './uniwind-types.d.ts' })`.
- Layout `layout.ts` must `import '../global.css'` top per Uniwind docs or className silently ignored.
- Test via `tests/integration/web-mobile-rnr.test.ts` — asserts shared theme imports, babel metro, RNR components, no hardcoded StyleSheet.
- Versions: `packages/versions/src/index.ts` `uniwind` group `uniwind`, `tailwind-variants`, `tw-animate-css` + `reanimated` group `react-native-reanimated`.
- Lint: `oxlintrc.json` override `typescript/no-explicit-any: warn` for `src/lib/**/*.ts`, `src/templates/**/*.ts`, `src/cli/**/*.ts`, `src/commands/**/*.ts` to forbid new `any` while allowing gradual cleanup (warn not error).

### New Preset / Addon (preset-first, opt-in)

Presets: `saas` (full), `frontend` (minimal), `custom` (pick). Addons are opt-in via `--with-*` flags unified: `auth`, `api`, `email`, `analytics`, `cache` (Upstash Redis), `eve`, `i18n`, `pdf`, `messaging`. `--features` is deprecated alias for `--with-eve/--with-i18n` kept for backward compat (parseCreateArgs maps `features` includes eve→withEve true). Messaging is DM-only, opt-in for all presets (`presetDefaults.*.messaging=false`), requires `auth+api+database!==none` (validated in `isValidAddonCombo`), postgres uses oRPC WS (`@orpc/server/ws` + `crossws` + `bun-ws` + `@repo/realtime` + `@repo/storage`), convex uses native `convex/messaging.ts` + `ctx.storage` (no WS).

- `src/lib/addons.ts`: `coreAddons` (lint,format,t3env,ui,tanstack,zod always), `saasAddons` (auth,database,api,services,email,analytics conditional), `optionalAddons` (auth,api,email,analytics,cache,eve,i18n,pdf,messaging), `presetDefaults` (saas `email:true`, `frontend`/`custom` now also `email:true` (was false) — email is default-on for all presets; `buildAddonInstallerMap` `emailInUse = input.email ?? true`), parsers `parsePresetInput`, `parseCacheInput` (redis alias upstash), `parseStackInput`, `isValidAddonCombo` (auth→DB + messaging→DB guard), `buildAddonInstallerMap` (preset-aware: saas/no-preset true, frontend false, custom explicit booleans; database true if !=none; services follows api||auth; features/eve/i18n via withEve/withI18n or features includes; messaging opt-in all presets false). All AddonInstallerMap keys include PRESETS, CACHE_PROVIDERS, optionalAddons.
- `src/lib/config.ts`: `projectConfigSchema` fields `preset`, `cache`, `auth?`, `api?`, `email?`, `analytics?`, `eve?`, `i18n?`, `pdf?`, `messaging?` plus `billing`, `features` (kept empty for new, filtered), `database`, `framework`, `apps`.
- `src/lib/interactive.ts` `parseCreateArgs`: handles `with-*` + `--features` alias (if features includes eve/i18n and withEve undefined → set true), `--cache` redis alias, stack mapping.
- `src/cli/args.ts`: `CLI_OPTIONS` with `preset`, `cache`, `stack`, `with-auth, with-api, with-email, with-analytics, with-cache, with-eve, with-i18n, with-pdf, with-messaging`, `CreateParsed` includes withEve/withI18n/withPdf/withMessaging.
- `src/commands/create/index.ts`: decode interactive `__custom_*` prefixes (customFeatures 8-toggle includes eve/i18n/p/**/messaging), merge with CLI flags, set effectiveAuth/Api/Email/Analytics/Eve/I18n/Pdf/Messaging per preset (saas true for auth/api/email/analytics, false for messaging even in saas; frontend false via features includes, custom via flags), validate `isValidAddonCombo` with hasAuth+hasMessaging, pass `preset/cache/auth/api/email/analytics/eve/i18n/pdf/messaging` to `projectConfigSchema` (filters features eve/i18n out of features array, stores as eve/i18n booleans).
- `src/commands/create/prompts.ts`: preset-first wizard. First `What are you building?` select saas/frontend/custom. Branch: saas → mode, framework, database, billing, apps, features (eve/i18n/pdf/messaging); frontend → mode, stack (nextjs|tanstack-start|expo|both), install; custom → mode, framework, database, apps, addons 9-toggle (auth/api/email/analytics/cache/eve/i18n/pdf/messaging) + billing + install. Custom addons encoded as `__custom_*` for outer handler.
- `src/templates/modes/monorepo/index.ts` + `single/index.ts`: buildAddonInstallerMap with `eve: config.eve, i18n: config.i18n, pdf: config.pdf, messaging: config.messaging` passthrough, `hasEve/hasI18n/hasPdf/hasMessaging` includes `config.*` fallback, conditional `servicesComposerFiles` etc., `hasAuth/hasApi/hasAnalytics/hasEmail/hasCache/hasPdf/hasMessaging` derived from map; frontend minimal: `packagesComposerFiles` without analytics when off, database stub when none, `cacheComposerFiles` only when hasCache, `realtimePackage/storagePackage` only when `hasMessaging && postgres`, auth/api filtered via `hasAuth` etc. Stripping: disabled packages removed via path/content filters + workspace deps removal in `root-composer.ts`/`services-composer.ts`. Messaging branch: postgres → `packages/database` tables + `packages/modules/messaging` + `packages/api` procedures + `ws.ts` + `apps/**/lib/realtime` + `app/(app)/messages` + `server.ts` + `attachments` route; convex → `convex/messaging.ts` + schema tables + `convex/react` hooks UI.
- `src/cli/help.ts`: list --preset/--cache/--stack/--with-* (8 flags) + --features deprecated note. New `ws`/`crossws` versions in `packages/versions` `realtime` group, `storage` S3 wrapper; `GLOBAL_ENV_KEYS` includes `*_WS_URL` + `STORAGE_*` + `UPLOADS_DIR` (postgres only, convex ignored).

To add a new addon: add to `optionalAddons` + `presetDefaults` + `projectConfigSchema` + `CLI_OPTIONS` + `parseCreateArgs` + `create/index.ts` effective handling + `prompts.ts` custom checklist + `buildAddonInstallerMap` + help/skills + template conditional composer + env if needed.

### New Feature (eve, i18n) — now addons

Unified as addons via `--with-eve/--with-i18n` (preferred) + deprecated `--features eve,i18n` alias. New template still lives in `src/templates/eve/` and `src/templates/i18n/` but is now gated by `hasEve/hasI18n` from addon map (not just features). Wiring same: `services-composer.ts` / `agents-composer.ts` / `core-services-aggregator.ts` + env + tests. Add via addon flow above, not via old `availableFeatures`-only flow.

### New Env Var — 5-Place + Skills (Critical)

New var → MUST update same PR 5 places + skills:

1. `src/lib/constants.ts` `ENV_PLACEHOLDERS` `"REPLACE_WITH_..."`
2. `src/templates/shared/env/` builder: `billing.ts`, `core.ts`, `builders.ts` — emit example + local + dual client prefixes where client-safe
3. `src/templates/root.ts` `turbo()` manifest-derived, capability-scoped `globalEnv`
4. root `turbo.json` `globalEnv`
5. docs `AGENTS.md` + `CONTRIBUTING.md` tooling quirk + **MUST also update** `skills/ghostinit-use/` (`references/billing.md` or `workflows.md` or `frameworks.md` if user-visible) + `references/env-vars.md` this skill

Miss one → env missing in generated or Turbo cache poisoned. Verify: grep globalEnv includes var + smoke `create demo` + cat `.env.example` includes var + cat generated `turbo.json` includes var.

## Project Structure Quick Map

- `src/cli.ts` + `cli/index.ts` + `registry.ts`, `args.ts`, `help.ts`, `validation.ts` — arg parsing, levenshtein, envelope, flag gates (`--fix/--verbose/--list`)
- `src/commands/create/` — orchestrator, validation, prompts @clack, installer FsTransaction + bun install, dry-run diff (`stagedFiles` + `totalBytes`)
- `src/commands/add.ts` — pre-lock validation + lock + generators + sync, TOCTOU, noop, `--list` (scans state + FS)
- `src/commands/sync.ts` — 4 registries deterministic + drift parallel hash + --check exit 8 + --dry-run
- `src/commands/check.ts` — architecture analyzer 23x <200 LOC via oxc-parser, `--fix` (turbo.json globalEnv)
- `src/commands/doctor/` — env, versions, checks secret strength + DB connectivity, `--fix` (mint secrets, turbo.json)
- `src/commands/status.ts` — state + lock, `--verbose` (full config), `--list` (alias)
- `src/lib/` — see AGENTS.md list
- `src/generators/` — module, use-case, procedure, action, shared.ts AST
- `src/templates/root/` — `package.ts` (husky 9.1.7 + prepare + check scripts), `husky.ts` (`.husky/pre-commit` + `lefthook.yml`), `turbo.ts`/`config.ts` (turbo.json, lint configs, workflow), `secrets.ts` + `env.ts` + `shared/env/` builders
- `src/templates/` — see AGENTS.md + `references/templates.md`
- `packages/versions/` — dependency SSOT for host/generated tooling, `tests/`, `scripts/build.ts`, `scripts/sync-turbo-env.ts`, `scripts/check-versions.ts`

## Tooling Quirks

- host `bunfig.toml` isolated hoist=false hermetic, generated hoist=true Next compat (TS7 quirk)
- TypeScript is runtime-scoped: Next.js uses the catalog's TS 7 CLI pin; TanStack/Vite and Expo remain on TS 6 while their tooling loads the JavaScript compiler API.
- Email default-on: `packages/email` uses the supported unified React Email 6 package (`react-email`; components, Tailwind, and `render` share one import) + Resend, with versions from the central catalog. It includes an `EmailLayout` using Tailwind `pixelBasedPreset` and a hex palette, `sendEmail<T>(to,subject,Component,props)` via `render()`, and a `MagicLink` template; `frontend`/`custom` presets use `email:true` and `buildAddonInstallerMap` defaults `emailInUse = input.email ?? true`.
- React web stack uses the npm-latest compatible pins in `packages/versions/src/index.ts` `nextStack`; Expo keeps its official React line in `expoReact`.
- Auth P2: `better-auth` plugins `magicLink`, `passkey`, `organization` added to `src/templates/auth.ts` (server `magicLink({sendMagicLink})` + `passkey()` + `organization()` and client `magicLinkClient`, `passkeyClient`, `organizationClient`), plus OAuth `GOOGLE_CLIENT_ID/SECRET` + `GITHUB_*` (`env-manifest` + `shared/env/core.ts` + `GLOBAL_ENV_KEYS` + `turbo` + `auth.ts` `socialProviders` spread) and `accountLinking` + `changeEmail` + `emailVerification`
- Hooks: generated `husky 9.1.7` + `.husky/pre-commit` (oxlint + oxfmt --check + ghostinit check, set -e) + `lefthook.yml` alternative (`parallel: false`, oxlint/oxfmt/arch), `package.json` scripts `check`/`check:fix`/`doctor:fix`/`prepare: husky`, CI `.github/workflows/ci.yml` now `on: [push, pull_request]` with lint+typecheck+build+ghostinit check
- Create dry-run: `create --dry-run --json` uses `FsTransaction.getStagedFiles()` → `DryRunFile[]:{path,size,bytes}` + `totalBytes`, text `237 files (394 kB)` + first 100 list, `previewFiles` cloned to avoid `[Circular]` via WeakSet redact
- Check/Doctor fix: `check --fix` fixes `turbo.json` globalEnv (96 keys from `env-manifest.ts`), `doctor --fix` mints `BETTER_AUTH_SECRET`/`POSTGRES_PASSWORD` placeholders + creates `.env.local` + fixes turbo.json, both re-evaluate checks post-fix
- Status verbose: `status --verbose` / `--list` exposes `mode, framework, database, billing, apps, preset, cache, deploy, procedures, checksumCount, generatedBy`
- CI freshness: host `check-and-test` now runs `scripts/sync-turbo-env.ts --check` + `check:versions` (needs network) before test; `scripts/sync-turbo-env.ts` is SSOT for `turbo.json` vs `GLOBAL_ENV_KEYS`
- build verifies real d.ts >10 bytes not fake `export {}` stub
- Deployment templates: `root/deploy.ts` + `deploy-guides.ts` emit exact Bun images, an ephemeral BuildKit env secret (never `COPY .env*`), runtime `COPY --chown=1000:1000`, `/api/health` image/Fly probes, 30-second Compose/Fly shutdown grace, and explicit named Eve Workflow volumes. Vercel validly uses provider-managed `bunVersion: "1.4.x"` while install/build invoke exact catalog Bun. Postgres 18 volumes mount `/var/lib/postgresql`, not the pre-18 `/var/lib/postgresql/data` path.
- Cache via catalog-pinned Upstash Redis over HTTP is fail-closed; `packages/cache` is emitted only for `cache===redis` (or `--with-cache`). The same `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` pair owns atomic production API rate limiting when auth+transport are selected even if the cache package is off; placeholders permit only the bounded development/test limiter fallback. Turbo `globalEnv` and capability sanitization follow that ownership.
- Preset frontend/custom: `database: "none"` stub `packages/database` with `db: any` proxy; `email` is now always emitted (React Email default-on) — not stripped; `auth` stripped removes `auth-client`, `trustedOrigins`, `expo()` plugin; analog for `api`/`analytics`/`eve`/`i18n`/`cache`/`billing` only
- API RBAC: `packages/api/src/context.ts` exposes `role` + `sessionId` + `requireUser`/`requireAdmin`; `packages/api/src/middleware/auth.ts` provides `protectedProcedure(ctx)`/`adminProcedure(ctx)` (throw `ORPCError` `UNAUTHORIZED`/`FORBIDDEN`). Mutation procedures use one atomic Upstash Redis `EVAL` through the REST pipeline; only development/test may use the bounded process-local fallback, and production fails closed even when the optional cache package is off. `health` + `me` still exist, `billing/*` procedures use `listSubscriptionsUseCase`.
- Settings: `apps/web/src/app/settings/components/sessions-card.tsx` (`useState` + `authClient.listSessions`/`revokeSession`/`revokeSessions`, `Badge current`, `Revoke`) added to `settingsFiles()` (Next) and TanStack `settings/tanstack-page.ts` `Security` now links to `Sessions` + `Passkey & Magic Link` note + `Organization` enabled.
- Admin: `admin/hooks/use-admin-users.ts` now `search`/`page`/`limit:20`/`offset` + `query:{limit,offset,search}`; `admin/users-page.tsx` search input + `Prev/Next` + `Page X/Y` + audit-log footnote.
- Billing: `apps/web/src/app/billing/page.tsx` (and `routes/billing.tsx`) now real UI via `hooks/use-billing.ts` (`subscriptions`/`invoices`/`isCheckoutLoading`/`pastDue` + `handleCheckout(provider)` + `handlePortal`) emitted by `billing/index.ts` for both routers; `billingFiles()` emits hook for Next (`app/billing/hooks/use-billing.ts`) and TanStack (`routes/billing/hooks/use-billing.ts`).
- Env prefix is framework-specific: `@repo/config` uses `@t3-oss/env-nextjs` (NEXT_PUBLIC_) for Next.js and `@t3-oss/env-core` with `clientPrefix: "VITE_"` for TanStack, emitting only that framework's public vars; listing both families together fails t3-env typecheck. Expo adds `EXPO_PUBLIC_` via separate config.

## Testing

- `--timeout 100000` required
- fixtures per-fixture `bun install` slow — skip unless compat
- `bun run build && node dist/cli.js check` after template changes
- QA: turbo globalEnv 96 keys, hoist=true, catalog no versions hardcoded, no `export *`, no `fs.*Sync`, husky hooks present (`.husky/pre-commit` + `lefthook.yml`), `create --dry-run --json` emits `files[]` + `totalBytes`
- `check --fix` / `doctor --fix` tested via drift injection (turbo.json truncated + placeholder `.env.local`) → mint+rewrite
- See `references/testing.md`

## Maintaining This Skill (For Contributors — NOT for generated project users)

Whenever you change host contributor workflow, you MUST update this skill in SAME PR — no drift:

- New package catalog group pattern
- New billing provider 7-file pattern or factory pattern changed, or `ENV_PLACEHOLDERS` pattern
- New framework `RouterType` pattern or fragments extraction trigger changed
- New env 5-place location or verification command, new turbo globalEnv pattern
- New convention: <400 LOC escape, composers <5 imports, no `export *`, FsTransaction, secret-safe, typed errors, versions SSOT
- New testing quirk: timeout, fixtures, checker, QA
- New build check: build.ts verification, tsconfig, bunfig.toml rule
- New template composition: monorepoFiles dedup+sort+`__PROJECT_NAME__`, composer wiring, fragments DRY

**Checklist (same PR, mandatory):**

1. Update this `SKILL.md` adding-things/env decision tree + tooling quirks + conventions as affected + update `references/billing-provider.md`, `framework.md`, `env-vars.md`, `templates.md`, `testing.md` if topic specific.
2. If usage also affected (new flag, new billing provider, new framework, new env var user fills, new add subcommand, new workflow), ALSO update `skills/ghostinit-use/` SKILL.md + refs per its checklist — sometimes both skills.
3. Mirror each file from `skills/ghostinit-dev` and `skills/ghostinit-use` to its corresponding `.claude/skills/` path with safe per-file writes. Do not recursively delete either tree. Verify identical relative-path sets and SHA-256 hashes afterward.
4. Update `AGENTS.md`, `README.md`, and `CONTRIBUTING.md` if affected. When the public CLI or migration contract changes, update `evidence/compatibility/v1-to-v2.json` and its adjacent schema. When a frontend/design-system contract changes, update `DESIGN.md` and add or revise the applicable `docs/engineering/frontend-task-records/` record.
5. `bun run format && bun run build && bun run check` must pass.

Keep this skill lean with progressive `references/`. No slop. No duplicating usage content already in `ghostinit-use` — cross-reference instead.

## Documentation Sync (Mandatory)

When arch, billing, env vars, framework list, version, tooling quirks, file layout, conventions, or usage changes → same PR:

- `AGENTS.md` minimal
- `AGENTS.md#architecture` generated DAG and boundary invariants
- `evidence/compatibility/v1-to-v2.json` + its adjacent schema when the V1/V2 CLI or migration mapping changes
- `DESIGN.md#evidence-and-policy-gates` + `docs/engineering/frontend-task-records/` when frontend contract or review evidence changes
- `README.md` user-facing + skills section
- `CONTRIBUTING.md` how-to + skills abstraction rule + sync rule
- `skills/ghostinit-use/` usage abstraction (zero-knowledge) + `skills/ghostinit-dev/` this skill + `references/` + `.claude/skills/` mirror

No drift. Verify `build && check`.

## Additional Resources

- `references/billing-provider.md` — adding 5th provider step-by-step
- `references/framework.md` — adding framework with fragments DRY
- `references/env-vars.md` — 5-place + skills rule, patterns, verification
- `references/templates.md` — composition pipeline monorepoFiles, dedup, fragments triggers, DRY
- `references/testing.md` — test org, fixtures, smoke, version sync
