# GhostInit Commands — Usage Reference

For agents with zero codebase knowledge.

## Registry

Commands: `create, init, upgrade, add, sync, status, check, doctor, security, capabilities, version, help`. Invoke via `ghostinit <command> [args] [flags]`.

## `create <name>`

Scaffolds new project folder `<name>` under `--cwd` (default cwd).

- `<name>` must match `^[a-z][a-z0-9-]*$` lowercase.
- Interactive when TTY and no `--json/--yes/--ci`: prompts for name if missing, mode, framework, apps (web/mobile/both), database, billing multiselect, features multiselect, install confirm.
- Non-interactive: pass all flags explicitly + `--yes`.
- Validation:
  - `billing + database=none` blocked → needs DB for subscriptions.
  - `single + apps both|all|web,mobile` blocked → single supports only one target; use monorepo for web+mobile.
  - `single + apps mobile|desktop` is frontend-only. Server-backed capabilities, database/cache/deploy selections, and implicit SaaS defaults are rejected with typed reason `single-native-server-capabilities-unsupported`.
  - `apps none` or empty alone blocked → at least one app required.
    Emits warning + exits 2 if invalid.
- Output: folder `<cwd>/<name>` with scaffolded files, `.env.example`, `.env.local` placeholders (`.dev.vars` for Cloudflare), `.ghostinit/state.json`, `start-database.sh`, `turbo.json` exhaustive globalEnv (including EXPO_PUBLIC_*), `bunfig.toml` hoist=true.
  - `apps/web` when web selected (Next.js app router or TanStack Start src/routes).
  - `apps/mobile` when mobile selected (Expo SDK 57 Router app/, metro.config.js auto monorepo, babel-preset-expo, SecureStore).
  - `apps/web + apps/mobile` when both selected (monorepo only).
  - Single mode `apps mobile|desktop` → flat frontend-only native structure with no generated backend host.
- If `existsSync(projectRoot)` and no `--force` → exit 18 conflict.
- If installation or verification fails → exit 22. A new target is published only after its private candidate passes; ordinary failures discard the candidate or roll back an existing empty target. If process cleanup cannot be verified, diagnostic files may be retained and the command reports that explicitly.
- If prompt cancelled → exit 130.

### Flags

| Flag                  | Values                                                       | Default    | Effect                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--preset`            | `saas,frontend,custom`                                       | `saas`     | Preset: saas=full Auth+DB+API+Email+Analytics; frontend=minimal; custom=pick via --with-*                                                                     |
| `--mode`              | `monorepo`, `single`                                         | `monorepo` | Structure: workspaces vs flat                                                                                                                                 |
| `--framework`         | `nextjs`, `tanstack-start`                                   | `nextjs`   | Frontend framework for web target                                                                                                                             |
| `--apps`              | `web,mobile,desktop,both,all` comma/repeat                   | `web`      | App targets: web=Next/TanStack, mobile=Expo, desktop=Electron + TanStack Router SPA, both=web,mobile, all=web,mobile,desktop                                  |
| `--billing`           | `stripe,paddle,polar,chargily,manual,both,none` comma/repeat | `none`     | At most one global provider, plus optional Chargily and manual                                                                                                |
| `--cache`             | `redis,none` (alias `upstash`)                               | `none`     | Cache via Upstash Redis + memory fallback                                                                                                                     |
| `--deploy`            | `vercel,fly,docker,cloudflare,none`                          | `none`     | Provider deployment output; Cloudflare supports web + Convex/none (Next via OpenNext, TanStack native)                                                        |
| `--stack`             | `nextjs,tanstack-start,expo,both`                            | —          | Frontend shorthand: maps to framework+apps for frontend preset                                                                                                |
| `--with-auth`         | flag                                                         | off        | Opt-in Auth (requires DB postgres                                                                                                                             | convex); custom only, saas forces on, frontend off unless --with-* |
| `--with-api`          | flag                                                         | off        | Opt-in oRPC API contract-first                                                                                                                                |
| `--with-email`        | flag                                                         | off        | Opt-in Resend email                                                                                                                                           |
| `--with-analytics`    | flag                                                         | off        | Opt-in PostHog                                                                                                                                                |
| `--with-cache`        | flag                                                         | off        | Opt-in Upstash Redis (same as --cache redis)                                                                                                                  |
| `--with-eve`          | flag                                                         | off        | Opt-in Eve AI hybrid; --features eve deprecated alias                                                                                                         |
| `--with-i18n`         | flag                                                         | off        | Opt-in next-intl; --features i18n deprecated alias                                                                                                            |
| `--with-pdf`          | flag                                                         | off        | Opt-in React PDF renderer; custom only                                                                                                                        |
| `--with-messaging`    | flag                                                         | off        | Opt-in DM messaging (requires DB+auth+api); custom only, saas/frontend opt-in                                                                                 |
| `--features`          | `eve,i18n,none` deprecated alias                             | `none`     | Alias for --with-eve/--with-i18n (case-insensitive deduped)                                                                                                   |
| `--database`          | `postgres,convex,none`                                       | `postgres` | DB provider; frontend defaults to none if not set                                                                                                             |
| `--runtime`           | `bun,node`                                                   | `bun`      | Executor for generated scripts                                                                                                                                |
| `--cwd`               | path                                                         | `.`        | Parent where project created                                                                                                                                  |
| `--no-install`        | flag                                                         | off        | Skip verified install; run `bun run install:bootstrap` once in the fresh output                                                                               |
| `--force`             | flag                                                         | off        | Permit command-specific existing/dirty checks or lease takeover; never bypass managed-file conflicts                                                          |
| `--json`              | flag                                                         | off        | JSON envelope to stdout, logs stderr                                                                                                                          |
| `--yes` / `--ci`      | flag                                                         | off        | Non-interactive; --yes defaults to saas unless --preset set                                                                                                   |
| `--dry-run`           | flag                                                         | off        | Preview: no write, returns `files[]:{path,size,bytes}`, `totalBytes`, `previewFiles` first 100 + `hasMore` (`--json`); text shows `237 files (394 kB)` + list |
| `--fix`               | flag                                                         | off        | Auto-fix (only `check`/`doctor`): `check --fix` selected manifest-derived turbo.json keys, `doctor --fix` mint secrets                                        |
| `--verbose`           | flag                                                         | off        | Verbose (only `status`/`check`/`doctor`): `status --verbose` full config                                                                                      |
| `--list`              | flag                                                         | off        | List (only `add`/`status`): `add --list` modules, `status --list` alias                                                                                       |
| `--quiet` / `--debug` | flag                                                         | off        | Log verbosity                                                                                                                                                 |

Invalid `--mode/framework/database/apps/preset/cache/deploy` → throws validation error exit 17 or exit 2 for combo, no silent fallback. Billing: partially unknown tolerated (`stripe,unknown` → `stripe`), fully unknown → throws exit 17. Features: deprecated alias, same tolerance (`eve,unknown`→`eve`, fully unknown→throws). Apps: `both` → `web,mobile`; `all` → `web,mobile,desktop`, repeatable/comma: `--apps web --apps mobile` == `--apps web,mobile`. Auth validation: `--with-auth` + `--database none` → exit 2 blocked (requires postgres|convex). Preset frontend with no explicit --database defaults to `none`. Cloudflare validation rejects PostgreSQL, Eve, and server-side PDF; select Convex or no database and keep those capabilities off.

Interactive when TTY and no --json/--yes/--ci: preset-first wizard. First prompts project name (if missing), then `What are you building?` select SaaS Starter / Frontend Only / Custom. Branching: SaaS → mode, framework, database (postgres|convex), billing multiselect, apps, features (eve/i18n); Frontend → mode, stack (nextjs|tanstack-start|expo|both), install confirm; Custom → mode, framework, database (postgres|convex|none), apps, addons 7-toggle (auth/api/email/analytics/cache/eve/i18n), billing, install confirm. Cancel → exit 130.

### Example

```bash
ghostinit create my-app --yes --cwd /tmp --mode monorepo --framework nextjs --apps web,mobile --database postgres --billing stripe,chargily --with-eve --with-i18n --no-install --json
# stdout: {"success":true,"exitCode":0,"data":{"projectName":"my-app","projectRoot":"/tmp/my-app","filesWritten":216,...},"meta":{"command":"create","durationMs":1234}}
# deprecated alias still works:
ghostinit create my-app --preset saas --features eve,i18n --yes --no-install
# frontend minimal:
ghostinit create my-app --preset frontend --stack nextjs --yes --no-install
# custom pick-your-own:
ghostinit create my-app --preset custom --with-auth --with-api --with-cache --cache redis --with-eve --database postgres --yes --no-install

ghostinit create my-app --apps web,mobile
ghostinit create my-app --apps mobile --mode monorepo --preset frontend --database none
ghostinit create my-app --apps mobile --mode single --preset frontend --database none
ghostinit create my-app --apps both --framework tanstack-start
ghostinit create my-app --dry-run --yes --no-install
ghostinit create my-app --dry-run --json --yes | jq .data.files
ghostinit create my-app --preset saas --billing stripe --with-pdf --with-messaging --deploy docker --yes --no-install
ghostinit create my-worker --preset frontend --framework tanstack-start --database none --deploy cloudflare --yes --no-install
```

## `upgrade [--dry-run] [--force] [--no-install] [--json]`

Compiles the current V2 desired state and applies a hash-gated transactional
re-render. Generator-owned files update only from their recorded base hash;
user-owned seed edits are preserved and retired from management when needed,
and conflicting managed edits stop the entire operation before commit. The
plan also covers path moves, environment migrations, and self-issued secret
materialization. Run `ghostinit upgrade --dry-run` first, especially when a
deployment change moves `.env.local` values into Cloudflare `.dev.vars`.

After reconciliation, upgrade applies compatible security repairs, installs frozen,
runs the canonical installed audit, and executes `typecheck`, `lint:all`, and root
`test`. `--no-install` skips this phase and reports security `not-run`. A failed
security phase can follow an applied source upgrade; inspect JSON `upgraded` and
`dependencySecurity`, and follow its recovery guidance.

## `security [audit|fix] [--dry-run] [--json]`

`audit` is the default, read-only action. `fix --dry-run` previews compatible,
age-eligible repairs without changing project files or installed dependencies.
`fix` publishes verified lock/manifests/evidence and security floors, installs the
project frozen, audits it, and runs `typecheck`, `lint:all`, and root `test`.

The command accepts project options such as `--cwd`; `fix` is a positional action,
not a `--fix` flag. CLI results use the normal JSON envelope. `clean`/`fixed`
return 0, `partial`/`blocked` return 8, and runtime failure returns 1 (typed
validation/lock/cancellation errors retain their usual codes). Dry-run results do
not prove installation. Generated `security:audit`/`security:fix` return the result
directly, with blocked results using exit 1. See
[dependency-security.md](dependency-security.md) for complete policy and recovery.

## `add module <name>`

Creates `packages/modules/src/<name>/`:

- `domain/types.ts` — `<Pascal>Entity {id}`
- `domain/index.ts` — re-export type
- `application/index.ts` — `<Pascal>ApplicationVersion`
- `ports/index.ts` — `<Pascal>Port`
- `index.ts` barrel
- `packages/database/src/schema/<name>.ts` — pgTable with userId FK to users
- `packages/modules/tests/<name>/domain-types.test.ts` stub

Returns noop true if dir exists → skips sync.

```bash
ghostinit add module orders
ghostinit add module orders --json   # {added:"module", name:"orders", noop:false, modules:["orders"], procedures:[]}
ghostinit add module orders --force --cwd /tmp/my-app
ghostinit add --list
ghostinit add --list --json | jq .data.modules
ghostinit add list  # alias
```

Constraints: reserved names rejected (workspace packages `api,auth,database,config,ui,...`, JS keywords, generated infra `openapi,contract,router,context,index`), language reserved, etc.

## `add use-case <module> <name> --kind command|query`

Creates use-case file in module's `application/` and updates barrel. Requires module exists.

- `command` → writes command use-case (write side)
- `query` → query use-case (read side)
- Generates `packages/modules/src/<module>/application/<name>.command.ts` or `<name>.query.ts` or `<name>.ts` depending on template.

```bash
ghostinit add use-case orders create-order --kind command
ghostinit add use-case orders list-orders --kind query
```

## `add procedure <module> <name>`

oRPC procedure in `packages/api/src/procedures/<name>.ts` wrapping use-case.

```bash
ghostinit add procedure orders create
ghostinit add procedure orders list
```

Requires module exists. After add auto syncs contract/router registries.

## `add action <module> <name>`

Server action for the module.

```bash
ghostinit add action orders submit
```

## `sync [--check] [--dry-run] [--force] [--json]`

When desired configuration or a pending operation exists, sync first runs the
same hash-gated transactional reconciliation used by upgrade. It then rebuilds
4 registries deterministically:

- `packages/modules/src/index.ts`
- `packages/api/src/contract.ts`
- `packages/api/src/router.ts`
- `packages/database/src/schema/index.ts`

- `--check` mode no writes, exits 8 DRIFT if changed or drift detected (tracked files modified externally vs checksums in state).
- `--dry-run` previews the desired-state plan (including conflicts) and registry
  changes without locking or writing.
- Normal mode writes + updates checksums + `state.json`.

```bash
ghostinit sync
ghostinit sync --check                # CI gate, exit 8 if out of sync
ghostinit sync --dry-run              # preview
ghostinit sync --json | jq .data.modules
```

Drift detection parallel hash compare detects missing/modified/unreadable tracked files.

## `status [--json]`

Shows `loadState(cwd)` metadata + the presence of `.ghostinit.lock` as `lockActive` (not a liveness check). Includes apps selected.

```bash
ghostinit status
# Project: my-app
# Runtime: bun
# Apps: web, mobile
# Modules: orders, identity
# Lock active: false

ghostinit status --json
# {success:true, exitCode:0, data:{project:"my-app", runtime:"bun", version:"0.1.0", apps:["web","mobile"], modules:["orders"], generatedAt:"2026-..", lockActive:false}}
```

Warns if no `.ghostinit/state.json`. Exits 0 if state present else 1.

## `check [--json] [--fix] [--verbose]`

Architecture checker (6-layer + isolation). Must have state else exit 23 INVALID_STATE.

- Passed if `blockers==0 && highs==0` → 0 else 1.
- Text mode logs each `[SEVERITY] message (rule)` with file + summary duration.
- JSON: `{findings: [{id,severity,message,file,rule}], summary:{blockers,highs,mediums}, fixed?: string[], fixMessages?: string[]}` when `--fix`.
- `--fix`: auto-fixes `turbo.json` globalEnv drift (selected capability/app keys from `src/lib/env-manifest.ts`); other layered violations require manual fix. Logs `Auto-fixed 1 issue(s): turbo.json` or `No auto-fixable issues`.
- `--verbose`: same as default (check always verbose).

```bash
ghostinit check
ghostinit check --json | jq .data.summary
ghostinit check --fix
ghostinit check --fix --json | jq .data.fixed
```

Rules (user-visible): layered-dependency, vendor-isolation, capability-isolation, client-boundary, domain-purity, application-purity, database-isolation, module-isolation, etc. Run after template changes or after manual code edits. Works for web, mobile (apps/mobile), and both. Flag validation: `--fix` only on `check|doctor`, `--verbose` only on `status|check|doctor`.

## `doctor [--json] [--fix]`

Tooling + env verification:

- Collects bun, node, tsc versions.
- Checks: bun present, node present, typescript present, ghostinit-version, ghostinit-state existence, BETTER_AUTH_SECRET length 32+, BETTER_AUTH_URL presence, NEXT_PUBLIC_APP_URL presence, POSTGRES_PASSWORD length, database existence/connectivity (optional), connectivity optional/skipped not blocking required.
- When mobile selected: checks EXPO_PUBLIC_APP_URL, EXPO_PUBLIC_API_URL presence (warning not blocking).
- `--fix`: mints `BETTER_AUTH_SECRET`/`POSTGRES_PASSWORD` placeholders (`REPLACE_WITH_*` or empty), creates `.env.local` from `.env.example` if missing, fixes `turbo.json` globalEnv. Re-evaluates checks post-fix. Returns `fixed:["BETTER_AUTH_SECRET","turbo.json"]`.

```bash
ghostinit doctor
# [OK] bun: repository-pinned Bun version
# [OK] node: Node 24.19.0
# [OK] typescript: TypeScript 7.0.2
# [OK] ghostinit-version: ghostinit 0.1.0
# [OK] ghostinit-state: Project state found for my-app
# [FAIL] BETTER_AUTH_SECRET: too short (<32)
# etc
ghostinit doctor --fix
ghostinit doctor --fix --json | jq .data.fixed
```

All required must OK → 0 else 1. DB connectivity optional.

## `status [--verbose] [--list] [--json]`

Shows project name, runtime, version, modules, lock. `--verbose` adds mode, framework, database, billing, apps, preset, cache, deploy, procedures, checksumCount, generatedBy. `--list` alias for verbose-light.

```bash
ghostinit status
ghostinit status --verbose
ghostinit status --verbose --json | jq .data
ghostinit status --list
```

## Global Flags (All Commands)

`--cwd` working dir root, `--json` envelope, `--yes`/`--ci` non-interactive, `--dry-run` preview, `--force` permits command-specific existing/dirty checks and explicit lease takeover; managed-file conflicts still fail, `--no-install` create/init/upgrade only, `--runtime`, `--quiet` suppress stderr, `--debug` verbose, `--version`, `--help`.

Help text: `ghostinit` or `ghostinit help` or `ghostinit --help`. Version: `ghostinit version` or `--version`.

## JSON Envelope

Shape: `{success: bool, exitCode: number, data?: any, error?: {message, code, details?}, meta: {command, durationMs}}`. Logs stderr so stdout parseable.

Exit codes: `0 OK, 1 GENERAL_ERROR, 2 INVALID_ARGUMENTS, 8 DRIFT, 16 MISSING_DEPENDENCY, 17 VALIDATION_ERROR, 18 CONFLICT_ERROR, 19 LOCK_ERROR, 20 GIT_DIRTY_ERROR, 21 INCOMPATIBLE_SCHEMA, 22 GENERATION_ERROR, 23 INVALID_STATE, 130 CANCELLED`.

## Lock

`.ghostinit.lock` is a renewable local-filesystem lease. Its default expiry is five minutes since the latest heartbeat, with token-checked release and guarded stale takeover. `status.lockActive` reports file presence, not process liveness. Stop a known active writer before requesting `--force` takeover; do not delete an active lease manually. Force never bypasses reconciliation hash conflicts. A dependency-security `CLEANUP_UNVERIFIED` journal also blocks every mutation and force/TTL takeover until independent process cleanup verification and explicit journal reconciliation.
