# Billing — Usage Guide

Use this guide to configure the billing workflow selected for your generated project.

## Choosing Providers

Choose at most one global provider: `stripe`, `paddle`, or `polar`. Add `chargily`,
`manual`, or both if needed. Each option also works alone. `none` disables billing;
`all` and multiple global providers are rejected. `both` is the legacy
`stripe,chargily` alias.

- Stripe: checkout, subscriptions, invoices and customer portal.
- Chargily: Algeria EDAHABIA/CIB checkout, invoices, subscription records and
  administrator-created payment links. There is no customer portal. A renewal
  requires a new customer-authorized checkout; automatic recurring debits are not implemented.
- Paddle: checkout, subscriptions, invoices and customer portal.
- Polar: checkout, subscriptions, invoices and customer portal. Usage/license
  sections display existing account records. Usage ingestion requires a trusted
  server integration; manual license issuance is unsupported because provider
  benefit grants create license keys.
- Manual: DZD balance top-ups with private receipts and administrator review.

Billing requires PostgreSQL or Convex and a selected server-capable web host.
For native clients, use monorepo `web,mobile` or `web,desktop`. Single native and
native-only backend configurations are unsupported.

## Scaffolding

```bash
ghostinit create my-app --billing stripe --yes --no-install
ghostinit create my-app --billing chargily,stripe --yes --no-install
ghostinit create my-app --billing manual,chargily,stripe --yes --no-install
ghostinit create my-app --billing manual --database convex --yes --no-install
ghostinit create my-app --billing stripe --apps web,mobile --yes --no-install
ghostinit create my-app --billing stripe --apps both --framework tanstack-start --yes --no-install
```

Run `bun run install:bootstrap` inside fresh `--no-install` output before other
scripts. Selected online providers receive server-only SDK adapters, webhook
routes, conditional panels and environment values. Manual payments use a
separate balance workflow and enable the required storage capability.

## Configure Manual Payments

Submissions are disabled until the real recipient is configured. Read the
generated `docs/manual-payments.md` and edit:

- PostgreSQL monorepo: `packages/billing/src/manual-payment-config.ts`.
- PostgreSQL single: `src/server/billing/manual-payment-config.ts`.
- Convex: `convex/manualPaymentConfig.ts`; also configure `CONVEX_SITE_URL` and
  deploy the generated functions.

Set real `receiverInstructions`, choose `allowedMethods`, and set `enabled: true`.
Instructions are visible to signed-in customers, so do not include secrets.
Apply the generated PostgreSQL schema when applicable and configure private,
durable receipt storage for production.

An active account with verified email may submit a PNG, JPEG or PDF receipt up
to 5 MiB. Amounts are integer DZD minor units: 100 means 1 DZD, with a maximum
of 1,000,000 DZD per request. Each owner may have 10 pending submissions and
1,000 retained receipts. Submission stays pending and does not credit a balance.

Administrators inspect private receipts and confirm the actual incoming transfer
before approving. Rejection requires a reason, and administrators cannot review
their own payments. Approval atomically credits the saved amount once; retries do
not create another credit. Receipt access is limited to its owner and
administrators. Retained financial references may block account deletion.

Web and Electron provide submission and review controls. Expo shows balance and
history and opens the configured web billing page for submission/review, explaining
that another sign-in may be needed. Spending, subscription exchange, refunds and
withdrawals are not implemented by this balance workflow.

## Online Provider Environment

Fill in the gitignored `.env.local`, or `.dev.vars` for Cloudflare. Vendor keys
and webhook secrets remain placeholders until you supply real credentials;
generation only mints self-issued application secrets.

- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the configured price
  IDs. The publishable key uses the selected client audience prefix.
- Chargily: `CHARGILY_API_KEY`, `CHARGILY_SECRET_KEY`, and
  `CHARGILY_MODE=test|live`. These values remain server-only.
- Paddle: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, configured price IDs, and
  `PADDLE_ENVIRONMENT=sandbox|production`. Paddle.js uses a public `test_...`
  sandbox or `live_...` production client token and matching public environment.
  The generated placeholder is not a usable client token.
- Polar: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_ORG_ID`, configured
  product IDs, and `POLAR_ENVIRONMENT=sandbox|production`. These are server-only.

Public values use `NEXT_PUBLIC_*` for Next, `VITE_*` for TanStack/Electron, and
`EXPO_PUBLIC_*` for Expo. Only selected audiences are emitted. Examples include
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `VITE_PADDLE_CLIENT_TOKEN`, and
`EXPO_PUBLIC_PADDLE_ENVIRONMENT`. Prefixing a server secret never makes it public-safe.

Native clients use `EXPO_PUBLIC_API_URL` or the desktop API configuration to call
the selected backend. Set production origins to HTTPS endpoints reachable from
the device. Checkout opens the provider flow in a browser; webhooks still reach
the web backend.

## Webhooks and Billing Page

Next.js and TanStack Start own the selected online-provider webhook routes.
Handlers validate bounded raw request bytes and signatures, then apply idempotent
events and account-owned billing records. Browser success/cancel redirects affect
navigation only; authenticated snapshots and verified webhooks determine payment state.

Next monorepo billing uses `apps/web/src/app/billing/page.tsx`; single uses
`src/app/billing/page.tsx`. TanStack uses the corresponding `src/routes/billing.tsx`.
Feature screens, remote adapters, workflow hooks and focused views own the UI.

Stripe, Paddle and Polar expose checkout and customer-portal controls plus account
records. Subscription management occurs through the supported provider portal;
the generated subscription table is not a direct cancellation API. Chargily has
its own checkout panel and administrator-only payment-link form, with no portal.
Manual payments have a separate balance, receipt history and administrator queue.

## Cache and Troubleshooting

Turbo inputs include the selected billing keys and applicable public prefixes.
Keep added environment keys synchronized with the generated configuration and
cache inputs.

- Manual submission unavailable: configure the recipient, enable manual payments,
  apply/deploy the backend, and verify private storage.
- Chargily panel missing: verify Chargily is selected and the generated billing
  feature is present. A server-only SDK does not remove its client panel.
- Chargily portal missing: expected; that operation is unsupported.
- Paddle checkout unavailable: use a valid `test_...`/`live_...` public client token
  and matching `sandbox`/`production` server and client environments.
- Webhook signature failure: verify the provider secret and registered backend
  URL; preserve the generated raw-body verification.
- Mobile checkout 404: point `EXPO_PUBLIC_API_URL` at the running backend, not
  Expo's development server.
