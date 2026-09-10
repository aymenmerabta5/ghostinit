# Testing — Host CLI

## Commands

```bash
bun install
bun run build
bun run check
bun test --timeout 100000 tests/integration tests/unit
bun test tests/unit/<file>.test.ts --timeout 100000
bun test tests/integration/<file>.test.ts --timeout 100000
bun run test:fixtures
bun run test:workers
bun run test:ci
```

Timeout required `--timeout 100000` because integration does heavy generation + bun install checks.

Pretest auto-builds via `package.json` `pretest = bun run build`.

`test:fixtures` runs `scripts/test-fixtures.ts`, which requires the repository-pinned Bun version and
owns the complete fixture sequence. Do not prepend a separate fixture install;
the runner frozen-installs each fixture exactly once.

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
  - turbo.json globalEnv exactly matches the selected capability/app environment manifest
  - env files `.env.example` + `.env.local` existence + content billing filtered
  - composers dedup+sort + `__PROJECT_NAME__` replace
  - architecture checker `analyzeProject()` on generated output no BLOCKER/HIGH
  - sync deterministic idempotent: run twice same output
  - add module/use-case/procedure/action generators produce expected paths + sync rebuilds registries
  - billing combinations produce correct env + turbo globalEnv per combo
  - framework variants (next vs tanstack) produce correct vite/next config + outputs

- `tests/fixtures/compatibility/` — isolated compatibility projects exercised by one bounded runner:
  - `drizzle-betterauth-orpc/` — exact Drizzle, Better Auth, and oRPC pins. The runner installs, typechecks, runs seven Bun tests across two files, then runs the fixture's explicit runtime probes.
  - `next-tailwind-biome/` — catalog-pinned Next 16, Tailwind 4, Oxlint, and Oxfmt. The historical directory name remains, but there is no Biome dependency. The runner installs, typechecks, lints, and production-builds it.
  - `expo-uniwind-rnr/` — Expo, React Native, Uniwind, and Tailwind helpers. The runner installs, typechecks, then runs the Tailwind Variants, animation CSS, and Uniwind probes.
  - Each fixture has its own `package.json` and `bun.lock`. Run `bun run test:fixtures` once; `scripts/test-fixtures.ts` performs every stage with bounded timeouts.
  - Skip on narrow iterations unless touching oRPC/Drizzle, Next/Tailwind, or Expo/Uniwind compatibility because the three installs are slow.

- `bun run test:workers` — eight installed Cloudflare release corners: Next and
  TanStack Start in both monorepo and single mode, across Convex and
  database-free profiles. Every corner runs the ordinary generated-project
  audit/format/architecture/type/lint/test sequence, then Worker build and an
  independent sentinel scan, Wrangler dry-run, and bounded local `/` plus
  `/api/health` HTTP 200 smoke with verified process-tree cleanup. Both framework families have three
  Convex monorepo corners selecting one global provider plus Chargily/manual and
  the reviewed capability families. All eight validate `/api/rpc/health`;
  database-free singles add API, while Convex monorepo probes avoid external-service calls. Monorepos select Bun and single
  projects select Node. TanStack's independent scan targets the app-level
  `.wrangler/ghostinit-dry-run` upload bundle rather than only Vite `dist`.

## Dependency-security verification

For changes to the shared security runtime or integration, verify strict Bun JSON
parsing, stable range boundaries, unambiguous manifest/catalog edits, and unchanged
source/lease guards. Cover high/unknown blockers, lower-severity partial outcomes,
seven-day release-age blockers, exact patch checks, dry-run immutability, interrupted
install recovery, and unverified cleanup blocking later mutations.

Prove repairs on real installed direct, workspace, and Bun catalog dependencies,
including failure after source publication. Verify persistent floors through later
create/upgrade/sync compilation, retaining higher compatible pins and removing
absent dependencies. Dedicated CLI and generated fixes plus upgrade must run
`typecheck`, `lint:all`, and root tests; install scripts must prove canonical
installed audit. No-install/dry-run results cannot claim installed verification.

Build regenerates the standalone dependency-security runtime; verify emitted imports
stay within its allowed boundary and the bundle runs without GhostInit installed.
Keep fixture and generated-project audits, full app/runtime/build checks, and the
release artifact proof. Metadata probes or mocked subprocess reports do not replace
real installation evidence. See the
[maintenance contract](../../ghostinit-use/references/dependency-security.md).

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
bun run install:bootstrap && bun run typecheck && bun run lint:all
# variants
bunx ghostinit create demo2 --yes --no-install --cwd /tmp/gi-test --mode monorepo --framework tanstack-start --database postgres --billing manual,chargily,stripe --features eve
bunx ghostinit create demo3 --yes --no-install --cwd /tmp/gi-test --mode single --database postgres --billing stripe
```

Checklist after generation:

- `turbo.json` globalEnv includes billing vars (`STRIPE_*`, `CHARGILY_*`, etc) + `$TURBO_DEFAULT$` + `NEXT_PUBLIC_*` + `VITE_*`
- `bunfig.toml` hoist=true generated
- `packages/versions` catalog used no hardcoded literal versions in templates — grep `"^` version in templates folder should only be via `v.*` interpolation
- No `export *` in billing barrels — grep `export \*` in `billing/` + `webhooks/` + `providers/*/index.ts` should be 0 except allowed shims
- No direct `fs.writeFileSync` / `mkdirSync` / `rmSync` in src/ except `fs.ts` itself `node:fs/promises`
- Architecture checker passes on generated: `ghostinit check` inside generated or via built CLI
- `.env.example` and filtered `.env.local` retain vendor-issued billing credential placeholders for chosen providers; only self-issued secrets are minted. Client variables include only the selected app audiences.
- Cloudflare output contains `.dev.vars` instead of runtime `.env.local`, the
  correct OpenNext/native Vite adapter, and no unsupported PostgreSQL/Eve/PDF
  profile; `bun run test:workers` proves the built Worker and runtime health

## Version Sync Check

3 files must match on release:

- `packages/versions/src/index.ts` `ghostinitVersion`
- `package.json` `version`
- `src/templates/versions.ts` re-export

Build script verifies real d.ts >10 bytes not fake `export {}` stub via declarationMap.

`bun pm pack` via `bun run release` includes the publishable files declared in `package.json`. Inspect the resulting tarball when changing package layout.

## Fixtures Deep

- `bun.lock` per fixture isolated via host `bunfig.toml` `linker=isolated,hoist=false` hermetic vs generated hoist=true.
- All three fixture manifests target the canonical `runtime.bun` version. The Next, Drizzle/oRPC and Expo compatibility fixtures all pin TypeScript 7.0.2. Generated apps and shared tooling all use the catalog TS7 pin; Next invokes the project-local compiler CLI. Read each fixture manifest when changing compiler coverage. The fixture runner enforces Bun, frozen-installs each manifest, and invokes every fixture's typecheck script.
- oRPC uses one lockstep catalog line; `@orpc/next` is omitted because its latest 1.14.11 was an accidental deprecated v2 publish, so GhostInit uses pure RPCHandler route handlers instead.

## Troubleshooting Tests

- Timeout without `--timeout 100000` → integration 5s default fails generation heavy.
- Fixture bun install fails → check bunfig host isolated vs generated hoist, workspace:* resolution, Node 24 target.
- Architecture checker finds violations after template change → fix template imports not checker (checker mirrors intended layer model). If model intentionally changed, update checker `getLayerFromFilePath` + `getLayerFromImport` + docs + AGENTS.md same PR.
- Secret detection false positive → check SECRET_SUBSTRINGS superset maybe word contains `key` substring unavoidable (monkey) → adjust detection logic or rename var.
- Billing parser forward-compat: `parseBillingInput("stripe,unknown")` should not throw → ["stripe"], `parseBillingInput("unknown")` must throw ValidationError.
- Sync drift unrelated to your change → inspect `ghostinit sync --dry-run` before regenerating. Preserve user edits; `--force` cannot override managed-file hash conflicts.
- Lock active on status → `.ghostinit.lock` exists. Inspect its renewable lease/owner, allow stale recovery, or stop the known writer before explicit `--force` takeover; never delete an active lease manually.
