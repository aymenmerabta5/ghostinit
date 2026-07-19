export type ResponseLib = "NextResponse" | "Response";
export const sharedStripeImports = `import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@repo/database";
import { webhook_events, checkouts, subscriptions, invoices } from "@repo/database/schema/billing.js";
import { logger } from "@repo/observability";`;
export const stripeSecretCheck = `const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey || stripeSecretKey.startsWith("REPLACE_WITH")) throw new Error("STRIPE_SECRET_KEY is not configured - set server-only env var");
const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-03-31.basil" as any });`;

export function stripeWebhookCore(responseLib: ResponseLib): string {
  const jsonCall = responseLib === "NextResponse" ? "NextResponse.json" : "Response.json";
  return `  const sig = request.headers.get("stripe-signature");
  if (!sig) return ${jsonCall}({ ok: false, error: "Missing stripe-signature header" }, { status: 400 });
  const buf = Buffer.from(await request.arrayBuffer());
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!secret || secret.startsWith("REPLACE_WITH")) return ${jsonCall}({ ok: false, error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(buf, sig, secret); } catch (err: any) { logger.error(\`[webhook:stripe] invalid signature 403: \${err.message}\`); return ${jsonCall}({ ok: false, error: \`Webhook Error: \${err.message}\` }, { status: 403 }); }
  try { if (!db.query.webhook_events.findFirst) throw new Error("webhook_events query not available — ensure billing schema is migrated"); const existing = await db.query.webhook_events.findFirst({ where: eq(webhook_events.providerEventId, event.id) }); if (existing?.processed) return ${jsonCall}({ ok: true, alreadyProcessed: true, provider: "stripe", id: event.id }); } catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error(\`[webhook:stripe] idempotency check failed: \${message}\`); }
  try {
    switch (event.type) {
      case "checkout.session.completed": { const session = event.data.object as Stripe.Checkout.Session; try { if (session.id) await db.update(checkouts).set({ status: "completed" }).where(eq(checkouts.providerCheckoutId, session.id)); const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription as any)?.id; if (subId && session.client_reference_id) { const userId = (session.metadata as any)?.userId ?? session.client_reference_id; if (userId) await db.insert(subscriptions).values({ userId, provider: "stripe", providerSubscriptionId: subId, status: "active", metadata: session.metadata as any }).onConflictDoNothing(); } } catch (error) { logger.error(\`[stripe webhook] handler failed: \${error instanceof Error ? error.message : String(error)}\`); } break; }
      default: break;
    }
  } catch (e) { logger.error(\`[webhook:stripe] handler error \${e instanceof Error ? e.message : String(e)}\`); }
  try { await db.insert(webhook_events).values({ provider: "stripe", providerEventId: event.id, type: event.type, payload: event as any, processed: true }).onConflictDoNothing(); } catch (error) { logger.error(\`[stripe webhook] failed to record event: \${error instanceof Error ? error.message : String(error)}\`); }
  logger.info(\`[webhook:stripe] \${event.type} \${event.id} ok\`);
  return ${jsonCall}({ ok: true, provider: "stripe", type: event.type, id: event.id });`;
}

export function stripeWebhookFileContent(router: "next" | "tanstack"): string {
  const isNext = router === "next";
  if (isNext) {
    return `${sharedStripeImports}\n\n${stripeSecretCheck}\n\nexport async function POST(request: Request): Promise<NextResponse> {\n${stripeWebhookCore("NextResponse")}\n}\n`;
  }
  return `import { createFileRoute } from '@tanstack/react-router'\n${sharedStripeImports.replace(/"/g, "'")}\n\nconst stripeSecretKey = process.env.STRIPE_SECRET_KEY\nif (!stripeSecretKey || stripeSecretKey.startsWith('REPLACE_WITH')) throw new Error('STRIPE_SECRET_KEY is not configured - set server-only env var')\nconst stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-03-31.basil' as any })\n\nasync function POST(request: Request): Promise<Response> {\n${stripeWebhookCore("Response").replace(/NextResponse\.json/g, "Response.json")}\n}\n\nexport const Route = createFileRoute('/api/webhooks/stripe')({ server: { handlers: { POST }, }, })\n`;
}
