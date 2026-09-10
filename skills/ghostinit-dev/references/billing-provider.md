# Adding New Billing Provider — Dev Deep Dive

## Canonical Example: Stripe

Reference files: `src/templates/billing/providers/stripe/`

- api-version.ts — `STRIPE_API_VERSION = "2026-07-29.dahlia"`, kept in lockstep with exact `stripe@22.5.0`.
- client.ts — `getStripeClient()` validates the server-only key and passes the pinned Dahlia API version.
- checkout.ts — `createStripeCheckout(stripe, input)` uses `stripe.checkout.sessions.create` with request-key idempotency and ownership metadata.
- customer.ts — `createStripeCustomer(stripe, input)` uses hashed idempotency keys and actor metadata.
- portal.ts — `stripe.billingPortal.sessions.create`.
- webhook.ts — bounded raw `Buffer` + `await stripe.webhooks.constructEventAsync(raw, signature, secret)` (required by Bun/worker SubtleCrypto).
- subscriptions.ts — `listStripeSubscriptions(stripe, input)` with typed status filtering.
- mappers.ts — Stripe → BillingSubscription internal.
- host-only.d.ts — host typecheck shim only; the billing generator does not emit it.
- `src/templates/billing/providers/stripe.ts` — explicit named provider barrel and factory.

## Chargily (Algeria) Differences

- Checkout-only and server-only, with no customer portal. Renewals require a new customer-authorized checkout; the generated application does not promise automatic recurring debits.
- Docs say meant to be ONLY used in server-side → checker flags client-boundary if UI imports directly; UI must go via `@repo/billing` capability.
- Payment link vs checkout session.
- HMAC webhook verify.

## Paddle / Polar Differences

- Paddle uses a public client-side token for Paddle.js and separate server API/webhook credentials. Never put an API key or notification secret in a public client-token variable.
- Polar usage ingestion is a trusted-server adapter, not a browser operation. License keys are created by configured benefit grants; manual license issuance explicitly returns `NOT_SUPPORTED`. Existing license/usage records may appear in account snapshots. Server credentials remain private.

## Adding an online provider `myprovider`

Manual payments are a separate receipt-review workflow, not an online SDK or
webhook provider. Keep manual out of provider factories and SDK dependency maps.
Classify a new online provider explicitly in the selection policy: global
providers are mutually exclusive, with optional Chargily and manual payments.

1. `packages/versions/src/index.ts` billing group:

```ts
export const billing = {
  stripe: "22.5.0",
  "@chargily/chargily-pay": "2.1.0",
  "@paddle/paddle-node-sdk": "3.10.0",
  "@paddle/paddle-js": "1.6.5",
  "@polar-sh/sdk": "0.49.0",
  "@polar-sh/nextjs": "0.9.6",
  "myprovider-sdk": "1.0.0",
} as const;
```

2. Provider choices live in `src/domain/project/choices.ts`; `src/lib/constants.ts`
   re-exports them. For a new global provider, extend both online and global choices
   without dropping the manual workflow:

```ts
export const ONLINE_BILLING_PROVIDERS = [
  "stripe",
  "chargily",
  "paddle",
  "polar",
  "myprovider",
] as const;
export const GLOBAL_BILLING_PROVIDERS = ["stripe", "paddle", "polar", "myprovider"] as const;
export const BILLING_PROVIDERS = [...ONLINE_BILLING_PROVIDERS, "manual"] as const;
```

Keep `src/domain/project/billing-selection.ts`, config schemas and public support
metadata consistent. Add vendor placeholders to the environment manifest:

```ts
export const ENV_PLACEHOLDERS = {
  ...,
  MYPROVIDER_API_KEY: "REPLACE_WITH_MYPROVIDER_API_KEY",
  MYPROVIDER_WEBHOOK_SECRET: "REPLACE_WITH_MYPROVIDER_WEBHOOK_SECRET",
} as const;
```

3. Register actual client operations in `src/domain/capabilities/billing-provider-operations.ts` and the support-catalog schema. The compiler derives effective acceptance requirements from the selected provider set; UI controls and server portal admission use the same domain policy. Then add `src/templates/billing/providers/myprovider/` with small capability modules `<300 LOC` each; use `// @allow-long <LOC>: <reason>` only when justified. Start from `client.ts`, `checkout.ts`, `customer.ts`, `webhook.ts`, and `subscriptions.ts`; add portal, mapper, licensing, usage, product, or payment-link modules only when the provider supports them.

client.ts pattern:

```ts
export function getMyProviderClient() {
  const key = process.env.MYPROVIDER_API_KEY;
  if (!key || key.startsWith("REPLACE_WITH_"))
    throw new Error("MYPROVIDER_API_KEY placeholder not set");
  // The exact SDK version belongs in the generated package manifest via v.billing.
  return new MyProvider(key);
}
```

checkout.ts, customer.ts, portal.ts (if unsupported throw), webhook.ts raw body pattern:

```ts
export async function verifyMyProviderWebhook(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get("myprovider-signature");
  // verify
  return { verified: true, providerEventId: "...", event: parsed };
}
```

subscriptions.ts, mappers.ts.

Barrel `index.ts` explicit named only.

4. `src/templates/billing/providers/interface/types.ts` if interface-based:

```ts
export const BILLING_PROVIDER_NAMES = [
  "stripe",
  "chargily",
  "paddle",
  "polar",
  "myprovider",
] as const;
```

5. Webhook factory `billing/webhooks/factory.ts`:

```ts
export function billingWebhookFilesByProvider(p: BillingProviderName) {
  switch (p) {
    case "myprovider":
      return myProviderWebhookFiles();
  }
}
```

Create `webhooks/providers/myprovider.ts` webhook route files (Next + optional TanStack variants `myprovider-next.ts` `myprovider-tanstack.ts`):

- Next monorepo: `apps/web/src/app/api/webhooks/myprovider/route.ts`
- Next single: `src/app/api/webhooks/myprovider/route.ts`
- TanStack monorepo: `apps/web/src/routes/api/webhooks/myprovider.ts`
- TanStack single: `src/routes/api/webhooks/myprovider.ts`

```ts
import { file } from "../../shared.js";
export function myProviderWebhookFiles() {
  return [
    file(
      "apps/web/src/app/api/webhooks/myprovider/route.ts",
      `
import { verifyMyProviderWebhook } from "@repo/billing/providers/myprovider";
export async function POST(req: Request) {
  const raw = await readBoundedWebhookBody(req);
  if (raw instanceof Response) return raw;
  // verify + idempotent webhook_events unique
}
`,
    ),
  ];
}
```

6. Env `shared/env/billing.ts`:

```ts
export function billingEnvLines(selected: BillingProviderName[]) {
  const has = (n: BillingProviderName) => selected.includes(n);
  if (has("myprovider")) {
    out.push("# MyProvider");
    out.push(`MYPROVIDER_API_KEY=${ENV_PLACEHOLDERS.MYPROVIDER_API_KEY}`);
    ...
  }
}
export function billingEnvLocalLinesFiltered(...) similar.
```

7. Add `MYPROVIDER_*` ownership to the environment manifest and builders so generated Turbo inputs include it exactly when the provider is selected.

8. UI `billing/ui/billing-page.tsx` conditional panel per provider + `ui/components/providers/myprovider.ts` panel.

9. Tests:

```bash
bun test tests/unit/billing-*.test.ts tests/unit/addons.test.ts --timeout 100000
mkdir /tmp/gi-test && bunx ghostinit create demo --billing myprovider --yes --no-install --cwd /tmp/gi-test
cat /tmp/gi-test/demo/.env.example | grep MYPROVIDER
cat /tmp/gi-test/demo/turbo.json | grep MYPROVIDER
cat /tmp/gi-test/demo/packages/billing/src/providers/myprovider/ - list
```

10. Docs sync same PR: `AGENTS.md#architecture` + CONTRIBUTING.md + skills/ghostinit-use/references/billing.md + skills/ghostinit-dev/references/billing-provider.md. Update `evidence/compatibility/v1-to-v2.json` and its schema when the public provider/CLI migration mapping changes.

## Patterns to Follow

- Server-only secrets never client.
- Emit client-safe publishable keys and client tokens through `publicVarLines(audience, name, value)`: only selected Next (`NEXT_PUBLIC_*`), TanStack/desktop (`VITE_*`), and Expo (`EXPO_PUBLIC_*`) audiences receive them. Never combine server secrets with a client runtime schema.
- Idempotent webhook_events unique (provider+providerEventId) onConflictDoNothing.
- DRY via factory, not duplication.
- Explicit named re-exports only, never `export *`.
- Versions via `v.*` never hardcode.
