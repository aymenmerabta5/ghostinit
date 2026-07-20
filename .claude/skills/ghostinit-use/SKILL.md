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
ghostinit create my-app                          # interactive (TTY)
ghostinit create my-app --yes --no-install       # non-interactive CI-friendly
ghostinit create my-app --billing stripe,chargily --features eve,i18n --framework tanstack-start --database postgres
```

Name rule: `^[a-z][a-z0-9-]*$` — lowercase, numbers, hyphens, starts with letter.

## Create Options

| Flag             | Values                                                    | Default    | Guidance                                                                                                                                            |
| ---------------- | --------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--mode`         | `monorepo`, `single`                                      | `monorepo` | monorepo = `apps/* + packages/* + tooling/*`                                                                                                        |
| `--framework`    | `nextjs`, `tanstack-start`                                | `nextjs`   | Next 16.2.10 App Router vs TanStack Start Vite+Nitro                                                                                                |
| `--apps`         | `web,mobile,both,all` comma/repeat                        | `web`      | web=Next/TanStack via --framework, mobile=Expo SDK 54 Router+SecureStore shares backend via EXPO_PUBLIC_API_URL, both=apps/web+apps/mobile monorepo |
| `--billing`      | `stripe,chargily,paddle,polar,both,all,none` or any combo | `none`     | `chargily` DZ checkout-only, `stripe` global cards, `chargily,stripe` dual, `all` all 4                                                             |
| `--features`     | `eve,i18n` or `eve,i18n` combo                            | `none`     | `eve` durable AI agents, `i18n` next-intl                                                                                                           |
| `--database`     | `postgres,convex,none`                                    | `postgres` | `billing` requires `postgres` or `convex`                                                                                                           |
| `--cwd`          | path                                                      | `.`        | parent where `<name>` folder created                                                                                                                |
| `--no-install`   | flag                                                      | installs   | skip bun install                                                                                                                                    |
| `--yes` / `--ci` | flag                                                      | prompt     | non-interactive, use defaults/flags                                                                                                                 |
| `--json`         | flag                                                      | text       | machine JSON `{success,exitCode,data                                                                                                                | error,meta}` |
| `--force`        | flag                                                      | off        | bypass dirty git + drift checks                                                                                                                     |

Billing repeatable or comma: `--billing stripe --billing chargily` == `--billing stripe,chargily`. Same for features.

## Post-Create Workflow

```bash
cd my-app
bun install                          # if --no-install used
cp .env.example .env.local           # fill placeholders
./start-database.sh                  # quick Postgres container (docker/podman auto-detected)
bun run db:push                      # push drizzle schema
bun run dev                          # turbo dev → web on :3000
```

Env to fill in `.env.local`:

- `BETTER_AUTH_SECRET` 32+ chars required, never placeholder
- `DATABASE_URL` or `POSTGRES_USER/PASSWORD/HOST/PORT/DB`
- `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` same origin — web
- `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_API_URL` when mobile selected (Expo client reads API URL; backend single port 3000)
- `RESEND_API_KEY` if email used
- Billing keys if selected: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` for mobile, `CHARGILY_API_KEY`, `CHARGILY_SECRET_KEY`, `PADDLE_API_KEY`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` + `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN`, `POLAR_ACCESS_TOKEN`, etc.
- `POSTHOG_*` if analytics

`start-database.sh`: docker vs podman detection, `nc` port check, reuses existing `*_postgres` container, random password via `openssl` if placeholder, safe env parsing allowlisted keys only, volume `*_postgres_data`.

## Generated Structure

```
my-app/
  apps/web                  # frontend: Next.js app router or TanStack Start src/routes
  apps/mobile (optional)    # Expo SDK 54 Router file-based app/, metro.config.js auto monorepo, babel-preset-expo, SecureStore, expo-linking
  packages/api              # oRPC contract + router
  packages/auth             # Better Auth email/password, 2FA, admin
  packages/database         # Drizzle ORM + schema registry
  packages/modules/src/<m>/ # bounded contexts: domain/, application/, ports/
  packages/billing          # billing capabilities + providers (vendors)
  packages/services, email, analytics, ui, config, observability, contracts, kernel
  tooling/typescript-config # shared TS base ES2024 @/* @repo/*
  tooling/lint              # oxlint + oxfmt
  turbo.json                # 50+ globalEnv exhaustive
  bunfig.toml               # hoist=true required for Next compat
  .env.example / .env.local / .ghostinit/state.json / start-database.sh
```

Single mode: flat Next.js `src/app + server/` no workspaces; Expo single `app/` + `src/server/` with `app.json`.

App targets: `--apps` controls which apps scaffolded:

- `web` default — Next/TanStack via `--framework`
- `mobile` — Expo SDK 54 Router file-based `app/`, metro auto monorepo (SDK52+), babel-preset-expo, SecureStore, expo-linking, scheme handling, typedRoutes, Better Auth `expo()` server plugin + `expoClient` client, oRPC via `EXPO_PUBLIC_API_URL` + `getCookie`, sharing backend single port 3000
- `both`/`all` → monorepo `apps/web + apps/mobile`
- `single + mobile` → flat Expo app (not Next), single mode supports only one target otherwise invalid

## Commands (Post-Scaffold)

```bash
ghostinit status             # project name, runtime, version, modules, lock
ghostinit doctor             # bun, node, tsc + env checks + secret strength + DB connectivity
ghostinit check              # architecture checker 6-layer + isolation → fails if BLOCKER/HIGH
ghostinit sync               # rebuild registries: modules index, api contract/router, db schema index
ghostinit sync --check       # drift detect → exit 8 if out of sync
ghostinit add module <name>
ghostinit add use-case <module> <name> --kind command|query
ghostinit add procedure <module> <name>
ghostinit add action <module> <name>
```

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

## Frameworks & Features

- `nextjs` → `NEXT_PUBLIC_*`, `.next/**`
- `tanstack-start` → `VITE_*`, Vite+Nitro `.vinxi/** .output/**`
- Expo app target (`--apps mobile/both`) is NOT a framework — it is an app target: SDK 54, file-based `app/`, metro auto monorepo, SecureStore, `EXPO_PUBLIC_*` client prefix, Better Auth `expo()` plugin, oRPC via `EXPO_PUBLIC_API_URL` + `getCookie`, no Elysia, backend single port 3000 shared
- `eve` → `withEve()` extra apps/packages, `i18n` → next-intl
- All emit dual/triple env prefixes for client safety (`NEXT_PUBLIC_*`, `VITE_*`, `EXPO_PUBLIC_*`). See `references/frameworks.md`.

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
ghostinit sync && ghostinit sync --check && ghostinit check && ghostinit status
```

Lock `.ghostinit/lock` prevents concurrent mutations. `status` shows `lockActive`. Crash leftover → `--force` or manual rm.

## JSON & CI

```bash
ghostinit create my-app --yes --billing stripe --json --cwd /tmp | jq .data.projectName
ghostinit sync --check --json
ghostinit check --json | jq .data.summary
```

Exit codes stable: `0 OK, 1 GENERAL, 2 INVALID_ARGS, 8 DRIFT, 16 MISSING_DEP, 17 VALIDATION, 18 CONFLICT, 19 LOCK, 20 GIT_DIRTY, 21 INCOMPAT_SCHEMA, 22 GENERATION, 23 INVALID_STATE, 130 CANCELLED`.

## Troubleshooting

- `Invalid project name` → `^[a-z][a-z0-9-]*$`
- `Billing requires postgres or convex` → `--database postgres`
- `Target directory already exists` → `--force` or new name/cwd
- `Module does not exist` → `ghostinit add module <name>` first
- `No GhostInit project state found` → project root with `.ghostinit/state.json`
- `Generated registries out of sync` → `ghostinit sync`
- `Drift: path: modified externally` → restore or `--force`
- `BETTER_AUTH_SECRET must be at least 32` → `.env.local`
- `hoist` error → ensure `bunfig.toml` `hoist=true` generated
- `workspace:*` error → TS7 not supported generated, TS 6.x
- `Reserved module name` → collides `api,auth,database,config,ui,...` or JS reserved or `openapi,contract,router,context,index`

See `references/workflows.md` for full end-to-end flows.

## Maintaining This Skill (For Contributors — NOT for users)

**This section is only for agents developing the host CLI that change HOW to use ghostinit.** Users ignore it.

Whenever you change anything that affects HOW to use ghostinit as an abstraction, you MUST update this skill in the SAME PR — no exceptions:

- New flag: `--mode`, `--framework`, `--apps`, `--billing`, `--features`, `--database`, `--runtime`, `--cwd`, `--json`, `--yes`, `--ci`, `--dry-run`, `--force`, `--no-install`, `--quiet`, `--debug`, or any new flag
- New billing provider, new framework, new database, new feature, new env var in `.env.example`/`.env.local`
- New `add` subcommand or changed artifact shape (module/use-case/procedure/action)
- Changed workflow (create→env→DB→dev→add→sync→check), new required step, new default, new interactive prompt
- Changed generated structure (`apps/*`, `packages/*`, `tooling/*`, `turbo.json` globalEnv, `bunfig.toml`, `.env.example`, `start-database.sh`)
- Changed troubleshooting, validation rule, reserved name, exit code, command behavior

**Checklist (same PR, mandatory):**

1. Update `SKILL.md` table/workflow/commands/billing as affected + update `references/commands.md`, `billing.md`, `frameworks.md`, `workflows.md` if their topic changed.
2. Mirror: `rm -rf .claude/skills/ghostinit-use && cp -r skills/ghostinit-use .claude/skills/` (Windows: manual copy per file).
3. Update `AGENTS.md` minimal delta + `docs/ARCHITECTURE.md` + `README.md` + `CONTRIBUTING.md` if affected.
4. `bun run format && bun run build && bun run check` must pass.

If you skip this, agents with zero codebase knowledge will have outdated docs → wrong scaffolding, missed env vars, broken generation. **NOT optional.**

## Additional Resources

- `references/commands.md` — full command reference, flags, exit codes, JSON envelope, lock
- `references/billing.md` — billing providers chooser, env vars, dual market, webhook UI
- `references/frameworks.md` — next vs tanstack chooser, databases, features, modes, env prefixes
- `references/workflows.md` — create→env→DB→dev→add→sync→check end-to-end, CI, remote DB, sync/check
