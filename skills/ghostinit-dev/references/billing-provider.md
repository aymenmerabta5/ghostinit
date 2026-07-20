# Adding New Billing Provider — Dev Deep Dive

## Canonical Example: Stripe

Reference files: `src/templates/billing/providers/stripe/`

- client.ts — `getStripeClient()` validates key not placeholder, pinned apiVersion basil.
- checkout.ts — `createStripeCheckoutSession(userId, priceId)` via `stripe.checkout.sessions.create`.
- customer.ts — getOrCreate by metadata userId.
- portal.ts — `stripe.billingPortal.sessions.create`.
- webhook.ts — `Buffer.from(await request.arrayBuffer())` + `stripe.webhooks.constructEvent(raw, signature, secret)`.
- subscriptions.ts — list/cancel mapped.
- mappers.ts — Stripe → BillingSubscription internal.
- index.ts explicit named re-exports only.

## Chargily (Algeria) Differences

- checkout-only, server-only, manual recurring cron, no portal → portal.ts throws `checkout-only: portal not supported`.
- Docs say meant to be ONLY used in server-side → checker flags client-boundary if UI imports directly; UI must go via `@repo/billing` capability.
- Payment link vs checkout session.
- HMAC webhook verify.

## Paddle / Polar Differences

- Paddle MoR 5%+50c + client token `pdl_ntf_` + environment sandbox/live + webhook secret.
- Polar MoR open-source 4% + metering + license keys + usage_events + org id.

## Step-by-Step Adding 5th Provider `myprovider`

1. `packages/versions/src/index.ts` billing group:

```ts
export const billing = {
  stripe: "19.1.0",
  "@chargily/chargily-pay": "2.1.0",
  "@paddle/paddle-node-sdk": "3.8.0",
  "@paddle/paddle-js": "1.6.4",
  "@polar-sh/sdk": "0.48.1",
  "@polar-sh/nextjs": "0.9.6",
  "myprovider-sdk": "1.0.0",
} as const;
```

2. `src/lib/constants.ts`:

```ts
export const BILLING_PROVIDERS = ["stripe","chargily","paddle","polar","myprovider"] as const;
export const ENV_PLACEHOLDERS = {
  ...,
  MYPROVIDER_API_KEY: "REPLACE_WITH_MYPROVIDER_API_KEY",
  MYPROVIDER_WEBHOOK_SECRET: "REPLACE_WITH_MYPROVIDER_WEBHOOK_SECRET",
} as const;
```

3. Folder `src/templates/billing/providers/myprovider/` 7 files `<300 LOC` each use `// @allow-long <LOC>: <reason>` if legit:

client.ts pattern:

```ts
import * as v from "../../../versions.js";
export function getMyProviderClient() {
  const key = process.env.MYPROVIDER_API_KEY;
  if (!key || key.startsWith("REPLACE_WITH_"))
    throw new Error("MYPROVIDER_API_KEY placeholder not set");
  // init SDK via v.billing["myprovider-sdk"]
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

```ts
import { file } from "../../shared.js";
export function myProviderWebhookFiles() {
  return [
    file(
      "apps/web/src/app/api/billing/webhooks/myprovider/route.ts",
      `
import { verifyMyProviderWebhook } from "@repo/billing/providers/myprovider";
export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
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

7. Turbo globalEnv `root.ts` `turbo()` + root `turbo.json` + `shared/env` exhaustive 50+ list — add `MYPROVIDER_*` vars.

8. UI `billing/ui/billing-page.tsx` conditional panel per provider + `ui/components/providers/myprovider.ts` panel.

9. Tests:

```bash
bun test tests/unit/billing-*.test.ts tests/unit/addons.test.ts --timeout 100000
mkdir /tmp/gi-test && bunx ghostinit create demo --billing myprovider --yes --no-install --cwd /tmp/gi-test
cat /tmp/gi-test/demo/.env.example | grep MYPROVIDER
cat /tmp/gi-test/demo/turbo.json | grep MYPROVIDER
cat /tmp/gi-test/demo/packages/billing/src/providers/myprovider/ - list
```

10. Docs sync same PR: AGENTS.md + ARCHITECTURE.md + CONTRIBUTING.md + skills/ghostinit-use/references/billing.md + skills/ghostinit-dev/references/billing-provider.md.

## Patterns to Follow

- Server-only secrets never client.
- Client-safe publishable/client token dual emit NEXT_PUBLIC_* + VITE_*.
- Idempotent webhook_events unique (provider+providerEventId) onConflictDoNothing.
- DRY via factory, not duplication.
- Explicit named re-exports only, never `export *`.
- Versions via `v.*` never hardcode.
