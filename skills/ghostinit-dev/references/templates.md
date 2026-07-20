# Templates Composition — Dev Deep Dive

## Pipeline

`src/templates/default.ts` `generateProjectFiles(config, ctx)`:

- `config.mode` defaults `monorepo`, else `single`.
- If monorepo → `modes/monorepo/index.ts` `monorepoFiles(config, secrets=buildSecrets(), ctx, addons)` where `buildSecrets()` random via `secret()` helper + `selectedBillingFromAddons()`, `hasEve/hasI18n`, `effectiveFramework`.
- Else single → `modes/single.ts` `singleFiles()` flat Next.

`monorepoFiles()`:

- Params: `ProjectConfig`, `RootSecrets = buildSecrets()`, `MonorepoContext {dryRun}`, `AddonInstallerMap` optional builds via `buildAddonInstallerMap({billing, features, database, mode, framework})` if not provided.
- `hasEve` = addonMap.eve.inUse OR features includes eve, `hasI18n` similar.
- `configuredFramework` = `config.framework`, `effectiveFramework` = configured ?? addonMap tanstack-start inUse? tanstack-start : nextjs.
- `selectedBilling` via `selectedBillingFromAddons(addonMap)` → `effectiveBilling` = selected nonempty ? selected : config.billing.
- `all` = concat composer groups: `rootComposerFiles(projectName,secrets,ctx,runtime,effectiveBilling)`, `packagesComposerFiles(runtime)`, `databaseComposerFiles(projectName,runtime)`, `authComposerFiles(effectiveFramework)`, `apiComposerFiles()`, `uiComposerFiles()`, `modulesComposerFiles(runtime)`, `appsComposerFiles(runtime,addonMap,effectiveFramework)`, `servicesComposerFiles(projectName,runtime,addonMap,hasEve,hasI18n,effectiveFramework)`, `billingComposerFiles(mode,runtime,addonMap,effectiveBilling)` → 12+ groups.
- `agentsComposerFiles(projectName,effectiveBilling,hasEve,hasI18n,effectiveFramework)` enrichedAgents replaces old AGENTS/CLAUDE/.cursor/.windsurf filtered.
- Dedup via Map path→file + sort by path + `__PROJECT_NAME__` replace in path and content.

Each composer `<5 imports` guideline, monorepo/index.ts exceeds but via intentional delegation (acknowledged).

## Composers Overview

- `root-composer.ts` → `genRootFiles()` from `root/` folder split: root package.json, turbo.json exhaustive globalEnv, bunfig.toml hoist=true (generated), oxlint/oxfmt configs, .gitignore, .env.example via `filteredEnvExample()` replacing raw, README minimal. `filteredEnvExample()` uses `shared/env` builders selectedBilling aware.
- `packages-composer.ts` → `genPackageFiles(runtime)` filtered excluding `typescript-config` (emitted by apps-composer authoritative @/* @repo/* aliases) + `genToolingFiles()` + `genAnalyticsFiles()`.
- `database-composer.ts` → database package + start-database.sh script. `database.ts` `databasePackage()` aggregates billing schema duplicate copy to avoid circular dep database→billing→database (copies `billing/schema/` tables into `database/src/schema/` for `db.query.webhook_events` support). `tryLoadBilling()` reads billing schema files via `readFileSync` relative thisDir, fallback barrel if missing.
- `auth-composer.ts` → auth package with framework resolution `resolveAuthFramework()` handles string|object+addons map detection TanStack vs Next cookie `nextCookies()` vs `tanstackStartCookies()`, security review flags: `autoSignInAfterRegistration false`, `httpOnly secure sameSite lax`, rateLimit memory, TRUSTED_PROXY guard ipAddressHeaders, backgroundTasks waitUntil, plugins admin twoFactor issuer.
- `api-composer.ts` → api package oRPC pure contract-first health+me procedures + contract/router barrel + openapi generator `OpenAPIGenerator` converters Zod.
- `ui-composer.ts` → ui package.
- `modules-composer.ts` → modules package empty starter.
- `apps-composer.ts` → apps/web files choose via effectiveFramework next vs tanstack vs myframework future, imports core/pages/components/api/tests fragments.
- `billing-composer.ts` → delegates to `billingFiles()` which aggregates billing domain/schema/providers/webhooks/ui based on addonMap billing effective.
- `services-composer.ts` + `core-services-aggregator.ts` + `eve-aggregator.ts` + `agents-composer.ts` — services/eve/agents conditional on hasEve/hasI18n/billing.

## Shared Concept: `file()`, `packageJson()`, `tsconfig()`, `codeScripts()`

Located in `src/templates/shared.ts` (or similar) — helpers return `TemplateFile {path, content}`. `file(path, content)` raw. `packageJson({name, exports, scripts, dependencies, devDependencies})` stringifies package.json with deterministic ordering + workspace:* handling. `tsconfig({include, compilerOptions})` stringifies tsconfig. `codeScripts()` default scripts `{lint, typecheck, ...}`.

Version injection: `import * as v from "./versions.js"` re-export of `@repo/versions`, then e.g., `stripe: "^" + v.billing.stripe`.

Internal deps `workspace:*` for `@repo/*`.

## Root Folder Split (483 LOC God File → <100 Each)

`src/templates/root/` after split:

- `index.ts` → `rootFiles(projectName,secrets,ctx,runtime)` main assembler? Actually delegates.
- `secrets.ts` → `RootSecrets` interface, `billingEnvPlaceholders`, `secret()` random helper.
- - maybe package.ts, turbo.ts, bunfig.ts, lint.ts, env.ts etc each small.

Same pattern for `shared/env/` split 449 LOC → `billing.ts`, `core.ts`, `builders.ts` each <300 etc.

Maintain <300 LOC guideline per file with `// @allow-long <LOC>: <reason>` escape if aggregation legit.

## Apps Fragments DRY

`src/templates/apps/fragments/` — extract common logic across Next vs TanStack to keep files <300 LOC and avoid duplication >30%.

- Each area folder `auth/`, `billing/`, `core/`, `marketing/`, `recovery/`, `settings/`, `header/`, etc.
- `page.ts` exports `export function <area>PageContent(router: RouterType): string` + `export function <area>Page(router): TemplateFile` choosing path based on router.
- `RouterType` = `"nextjs" | "tanstack-start"` | future frameworks.
- Guard helpers `auth/tanstack-guard.ts` `tanstackGetSessionFnContent()` + `tanstackAuthBeforeLoadContent()` instead of reimplementing per route.
- Shim barrels `core.ts`, `marketing.ts`, `header.ts` re-export from subfolder for backward compat + keep each sub-file <150 LOC.
- `pages.ts` (Next) delegates via `...settingsFiles()`, `...recoveryFiles()`, `...billingFiles()`. `tanstack-pages.ts` mirrors with router param: `...recoveryFiles("tanstack")`, `...settingsFiles("tanstack")`, `...billingFiles("tanstack")`. No inline 66 LOC route definitions — all routes go through fragments like `buildMarketingPageContent("tanstack")`.

Extraction triggers:

- `apps/tanstack-*` file approaching 300 LOC guideline.
- Duplication across Next/TanStack >30%.
- New `availableFrameworks` entry.
- Inline route >50 LOC duplicated.
- Guard duplication per route.

History Yellow #3: extracted forgot-password 66 LOC, reset-password 80 LOC, settings 78 LOC, billing 66 LOC inline from tanstack-pages.ts 357 → 65 LOC into fragments.

## Adding New Package Quick

1. versions group
2. template file `src/templates/my.ts` with `file()`, `packageJson()` via `v.*`
3. paths covered by glob usually, verify `tooling/typescript-config/base.json`
4. wire packages-composer + root-composer
5. build+test+check

## Adding New App Composer

If new deployable (e.g., `apps/eve`, `apps/api` separate), add to `apps-composer.ts` conditional on feature/database etc.

## SSOT Points

- Versions: `packages/versions/src/index.ts` catalog + ghostinitVersion
- Env: `shared/env/` builders
- Turbo globalEnv: `root.ts` turbo()
- Billing providers list: `constants.ts` BILLING_PROVIDERS + interface types
- Framework list: `addons.ts` availableFrameworks + parsers
- Modes/databases/features: `addons.ts` similar
- Reserved packages: `constants.ts` RESERVED_WORKSPACE_PACKAGES canonical imported by `reserved.ts`
- Secret substrings: `constants.ts` SECRET_SUBSTRINGS canonical host + generated observability logger mirror
