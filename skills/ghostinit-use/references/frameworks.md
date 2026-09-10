# Frameworks & Features — Usage Guide

## Frameworks

### nextjs (default)

- Catalog-pinned Next 16 + React 19, RSC, Tailwind v4 + Base UI + shadcn, oRPC via route handlers `apps/web/src/app/api/`, client via `@orpc/client` + `@orpc/react-query`, env `NEXT_PUBLIC_*` client, output `.next/**`, turbo tasks Next.
- Generated installs use `bunfig.toml` hoist=true for the supported Next workspace resolution path. Next uses the catalog TS7 CLI by default; do not set `experimental.useTypeScriptCli` to false.
- Native Next output enables `experimental.webpackBuildWorker` to end compiler workers before its mandatory TypeScript phase, including when plugins add a Webpack hook. Preserve full build/runtime checks when changing plugins. Cloudflare keeps its separate configuration.

### tanstack-start

- Vite 7 + Nitro 3, file-based router `src/routes`, server functions `createServerFn`, `getRequestHeaders`, outputs `.output/** dist/**`, env `VITE_*` client, auth `tanstackStartCookies()` Better Auth plugin vs Next `nextCookies()`, same oRPC contract-first, same webhook `request.arrayBuffer()` standard Fetch API, web development defaults to port 3000; selected Eve runs as a private companion.
- Framework entrypoints are classified by their exact paths; their imports remain subject to applicable architecture and client/server boundary checks.

Choose via:

```bash
ghostinit create my-app --framework nextjs
ghostinit create my-app --framework tanstack-start
```

Generated env files include only the public prefixes consumed by selected apps: `NEXT_PUBLIC_*` for Next web, `VITE_*` for TanStack web or desktop renderers, and `EXPO_PUBLIC_*` for Expo. In monorepos, clients import the matching `@repo/config/next`, `/vite`, or `/expo` runtime; single projects use `src/lib/env/`. Each entry validates only its own audience and cannot import server secrets. A later framework migration must update both env values and imports.

With `--deploy cloudflare`, Next.js is packaged by
`@opennextjs/cloudflare`, while TanStack Start replaces Nitro with Cloudflare's
native Vite plugin. Both Worker paths support monorepo/single web projects with
Convex or no database. They use gitignored `.dev.vars` locally and keep
production build variables separate from runtime Worker secrets. Next/OpenNext
adds R2 incremental-cache, Durable Object queue, and sharded tag-cache bindings. See
`cloudflare.md` for commands and provisioning.

## App Targets

Expo and Electron are **not** frameworks — they are app targets selected via `--apps`. Web target uses `--framework` (nextjs/tanstack-start). Mobile is Expo, Desktop is Electron.

### expo (via --apps mobile)

- Expo SDK 57, Expo Router file-based `app/` directory (`app/_layout.tsx`, `app/index.tsx`, `app/(auth)/*`, `app/+not-found.tsx`), `expo-router/entry` main, typedRoutes experiment enabled.
- `metro.config.js` auto monorepo support from SDK 52+ — `getDefaultConfig(__dirname)` auto-detects workspace root, no manual watchFolders needed. `babel-preset-expo` preset.
- `app.json`: scheme `__PROJECT_NAME__`, slug/name templated, orientation portrait, platforms ios/android/web, plugins `expo-router` and `expo-secure-store` plus `expo-notifications` when selected, and `assetBundlePatterns`. Binary icon/splash paths are omitted until real assets exist.
- Storage/Auth: `expo-secure-store` for Better Auth token persistence, `expo-linking` for deep links + OAuth redirects, `expo-constants` + `expo-web-browser` for auth flow, scheme handling for `__PROJECT_NAME__://` links, `typedRoutes: true` typed linking.
- Better Auth and oRPC are emitted for Expo only when a monorepo web app owns the backend. Single Expo is frontend-only; external backend-host selection is not implemented.
- Backend: when both web+mobile, single DB + same `packages/api` + same auth server. Mobile calls `/api/rpc` and `/api/auth/*` via `EXPO_PUBLIC_API_URL`.
- Env: client prefix `EXPO_PUBLIC_*` (Expo convention). A Next+Expo project emits `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*`; TanStack+Expo emits `VITE_*` and `EXPO_PUBLIC_*`. Adding desktop also selects `VITE_*` for its renderer.

### desktop (via --apps desktop — Electron + TanStack Router SPA)

- Catalog-pinned Electron + electron-vite + electron-builder, TanStack Router SPA (`src/renderer/routes/__root.tsx` + `index.tsx`/`dashboard.tsx` + `routeTree.gen.ts` via `@tanstack/router-plugin`), `src/main.ts` + `preload.ts` (contextBridge), `electron-store` + `safeStorage` (t3code `ElectronSafeStorage.ts` pattern) for auth, `electron-updater` autoUpdater. Renderer shares `packages/ui/theme.css` + `packages/api` oRPC via `http://localhost:3000/api/rpc` single port, no direct DB.

Choose via:

```bash
ghostinit create my-app --apps web              # default, web only
ghostinit create my-app --apps mobile --preset frontend  # frontend-only apps/mobile
ghostinit create my-app --apps desktop --preset frontend # frontend-only apps/desktop
ghostinit create my-app --apps web,desktop      # web + desktop
ghostinit create my-app --apps both             # monorepo apps/web + apps/mobile (compat)
ghostinit create my-app --apps all              # monorepo apps/web + apps/mobile + apps/desktop
ghostinit create my-app --apps web,mobile       # same as both, comma repeatable
ghostinit create my-app --apps web,mobile,desktop # same as all
ghostinit create my-app --mode single --apps mobile --preset frontend  # flat frontend-only Expo
ghostinit create my-app --mode single --apps desktop --preset frontend # flat frontend-only Electron
ghostinit create my-app --apps web,mobile --framework tanstack-start  # web tanstack + mobile expo
```

Validation:

- `single` mode supports one target. Web may own backend capabilities; mobile/desktop are frontend-only and permit only client-local analytics/i18n. Use `monorepo` for `web+mobile`/`web,desktop`/`all` and full backend parity.
- `billing + database=none` still blocked regardless of apps.
- At least one app required (`none` alone invalid).

Dev workflows:

```bash
# monorepo both: web :3000 + mobile :19000
bun run dev              # web
cd apps/mobile && bun run dev  # expo start --port 19000

# single mobile flat
bun run dev              # expo start (single expo mode)
```

## Databases

- `postgres` default — Drizzle ORM 0.45.2 + pg 8.23.0 + drizzle-kit 0.31.10, postgres:18.6 via the cross-platform `docker compose --env-file .env.local up -d` path (optional `bash ./start-database.sh` when Bash is installed). The named volume mounts `/var/lib/postgresql`, the required parent for Postgres 18's versioned `18/docker` data directory. Pool config prefers `DATABASE_URL`, otherwise `POSTGRES_USER/PASSWORD/HOST/PORT/DB`; SSL uses `DATABASE_SSL=true` and optional `DATABASE_SSL_CA`.
- `convex` — realtime serverless alternative, scaffold uses Convex packages (check versions catalog).
- `none` — no database, invalid if billing is selected (billing needs persistent storage).
- Cloudflare supports `convex` and `none`; the generated PostgreSQL adapter is
  rejected until it has a request-scoped Hyperdrive implementation.

PostgreSQL auth uses `better-auth/minimal` with the explicit Drizzle adapter. Keep
that adapter and its transaction support; the minimal initializer does not accept
direct database objects or provide built-in auth migrations. Use the generated
Drizzle migration commands, retain root `Auth` imports as type-only, and preserve
the emitted session, verification, authorization and plugin settings.

```bash
ghostinit create my-app --database postgres
ghostinit create my-app --database convex
ghostinit create my-app --database none   # only if --billing none
```

## Presets & Addons

GhostInit is preset-first with opt-in addons. `coreAddons` (lint, format, t3env, ui, tanstack, zod) always included. `saasAddons` (auth, database, api, services, email, analytics) are preset-dependent. Addons are opt-in via `--with-*`; `--features` is deprecated alias.

### Presets

- **saas** (default): Auth + DB (postgres) + API + Email + Analytics enabled. Billing/cache/eve/i18n optional via `--with-*`/`--billing`/`--cache`. Interactive: framework, database, billing, apps, eve/i18n. `ghostinit create my-app --yes` → saas. `ghostinit create my-app --preset saas --billing stripe --with-cache --with-eve --yes`
- **frontend**: Minimal frontend only: `apps/web` (+ mobile when stack=expo/both) + `packages/ui` + `packages/config` + `tooling` + supporting contracts/kernel etc. (~134 files vs saas ~216). Database defaults to `none` (stub emits `packages/database` stub so `@repo/database` resolves), all addons disabled unless explicit `--with-*`. Interactive: mode + stack (nextjs|tanstack-start|expo|both) only. `ghostinit create my-app --preset frontend --stack nextjs --yes`
- **custom**: Full control: all addons off by default (auth/api/email/analytics/cache/eve/i18n false, database none). Pick via `--with-auth --with-api --with-email --with-analytics --with-cache --with-eve --with-i18n` plus `--billing/--database/--framework/--apps`. Interactive: 7-toggle addon checklist (auth, api, email, analytics, cache/eve/i18n) + billing + framework + database + apps. `ghostinit create my-app --preset custom --with-auth --with-api --with-cache --cache redis --database postgres --yes`

Cache: `--cache redis` (alias `upstash`, `upstash-redis`) or `--with-cache` → catalog-pinned Upstash Redis over HTTP + memory fallback when `UPSTASH_REDIS_REST_URL=REPLACE_WITH_...`. Auth requires DB: `--with-auth` + `--database none` → validation error `Auth requires a database (postgres or convex)`.

### Addons

#### eve

Eve is an opt-in application capability. Exact Eve, AI SDK, and Vercel Connect versions come from `packages/versions`; selected outputs include the Eve runtime and framework integration. Contributor guidance is generated from the resolved project configuration for every project. Use `--with-eve`; the older `--features eve` alias remains supported.

```bash
ghostinit create my-app --preset custom --with-eve --yes
ghostinit create my-app --preset saas --with-eve --yes          # saas + eve
ghostinit create my-app --features eve --yes                     # deprecated alias still works
```

#### i18n

Catalog-pinned next-intl 4 internationalization routing. Opt-in via `--with-i18n` (preferred) or deprecated `--features i18n` alias.

```bash
ghostinit create my-app --preset custom --with-i18n --yes
ghostinit create my-app --features i18n --yes                    # alias
```

Combo via addons:

```bash
ghostinit create my-app --preset custom --with-eve --with-i18n --yes
ghostinit create my-app --with-eve --with-i18n --yes             # custom implicitly or via saas with flags
# alias combo still works:
ghostinit create my-app --features eve,i18n --yes
```

All addons optional, false default (except saas preset forces auth/api/email/analytics true). Parsed case-insensitive deduped via `parseFeaturesInput()` for alias and `parseCacheInput()` for cache. Unknown partially tolerated forward-compat (`eve,unknown` → `eve`), fully unknown (`unknownOnly`) throws ValidationError. Same for billing.

#### Other addons

- **auth**: Better Auth + 2FA; requires DB postgres|convex. Stripped when off: no `packages/auth`, no `auth-client`, no `trustedOrigins`, no expo auth plugin.
- **api**: oRPC contract-first; when off, `packages/api` and `packages/contracts` stubs? Actually api package omitted.
- **email**: Resend templates; when off, `packages/email` omitted.
- **analytics**: PostHog; when off, `packages/analytics` omitted.
- **cache**: Upstash Redis; when off, `packages/cache` omitted.
- **billing**: Select at most one of Stripe/Paddle/Polar, plus optional Chargily and manual payments. Manual and Chargily are each valid alone or together; `none` disables billing. `all` and multiple global providers are rejected.

## Modes

- `monorepo` default — workspaces `apps/*, packages/*, tooling/*`, turbo tasks, root composer 12+ groups, recommended for AI/codebase split bounded contexts. Supports `web`, `mobile`, `desktop`, `both` and `all` app selections.
- `single` — one project without workspaces. Web uses Next.js `src/app/` or TanStack Start `src/routes/`, with selected backend capabilities under `src/server/`. Single Expo/Electron is a frontend-only native layout with no generated server or external host contract.

```bash
ghostinit create my-app --mode monorepo
ghostinit create my-app --mode single
ghostinit create my-app --mode monorepo --apps both
ghostinit create my-app --mode single --apps mobile --preset frontend --database none
```

## Combinations Examples

- Algeria SaaS local: `chargily + postgres + nextjs + monorepo + apps web`
- Algeria+Global dual: `chargily,stripe + postgres + nextjs + monorepo + eve + apps web`
- Global open-source MoR: `polar + postgres + nextjs + eve + apps web`
- Global plus Algeria/manual: `stripe,chargily,manual + postgres + nextjs + monorepo + eve,i18n + apps web`
- TanStack edge: `tanstack-start + postgres + stripe + monorepo + apps web`
- Minimal: `none billing + postgres + nextjs + single + apps web` or `none + none DB + nextjs + single`
- Mobile-only: `none database + preset frontend + apps mobile` → Expo SDK 57 without a backend; select monorepo `web,mobile` for server-backed capabilities
- Both apps: `postgres + monorepo + apps both` → `apps/web + apps/mobile` shared backend port 3000
- Both + TanStack web: `tanstack-start + postgres + monorepo + apps both`
- Single mobile: `single + apps mobile + preset frontend` → flat Expo app.json + client-only `app/` and `src/`.
- Cross-platform SaaS: `stripe + postgres + monorepo + apps both + eve`

Important blocked combos:

- `billing + database=none`
- `single + apps both|all|web,mobile` (use monorepo for dual)
- `single + apps mobile|desktop` with any server-backed capability, database, cache, or deploy target

## Env Prefixes

- Next client: `NEXT_PUBLIC_*`
- TanStack/Vite client: `VITE_*`
- Expo client: `EXPO_PUBLIC_*`
- Emit only prefixes belonging to selected app audiences. Client runtimes stay separate, and server secrets never appear in these prefixes.
- Mobile additionally needs `EXPO_PUBLIC_API_URL` (API base) and `EXPO_PUBLIC_APP_URL` (app origin for deep links).

## Turbo Outputs

- `dist/**` bun build + expo export static
- `.next/**` Next
- `.output/** dist/**` TanStack Vite/Nitro
- `.vercel/**` Vercel
- `.expo/**` Expo cache, `apps/mobile/dist/**` expo export
- `globalEnv` exactly follows the selected capability/app environment manifest, including `EXPO_PUBLIC_*` when mobile is selected

If you add new client var manually, add to turbo globalEnv too to invalidate cache on change.

## Choosing Guidance

- Starting new production app → `monorepo + nextjs + postgres + chosen billing + apps web`
- Need realtime sync → consider `convex` (or postgres + realtime addon later)
- Algeria market → include `chargily` + `stripe` dual
- Global SaaS → choose one of `stripe`, `paddle` or `polar`; optionally add `chargily` and/or `manual`
- Need AI durable agents → `eve`
- Need multi-language → `i18n`
- Experiment quickly → `single + postgres + nextjs + none billing + apps web`
- Mobile app needed → `apps mobile` alone or `apps both` for web+mobile monorepo
- Cross-platform (web dashboard + mobile app sharing same backend) → `monorepo + apps both`, backend single port 3000 via `EXPO_PUBLIC_API_URL`
- Expo only, no web → frontend-only `monorepo + apps mobile` or `single + apps mobile --preset frontend`; add web in monorepo for backend capabilities
- When both: web via `--framework nextjs|tanstack-start`, mobile always Expo SDK 57 regardless of framework
