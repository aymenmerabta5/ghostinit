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
```

Pretest auto-builds. `--timeout 100000` required (generation heavy).

## Hard Conventions (Will Break CI)

- **FsTransaction mandatory**: never `fs.writeFileSync`/`mkdirSync`/`rmSync` direct. All via `FsTransaction` (`fs.ts`) staging `.ghostinit-staging` TTL 1h cleanup ctor fire-and-forget + commit sync + rollback safety, traversal `toAbsolute()` rejects `/`, `\`, `C:`, `..`, escapes root via `resolve`. Dry-run `getStagedFiles()`.
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

### New Billing Provider (7 files)

See `references/billing-provider.md` full steps with stripe reference.

1. versions billing group SDK dep
2. `BILLING_PROVIDERS` in `constants.ts`
3. `billing/providers/<name>/` 7 files `<300 LOC`: `client.ts` (server-only throws placeholder), `checkout.ts`, `customer.ts`, `portal.ts` (throw checkout-only if unsupported), `webhook.ts` (`Buffer.from(await request.arrayBuffer())`), `subscriptions.ts`, `mappers.ts` + explicit barrel `index.ts`
4. barrels explicit + `billing/index.ts` switch + `BILLING_PROVIDER_NAMES`
5. webhook factory `billing/webhooks/factory.ts` + `webhooks/providers/<name>.ts`
6. `shared/env/billing.ts` `billingEnvLines()` + `ENV_PLACEHOLDERS` `constants.ts`
7. turbo `globalEnv` in `root.ts` + root `turbo.json` 50+ exhaustive
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

### New Feature (eve, i18n)

`availableFeatures` + `src/templates/<feature>/` explicit + composer wiring `services-composer.ts` / `agents-composer.ts` / `core-services-aggregator.ts` + env + tests.

### New Env Var — 5-Place + Skills (Critical)

New var → MUST update same PR 5 places + skills:

1. `src/lib/constants.ts` `ENV_PLACEHOLDERS` `"REPLACE_WITH_..."`
2. `src/templates/shared/env/` builder: `billing.ts`, `core.ts`, `builders.ts` — emit example + local + dual client prefixes where client-safe
3. `src/templates/root.ts` `turbo()` `globalEnv` exhaustive 50+
4. root `turbo.json` `globalEnv`
5. docs `docs/ARCHITECTURE.md` + `AGENTS.md` tooling quirk + **MUST also update** `skills/ghostinit-use/` (`references/billing.md` or `workflows.md` or `frameworks.md` if user-visible) + `references/env-vars.md` this skill

Miss one → env missing in generated or Turbo cache poisoned. Verify: grep globalEnv includes var + smoke `create demo` + cat `.env.example` includes var + cat generated `turbo.json` includes var.

## Project Structure Quick Map

- `src/cli.ts` + `cli/index.ts` + `registry.ts`, `args.ts`, `help.ts`, `validation.ts` — arg parsing, levenshtein, envelope
- `src/commands/create/` — orchestrator, validation, prompts @clack, installer FsTransaction + bun install
- `src/commands/add.ts` — pre-lock validation + lock + generators + sync, TOCTOU, noop
- `src/commands/sync.ts` — 4 registries deterministic + drift parallel hash + --check exit 8 + --dry-run
- `src/commands/check.ts` — architecture analyzer 23x <200 LOC via oxc-parser
- `src/commands/doctor/` — env, versions, checks secret strength + DB connectivity
- `src/lib/` — see AGENTS.md list
- `src/generators/` — module, use-case, procedure, action, shared.ts AST
- `src/templates/` — see AGENTS.md + `references/templates.md`
- `packages/versions/` — SSOT, `tooling/`, `tests/`, `scripts/build.ts`

## Tooling Quirks

- host `bunfig.toml` isolated hoist=false hermetic, generated hoist=true Next compat (TS7 quirk)
- TS 6.0.3 stable not 7 — Next detection + Bun runner
- build verifies real d.ts >10 bytes not fake `export {}` stub

## Testing

- `--timeout 100000` required
- fixtures per-fixture `bun install` slow — skip unless compat
- `bun run build && node dist/cli.js check` after template changes
- QA: turbo globalEnv billing, hoist=true, catalog no versions hardcoded, no `export *`, no `fs.*Sync`
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
3. Mirror: `rm -rf .claude/skills/ghostinit-dev .claude/skills/ghostinit-use && cp -r skills/ghostinit-dev .claude/skills/ && cp -r skills/ghostinit-use .claude/skills/` (Windows manual per file).
4. Update `AGENTS.md` minimal delta + `docs/ARCHITECTURE.md` + `README.md` + `CONTRIBUTING.md` if affected.
5. `bun run format && bun run build && bun run check` must pass.

Keep this skill lean with progressive `references/`. No slop. No duplicating usage content already in `ghostinit-use` — cross-reference instead.

## Documentation Sync (Mandatory)

When arch, billing, env vars, framework list, version, tooling quirks, file layout, conventions, or usage changes → same PR:

- `AGENTS.md` minimal
- `docs/ARCHITECTURE.md` deep DAG
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
