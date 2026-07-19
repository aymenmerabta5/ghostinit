import { file, type TemplateFile } from "../../shared.js";

export function scheduleBillingRenewal(): TemplateFile {
  return file(
    "apps/eve/agent/schedules/billing-renewal.md",
    `---
cron: "0 2 1 * *"
---
# Billing Renewal — Monthly Recurring via Chargily Checkout (EDAHABIA/CIB)
Chargily is checkout-only, no native subscriptions. This schedule emulates recurring via DB subscriptions + monthly new checkout.
Env placeholders: REPLACE_WITH_CHARGILY_API_KEY REPLACE_WITH_CHARGILY_SECRET_KEY .env.example + real via secret() 48-byte base64url .env.local gitignored t3env server-only.
Monthly flow: Load subscriptions provider=chargily active periodEnd<=now, create new checkout via ChargilyClient createCheckout with checkout_url redirect, insert checkouts pending, update subscription periodEnd now+30d, notify past_due via email Resend EMAIL_FROM checkout_url or paymentLink url.
Steps:
1. Load subscriptions where provider=chargily status=active currentPeriodEnd <= now() limit 100 batch.
2. For each needing renewal: Ensure priceId valid, getProductPrices(product_id) fallback, createProduct name description images metadata, createPrice amount currency dzd product_id, createCheckout items price quantity success_url failure_url payment_method edahabia|cib locale pass_fees_to_customer collect_shipping_address customer_id metadata renewal previousSubscriptionId checkout_url redirect, createPaymentLink name items after_completion_message locale.
3. Insert checkouts provider=chargily providerCheckoutId=checkout.id url=checkout.checkout_url status=pending customerId priceId metadata, update subscription currentPeriodEnd = now + 30d
4. Handle past_due notify via email Resend EMAIL_FROM checkout_url or paymentLink url.
5. Webhook paid renewal verifies via verifySignature payload Buffer sig secret raw Buffer Buffer.from(await req.arrayBuffer()) NOT req.json() else 403 signature mismatch and Buffer.from(await request.arrayBuffer()) header signature 400 missing 403 invalid 200 ok.
File: agent/schedules/billing-renewal.md monthly cron for chargily manual recurring checkout EDAHABIA/CIB checkout-only server-only NEVER client.
`,
  );
}

export function scheduleBillingRenewalExample(): TemplateFile {
  return file(
    "apps/eve/agent/schedules/billing-renewal.example.ts",
    `import { defineSchedule } from "eve/schedules";
export default defineSchedule({ cron: "0 2 1 * *", markdown: "Monthly billing renewal Chargily checkout-only recurring via DB subscriptions + new checkout edahabia|cib createProduct createPrice createCheckout checkout_url redirect createPaymentLink after_completion_message verifySignature Buffer.from(await req.arrayBuffer()) Buffer.from(await request.arrayBuffer()) REPLACE_WITH_CHARGILY_API_KEY" });
`,
  );
}
