# Testing — Host CLI

## Commands

```bash
bun install
bun run build
bun run check
bun test --timeout 100000 tests/integration tests/unit
bun test tests/unit/<file>.test.ts --timeout 100000
bun test tests/integration/<file>.test.ts --timeout 100000
bun run pretest:fixtures && bun run test:fixtures
bun run test:ci
```

Timeout required `--timeout 100000` because integration does heavy generation + bun install checks.

Pretest auto-builds via `package.json` `pretest = bun run build`.

## Organization

- `tests/unit/` — pure parsing: billing input, features, mode, framework, database parsers, addon map builder, reserved names, secret detection looksLikeSecret, FsTransaction atomic staging path traversal, config schema zod, interactive parseCreateArgs isInteractiveMode, billing barrel matches SSOT.
  - `addons.test.ts` — `parseBillingInput()`, `parseFeaturesInput()`, `parseModeInput()`, `parseFrameworkInput()`, `parseDatabaseInput()`, `isValidAddonCombo()`, `buildAddonInstallerMap()`
  - `billing-barrel.test.ts` — fs matches SSOT explicit re-exports no `export *`
  - `fs.test.ts` — FsTransaction write, commit, rollback, getStagedFiles, traversal rejection, staging cleanup TTL
  - `reserved.test.ts` — validateArtifactName reserved checks
  - `secret.test.ts` — looksLikeSecret, SECRET_SUBSTRINGS superset
  - `config.test.ts` — projectConfigSchema, stateSchema
  - etc.

- `tests/integration/` — actual generation:
  - `generateProjectFiles()` dryRun + `monorepoFiles()` composer output checks
  - turbo.json globalEnv includes billing vars, exhaustive 50+ list present
  - env files `.env.example` + `.env.local` existence + content billing filtered
  - composers dedup+sort + `__PROJECT_NAME__` replace
  - architecture checker `analyzeProject()` on generated output no BLOCKER/HIGH
  - sync deterministic idempotent: run twice same output
  - add module/use-case/procedure/action generators produce expected paths + sync rebuilds registries
  - billing combinations produce correct env + turbo globalEnv per combo
  - framework variants (next vs tanstack) produce correct vite/next config + outputs

- `tests/fixtures/compatibility/` — real installs compatibility matrices:
  - `drizzle-betterauth-orpc/` — verifies drizzle + better-auth + oRPC contract-first compat with exact versions from @repo/versions
  - `next-tailwind-biome/` — Next 16.2.10 + Tailwind 4 + oxlint/oxfmt etc (despite name biome, actually oxlint/oxfmt)
  - Each fixture has own package.json + separate `bun install` (slow). Must run `pretest:fixtures` cd each fixture bun install then `test:fixtures` bun test fixtures folder.
  - Skip iteration unless touching oRPC/Drizzle/Next compat because slow + heavy node_modules.

## Architecture Checker in Tests

- Integration runs `analyzeProject()` on generated path ensuring no layered violations introduced by template changes.
- Host self-check: `bun run build && node dist/cli.js check` runs analyzer on host repo files.
- After template changes must run checker host + generated smoke.

## Manual Smoke Test

```bash
rm -rf /tmp/gi-test && mkdir /tmp/gi-test
bunx ghostinit create demo --yes --no-install --cwd /tmp/gi-test --billing stripe,chargily --features eve,i18n --framework nextjs
cd /tmp/gi-test/demo
cat turbo.json | grep globalEnv -A 80 | head -100    # billing vars present
cat bunfig.toml                                      # hoist=true
ls packages/ packages/billing/src/providers/         # stripe + chargily present
bun install && bun run typecheck && bun run lint
# variants
bunx ghostinit create demo2 --yes --no-install --cwd /tmp/gi-test --mode monorepo --framework tanstack-start --database postgres --billing all --features eve
bunx ghostinit create demo3 --yes --no-install --cwd /tmp/gi-test --mode single --database postgres --billing stripe
```

Checklist after generation:

- `turbo.json` globalEnv includes billing vars (`STRIPE_*`, `CHARGILY_*`, etc) + `$TURBO_DEFAULT$` + `NEXT_PUBLIC_*` + `VITE_*`
- `bunfig.toml` hoist=true generated
- `packages/versions` catalog used no hardcoded literal versions in templates — grep `"^` version in templates folder should only be via `v.*` interpolation
- No `export *` in billing barrels — grep `export \*` in `billing/` + `webhooks/` + `providers/*/index.ts` should be 0 except allowed shims
- No direct `fs.writeFileSync` / `mkdirSync` / `rmSync` in src/ except `fs.ts` itself `node:fs/promises`
- Architecture checker passes on generated: `ghostinit check` inside generated or via built CLI
- `.env.example` includes expected billing placeholders for chosen providers, filtered `.env.local` real secrets

## Version Sync Check

3 files must match on release:

- `packages/versions/src/index.ts` `ghostinitVersion`
- `package.json` `version`
- `src/templates/versions.ts` re-export

Build script verifies real d.ts >10 bytes not fake `export {}` stub via declarationMap.

`npm pack` via `bun run release` includes `dist/cli.js`, `src/**`, `schemas/project-config.json`, `README`, `LICENSE`. Tarball verification.

## Fixtures Deep

- `bun.lock` per fixture isolated via host `bunfig.toml` `linker=isolated,hoist=false` hermetic vs generated hoist=true.
- TS 6.0.3 stable reason tested: TS7 Go port `lib/typescript.js` missing causes Next 16.2.10 to fallback npm install workspace:* fails "Unsupported URL Type workspace:*"
- oRPC version 1.14.7 stable, `@orpc/next` omitted due to peers conflict 0.27.0 vs 1.14.7 core line, pure RPCHandler route handlers instead.

## Troubleshooting Tests

- Timeout without `--timeout 100000` → integration 5s default fails generation heavy.
- Fixture bun install fails → check bunfig host isolated vs generated hoist, workspace:* resolution, Node 24 target.
- Architecture checker finds violations after template change → fix template imports not checker (checker mirrors intended layer model). If model intentionally changed, update checker `getLayerFromFilePath` + `getLayerFromImport` + docs + AGENTS.md same PR.
- Secret detection false positive → check SECRET_SUBSTRINGS superset maybe word contains `key` substring unavoidable (monkey) → adjust detection logic or rename var.
- Billing parser forward-compat: `parseBillingInput("stripe,unknown")` should not throw → ["stripe"], `parseBillingInput("unknown")` must throw ValidationError.
- Sync drift unrelated to your change → `ghostinit sync` to regenerate, or `--force` + `--dry-run` preview.
- Lock active on status → `.ghostinit/lock` leftover after crash, rm manually or --force.
