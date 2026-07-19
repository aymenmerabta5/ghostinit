export function paddleWebhookFileContent(router: "next" | "tanstack"): string {
  const core = (
    responseLib: "NextResponse" | "Response",
  ) => `  const sig = request.headers.get("paddle-signature");
  if (!sig) return ${responseLib}.json({ ok: false, error: "Missing paddle-signature header" }, { status: 400 });
  const buf = Buffer.from(await request.arrayBuffer()); const rawBody = buf.toString("utf-8");
  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? ""; if (!secret || secret.startsWith("REPLACE_WITH")) return ${responseLib}.json({ ok: false, error: "PADDLE_WEBHOOK_SECRET not configured" }, { status: 400 });
  let eventType: string; let eventId: string; let eventData: Record<string, unknown>;
  try { const { Paddle, Environment } = await import("@paddle/paddle-node-sdk"); const paddle = new Paddle(process.env.PADDLE_API_KEY ?? "", { environment: (process.env.PADDLE_ENVIRONMENT === "production" ? Environment.production : Environment.sandbox) as any }); const ev = (await paddle.webhooks.unmarshal(rawBody, secret, sig)) as any; eventType = ev.eventType; eventId = ev.eventId ?? ev.id ?? \`evt_\${Date.now()}\`; eventData = ev.data ?? ev; } catch (err: any) { const msg = err?.message ?? String(err); const isInvalid = msg.toLowerCase().includes("signature") || msg.toLowerCase().includes("invalid"); logger.error(\`[webhook:paddle] Webhook Error: \${msg}\`); return ${responseLib}.json({ ok: false, error: \`Webhook Error: \${msg}\` }, { status: isInvalid ? 403 : 400 }); }
  try { if (!db.query.webhook_events.findFirst) throw new Error("webhook_events query not available — ensure billing schema is migrated"); const existing = await db.query.webhook_events.findFirst({ where: eq(webhook_events.providerEventId, eventId) }); if (existing?.processed) return ${responseLib}.json({ ok: true, alreadyProcessed: true, provider: "paddle", id: eventId }); } catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error(\`[webhook:paddle] idempotency check failed: \${message}\`); }
  try {
    const customData = (eventData as any).customData as Record<string, unknown> | undefined; const txnId = (eventData as any).id ?? eventId; const customerId = (eventData as any).customerId ?? (eventData as any).customer_id;
    switch (eventType) {
      case "transaction_completed": case "TransactionCompleted": case "transaction.completed": { try { await db.update(checkouts).set({ status: "completed" }).where(eq(checkouts.providerCheckoutId, txnId)); const userId = (customData?.userId as string | undefined) ?? (customData?.user_id as string | undefined); const subId = (eventData as any).subscriptionId ?? (eventData as any).subscription_id ?? txnId; if (userId && subId) await db.insert(subscriptions).values({ userId, provider: "paddle", providerSubscriptionId: subId, status: "active", customerId: customerId as any, metadata: customData as any }).onConflictDoNothing(); } catch (error) { logger.error(\`[paddle webhook] transaction_completed failed: \${error instanceof Error ? error.message : String(error)}\`); } break; }
      default: break;
    }
  } catch (e) { logger.error(\`[webhook:paddle] handler error \${e instanceof Error ? e.message : String(e)}\`); }
  try { await db.insert(webhook_events).values({ provider: "paddle", providerEventId: eventId, type: eventType, payload: eventData as any, processed: true }).onConflictDoNothing(); } catch (error) { logger.error(\`[paddle webhook] failed to record: \${error instanceof Error ? error.message : String(error)}\`); }
  logger.info(\`[webhook:paddle] \${eventType} \${eventId} ok\`);
  return ${responseLib}.json({ ok: true, provider: "paddle", type: eventType, id: eventId });`;
  if (router === "next") {
    return `import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@repo/database";
import { webhook_events, checkouts, subscriptions, invoices } from "@repo/database/schema/billing.js";
import { logger } from "@repo/observability";
export async function POST(request: Request): Promise<NextResponse> {
${core("NextResponse")}
}
`;
  }
  return `import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '@repo/database'
import { webhook_events, checkouts, subscriptions, invoices } from '@repo/database/schema/billing.js'
import { logger } from '@repo/observability'
async function POST(request: Request): Promise<Response> {
${core("Response")}
}
export const Route = createFileRoute('/api/webhooks/paddle')({ server: { handlers: { POST }, }, })
`;
}
