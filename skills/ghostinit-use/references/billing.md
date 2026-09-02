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
ghostinit create my-app --billing stripe --apps web,mobile --yes --no-install  # billing + mobile triple env
ghostinit create my-app --billing stripe --apps both --framework tanstack-start --yes --no-install
```

Generated includes `packages/billing/` capabilities + providers server-only SDK wrappers + webhook routes + UI conditional panels + env vars for selected providers + turbo globalEnv exhaustive including `EXPO_PUBLIC_*`.

## Env Variables Needed

Fill in `.env.local` (gitignored) — example placeholders in `.env.example`:

- Stripe: `STRIPE_SECRET_KEY` (sk_...), `STRIPE_WEBHOOK_SECRET` (whsec_...), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_...) + `VITE_STRIPE_PUBLISHABLE_KEY` for TanStack + `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` for Expo when `--apps mobile|both` selected. Scaffold emits triple prefix for all client-safe tokens when mobile included.
- Chargily: `CHARGILY_API_KEY`, `CHARGILY_SECRET_KEY`, `CHARGILY_MODE=test|sandbox|live`. Server-only — never client. No `EXPO_PUBLIC_*` needed.
- Paddle: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENVIRONMENT=sandbox|live`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=pdl_ntf_...`, `NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox` + `VITE_PADDLE_CLIENT_TOKEN` + `VITE_PADDLE_ENVIRONMENT` duplicates for TanStack + `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN` + `EXPO_PUBLIC_PADDLE_ENVIRONMENT` for Expo mobile when `--apps mobile|both`.
- Polar: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_ORG_ID`, `POLAR_ENVIRONMENT=sandbox`. Server-only, no client token. No `EXPO_PUBLIC_*` for Polar.
- Mobile API env (not billing but required when mobile+billing): `EXPO_PUBLIC_API_URL=http://localhost:3000` (API base for oRPC checkout session creation), `EXPO_PUBLIC_APP_URL=http://localhost:3000` (app origin for deep links). Billing checkout via same backend `/api/rpc` + webhooks.

Client-safe (`NEXT_PUBLIC_*`, `VITE_*`, `EXPO_PUBLIC_*`) safe to expose to browser/mobile JS. Server-only secrets never client. When `--apps both`, scaffold emits triple prefix for every client-safe billing var so web Next, web TanStack, and mobile Expo all read same token via their convention.

Summary triple mapping:

- Stripe publishable: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Paddle client token: `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_CLIENT_TOKEN`, `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN`
- Paddle environment: `NEXT_PUBLIC_PADDLE_ENVIRONMENT`, `VITE_PADDLE_ENVIRONMENT`, `EXPO_PUBLIC_PADDLE_ENVIRONMENT`
- PostHog key (if analytics): `NEXT_PUBLIC_POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_KEY` similarly
- App URLs: `NEXT_PUBLIC_APP_URL` + `VITE_APP_URL` + `EXPO_PUBLIC_APP_URL`, plus `EXPO_PUBLIC_API_URL` for Expo oRPC base (unique to Expo)

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

Turbo `globalEnv` includes all billing vars including `EXPO_PUBLIC_*` when mobile present. Changing billing key invalidates cache because env listed in globalEnv. If you add new billing env var manually without listing in turbo globalEnv, cache poisoned → old key reused. Scaffolded `turbo.json` already exhaustive 50+ vars including `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN`, `EXPO_PUBLIC_PADDLE_ENVIRONMENT`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_URL`. If adding custom var, also add to `turbo.json` globalEnv.

## Troubleshooting Billing

- `billing + database=none invalid` → use `--database postgres` (default) when billing enabled.
- Chargily panel missing? Expected — server-only SDK no client panel needed; payment link generation server-side API route.
- Portal button missing for Chargily → intentional checkout-only, no portal supported.
- Webhook 400 signature mismatch → check raw body pattern `arrayBuffer()` used not `json()`, secret correct from `.env.local`, local tunneling (e.g., ngrok) URL matches webhook registered in provider dashboard.
- Checkout URL not generating → check `*_API_KEY` not placeholder `REPLACE_WITH_`, client throws if placeholder.
- Duplicate webhook events → ensure `webhook_events` table exists `bun run db:push`, check unique constraint `(provider, providerEventId)`.
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` missing in mobile → scaffold emits triple when `--apps mobile|both` selected; if you scaffolded web-only then added mobile manually, copy publishable key to `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local` and add to `turbo.json` globalEnv.
- `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN` missing → same as above for Paddle; Paddle client token originally `pdl_ntf_...`.
- Mobile checkout 404 → ensure `EXPO_PUBLIC_API_URL` points to running backend `:3000` (web), not Expo dev `:19000`. Backend handles `/api/rpc` checkout session creation.
