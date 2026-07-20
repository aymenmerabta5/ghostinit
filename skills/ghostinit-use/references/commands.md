# GhostInit Commands — Usage Reference

For agents with zero codebase knowledge.

## Registry

Commands: `create, add, sync, status, check, doctor, version, help`. Invoke via `ghostinit <command> [args] [flags]`.

## `create <name>`

Scaffolds new project folder `<name>` under `--cwd` (default cwd).

- `<name>` must match `^[a-z][a-z0-9-]*$` lowercase.
- Interactive when TTY and no `--json/--yes/--ci`: prompts for name if missing, mode, framework, apps (web/mobile/both), database, billing multiselect, features multiselect, install confirm.
- Non-interactive: pass all flags explicitly + `--yes`.
- Validation:
  - `billing + database=none` blocked → needs DB for subscriptions.
  - `single + apps both|all|web,mobile` blocked → single supports only one target; use monorepo for web+mobile.
  - `apps none` or empty alone blocked → at least one app required.
    Emits warning + exits 2 if invalid.
- Output: folder `<cwd>/<name>` with scaffolded files, `.env.example`, `.env.local` placeholders, `.ghostinit/state.json`, `start-database.sh`, `turbo.json` exhaustive globalEnv (including EXPO_PUBLIC_*), `bunfig.toml` hoist=true.
  - `apps/web` when web selected (Next.js app router or TanStack Start src/routes).
  - `apps/mobile` when mobile selected (Expo SDK 54 Router app/, metro.config.js auto monorepo, babel-preset-expo, SecureStore).
  - `apps/web + apps/mobile` when both selected (monorepo only).
  - Single mode `apps mobile` → flat `app/` + `src/server/` + `app.json` Expo structure.
- If `existsSync(projectRoot)` and no `--force` → exit 18 conflict.
- If install fails → exit 22 generation error but files still written.
- If prompt cancelled → exit 130.

### Flags

| Flag                  | Values                                                    | Default    | Effect                                                |
| --------------------- | --------------------------------------------------------- | ---------- | ----------------------------------------------------- |
| `--mode`              | `monorepo`, `single`                                      | `monorepo` | Structure: workspaces vs flat                         |
| `--framework`         | `nextjs`, `tanstack-start`                                | `nextjs`   | Frontend framework for web target                     |
| `--apps`              | `web,mobile,both,all` comma/repeat                        | `web`      | App targets: web=Next/TanStack, mobile=Expo, both=all |
| `--billing`           | `stripe,chargily,paddle,polar,both,all,none` comma/repeat | `none`     | Any combo allowed                                     |
| `--features`          | `eve,i18n,none` comma/repeat                              | `none`     | Eve AI, i18n next-intl                                |
| `--database`          | `postgres,convex,none`                                    | `postgres` | DB provider                                           |
| `--runtime`           | `bun,node`                                                | `bun`      | Executor for generated scripts                        |
| `--cwd`               | path                                                      | `.`        | Parent where project created                          |
| `--no-install`        | flag                                                      | off        | Skip bun install                                      |
| `--force`             | flag                                                      | off        | Bypass exists + dirty git + drift                     |
| `--json`              | flag                                                      | off        | JSON envelope to stdout, logs stderr                  |
| `--yes` / `--ci`      | flag                                                      | off        | Non-interactive                                       |
| `--dry-run`           | flag                                                      | off        | Preview would-write without writing                   |
| `--quiet` / `--debug` | flag                                                      | off        | Log verbosity                                         |

Invalid `--mode/framework/database/apps` → throws validation error exit 17 or exit 2 for combo, no silent fallback. Billing/features: partially unknown tolerated (`stripe,unknown` → `stripe`), fully unknown (`unknownOnly`) → throws exit 17. Apps: `both`/`all` alias → `web,mobile`, repeatable/comma: `--apps web --apps mobile` == `--apps web,mobile`.

### Example

```bash
ghostinit create my-app --yes --cwd /tmp --mode monorepo --framework nextjs --apps web,mobile --database postgres --billing stripe,chargily --features eve,i18n --no-install --json
# stdout: {"success":true,"exitCode":0,"data":{"projectName":"my-app","projectRoot":"/tmp/my-app","filesWritten":167,...},"meta":{"command":"create","durationMs":1234}}

ghostinit create my-app --apps web,mobile
ghostinit create my-app --apps mobile --mode monorepo
ghostinit create my-app --apps mobile --mode single
ghostinit create my-app --apps both --framework tanstack-start
```

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

Rebuilds 4 registries deterministically:

- `packages/modules/src/index.ts`
- `packages/api/src/contract.ts`
- `packages/api/src/router.ts`
- `packages/database/src/schema/index.ts`

- `--check` mode no writes, exits 8 DRIFT if changed or drift detected (tracked files modified externally vs checksums in state).
- `--dry-run` logs would-change list, skips writeFile + saveState.
- Normal mode writes + updates checksums + `state.json`.

```bash
ghostinit sync
ghostinit sync --check                # CI gate, exit 8 if out of sync
ghostinit sync --dry-run              # preview
ghostinit sync --json | jq .data.modules
```

Drift detection parallel hash compare detects missing/modified/unreadable tracked files.

## `status [--json]`

Shows `loadState(cwd)` metadata + `existsSync(.ghostinit/lock)` lock active. Includes apps selected.

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

## `check [--json]`

Architecture checker (6-layer + isolation). Must have state else exit 23 INVALID_STATE.

- Passed if `blockers==0 && highs==0` → 0 else 1.
- Text mode logs each `[SEVERITY] message (rule)` with file + summary duration.
- JSON: `{findings: [{id,severity,message,file,rule}], summary:{blockers,highs,mediums}}`

```bash
ghostinit check
ghostinit check --json | jq .data.summary
```

Rules (user-visible): layered-dependency, vendor-isolation, capability-isolation, client-boundary, domain-purity, application-purity, database-isolation, module-isolation, etc. Run after template changes or after manual code edits. Works for web, mobile (apps/mobile), and both.

## `doctor [--json]`

Tooling + env verification:

- Collects bun, node, tsc versions.
- Checks: bun present, node present, typescript present, ghostinit-version, ghostinit-state existence, BETTER_AUTH_SECRET length 32+, BETTER_AUTH_URL presence, NEXT_PUBLIC_APP_URL presence, POSTGRES_PASSWORD length, database existence/connectivity (optional), connectivity optional/skipped not blocking required.
- When mobile selected: checks EXPO_PUBLIC_APP_URL, EXPO_PUBLIC_API_URL presence (warning not blocking).

```bash
ghostinit doctor
# [OK] bun: Bun 1.3.14
# [OK] node: Node 24.18.0
# [OK] typescript: TypeScript 6.0.3
# [OK] ghostinit-version: ghostinit 0.1.0
# [OK] ghostinit-state: Project state found for my-app
# [FAIL] BETTER_AUTH_SECRET: too short (<32)
# etc
```

All required must OK → 0 else 1. DB connectivity optional.

## Global Flags (All Commands)

`--cwd` working dir root, `--json` envelope, `--yes`/`--ci` non-interactive, `--dry-run` preview, `--force` bypass dirty/drift, `--no-install` create only, `--runtime`, `--quiet` suppress stderr, `--debug` verbose, `--version`, `--help`.

Help text: `ghostinit` or `ghostinit help` or `ghostinit --help`. Version: `ghostinit version` or `--version`.

## JSON Envelope

Shape: `{success: bool, exitCode: number, data?: any, error?: {message, code, details?}, meta: {command, durationMs}}`. Logs stderr so stdout parseable.

Exit codes: `0 OK, 1 GENERAL_ERROR, 2 INVALID_ARGUMENTS, 8 DRIFT, 16 MISSING_DEPENDENCY, 17 VALIDATION_ERROR, 18 CONFLICT_ERROR, 19 LOCK_ERROR, 20 GIT_DIRTY_ERROR, 21 INCOMPATIBLE_SCHEMA, 22 GENERATION_ERROR, 23 INVALID_STATE, 130 CANCELLED`.

## Lock

`.ghostinit/lock` file ensures no concurrent add/sync/create mutations. `status` shows lockActive. Crash leaves lock; use `--force` to bypass/overwrite or manually remove.
