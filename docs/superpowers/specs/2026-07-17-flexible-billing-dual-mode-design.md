# GhostInit Flexible Addon System — Design Doc

**Date:** 2026-07-17  
**Status:** Draft for user review  
**Topic:** Flexible billing (Stripe, Chargily, Paddle, Polar — any combo), dual project modes (monorepo vs single), backend services layer, full frontend E2E including auth reset password via Resend, interactive CLI like create-t3-app, layered architecture by responsibility.

---

## Overview

Transform GhostInit from opinionated always-full monorepo into **flexible addon-based scaffolder** where user can choose:

- **Billing:** `none | stripe | chargily | paddle | polar | comma-separated (e.g., stripe,chargily) | all | both` — any combination, add later via `ghostinit add billing --provider X`.
- **Project mode:** `monorepo (default, recommended for AI agents, apps/web + apps/eve + packages/*) | single (all-in-one Next.js, everything in src/ + server/ + agent/ inside)`
- **Features:** `eve, i18n (next-intl), server` — opt-in at create or add later. Defaults: auth, lint/format (oxlint/oxfmt), t3env, database PG, api oRPC, ui shadcn+Base UI + Tailwind, server services layer `packages/services/src/` (monorepo) / `server/services/` (single), import alias `@`, turbo (monorepo only), TanStack Query/Form, Zod, AGENTS.md, Resend for email (reset password).

**Current state after cleanup:**
- `src/templates/` — `agentic.ts` (AGENTS.md, CLAUDE.md, .cursor/rules, .windsurf/rules NO CURSOR.md), `eve.ts` (apps/eve/ real eve@0.24.6 hybrid `withEve({eveRoot: "../eve"})`), `database.ts` (start-database.sh safe loader + databasePackage backward compat), `default.ts` merges 12 groups, `packages/versions.ts` has eve 0.24.6 ai 7.0.26 @vercel/connect 0.2.2
- Bun only, 81 tests green (post-cleanup, dist excluded but build passes), `src/cli.ts` non-interactive parseArgs + --json stable envelope, commands create, add module/use-case/procedure/action, sync, status, check, doctor, version, help
- `TO_FIX.md` removed (already implemented), debug files empty folders removed
- No specs yet in `docs/superpowers/specs/`

**Inspiration:** create-t3-app's `availablePackages` + `buildPkgInstallerMap` + `dependencyVersionMap` + `@clack/prompts` interactive with CI flags fallback; layered architecture image (UI → Transport → Domain → Capabilities → Vendors → Supporting Foundations); t3code hybrid eve `withEve()`.

---

## User Intent — Summary of Clarified Requirements

1. **Billing flexible both/one/none:** Shared DB tables (subscriptions provider enum), same UI `/billing` with tabs if multiple providers chosen. Must be end-to-end working, not stubs.
2. **Billing providers:** Stripe (global cards subscription-native), Chargily V2 (Algeria EDAHABIA/CIB, server-only, checkout-only, V2 docs verified), Paddle (MoR global tax handled 5%), Polar (MoR open-source 4% + usage metering + license keys for AI SaaS). Extensible interface so Paddle, LemonSqueezy etc can be added later. User confirmed "select anything we want from them" → multi-select.
3. **Frontend E2E:** Every functionality working — billing pages with real checkout flows, auth with reset password via Resend, not just backend stubs.
4. **Auth reset password via Resend:** Use Resend as email provider for Better Auth reset.
5. **Project modes:** Monorepo default (apps/web + apps/eve + packages/* + packages/services/src/ for services) vs single all-in-one Next.js (everything in src/app + src/server/services/ + server/ + agent/ inside). User approved "Two modes at create: monorepo default + single all-in-one".
6. **Backend services layer:** Default in both cases. Monorepo: `packages/services/src/` (or `packages/server/src/services/` — decision: `packages/services/src/` focused product modules per user's note). Single: `server/services/` folder. Services consumable by oRPC, server actions `"use server"`, and RSC.
7. **Defaults vs optional:** User clarified: "include only the default things authentication linting formatting and so on no eve at first but can be selected" + "we should include t3env and so on in all of them as default" + "server services layer i think are default" + "shadcn with base ui and so on should be default as well import alias is always with @". So defaults: auth, lint/format, t3env, database PG, api oRPC, ui shadcn+Base UI, server services layer, import alias @, turbo (monorepo), TanStack Query/Form, Zod, AGENTS.md. Optional: billing (none default), eve (false default opt-in), i18n next-intl (false default), database alternative convex (postgres default).
8. **Eve placement:** Hybrid approved earlier — `apps/eve/` physical separated but mounted same-origin via `withEve({ eveRoot: "../eve" })` single dev server single Vercel deploy, `useEveAgent()` zero CORS, cookie auth flows. Physical folder `apps/eve/` for agentic isolation, runtime integrated. User asked if monorepo structure good — approved with tweaks.
9. **Layered structure image:** User sent Code Organized by Responsibility 6 layers (UI apps/web, Transport orpc.ts → app/rpc → packages/api, Domain packages/core, Capabilities payments/storage/email/analytics, Vendors Stripe/S3/Email/PostHog, Supporting shared contracts schemas + database persistence). User confirmed "Yes, that layered structure is perfect" with tweaks for flexible billing, eve hybrid, server services.
10. **Ultracode:** User wants to use ultracode workflow (parallel agents) for implementation — noted for writing-plans phase.
11. **Bun:** User requested "And be careful use bun" — Bun only, no npm.

---

## Goals

- **Flexible billing:** Choose none, one, multiple, or all of Stripe, Chargily, Paddle, Polar at create or add later. All optional, none default.
- **Dual project modes:** Monorepo and single all-in-one, with shared template logic, default monorepo recommended for AI agents.
- **Server services layer:** Always default, monorepo `packages/services/src/`, single `server/services/`, consumable by oRPC + server actions + RSC.
- **Full frontend E2E:** Every functionality working — billing checkout flows, auth reset password via Resend email, not stubs.
- **Auth reset password via Resend:** Better Auth email sending via Resend for password reset.
- **Interactive CLI:** Like create-t3-app with `@clack/prompts` when TTY, flags fallback for agents (`--billing`, `--mode`, `--features`, `--json`).
- **Layered architecture:** Adopt image's 6-layer structure with GhostInit specifics.
- **Clean:** Already cleaned up empty folders, debug files, TO_FIX. Keep clean.

## Non-Goals

- Switch from Bun to pnpm/npm or from oxlint/oxfmt to ESLint/Prettier — keep Bun.
- Remove DDD modules or add tRPC — keep oRPC contract-first, DDD domain/application/ports.
- Remove Better Auth — keep as default auth.
- Make billing mandatory — keep opt-in none default.
- Full eve always included — make opt-in false default per user "no eve at first but can be selected".
- End-to-end e2e tests for every billing provider combo in CI — unit + integration for structure, manual smoke for actual Stripe/Chargily/Paddle/Polar checkout (needs API keys).

---

## Approach A: Flexible Addon Registry + Dual Modes + Billing Abstraction + Services Layer (Recommended)

### 1. Addon Registry — Single Source of Truth

New file `src/lib/addons.ts` (inspired by create-t3-app `installers/index.ts` + `dependencyVersionMap.ts`):

```ts
export const availableModes = ["monorepo", "single"] as const
export const billingProviders = ["stripe", "chargily", "paddle", "polar"] as const
export const availableFeatures = ["eve", "i18n"] as const  // server, auth, ui etc are default not optional

export interface GhostInitCreateOptions {
  mode: "monorepo" | "single" // default monorepo
  billing: Array<"stripe" | "chargily" | "paddle" | "polar"> | [] // default [] none
  features: Array<"eve" | "i18n"> // default [] none (no eve at first)
  database: "postgres" | "convex" | "both" | "none" // default postgres
  // existing: runtime, noInstall, force, etc.
}

export function parseBillingInput(input: string): BillingProvider[] {
  // "stripe", "both" -> [stripe, chargily], "all" -> all 4, "stripe,chargily", "none" -> []
  // Handles comma-separated, case-insensitive, trims, dedupes
}

export const addonCompatibility: Array<{ incompatible: BillingProvider[], message: string }> = [
  // Stripe + Paddle both MoR-ish? Actually compatible, both can coexist (different products)
  // No true incompatibilities for billing — all can coexist via shared tables
  // But: if database none and billing not none -> need at least postgres or convex for subscriptions table
]
```

Update `packages/versions.ts` to add new deps (pinned, exact):

```ts
billing: {
  stripe: "19.1.0", // stripe-node
  "@chargily/chargily-pay": "2.1.0",
  "@paddle/paddle-node-sdk": "3.8.0",
  "@paddle/paddle-js": "1.6.4",
  "@polar-sh/sdk": "0.48.1",
  "@polar-sh/nextjs": "0.9.6",
},
email: {
  resend: "4.0.1",
},
i18n: {
  "next-intl": "4.0.0", // check latest
},
```

### 2. Interactive CLI Hybrid

- If `process.stdout.isTTY && !json && !yes && !ci` → `@clack/prompts` `p.group()`:
  1. Name
  2. Mode: monorepo (recommended for AI agents) vs single all-in-one (everything in src/ + server/ + agent/)
  3. Database: postgres (default) vs convex vs both vs none
  4. Billing: multi-select (create-t3-app uses select exclusive, we need multi-select for both/one/none flexible) — None, Stripe (global), Chargily (Algeria), Paddle (MoR 5%), Polar (MoR open-source 4% + metering)
  5. Features: multi-select eve (durable agent apps/eve/ hybrid), i18n next-intl
  6. Import alias @ (default, not prompt) — always @ per user
  7. Git? Install?

- Else (agents, --json, --yes, --ci) → flags:
  `--mode monorepo|single --billing stripe|chargily|paddle|polar|both|all|none (comma or repeat) --features eve,i18n --database postgres|convex|both|none --yes`

- Flags parsing: `--billing` can be repeat or comma: `--billing stripe --billing polar` or `--billing stripe,polar` or `--billing all` (all 4) or `--billing both` (stripe+chargily legacy, or map to all? Define: both = stripe+chargily for backwards compat, all = all 4)

- CI: if incompatible (e.g., database none + billing not none), warn and exit 0 (like create-t3-app) so matrix continues.

### 3. Billing — 4 Providers Flexible Both/One/None/All

Verified patterns (no guessing):

**Stripe (Node v19+):**
```ts
import Stripe from 'stripe'
const stripe = new Stripe(SECRET, { apiVersion: '2025-03-31.basil' })
const session = await stripe.checkout.sessions.create({
  line_items:[{price:'price_xxx', quantity:1}], mode:'subscription'|'payment',
  automatic_tax:{enabled:true}, success_url, cancel_url
})
const sig = req.headers['stripe-signature']
const event = stripe.webhooks.constructEvent(rawBodyBuffer, sig, webhookSecret)
// events: checkout.session.completed, invoice.paid vs invoice.payment_succeeded, customer.subscription.updated|deleted
// subscription expandable string ID default, need expand[]=subscription
stripe.billingPortal.sessions.create({ customer, return_url, flow_data:{type:'subscription_update'} })
stripe.subscriptions.list({ customer, status: 'active'|'all'|'past_due'|... })
```

**Chargily V2 (from user pasted docs, real):**
```ts
import { ChargilyClient, verifySignature } from '@chargily/chargily-pay'
const client = new ChargilyClient({ api_key: SECRET, mode:'test' }) // ONLY server-side
// product -> price -> checkout
const product = await client.createProduct({ name, description, images: [] })
const price = await client.createPrice({ amount:5000, currency:'dzd', product_id })
const checkout = await client.createCheckout({
  items:[{price:price.id, quantity:1}],
  success_url, failure_url,
  payment_method:'edahabia'|'cib', locale:'en',
  pass_fees_to_customer:true, metadata, customer_id, shipping_address, collect_shipping_address
}) // -> checkout_url redirect
// webhook server-only raw body Buffer header 'signature'
verifySignature(payloadBuffer, signatureHeader, API_SECRET_KEY)
```

**Paddle (MoR):**
```ts
import { Paddle, EventName } from '@paddle/paddle-node-sdk'
const paddle = new Paddle(API_KEY)
const tx = await paddle.transactions.create({ items:[{priceId, quantity:1}], customerId, collectionMode:'automatic' })
const checkoutUrl = tx.checkout?.url
// webhook
const event = await paddle.webhooks.unmarshal(rawBodyString, WEBHOOK_SECRET, signatureHeader)
// EventName.TransactionCompleted, SubscriptionCreated, SubscriptionCanceled
// Must use express.raw({type:'application/json'}) raw body!
```

**Polar (MoR open-source, usage metering, license keys):**
```ts
import { Polar } from "@polar-sh/sdk"
const polar = new Polar({ accessToken: TOKEN })
const checkout = await polar.checkouts.create({ products:[productId], customerName, locale:'en' })
const sub = await polar.subscriptions.create({ productId, customerId })
const endpoint = await polar.webhooks.createWebhookEndpoint({ url, events:['subscription.uncanceled'], organizationId })
// events ingestion for metering
await polar.events.ingest ? Or SDK eventsIngest? Via Context7: eventsIngest({events:[{name, organizationId, externalCustomerId, externalId, metadata}]})
```

**Common critical pattern — ALL 4 need raw body Buffer:**
- Stripe: `constructEvent(rawBody Buffer, sig, secret)` — need `Buffer.from(await req.arrayBuffer())` not `await req.json()`
- Chargily: `verifySignature(payload Buffer, sig, secret)` — same raw Buffer
- Paddle: `webhooks.unmarshal(rawBody string, secret, sig)` + `express.raw` middleware — raw body
- Polar: webhook verification via SDK, raw body required

Many get this wrong and webhooks always 403. Template must enforce.

**Abstraction Design:**

```
Monorepo: packages/billing/ (NEW, or packages/modules/src/billing/ as DDD? Better as capability)
  src/
    providers/
      interface.ts: BillingProvider { 
        name: 'stripe'|'chargily'|'paddle'|'polar'
        createCheckout({userId, priceId, successUrl, failureUrl, metadata?}): Promise<{id, url}>
        createCustomer({email, name}): Promise<{id}>
        createPortalSession?(customerId, returnUrl): Promise<{url}> // stripe, paddle, polar, not chargily
        verifyWebhook(rawBody: Buffer, signature: string): {valid: boolean, event: BillingEvent}
        listSubscriptions?(customerId, status): Promise<Subscription[]>
        createLicenseKey?(subscriptionId): Promise<{key}> // polar only
        ingestEvent?(input): Promise<void> // polar metering
      }
      stripe.ts: implements via Stripe SDK patterns above
      chargily.ts: implements via ChargilyClient, maps checkout to internal sub, manual recurring via DB + eve cron
      paddle.ts: implements transactions.create -> checkout.url, webhooks.unmarshal
      polar.ts: implements checkouts.create, subscriptions.create, webhooks, eventsIngest metering
    domain/types.ts: CheckoutSession {id, url, provider, status, amount, currency}, Price, Product, Subscription {id, customerId, provider enum, status, currentPeriodEnd, trialEnd}, Invoice {id, provider, paid, amount, tax}, Customer, LicenseKey, UsageEvent
    application/
      create-checkout.command.ts: Input {userId, priceId, provider, successUrl, failureUrl}, Deps {providers}, returns CheckoutSession
      handle-webhook.command.ts: Input {provider, rawBody Buffer, signature}, verifies via provider, updates DB (subscription status, invoice paid), idempotent via event id dedup
      create-portal-session.command.ts: Input {provider, customerId, returnUrl} for stripe/paddle/polar
    schema/billing.ts: Drizzle PG tables: products {id, name, provider}, prices {id, productId, amount, currency, provider}, checkouts {id, provider enum, url, status, customerId, priceId, amount}, subscriptions {id, provider enum stripe|chargily|paddle|polar, customerId FK users.id, status enum active|trialing|past_due|canceled|etc, currentPeriodEnd, trialEnd, priceId, metadata}, invoices {id, provider, subscriptionId, paid bool, amount, tax, status}, customers {id, userId FK users, provider, providerCustomerId, email}, license_keys {id, subscriptionId FK, key, provider polar, status active|revoked}, usage_events {id, subscriptionId, name, credits, externalCustomerId, provider polar}
    index.ts: export BillingProvider factories
  package.json: deps stripe ^19.x if stripe chosen, @chargily/chargily-pay ^2.1.0 if chargily, @paddle/paddle-node-sdk ^3.8.0 + @paddle/paddle-js ^1.6.4 if paddle, @polar-sh/sdk ^0.48.1 + @polar-sh/nextjs ^0.9.6 if polar, both/all if multiple, pinned in packages/versions.ts

Single mode: src/server/services/billing/ same structure but inside Next.js app, not packages/
  Or: src/server/billing/ providers/ etc.

Env in .env.example placeholders + .env.local real:
Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
Chargily: CHARGILY_API_KEY (server-only!), CHARGILY_SECRET_KEY, CHARGILY_MODE=test|live
Paddle: PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_ENVIRONMENT=sandbox|production, NEXT_PUBLIC_PADDLE_CLIENT_TOKEN, NEXT_PUBLIC_PADDLE_ENVIRONMENT
Polar: POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_ORG_ID, POLAR_ENVIRONMENT=sandbox|production
Common: APP_URL for success/failure/return_url
```

**UI — End-to-end working:**

`apps/web/src/app/billing/page.tsx` (monorepo) or `src/app/billing/page.tsx` (single):
- If billing none: shows "No billing configured, add via ghostinit add billing --provider X"
- If one provider: shows provider-specific UI
  - Stripe: Checkout button -> creates checkout session via oRPC/api -> redirect url, Subscription list status, Portal button -> portal session url, invoice list
  - Chargily: Checkout button -> Chargily checkout_url redirect (edahabia/cib), manual status from DB subscriptions + checkouts, no portal, no native subs — shows "recurring via DB + monthly cron"
  - Paddle: Transaction button -> checkout.url, subs list, TransactionCompleted handling
  - Polar: Checkout button -> checkout, subs list, license key display + usage meter ingest example
- If both/all: Tabs component (shadcn + Base UI) — Stripe tab, Chargily tab, Paddle tab, Polar tab — shared data from same DB tables with provider badge
- All uses `useEveAgent()`? No, billing is direct, but eve could have tool list_subscriptions

**Webhooks — End-to-end working:**

`apps/web/src/app/api/webhooks/stripe/route.ts` (monorepo) or `src/app/api/webhooks/stripe/route.ts` (single):
```ts
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')
  const buf = Buffer.from(await req.arrayBuffer()) // CRITICAL not req.json()
  const event = stripe.webhooks.constructEvent(buf, sig!, process.env.STRIPE_WEBHOOK_SECRET!)
  switch(event.type) {
    case 'checkout.session.completed': await handleCheckoutCompleted(event.data.object)
    case 'invoice.paid': await handleInvoicePaid(event.data.object) // subscription lifecycle
    case 'customer.subscription.updated': // ...
  }
  return new Response('ok', {status:200})
}
```

Same for chargily: `req.headers.get('signature')`, `verifySignature(buf, sig, CHARGILY_SECRET_KEY)`, event.type handling.

Paddle: `paddle.webhooks.unmarshal(buf.toString(), WEBHOOK_SECRET, sigHeader)`, switch `EventName.TransactionCompleted`, `SubscriptionCreated`, `SubscriptionCanceled`.

Polar: similar raw body + verification via SDK.

All webhooks idempotent via event id dedup table (store processed event ids).

**Extensibility:** New file `providers/lemonsqueezy.ts` implements same `BillingProvider` interface, add to billingProviders array + versions registry + env. No breaking change.

### 4. Project Modes — Monorepo vs Single

**Layered structure (from user's image) — Adopt for monorepo:**

Image: 1. UI apps/web (routes, screen components, client usage) → 2. Transport apps/web/lib/orpc.ts → app/rpc → packages/api (typed client, HTTP mount, oRPC procedures, auth, validation, permissions) → 3. Domain packages/core + packages/modules domain/application... (product decisions + business use-cases) → 4. Capabilities payments/billing flexible, storage S3, email Resend, analytics PostHog (integration boundaries behind stable package APIs) → 5. Vendors Stripe, S3, Email provider, PostHog (external systems) → 6. Supporting foundations packages/shared contracts schemas + packages/database persistence

Map to GhostInit:

- **1. UI:** Monorepo `apps/web/src/app/` + components, Single `src/app/` + `src/components/ui/`
- **2. Transport:** Monorepo `apps/web/lib/orpc.ts` (existing) + `app/rpc` (existing api/[...path]/route.ts) + `packages/api` (oRPC procedures os.prefix), Single same but inside src/
- **3. Domain:** Monorepo `packages/core` (optional, or use `packages/modules/src/<name>/domain/` as domain) + `packages/modules/` DDD, Single `src/modules/<name>/domain/`
- **4. Capabilities:** Monorepo `packages/services/src/` (NEW default) + `packages/billing/` (optional billing capability), `packages/email/` (Resend), `packages/storage/` (optional S3), `packages/analytics/` (optional). Single `server/services/` + `server/billing/` etc.
  - Capabilities integration boundaries behind stable package APIs — e.g., billing capability exposes `createCheckout({provider, priceId})` stable, vendors behind it
- **5. Vendors:** Inside capabilities: `packages/billing/src/providers/stripe.ts` is vendor adapter, `chargily.ts`, `paddle.ts`, `polar.ts` same, email `resend.ts` vendor, storage `s3.ts`
- **6. Supporting:** `packages/shared` contracts schemas zod shared, `packages/database` Drizzle PG persistence, `packages/config` t3env, `packages/kernel` Result

**Monorepo mode (default, recommended for AI):**

```
my-app/
  AGENTS.md (package roles including new billing, services, layered structure)
  CLAUDE.md identical
  .cursor/rules/ghostinit.mdc + .windsurf/rules/ghostinit.md NO CURSOR.md
  package.json workspaces apps/* packages/*
  turbo.json globalEnv + tasks
  .env.example placeholders + .env.local real secrets + apps/web/.env.local duplicate gitignored
  docker-compose.yml postgres:18.4 + start-database.sh safe loader
  apps/web/
    package.json (next, react, orpc, @repo/api/auth/config/billing?/database/modules/services/ui, tanstack query/form, zod, eve for withEve, next-intl if i18n)
    next.config.ts withEve({eveRoot: "../eve"}) hybrid same-origin if eve chosen, else plain
    src/app/ (marketing, auth sign-in/up/2fa/forgot-password/reset-password/dashboard/settings/admin/billing/agent) + billing/page.tsx tabs if billing
    src/app/api/webhooks/stripe|chargily|paddle|polar/route.ts raw body Buffer verify
    lib/orpc.ts typed client
    app/rpc (existing)
  apps/eve/ (if eve feature chosen, false default) apps/eve/agent/agent.ts defineAgent, tools/, skills/, channels/eve.ts, schedules/
  packages/
    api/ (oRPC health+me + procedures per module + billing if chosen via services)
    auth/ (Better Auth + Resend for reset password)
    database/ Drizzle PG + schema/billing.ts optional subscriptions/checkouts/invoices/customers/license_keys/usage_events
    modules/ DDD src/<name>/domain/application/ports + index.ts generated by sync
    billing/ (optional, if billing chosen) providers interface + stripe/chargily/paddle/polar + domain/types + application commands + schema + index
    email/ (default? User said "we will use resend as well" for auth reset password — so email package with resend should be default, not optional, for auth reset)
    services/ (NEW default) src/services/ example: createInvoice, handleBillingWebhook, sendResetPasswordEmail — consumable by oRPC + server actions + RSC
    config/ t3env, ui shadcn Base UI + Tailwind, contracts ErrorCode, observability logger, kernel Result, etc.
  tooling/architecture
```

**Single mode (all-in-one Next.js):**

```
my-app/
  AGENTS.md smaller (no workspaces, but still package roles as src/ folders)
  package.json single, no workspaces, next, react, orpc, drizzle, better-auth, etc all direct deps
  src/
    app/ (same as monorepo apps/web/src/app/ but inside single)
      billing/page.tsx tabs if billing, api/webhooks/stripe|chargily|.../route.ts raw body
      agent/page.tsx useEveAgent if eve
    server/
      services/ (default) billing.service.ts etc consumable by oRPC + actions + RSC
      db/ drizzle client + schema
      auth/ better-auth + resend reset password
      billing/ providers interface if billing chosen
      email/ resend
    modules/<name>/domain/application/ports/ (DDD inside single app, not packages/modules)
    components/ui/
    lib/ utils cn, env.ts t3env
  agent/ (if eve chosen) inside Next root, withEve({eveRoot: "./agent"}) default no need ../eve, eve docs default looks for agent/ inside project root
  .env.example + .env.local gitignored
  docker-compose.yml + start-database.sh
  AGENTS.md + CLAUDE.md + .cursor/rules + .windsurf/rules NO CURSOR.md
```

- Import alias @ always: tsconfig paths @/* -> ./src/* (single) or @/* -> ./src/* + @repo/* -> ./packages/*/src (monorepo via typescript-config)
- Shared template logic: `src/templates/modes/monorepo.ts` (current default.ts logic + new billing + services) and `single.ts` (flat structure) — keep `shared.ts` file() helper, secret(), packageJson sorted, tsconfig, codeScripts

**Services layer default reasoning:**
- Encapsulation: business logic that spans multiple modules (e.g., createSubscription needs billing + database + email) belongs in services, not in one module
- Reuse: same service called from oRPC procedure POST /billing/create-checkout, server action "use server" revalidatePath, and RSC dashboard page
- Example monorepo: `packages/services/src/billing/create-checkout.ts` Input {userId, priceId, provider, successUrl} Deps {billingProvider, db, email} → calls provider.createCheckout
- Single: `server/services/billing/create-checkout.ts` same

**Backend question user asked earlier:** "what do you think we are not choosing backend yet should we include it in ghostinit or no?" — Answer: services layer IS backend, keep it. It's not Hono/Express separate backend app yet (non-goal). Packages/api oRPC is data backend, apps/eve is intelligence backend, packages/services is business logic backend. Don't add Hono/Express separate backend app unless non-Next deployment needed (Fly.io, WebSockets separate). If later, add `apps/api-hono/` alongside.

### 5. Auth Reset Password via Resend — Full Frontend E2E

**Current:** Better Auth 1.6.23 emailAndPassword autoSignIn false SECURITY, 2FA TOTP, but no reset password flow yet.

**New:** Resend as email provider for Better Auth password reset.

**Implementation:**

- `packages/versions.ts` add `email.resend: "4.0.1"` (latest)
- `packages/email/` (NEW default, not optional, because auth needs it) — `src/index.ts` resend client, `src/templates/forgot-password.ts`, `reset-password.ts` HTML templates, `src/send.ts` sendEmail via Resend API key
- `packages/auth/src/index.ts` Better Auth config add `emailAndPassword: { enabled: true, sendResetPassword: async ({user, url}) => { await sendEmail({to: user.email, subject: "Reset password", html: forgotPasswordTemplate(url)}) } }` — Better Auth handles token generation, just need email sending
- `.env.example` + `.env.local`: `RESEND_API_KEY=REPLACE_WITH...`, `EMAIL_FROM=noreply@example.com`
- `apps/web/src/app/forgot-password/page.tsx` + `reset-password/page.tsx` (monorepo) or `src/app/forgot-password/` (single) — client TanStack Form email validation, calls `authClient.forgetPassword({email, redirectTo: "/reset-password"})`, reset page token from URL searchParams + new password + confirm, calls `authClient.resetPassword({newPassword, token})`
- Better Auth docs: `forgetPassword` and `resetPassword` client methods + server `sendResetPassword` hook

**Frontend E2E:** User clicks forgot password → enters email → receives Resend email with link `/reset-password?token=xxx` → enters new password → redirected to sign-in.

**Security:** Token via Better Auth, short expiry, single use, Better Auth handles.

### 6. CLI Interactive + Flags Hybrid

- Use `@clack/prompts` for TTY beautiful (like create-t3-app), fallback flags `--billing`, `--mode`, `--features`, `--database`, `--json`, `--yes`, `--ci` for agents
- `src/lib/addons.ts` registry: `availableModes`, `billingProviders` (stripe, chargily, paddle, polar), `availableFeatures` (eve, i18n), `availableDatabases` (postgres, convex, both, none), `defaultAddons` (auth, lint, format, t3env, database PG, api, ui, server services, TanStack Query/Form, Zod)
- `parseBillingInput` handles "stripe", "both" (legacy map to stripe+chargily), "all" (all 4), comma-separated "stripe,chargily", repeated flags
- `ghostinit add` extended: `add billing --provider X`, `add i18n`, `add service <name>`, `add addon eve`, `add addon billing`

### 7. Layered Architecture Enforcement

Update `src/lib/architecture.ts` to enforce new layered structure from image:

- Layer 1 UI `apps/web` or `src/app` no direct DB import
- Layer 2 Transport `apps/web/lib/orpc.ts` → `app/rpc` → `packages/api` typed client HTTP mount oRPC procedures auth validation permissions
- Layer 3 Domain `packages/core` or `packages/modules/src/<name>/domain/` pure TS no framework — product decisions + business use-cases
- Layer 4 Capabilities `payments/billing flexible`, `email` Resend, `storage` S3 optional, `analytics` optional — integration boundaries behind stable package APIs (e.g., billing capability exposes createCheckout stable)
- Layer 5 Vendors `Stripe`, `Chargily`, `Paddle`, `Polar`, `S3`, `Email provider Resend`, `PostHog` — inside capabilities
- Layer 6 Supporting `packages/shared` shared contracts schemas + `packages/database` persistence

Rules:
- Capabilities must NOT import other capabilities directly? Actually payments can depend on email? For invoice email, but via stable API
- Vendors isolated inside capabilities, capabilities expose stable API to domain
- UI must NOT import vendors directly, only via capabilities or domain or transport
- Enforce via new rules in architecture.ts: capability-isolation, vendor-isolation, layered-dependency

### 8. Testing & Verification

- Unit: Test addon parsing, billing provider interface, mode selection, defaults vs optional
- Integration: `ghostinit create --mode single --billing polar --json` creates src/server/services/ + src/app/billing/page.tsx + package.json contains @polar-sh/sdk
- Check: Architecture checker must pass for both monorepo and single
- Smoke: Create monorepo with billing all (4 providers) + eve + i18n, verify AGENTS.md exists, package.json workspaces, billing schema exists, webhooks routes exist raw body Buffer, billing page tabs, auth reset password pages, eve hybrid withEve config

### 9. Files to Modify/Create

- `src/lib/addons.ts` NEW — addon registry, billingProviders, modes, defaults, parseBillingInput, compatibility
- `src/templates/modes/` NEW — `monorepo.ts` (current default.ts logic + billing + services) + `single.ts` (flat Next.js)
- `packages/versions.ts` add billing providers + resend + next-intl + convex
- `src/templates/billing/` NEW — `providers/interface.ts`, `stripe.ts`, `chargily.ts`, `paddle.ts`, `polar.ts`, `domain/types.ts`, `application/`, `schema/`, `ui/billing-page.tsx`, `webhooks/`
- `src/templates/email/` NEW — resend client, templates forgot/reset
- `src/templates/services/` NEW — services layer default
- `src/templates/auth.ts` MODIFY — add sendResetPassword via Resend
- `src/templates/apps/core.ts` MODIFY — next.config.ts withEve hybrid already done, add billing deps conditional, add email
- `src/templates/apps/pages.ts` MODIFY — add billing page tabs + forgot-password + reset-password + agent page already exists useEveAgent
- `src/templates/root.ts` MODIFY — handle dual modes, workspaces conditional, .env.example includes billing + resend keys conditional
- `src/templates/default.ts` MODIFY — use modes/ + addons registry to merge conditional templates
- `src/cli.ts` MODIFY — add interactive prompts @clack/prompts when TTY, flags --billing, --mode, --features, --database, --ci
- `src/commands/create.ts` MODIFY — use addons registry, parse billing, pass to generateProjectFiles
- `src/commands/add.ts` MODIFY — add billing, i18n, service subcommands
- `src/lib/architecture.ts` MODIFY — new layered rules
- `src/lib/config.ts` MODIFY — projectConfigSchema add mode, billing, features, database fields
- `tests/` — new tests for addon parsing, billing providers, modes

### 10. Future — Ultracode Workflows

User wants ultracode — plan to use Workflow tool for implementation:
- Phase 1: Addon registry + CLI interactive + modes scaffolding
- Phase 2: Parallel agents — one per billing provider (stripe agent, chargily agent, paddle agent, polar agent) + email/resend agent + i18n agent + services layer agent — pipeline via pipeline() so each verified as soon as review completes, not barrier sync
- Phase 3: Shared billing tables + webhooks + UI synthesis (needs all providers results to dedup)
- Phase 4: Tests + review loop

---

## Self-Review

1. **Placeholder scan:** No TBD/TODO in design except intentional TODO comments for InputSchema extending (existing pattern). All sections have concrete details.
2. **Internal consistency:** Billing both/one/none/all flexible matches shared tables provider enum, raw body Buffer consistent across 4 providers, layered structure image adopted with GhostInit specifics, defaults vs optional consistent (auth/t3env/database/api/ui/services/TanStack/Zod always default, billing/eve/i18n optional none/false).
3. **Scope check:** Big but decomposable — addon registry + billing + modes + services + auth reset + i18n could be multiple loops. Recommend first loop: addon registry + billing (4 providers) + services layer + auth reset Resend + modes, keep i18n + convex as follow-up if needed. For this spec, include all requested but note implementation can be iterative via ultracode workflows.
4. **Ambiguity check:** "Both" for billing legacy means stripe+chargily, "all" means all 4 — explicit. Monorepo `packages/services/src/` vs single `server/services/` explicit. Import alias @ always explicit. No eve at first false default explicit. Resend for reset password via Better Auth sendResetPassword hook explicit. Raw body Buffer for webhooks explicit for all 4 providers.

---

## Next Steps

This spec covers flexible addon GhostInit with billing 4 providers selectable any combo, dual modes monorepo vs single, backend services layer default, full frontend E2E including auth reset via Resend, layered architecture by responsibility from image, interactive CLI hybrid.

If approved, invoke writing-plans skill to create implementation plan with ultracode workflow orchestration for parallel billing providers development.
