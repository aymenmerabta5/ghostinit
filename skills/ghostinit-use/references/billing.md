# Billing — Usage Guide

No host internals — only what a consumer needs to use billing in scaffolded or existing projects.

## Choosing Providers

- `chargily` alone — Algeria EDAHABIA/CIB checkout-only server-only. Manual recurring via cron. No portal. Suitable for Algeria market only.
- `stripe` alone — global cards subscription-native + checkout + portal + webhooks. International.
- `chargily,stripe` — dual market Algeria + Global most common for regional startups. Stripe for global cards, Chargily for local EDAHABIA/CIB.
- `paddle` — MoR global tax handling 5% + 50c + client token `pdl_ntf_...`. MoR means merchant of record handles VAT/tax.
- `polar` — MoR open-source focus 4% + metering + license keys + checkout + usage events. Access token + org id + webhook secret.
- `all` — all 4 combined.
- `none` — no billing.

Any combo allowed: `stripe,chargily`, `paddle,polar`, `chargily,paddle,polar,stripe`, etc. No validation blocks chargily+global combo intentionally.

Billing requires postgres or Convex plus a selected server-capable web host. Single native and native-only backend configurations are invalid; use monorepo `web,mobile` or `web,desktop` for native billing clients.

## Scaffolding

```bash
ghostinit create my-app --billing stripe --yes --no-install
ghostinit create my-app --billing chargily,stripe --yes --no-install    # dual
ghostinit create my-app --billing all --yes --no-install
ghostinit create my-app --billing none --yes --no-install
ghostinit create my-app --billing stripe --apps web,mobile --yes --no-install  # Next + Expo public env
ghostinit create my-app --billing stripe --apps both --framework tanstack-start --yes --no-install
```

Generated output includes `packages/billing/` capabilities, server-only provider SDK wrappers, webhook routes, conditional UI panels, selected-provider environment values, and the matching capability/app-scoped Turbo cache inputs.

## Env Variables Needed

Fill in the gitignored `.env.local`, or `.dev.vars` for Cloudflare. Vendor-issued credentials start as placeholders in both the example and local files; generation never invents provider keys or webhook secrets. Only self-issued application secrets are generated.

- Stripe: server-only `STRIPE_SECRET_KEY` (sk_...) and `STRIPE_WEBHOOK_SECRET` (whsec_...). Public `STRIPE_PUBLISHABLE_KEY` (pk_...) uses `NEXT_PUBLIC_` for Next, `VITE_` for TanStack/desktop, and `EXPO_PUBLIC_` for Expo, only when that audience is selected.
- Chargily: `CHARGILY_API_KEY`, `CHARGILY_SECRET_KEY`, `CHARGILY_MODE=test|sandbox|live`. Server-only — never client. No `EXPO_PUBLIC_*` needed.
- Paddle: server-only `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET`, plus `PADDLE_ENVIRONMENT=sandbox|live`. Public `PADDLE_CLIENT_TOKEN` (pdl_ntf_...) and `PADDLE_ENVIRONMENT` use only the selected audience prefixes listed below.
- Polar: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_ORG_ID`, `POLAR_ENVIRONMENT=sandbox`. Server-only, no client token. No `EXPO_PUBLIC_*` for Polar.
- Mobile API env (not billing but required when mobile+billing): `EXPO_PUBLIC_API_URL=http://localhost:3000` (API base for oRPC checkout session creation), `EXPO_PUBLIC_APP_URL=http://localhost:3000` (app origin for deep links). Billing checkout via same backend `/api/rpc` + webhooks.

Only public values belong in `NEXT_PUBLIC_*`, `VITE_*`, or `EXPO_PUBLIC_*`; their names do not make a secret safe to expose. Next+Expo emits `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*`; TanStack+Expo emits `VITE_*` and `EXPO_PUBLIC_*`. Desktop also consumes `VITE_*`. Each client imports its own env runtime, and server secrets stay in the server entry.

Public name reference (only selected audiences are emitted):

- Stripe publishable: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Paddle client token: `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_CLIENT_TOKEN`, `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN`
- Paddle environment: `NEXT_PUBLIC_PADDLE_ENVIRONMENT`, `VITE_PADDLE_ENVIRONMENT`, `EXPO_PUBLIC_PADDLE_ENVIRONMENT`
- PostHog key (if analytics): `NEXT_PUBLIC_POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_KEY` similarly
- App/API origins: `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_API_URL`, `VITE_APP_URL`/`VITE_API_URL`, and `EXPO_PUBLIC_APP_URL`/`EXPO_PUBLIC_API_URL`. Set Expo origins to an HTTPS backend reachable from the device for production.

## How Webhooks Work in Generated Project

- Webhook routes are hosted only by the selected Next.js or TanStack Start web app. Native billing clients require monorepo `web,mobile` or `web,desktop`; single native billing is rejected because it has no backend host.
- Signature verified against secret from env. Idempotent via `webhook_events` table unique `(provider, providerEventId)` — duplicate events `onConflictDoNothing`.
- After verification emits domain event + subscription status update.
- Shared backend when `apps both`: single webhook endpoint (web `:3000`) handles all providers regardless of client origin (web or mobile). Mobile checkout calls backend via `EXPO_PUBLIC_API_URL` so webhooks still hit same backend.

## UI Billing Page

Generated `apps/web/src/app/(dashboard)/billing/page.tsx` or `apps/mobile/app/billing.tsx` (Expo Router) conditional panels per selected provider:

- Stripe → checkout session + portal session + subscriptions list/cancel
- Chargily → payment link only, no portal tab (checkout-only)
- Paddle → checkout + customer portal via dashboard
- Polar → checkout + subscriptions + metering + license keys + usage events + portal

Add more providers later? Not auto — need recreate or manual add (future ghostinit add billing provider maybe). For now scaffold with desired providers upfront.

For mobile: `apps/mobile/app/billing.tsx` uses same oRPC client via `EXPO_PUBLIC_API_URL` + `getCookie()` forwarding, so checkout session creation still backend. Client tokens (`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN`) used only if client SDK needs publishable (e.g., Stripe js). Checkout redirect opens browser via `expo-web-browser`.

## Turbo Cache & Billing

Turbo `globalEnv` includes every selected billing key and the applicable public-prefix wildcard, including `EXPO_PUBLIC_*` when mobile is present. Changing a selected billing key therefore invalidates the cache. Add custom environment keys to the environment manifest and regenerate; a manually emitted key that is absent from Turbo inputs can reuse stale cached output.

## Troubleshooting Billing

- `billing + database=none invalid` → use `--database postgres` (default) when billing enabled.
- Chargily panel missing? Expected — server-only SDK no client panel needed; payment link generation server-side API route.
- Portal button missing for Chargily → intentional checkout-only, no portal supported.
- Webhook 400 signature mismatch → check raw body pattern `arrayBuffer()` used not `json()`, secret correct from `.env.local`, local tunneling (e.g., ngrok) URL matches webhook registered in provider dashboard.
- Checkout URL not generating → check `*_API_KEY` not placeholder `REPLACE_WITH_`, client throws if placeholder.
- Duplicate webhook events → ensure `webhook_events` table exists `bun run db:push`, check unique constraint `(provider, providerEventId)`.
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` missing in mobile → it is emitted when both Stripe and Expo are selected. If you added mobile manually, configure the publishable key under `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` and ensure the mobile env runtime and Turbo inputs include that audience. Never copy `STRIPE_SECRET_KEY` into a public variable.
- `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN` missing → same as above for Paddle; Paddle client token originally `pdl_ntf_...`.
- Mobile checkout 404 → ensure `EXPO_PUBLIC_API_URL` points to running backend `:3000` (web), not Expo dev `:19000`. Backend handles `/api/rpc` checkout session creation.
