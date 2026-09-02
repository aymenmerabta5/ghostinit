# End-to-End Workflows — Zero Knowledge to Working App

## 1. Create → Env → DB → Dev (Happy Path — Web Default)

```bash
# Scaffold non-interactive
ghostinit create my-app --dry-run --yes --no-install  # preview without writing
ghostinit create my-app --dry-run --json --yes | jq .data.files
ghostinit create my-app --yes --no-install --cwd /tmp --mode monorepo --framework nextjs --apps web --database postgres --billing stripe,chargily --features eve,i18n
cd /tmp/my-app

# Install deps with the generated project's pinned Bun toolchain
bun install

# Env setup: .env.local is already generated; edit it in place.
# Replace required REPLACE_WITH_* vendor placeholders in .env.local:
# BETTER_AUTH_SECRET=<32+ random, e.g. openssl rand -base64 32>
# DATABASE_URL or POSTGRES_USER/PASSWORD/HOST/PORT/DB individual
# BETTER_AUTH_URL=http://localhost:3000, NEXT_PUBLIC_APP_URL=http://localhost:3000
# When mobile selected also: EXPO_PUBLIC_APP_URL=http://localhost:3000, EXPO_PUBLIC_API_URL=http://localhost:3000 (API base for oRPC, same backend port 3000)
# STRIPE_SECRET_KEY if billing stripe, etc. + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY + VITE_ + EXPO_PUBLIC_ triple
# RESEND_API_KEY if email needed
# POSTHOG_KEY if analytics (optional) — triple prefix NEXT_PUBLIC_ + VITE_ + EXPO_PUBLIC_

# Portable DB start path (Windows, Linux, macOS)
docker compose --env-file .env.local up -d
# Optional Docker/Podman helper; Windows requires Git Bash, WSL, or another Bash:
# bash ./start-database.sh

# If you set DATABASE_URL to remote (Neon/Supabase) skip start-database.sh and just set var

# Push schema
bun run db:push   # or db:generate + db:migrate

# Dev
bun run dev        # turbo dev → apps/web :3000
```

Open http://localhost:3000 → scaffolded marketing + dashboard + billing page + auth.

### Env var setup note for mobile (EXPO_PUBLIC_API_URL)

When `--apps mobile` or `both` selected, generated `.env.example` includes:

- `EXPO_PUBLIC_APP_URL=http://localhost:3000` — app origin for deep links / OAuth redirect scheme `__PROJECT_NAME__://`
- `EXPO_PUBLIC_API_URL=http://localhost:3000` — API base for Expo oRPC when a monorepo web app is selected as the backend host.

For local dev both vars point to localhost:3000. For production set to deployed backend URL (e.g. `https://api.my-app.com`). Expo client uses `EXPO_PUBLIC_API_URL` preferred, fallback `EXPO_PUBLIC_APP_URL`, final fallback `http://localhost:3000`. Cookie forwarding via `authClient.getCookie()` → `headers: { cookie }` to oRPC.

## 2. Mobile & Both Apps Workflows

### 2a. Monorepo Mobile-Only Frontend (`apps/mobile`)

```bash
ghostinit create my-app --dry-run --yes --no-install  # preview without writing
ghostinit create my-app --dry-run --json --yes | jq .data.files
ghostinit create my-app --yes --no-install --cwd /tmp --mode monorepo --apps mobile --preset frontend --database none
cd /tmp/my-app
bun install
# .env.local is already generated; replace required REPLACE_WITH_* vendor placeholders in place
# Dev web intentionally absent — only mobile app exists in apps/mobile
bun run dev   # if defined, or:
cd apps/mobile && bun run dev   # expo start --port 19000
```

Generated structure:

- `apps/mobile/` — Expo SDK 57, Router `app/_layout.tsx`, `app/index.tsx`, `app/(auth)/`, `app/+not-found.tsx`, `app.json` scheme, `metro.config.js` auto monorepo, `babel.config.js` babel-preset-expo, SecureStore + expo-linking + auth expo() plugin
- No backend host, database, auth server, provider adapter, or webhook is generated. Select `apps web,mobile` for those capabilities.
- `tooling/typescript-config/expo.json` extends base, `apps/mobile/tsconfig.json` `@/*` + `@repo/*` paths

### 2b. Monorepo Both Web+Mobile (`apps/web + apps/mobile`)

```bash
ghostinit create my-app --dry-run --yes --no-install  # preview without writing
ghostinit create my-app --dry-run --json --yes | jq .data.files
ghostinit create my-app --yes --no-install --cwd /tmp --mode monorepo --apps both --framework nextjs --database postgres
# or --apps web,mobile or --apps all (alias)
# web framework chooser still applies to web target; mobile always uses the catalog-pinned Expo SDK regardless
ghostinit create my-app --apps both --framework tanstack-start --database postgres --billing stripe,chargily --yes --no-install --cwd /tmp

cd /tmp/my-app
bun install
# .env.local is already generated; replace required REPLACE_WITH_* vendor placeholders in place
# Fill: BETTER_AUTH_SECRET, DATABASE_URL, BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL, EXPO_PUBLIC_APP_URL, EXPO_PUBLIC_API_URL (all same origin http://localhost:3000 local), billing keys triple prefix
docker compose --env-file .env.local up -d
bun run db:push
bun run dev   # turbo dev → apps/web :3000
# In another terminal:
cd apps/mobile && bun run dev   # expo start --port 19000, calls backend via EXPO_PUBLIC_API_URL=http://localhost:3000/api/rpc
```

Both share:

- Single DB, single `packages/api` contract/router, single Better Auth server with `expo()` plugin when mobile included.
- Same billing subscriptions table, webhooks `/api/billing/webhooks/*`.
- Web `apps/web` :3000 Next/TanStack; mobile `apps/mobile` Expo Metro :19000 calling `http://localhost:3000`.

Tri-environment client tokens: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` etc. Scaffold emits triple for all client-safe vars (PostHog, Paddle client token).

### 2c. Single Mode Mobile (`single + apps mobile`)

```bash
ghostinit create my-expo --yes --no-install --cwd /tmp --mode single --apps mobile --preset frontend --database none
cd /tmp/my-expo
bun install
# .env.local is already generated; replace required REPLACE_WITH_* vendor placeholders in place
bun run dev   # expo start (single frontend mode)
```

Single mobile flat structure:

- `app/` — Expo Router frontend routes and local navigation.
- `src/` — client components, optional analytics/i18n, and platform-local adapters; no `src/server/` backend is emitted.
- `app.json`, `babel.config.js`, `metro.config.js`, `expo-env.d.ts`, `tsconfig.json`, `.env.example/.env.local`
- Auth, API, billing, messaging, storage, PDF, Eve, notifications, remote flags, jobs, cache, database, and deploy selections are rejected. External backend-host selection is not implemented.

Note: single mode supports only one target. `single + apps both` invalid → use monorepo for dual. Error: `Single mode supports only one app target --apps web or --apps mobile, not both. Use monorepo for web+mobile`.

### 2d. Dev Expo Start (Mobile)

```bash
cd my-app/apps/mobile   # monorepo both or mobile-only
bun run dev             # expo start --port 19000
bun run android         # expo start --android
bun run ios             # expo start --ios
bun run web             # expo start --web (Expo web, not Next web)
bun run build           # expo export → dist/

# Single mobile flat
cd my-expo
bun run dev             # expo start (package.json dev = expo start)
```

Metro config: SDK 52+ auto monorepo detection via `getDefaultConfig(__dirname)` — no manual `watchFolders`. If you add new package in `packages/*`, Metro auto watches via workspace root.

Backend sharing applies only to monorepo `web,mobile`; the generated web app owns port 3000. Single mobile has no generated remote-backend host contract.

Auth flow mobile: `expo-secure-store` stores session, `expo-linking` handles `__PROJECT_NAME__://` scheme OAuth callbacks, `expoClient` Better Auth client.

oRPC flow: `src/lib/orpc.ts` or `apps/mobile/src/lib/orpc.ts` creates `RPCLink` with `url: ${EXPO_PUBLIC_API_URL}/api/rpc` + `headers: async () => { cookie: authClient.getCookie() }`.

## 3. Adding Domain (Module → Use-Case → Procedure → Action)

```bash
cd /tmp/my-app

# Bounded context
ghostinit add module orders
# Creates packages/modules/src/orders/{domain/types.ts,domain/index.ts,application/index.ts,ports/index.ts,index.ts}
# + packages/database/src/schema/orders.ts (pgTable user_id FK users)
# + tests stub
# Auto sync rebuilds registries (modules index, api contract/router, db schema index)

# Use-cases — command (write) and query (read)
ghostinit add use-case orders create-order --kind command
ghostinit add use-case orders list-orders --kind query
# Writes application/create-order.command.ts and list-orders.query.ts + updates application/index.ts barrel

# oRPC procedures wrapping use-cases
ghostinit add procedure orders create
ghostinit add procedure orders list
# Creates packages/api/src/procedures/orders-create.ts, orders-list.ts + updates contract.ts + router.ts via sync

# Server action (if needed)
ghostinit add action orders submit
```

After each add:

```bash
ghostinit sync --check   # CI gate
ghostinit check          # architecture (should pass BLOCKER/HIGH 0)
ghostinit status         # metadata includes apps selected
bun run typecheck        # TS
bun run db:push          # if new table added
bun run dev              # verify
# plus for mobile both:
cd apps/mobile && bun run build   # expo export checks TS + bundling
```

## 4. Billing Setup in Generated Project

After scaffolding with billing selected, you need to:

- Fill billing secrets in `.env.local` (see billing.md reference) — now triple `NEXT_PUBLIC_* + VITE_* + EXPO_PUBLIC_*` for client tokens when mobile included
- Run `bun run db:push` — billing tables created
- Configure webhook URL in provider dashboard pointing to `/api/billing/webhooks/<provider>` with secret matching `.env.local`
- For local dev use ngrok or similar to expose :3000 publicly for webhook delivery.
- For mobile: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` etc must match same Stripe publishable as web if both selected; mobile checkout still goes through backend via oRPC, client token used for Stripe js equivalent if needed.

Test checkout:

- For stripe: create product/price in Stripe dashboard, set price id env or code, call `createCheckoutSession` via oRPC or server action, redirect to URL.
- Chargily: use payment link creation similar.
- Mobile: calls same oRPC procedures via `EXPO_PUBLIC_API_URL`, backend creates checkout session.

## 5. CI / Non-Interactive Mode

```bash
ghostinit create my-app --yes --cwd . --mode monorepo --framework nextjs --apps web,mobile --database postgres --billing stripe --features eve --runtime bun --no-install --json | tee create-output.json
ghostinit sync --check --json
ghostinit check --json | tee check.json
ghostinit doctor --json | tee doctor.json
ghostinit status --json

# jq parse
cat create-output.json | jq .data.projectRoot
cat check.json | jq .data.summary
cat doctor.json | jq .data.checks
```

Exit codes stable for CI gates: check `jq .exitCode` + `echo $?`. Drift failure exit 8 specifically for sync --check.

## 6. Remote DB (Neon, Supabase)

- Do not start the local Compose service or `bash ./start-database.sh`
- Set `DATABASE_URL=postgresql://...` in `.env.local`
- If SSL required: `DATABASE_SSL=true` + optionally `DATABASE_SSL_CA=<ca pem>`
- `drizzle.config.ts` and `packages/database/src/index.ts` builder prefers DATABASE_URL if present.
- Same for mobile and both — DB shared regardless of apps.

## 7. Framework & Apps Switching Note

Framework chosen at create time for web target. Switching Next ↔ TanStack Start post-scaffold is not auto — requires manual migration or new scaffold. Scaffold emits both NEXT_PUBLIC_* and VITE_* plus EXPO_PUBLIC_* client prefixes to ease manual switch and cross-app sharing.

Apps chosen at create time. Adding `apps/mobile` to existing web-only project requires manual migration or new scaffold (future `ghostinit add app mobile` maybe). For now scaffold with desired apps upfront (`--apps both` for web+mobile). Single → monorepo migration same.

## 8. Keeping Registries In Sync (When Manual Edits)

Manual edit of:

- `packages/modules/src/index.ts` → overwritten by sync, should not manual edit (generated).
- `packages/api/src/contract.ts` / `router.ts` → overwritten by sync.
- `packages/database/src/schema/index.ts` → overwritten by sync.
- `packages/modules/src/<m>/domain/`, `application/` → manual OK, but after adding new module manually, run sync.

Rule: if you create new module folder manually (not via `ghostinit add module`), you must run `ghostinit sync` to register it. Similarly new procedure file in `packages/api/src/procedures/` needs sync. New schema file `packages/database/src/schema/<name>.ts` needs sync to appear in index.

CI should gate:

```bash
ghostinit sync --check || (echo "Registries out of sync, run ghostinit sync" && exit 1)
```

## 9. Troubleshooting Quick

- `Invalid project name` → lowercase hyphens only `^[a-z][a-z0-9-]*$`
- `Billing requires postgres or convex` → set `--database postgres`
- `Target directory exists` → `--force` or new name
- `Module "x" does not exist` → `ghostinit add module x` first
- `No GhostInit project state found` → cd to project root with `.ghostinit/state.json`
- `Registries out of sync` → `ghostinit sync`
- `Drift: path: modified externally` → tracked file edited outside ghostinit, restore or `--force`
- `BETTER_AUTH_SECRET must be at least 32` → strong secret in `.env.local`
- `It looks like you're trying to use TypeScript...` → ensure `bunfig.toml` hoist=true (scaffold handles, manual change broke)
- `Reserved module name` → name collides with workspace packages `api,auth,database,config,ui,...` or JS reserved or generated infra `openapi,contract,router,context,index`
- `At least one app target required --apps web, mobile, or both` → passed `--apps none` or empty, set `web` or `mobile` or `both`
- `Single mode supports only one app target --apps web or --apps mobile, not both. Use monorepo for web+mobile` → switch `--mode monorepo` for dual apps or choose one app for single
- Lock active → `.ghostinit/lock` leftover after crash; `--force` or rm manually
- Webhook signature fail → raw body must be `Buffer.from(await request.arrayBuffer())` not json, secret from env, URL matches dashboard.
- Turbo cache stale billing → ensure new env var also in turbo.json globalEnv (includes EXPO_PUBLIC_* now).
- Expo Metro cannot resolve @repo/* → ensure `apps/mobile/tsconfig.json` extends `@repo/typescript-config/expo.json` and `@/*` + `@repo/*` paths present; Metro auto monorepo requires SDK 52+, check `expo` version 54.
- `EXPO_PUBLIC_API_URL` not set → mobile defaults to `http://localhost:3000`; if backend elsewhere set explicit URL, ensure backend CORS allows mobile origin if web.
- `expo-secure-store` install fail → plugin `expo-secure-store` must be in `app.json` plugins array; scaffold handles.
- Expo auth cookie missing → Better Auth server must have `expo()` plugin when mobile selected; client `expoClient()` + SecureStore adapter; check `authClient.getCookie()` forwarding in oRPC `RPCLink` headers.
