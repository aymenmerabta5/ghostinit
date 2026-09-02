---
name: ghostinit-use
description: This skill should be used when the user asks to "use ghostinit", "scaffold a project with ghostinit", "ghostinit create", "ghostinit add module", "ghostinit add use-case", "how to use ghostinit", "ghostinit commands", "ghostinit billing", "ghostinit workflow", "create a new app with ghostinit", or mentions ghostinit project generation, scaffolding, or working with a generated project.
---

# GhostInit Use — End-to-End Usage Abstraction

GhostInit is a CLI that scaffolds well-structured monorepos. This skill enables any agent with zero codebase knowledge to scaffold, configure, extend, and verify projects.

**This skill is HOW to use ghostinit as an abstraction — nothing more, nothing less. No host internals.**

## Quick Start

```bash
bun add -g ghostinit
ghostinit create my-app                          # interactive preset-first wizard (TTY)
ghostinit create my-app --yes --no-install       # non-interactive CI-friendly (defaults to --preset saas)
ghostinit create my-app --preset frontend --stack nextjs --yes --no-install   # minimal frontend: apps/web + ui + config only
ghostinit create my-app --preset saas --billing stripe,chargily --framework tanstack-start --database postgres --with-eve --with-i18n --yes --no-install
ghostinit create my-app --preset custom --with-auth --with-api --with-cache --with-eve --yes --no-install   # pick addons explicitly
ghostinit create my-app --dry-run --yes --no-install  # preview 237 files + sizes without writing
ghostinit create my-app --dry-run --json --yes | jq .data.files  # machine diff: files[], totalBytes, previewFiles
# --features eve,i18n still works as deprecated alias for --with-eve/--with-i18n
```

Name rule: `^[a-z][a-z0-9-]*$` — lowercase, numbers, hyphens, starts with letter.

## Create Options

| Flag               | Values                                                    | Default    | Guidance                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--preset`         | `saas`, `frontend`, `custom`                              | `saas`     | saas=full Auth+DB+API+Email+Analytics+optional billing/cache; frontend=minimal apps/web+ui+config only; custom=pick via --with-*                                                                                                                    |
| `--mode`           | `monorepo`, `single`                                      | `monorepo` | monorepo = `apps/* + packages/* + tooling/*`                                                                                                                                                                                                        |
| `--framework`      | `nextjs`, `tanstack-start`                                | `nextjs`   | Catalog-pinned Next 16 App Router vs TanStack Start Vite+Nitro                                                                                                                                                                                      |
| `--apps`           | `web,mobile,desktop,both,all` comma/repeat                | `web`      | web=Next/TanStack via --framework, mobile=Expo SDK 57 Router+SecureStore shares backend via EXPO_PUBLIC_API_URL, desktop=Electron + TanStack Router SPA, both=web,mobile, all=web,mobile,desktop monorepo                                           |
| `--billing`        | `stripe,chargily,paddle,polar,both,all,none` or any combo | `none`     | `chargily` DZ checkout-only, `stripe` global cards, `chargily,stripe` dual, `all` all 4                                                                                                                                                             |
| `--database`       | `postgres,convex,none`                                    | `postgres` | `billing` requires `postgres` or `convex`; `auth` also requires `postgres` or `convex`                                                                                                                                                              |
| `--cache`          | `redis`, `none` (`upstash` alias for redis)               | `none`     | Optional fail-closed cache via catalog-pinned Upstash Redis; production API rate limiting may use the same credentials even when the cache package is off                                                                                           |
| `--deploy`         | `vercel`, `fly`, `docker`, `none`                         | `none`     | All targets require a regular root `bun.lock`; Docker/Fly use the exact Bun image plus health/grace contracts, while Vercel manages `bunVersion: "1.4.x"` and runs install/build with exact Bun 1.4.0                                               |
| `--stack`          | `nextjs`, `tanstack-start`, `expo`, `both`                | —          | Frontend shorthand for --preset frontend: maps to --framework + --apps (expo→apps mobile)                                                                                                                                                           |
| `--with-auth`      | flag                                                      | off        | Opt-in Better Auth (requires DB postgres or convex) — for --preset custom (saas forces on, frontend forces off)                                                                                                                                     |
| `--with-api`       | flag                                                      | off        | Opt-in oRPC API contract-first transport — for custom preset                                                                                                                                                                                        |
| `--with-email`     | flag                                                      | off        | Opt-in Resend email templates — for custom preset                                                                                                                                                                                                   |
| `--with-analytics` | flag                                                      | off        | Opt-in PostHog analytics — for custom preset                                                                                                                                                                                                        |
| `--with-cache`     | flag                                                      | off        | Opt-in Upstash Redis cache (same as --cache redis) — for custom preset                                                                                                                                                                              |
| `--with-eve`       | flag                                                      | off        | Opt-in Eve durable AI agent hybrid via withEve() — for custom preset; --features eve is deprecated alias                                                                                                                                            |
| `--with-i18n`      | flag                                                      | off        | Opt-in next-intl i18n routing — for custom preset; --features i18n is deprecated alias                                                                                                                                                              |
| `--with-pdf`       | flag                                                      | off        | Opt-in PDF (React PDF) — for custom preset                                                                                                                                                                                                          |
| `--with-messaging` | flag                                                      | off        | Opt-in DM messaging (DM-only, files/images inline, presence+typing realtime; postgres→oRPC WS + Docker volume, convex→native queries + ctx.storage; requires DB postgres/convex + auth+api) — for custom preset (opt-in for all presets, even saas) |
| `--features`       | `eve,i18n` (deprecated)                                   | `none`     | Deprecated alias for --with-eve/--with-i18n; case-insensitive deduped, partially unknown tolerated, fully unknown throws                                                                                                                            |
| `--cwd`            | path                                                      | `.`        | parent where `<name>` folder created                                                                                                                                                                                                                |
| `--no-install`     | flag                                                      | installs   | skip bun install                                                                                                                                                                                                                                    |
| `--dry-run`        | flag                                                      | off        | preview without writing — emits `files[]:{path,size,bytes}`, `totalBytes`, `previewFiles` (first 100) + `hasMore` in `--json`; text shows `237 files (394 kB)` + list                                                                               |
| `--yes` / `--ci`   | flag                                                      | prompt     | non-interactive, use defaults/flags; --yes defaults to saas preset unless --preset explicitly set                                                                                                                                                   |
| `--json`           | flag                                                      | text       | machine JSON `{success,exitCode,data\|error,meta}` — works with `--dry-run`, `status --verbose`, `add --list`                                                                                                                                       |
| `--force`          | flag                                                      | off        | bypass dirty git + drift checks                                                                                                                                                                                                                     |

Billing repeatable or comma: `--billing stripe --billing chargily` == `--billing stripe,chargily`. Addons repeatable: `--with-auth --with-api` or `--with-auth --with-eve`. Apps repeatable: `--apps web,desktop` or `--apps all` (web,mobile,desktop). Frontend preset: database defaults to `none` and disables auth/api/email/analytics/cache/eve/i18n/pdf/messaging unless explicitly enabled via --with-_. SaaS preset: enables auth/api/email/analytics true and database postgres default; messaging stays opt-in (even saas). Custom preset: all addons off by default, pick via --with-_ plus billing/database/framework/apps; interactive custom shows 8-toggle checklist (auth, api, email, analytics, cache, eve, i18n, pdf, messaging) plus apps (web/mobile/desktop) + billing.

Billing repeatable or comma: `--billing stripe --billing chargily` == `--billing stripe,chargily`. Same for features. Apps `both` keeps `web,mobile` compat; `all` is new `web,mobile,desktop`.

## Post-Create Workflow

```bash
cd my-app
bun install                          # if --no-install used
# .env.local is already generated; replace required REPLACE_WITH_* vendor placeholders in place
docker compose --env-file .env.local up -d  # portable Postgres path on Windows, Linux, and macOS
bun run db:push                      # push drizzle schema
bun run dev                          # turbo dev → web on :3000
```

Env to fill in `.env.local`:

- `BETTER_AUTH_SECRET` 32+ chars required, never placeholder
- `DATABASE_URL` or `POSTGRES_USER/PASSWORD/HOST/PORT/DB`
- `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` same origin — web
- `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_API_URL` when mobile is paired with a monorepo web host. Single mobile is frontend-only and has no generated remote-backend contract.
- `RESEND_API_KEY` if email used
- Billing keys if selected: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` for mobile, `CHARGILY_API_KEY`, `CHARGILY_SECRET_KEY`, `PADDLE_API_KEY`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` + `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN`, `POLAR_ACCESS_TOKEN`, etc.
- `POSTHOG_*` if analytics
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for production API mutation rate limiting, including API projects without the optional cache package. Placeholders fall back only in development/test.

Optional helper: `bash ./start-database.sh` performs Docker/Podman detection, an `nc` port check, safe allowlisted env parsing, and reuses `*_postgres` plus its named volume. Windows requires Git Bash, WSL, or another Bash installation. Postgres 18 mounts the named volume at `/var/lib/postgresql` so its versioned `18/docker` data directory persists correctly.

Deployment notes: every deployment target requires a regular root `bun.lock`; after `--no-install`, create it with Bun `1.4.0`. Vercel accepts `bunVersion: "1.4.x"` and manages its patch, while its exact-Bun install/build commands run the shared lock guard first. `--deploy docker` emits `compose.production.yml` with a 30-second stop grace, an image health check, BuildKit-secret build configuration, and a stable named Eve Workflow volume when Eve is selected. `--deploy fly` emits the equivalent health/grace contract and a build-secret guide; Docker/Fly pin the exact runtime image.

## Generated Structure

Preset determines which packages are emitted:

- **frontend** (`--preset frontend`): `apps/web` (+ `apps/mobile` when stack=expo/both) + `packages/ui` + `packages/config` + `tooling/*` plus lightweight supporting packages (`contracts`, `kernel`, `observability`, `typescript-config`, etc.) — ~134 files, no `api/auth/database/email/analytics/billing/cache/eve/i18n` unless --with-* overrides. Database defaults to `none` (stub). Smallest is ~135 files vs SaaS full ~216.
- **saas** (`--preset saas` default): full: `apps/web` (+ optional mobile/eve) + all packages (`api`, `auth`, `database` postgres, `email`, `analytics`, `billing` if selected, `cache` if selected, `services`, `modules`, `contracts`, `kernel`, `observability`, etc.) + `tooling` — ~216 files (plus eve/cache/billing add more).
- **custom** (`--preset custom`): only what you pick via `--with-auth/--with-api/--with-email/--with-analytics/--with-cache/--with-eve/--with-i18n` plus `--billing/--database/--framework/--apps` — e.g. `--with-auth --with-api --with-cache --cache redis` yields ~221 files with auth/api/cache but without email/analytics unless added.

```
my-app/
  apps/web                  # frontend: Next.js app router or TanStack Start src/routes
  apps/mobile (optional)    # Expo SDK 57 Router file-based app/, metro.config.js auto monorepo, babel-preset-expo, SecureStore, expo-linking (when --apps mobile|both)
  apps/eve (optional)       # Eve agent hybrid via withEve() when --with-eve selected
  packages/api              # oRPC contract + router (only when --with-api or saas)
  packages/auth             # Better Auth email/password, 2FA, admin (only when --with-auth or saas; requires DB)
  packages/database         # Drizzle ORM + schema registry (postgres/convex, or stub when none)
  packages/cache            # Upstash Redis (@upstash/redis) + memory fallback (only when --with-cache/--cache redis)
  packages/modules/src/<m>/ # bounded contexts: domain/, application/, ports/
  packages/billing          # billing capabilities + providers (vendors, only when billing selected)
  packages/services, email, analytics, ui, config, observability, contracts, kernel
  tooling/typescript-config # shared TS base ES2024 @/* @repo/*
  tooling/lint              # oxlint + oxfmt
  turbo.json                # 96 globalEnv exhaustive (from src/lib/env-manifest.ts)
  bunfig.toml               # hoist=true required for Next compat
  .husky/pre-commit         # husky 9.1.7: oxlint + oxfmt --check + ghostinit check
  lefthook.yml              # lefthook alternative (parallel: false)
  .env.example / .env.local / .ghostinit/state.json / start-database.sh
  .github/workflows/ci.yml  # lint + typecheck + build + ghostinit check
  package.json              # scripts: check, check:fix, doctor:fix, prepare=husky
```

Single mode: flat Next.js `src/app + server/` for web. Single Expo/Electron emits a frontend-only native client with no backend host, database, provider adapters, or webhooks; only client-local analytics/i18n may be selected.

App targets: `--apps` controls which apps scaffolded:

- `web` default — Next/TanStack via `--framework`
- `mobile` — Expo SDK 57 Router file-based `app/`, metro auto monorepo, babel-preset-expo, SecureStore, expo-linking, and typedRoutes. Auth/oRPC bindings require monorepo `web,mobile`, where the web app owns the backend.
- `both`/`all` → monorepo `apps/web + apps/mobile`
- `single + mobile|desktop` → flat frontend-only native app. Server-backed selections are rejected with `single-native-server-capabilities-unsupported`; use monorepo `web,mobile` or `web,desktop` for full parity.

## Commands (Post-Scaffold)

```bash
ghostinit status                         # project name, runtime, version, modules, lock
ghostinit status --verbose               # full config: mode, framework, database, billing, apps, preset, cache, deploy, procedures, checksums
ghostinit status --verbose --json        # machine-readable full report
ghostinit status --list                  # alias for --verbose (includes procedures, checksumCount)
ghostinit doctor                         # bun, node, tsc + env checks + secret strength + DB connectivity
ghostinit doctor --fix                   # auto-fix: mint BETTER_AUTH_SECRET/POSTGRES_PASSWORD placeholders, create .env.local, fix turbo.json globalEnv
ghostinit check                          # architecture checker 6-layer + isolation → fails if BLOCKER/HIGH
ghostinit check --fix                    # auto-fix turbo.json globalEnv drift (others require manual fix)
ghostinit sync                           # rebuild registries: modules index, api contract/router, db schema index
ghostinit sync --check                   # drift detect → exit 8 if out of sync
ghostinit add module <name>
ghostinit add use-case <module> <name> --kind command|query
ghostinit add procedure <module> <name>
ghostinit add action <module> <name>
ghostinit add --list                     # list existing modules + procedures (also `ghostinit add list`)
ghostinit add --list --json | jq .data.modules  # machine list
```

`--fix` only on `check|doctor`, `--verbose` only on `status|check|doctor`, `--list` only on `add|status` — other combos exit 2 `INVALID_ARGS`. `add --list` scans both `.ghostinit/state.json` and `packages/modules/src` so pre-sync modules appear. `status --verbose` reads `state.project` for mode/framework/billing/database/apps/preset/cache/deploy + `checksumCount`/`generatedBy`.

Add auto-syncs registries unless noop (already exists). Requires module exists first. Clean git required unless `--force`.

See `references/commands.md` for full flags, exit codes, JSON envelope.

## Billing (User View)

Any combo intentional Algeria+Global:

- `chargily` → DZ checkout-only server-only EDAHABIA/CIB, no portal
- `stripe` → global cards subscription-native
- `chargily,stripe` → dual Algeria+Global common
- `paddle`, `polar` → MoR global tax / open-source metering
- `all` → 4 providers, `none` / `""` → no billing

Includes conditional panels, webhook raw body handling, `webhook_events` idempotency. See `references/billing.md`.

## Preset & Addon System

- `--preset saas` (default): full SaaS starter — Auth+DB (postgres) + API + Email + Analytics enabled. Add billing/cache/eve/i18n/pdf optionally via --with-* or --billing/--with-eve etc. Messaging stays opt-in even for saas (`--with-messaging`). Interactive wizard asks framework, database (postgres|convex), billing, apps, features (eve/i18n/pdf/messaging).
- `--preset frontend`: minimal frontend only — `apps/web` + `packages/ui` + `packages/config` + `tooling` (~134 files) + supporting contracts/kernel etc., with `database=none` and all addons disabled unless explicitly added via --with-*. Interactive asks stack (nextjs|tanstack-start|expo|both) and mode only (3 prompts).
- `--preset custom`: fully custom — all addons off by default (auth/api/email/analytics/cache/eve/i18n/pdf/messaging none, database none). Pick any via `--with-auth --with-api --with-email --with-analytics --with-cache --with-eve --with-i18n --with-pdf --with-messaging` plus `--billing/--database/--framework/--apps`. Interactive shows 8+-toggle addon checklist + billing + framework + database + apps (most control).

Cache: `--cache redis` (alias `--cache upstash`) or `--with-cache` enables the fail-closed catalog-pinned Upstash Redis provider over HTTP (edge/serverless safe, no TCP). Independently, auth+API production mutations use the same credentials for atomic shared rate limiting; placeholders fall back only in development/test when the cache package is off. Auth requires DB (postgres or convex) — validation fails if `--with-auth` with `--database none`.

## Frameworks & Features (Addons)

- `nextjs` → `NEXT_PUBLIC_*`, `.next/**`
- `tanstack-start` → `VITE_*`, Vite+Nitro `.vinxi/** .output/**`
- Expo app target (`--apps mobile/both`) is NOT a framework. SDK 57, file-based `app/`, SecureStore, and `EXPO_PUBLIC_*` are available in frontend-only single mode; Better Auth and oRPC require a selected monorepo web host.
- `eve` → `withEve()` extra apps/eve + packages when `--with-eve` (or deprecated `--features eve`) — durable AI agent hybrid, conditional files; stripped entirely when off
- `i18n` → next-intl routing when `--with-i18n` (or deprecated `--features i18n`) — conditional files; stripped when off
- `messaging` → DM-only messaging when `--with-messaging` — opt-in for all presets (requires `database=postgres|convex` + auth+api); DM pair unique via sorted ids, attachments 10MB allowlist `image/*, application/pdf, text/*` inline preview, presence/typing realtime: postgres→oRPC WS (`@orpc/server/ws` + catalog-pinned `crossws` for TanStack, `Bun.serve` ws upgrade same port `/api/ws`, catalog-pinned `ws`) + `packages/realtime` (in-memory Map + Upstash Redis fan-out) + `packages/storage` (Docker volume `./data/uploads` + S3 via `@aws-sdk/client-s3`) ; convex→native `convex/react` useQuery/useMutation + `ctx.storage.generateUploadUrl` + `typingIndicators` 5s TTL; Docker primary volume required, Vercel not supported (polling fallback doc), stripped entirely when off
- `pdf` → React PDF when `--with-pdf` — conditional files; stripped when off
- All emit dual/triple env prefixes for client safety (`NEXT_PUBLIC_*`, `VITE_*`, `EXPO_PUBLIC_*`) for client-safe vars. See `references/frameworks.md`.

## Shared Theming Web + Mobile (RNR + Uniwind)

- Edit `packages/ui/src/theme.css` for colors. Single source OKLCH tokens `--background`, `--primary` etc. One edit updates both web+mobile after dev restart.
- Web: `apps/web/src/app/globals.css` does `@import "@repo/ui/theme.css"` + `@import "tailwindcss"` + `@import "tw-animate-css"` + base layer. Tokens-only `@repo/ui` — no Button/Card in package, web primitives live in `apps/web/src/components/ui/` + `apps/web/src/lib/utils.ts` cn().
- Mobile: `apps/mobile/global.css` does `@import "tailwindcss"; @import "uniwind"; @import "@repo/ui/theme.css"; @import "tw-animate-css";` + `@source` entries for app/src/components. Processed by Uniwind Babel+Metro.
- Mobile uses RNR components `@/components/ui/button`, `text`, `card`, `input`, `label`, `badge`, `avatar`, `tabs` with `className="bg-primary text-primary-foreground"` — no `StyleSheet.create` for colors.
- Babel: `['uniwind/babel', { cssEntryFile: './global.css' }]` before `babel-preset-expo` — order matters, Uniwind first.
- Metro: `withUniwindConfig(config, { cssEntryFile: './global.css', dtsFile: './uniwind-types.d.ts' })` — wrapper from `uniwind/metro`.
- Layout imports `../global.css` at top per Uniwind docs Expo Router. Required or className ignored silently.
- Architecture: both `apps/web/` and `apps/mobile/` are L1 UI same 6-layer DAG, shared `packages/api` L2 + `packages/modules` L3/L4 + `packages/billing/providers` L5 + `packages/ui` L6 Supporting.
- Adding new color: edit `--primary` OKLCH in `packages/ui/src/theme.css` → restart dev.

## Sync & Check

```bash
ghostinit sync && ghostinit sync --check && ghostinit check && ghostinit status --verbose
ghostinit check --fix               # fix turbo.json globalEnv drift
ghostinit doctor --fix              # mint missing secrets
ghostinit add --list && ghostinit status --verbose  # inspect current project
```

Lock `.ghostinit/lock` prevents concurrent mutations. `status --verbose` shows full config + `lockActive`. Crash leftover → `--force` or manual rm. `check --fix` only fixes `turbo.json` globalEnv (96 keys from `env-manifest.ts`) — layered violations still require manual fix. `doctor --fix` mints `BETTER_AUTH_SECRET`/`POSTGRES_PASSWORD` placeholders + creates `.env.local` + fixes `turbo.json`.

## JSON & CI

```bash
ghostinit create my-app --yes --billing stripe --json --cwd /tmp | jq .data.projectName
ghostinit create my-app --dry-run --json --yes | jq '{files: .data.filesWritten, bytes: .data.totalBytes}'
ghostinit status --verbose --json | jq .data
ghostinit add --list --json | jq .data.modules
ghostinit sync --check --json
ghostinit check --json | jq .data.summary
ghostinit check --fix --json | jq .data.fixed
ghostinit doctor --fix --json | jq .data.fixed
```

Exit codes stable: `0 OK, 1 GENERAL, 2 INVALID_ARGS, 8 DRIFT, 16 MISSING_DEP, 17 VALIDATION, 18 CONFLICT, 19 LOCK, 20 GIT_DIRTY, 21 INCOMPAT_SCHEMA, 22 GENERATION, 23 INVALID_STATE, 130 CANCELLED`.

## Troubleshooting

- `Invalid project name` → `^[a-z][a-z0-9-]*$`
- `Billing requires postgres or convex` → `--database postgres`
- `Auth requires a database (postgres or convex) but database is none` → add `--database postgres` or use `--preset saas` or `--with-auth` requires DB; `frontend` preset blocks auth unless you add DB
- `Target directory already exists` → `--force` or new name/cwd
- `Module does not exist` → `ghostinit add module <name>` first
- `No GhostInit project state found` → project root with `.ghostinit/state.json`
- `Generated registries out of sync` → `ghostinit sync`
- `Drift: path: modified externally` → restore or `--force`
- `BETTER_AUTH_SECRET must be at least 32` → `.env.local` — try `ghostinit doctor --fix` to mint it (only when auth enabled; frontend without auth has no BETTER_AUTH_* vars)
- `turbo.json globalEnv drift` → `ghostinit check --fix` or `ghostinit doctor --fix` (rewrites 96 keys from `env-manifest.ts`)
- `--fix can only be used with 'check' or 'doctor'` → move flag to correct command
- `--verbose can only be used with 'status', 'check' or 'doctor'` / `--list can only be used with 'add' or 'status'` → use `status --verbose`, `add --list`
- `hoist` error → ensure `bunfig.toml` `hoist=true` generated
- `workspace:*` error → TS7 not supported generated, TS 6.x
- `Reserved module name` → collides `api,auth,database,config,ui,...` or JS reserved or `openapi,contract,router,context,index`
- `Invalid --preset value` / `Invalid --cache value` → allowed `saas,frontend,custom` / `redis,none` (upstash alias for redis)

See `references/workflows.md` for full end-to-end flows.

## Maintaining This Skill (For Contributors — NOT for users)

**This section is only for agents developing the host CLI that change HOW to use ghostinit.** Users ignore it.

Whenever you change anything that affects HOW to use ghostinit as an abstraction, you MUST update this skill in the SAME PR — no exceptions:

- New flag: `--mode`, `--framework`, `--apps`, `--billing`, `--features` (alias), `--preset`, `--cache`, `--stack`, `--with-auth/--with-api/--with-email/--with-analytics/--with-cache/--with-eve/--with-i18n/--with-pdf/--with-messaging`, `--database`, `--runtime`, `--cwd`, `--json`, `--yes`, `--ci`, `--dry-run`, `--force`, `--no-install`, `--fix`, `--verbose`, `--list`, `--quiet`, `--debug`, or any new flag
- New billing provider, new framework, new database, new addon/feature, new env var in `.env.example`/`.env.local` (including `UPSTASH_REDIS_REST_URL` etc.)
- New `add` subcommand or changed artifact shape (module/use-case/procedure/action)
- Changed workflow (create→env→DB→dev→add→sync→check), new required step, new default, new interactive prompt (preset-first wizard: saas/frontend/custom branching)
- Changed generated structure (`apps/*`, `packages/*`, `tooling/*`, `turbo.json` globalEnv, `bunfig.toml`, `.env.example`, `start-database.sh`) — preset determines which packages emitted (frontend minimal ~134 vs saas ~216)
- Changed troubleshooting, validation rule (auth requires DB), reserved name, exit code, command behavior

**Checklist (same PR, mandatory):**

1. Update `SKILL.md` table/workflow/commands/billing as affected + update `references/commands.md`, `billing.md`, `frameworks.md`, `workflows.md` if their topic changed.
2. Mirror: `rm -rf .claude/skills/ghostinit-use && cp -r skills/ghostinit-use .claude/skills/` (Windows: manual copy per file).
3. Update `AGENTS.md`, `README.md`, and `CONTRIBUTING.md` when the user-visible contract changes. Update `evidence/compatibility/v1-to-v2.json` and its adjacent schema when the public CLI or migration mapping changes.
4. `bun run format && bun run build && bun run check` must pass.

If you skip this, agents with zero codebase knowledge will have outdated docs → wrong scaffolding, missed env vars, broken generation. **NOT optional.**

## Additional Resources

- `references/commands.md` — full command reference, flags, exit codes, JSON envelope, lock
- `references/billing.md` — billing providers chooser, env vars, dual market, webhook UI
- `references/frameworks.md` — next vs tanstack chooser, databases, features, modes, env prefixes
- `references/workflows.md` — create→env→DB→dev→add→sync→check end-to-end, CI, remote DB, sync/check
