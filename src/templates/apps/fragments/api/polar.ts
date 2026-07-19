export function polarWebhookFileContent(router: "next" | "tanstack"): string {
  const core = (
    responseLib: "NextResponse" | "Response",
  ) => `  const secret = process.env.POLAR_WEBHOOK_SECRET ?? "";
  if (!secret || secret.startsWith("REPLACE_WITH")) return ${responseLib}.json({ ok: false, error: "POLAR_WEBHOOK_SECRET not configured" }, { status: 400 });
  const buf = Buffer.from(await request.arrayBuffer()); const headers: Record<string, string> = {}; request.headers.forEach((v, k) => { headers[k] = v; });
  let eventType: string; let eventId: string; let eventPayload: Record<string, unknown>;
  try { const { validateEvent } = await import("@polar-sh/sdk/webhooks"); const validated = validateEvent(buf, headers as any, secret) as any; eventType = validated.type ?? "unknown"; eventPayload = validated.data ?? validated; eventId = (validated.data as any)?.id ?? validated.id ?? \`evt_\${Date.now()}\`; } catch (err: any) { const name = err?.name ?? ""; const msg = err?.message ?? String(err); const isInvalid = name === "WebhookVerificationError" || msg.toLowerCase().includes("signature") || msg.toLowerCase().includes("verification") || msg.toLowerCase().includes("whsec"); logger.error(\`[webhook:polar] \${isInvalid ? "invalid signature 403" : "webhook error 400"}: \${msg}\`); return ${responseLib}.json({ ok: false, error: isInvalid ? \`Invalid polar signature 403: \${msg}\` : \`Webhook Error: \${msg}\` }, { status: isInvalid ? 403 : 400 }); }
  try { if (!db.query.webhook_events.findFirst) throw new Error("webhook_events query not available — ensure billing schema is migrated"); const existing = await db.query.webhook_events.findFirst({ where: eq(webhook_events.providerEventId, eventId) }); if (existing?.processed) return ${responseLib}.json({ ok: true, alreadyProcessed: true, provider: "polar", id: eventId }); } catch (error) { const message = error instanceof Error ? error.message : String(error); if (message.includes("webhook_events query not available")) { logger.error(\`[polar webhook] \${message}\`); throw error; } logger.error(\`[polar webhook] idempotency check failed: \${message}\`); }
  try { const data = eventPayload as any; switch (eventType) { case "subscription.created": case "subscription.active": case "subscription.updated": { try { const subId = data.id ?? eventId; const statusRaw = data.status ?? "active"; await db.insert(subscriptions).values({ userId: data.customerId ?? data.externalCustomerId ?? subId, provider: "polar", providerSubscriptionId: subId, status: statusRaw, metadata: data.metadata as any }).onConflictDoNothing(); await db.update(subscriptions).set({ status: statusRaw as any }).where(eq(subscriptions.providerSubscriptionId, subId)); } catch (error) { logger.error(\`[polar webhook] upsert failed: \${error instanceof Error ? error.message : String(error)}\`); } break; } default: break; } } catch (e) { logger.error(\`[webhook:polar] handler error \${e instanceof Error ? e.message : String(e)}\`); }
  try { await db.insert(webhook_events).values({ provider: "polar", providerEventId: eventId, type: eventType, payload: eventPayload as any, processed: true }).onConflictDoNothing(); } catch (error) { logger.error(\`[polar webhook] failed to record: \${error instanceof Error ? error.message : String(error)}\`); }
  logger.info(\`[webhook:polar] \${eventType} \${eventId} ok\`);
  return ${responseLib}.json({ ok: true, provider: "polar", type: eventType, id: eventId });`;
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
export const Route = createFileRoute('/api/webhooks/polar')({ server: { handlers: { POST }, }, })
`;
}
