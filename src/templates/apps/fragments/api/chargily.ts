export type ResponseLib = "NextResponse" | "Response";

export const chargilySharedCore = (responseLib: ResponseLib): string => {
  const json = responseLib === "NextResponse" ? "NextResponse.json" : "Response.json";
  return `  const sig = request.headers.get("signature");
  if (!sig) return ${json}({ ok: false, error: "Missing signature header (chargily)" }, { status: 400 });
  const buf = Buffer.from(await request.arrayBuffer());
  const secret = process.env.CHARGILY_SECRET_KEY ?? process.env.CHARGILY_WEBHOOK_SECRET ?? "";
  if (!secret || secret.startsWith("REPLACE_WITH")) return ${json}({ ok: false, error: "CHARGILY_SECRET_KEY missing - server-only" }, { status: 400 });
  let valid = false;
  try { valid = verifySignature(buf, sig, secret); } catch (err) { const msg = err instanceof Error ? err.message : String(err); return ${json}({ ok: false, error: \`Invalid chargily signature 403: \${msg}\` }, { status: 403 }); }
  if (!valid) return ${json}({ ok: false, error: "Invalid chargily signature 403" }, { status: 403 });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(buf.toString("utf-8")) as Record<string, unknown>; } catch { return ${json}({ ok: false, error: "Invalid JSON payload" }, { status: 400 }); }
  const data = (payload.data as Record<string, unknown> | undefined) ?? (payload.checkout as Record<string, unknown> | undefined) ?? payload;
  const eventId = (payload.id as string | undefined) ?? (data.id as string | undefined) ?? (payload.event_id as string | undefined) ?? \`evt_\${Date.now().toString(36)}_\${Math.random().toString(36).slice(2, 8)}\`;
  const eventType = (payload.type as string | undefined) ?? (payload.event as string | undefined) ?? \`checkout.\${(data.status as string | undefined) ?? "updated"}\`;
  try { if (!db.query.webhook_events.findFirst) throw new Error("webhook_events query not available — ensure billing schema is migrated"); const existing = await db.query.webhook_events.findFirst({ where: eq(webhook_events.providerEventId, eventId) }); if (existing?.processed) return ${json}({ ok: true, alreadyProcessed: true, provider: "chargily", id: eventId }); } catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error(\`[chargily webhook] idempotency check failed: \${message}\`); }
  try {
    const status = (data.status as string | undefined) ?? (payload.status as string | undefined);
    const checkoutId = (data.id as string | undefined) ?? (payload.id as string | undefined);
    if (eventType === "checkout.paid" || eventType === "checkout.completed" || status === "paid" || status === "completed") {
      if (checkoutId) {
        try { await db.update(checkouts).set({ status: "completed" }).where(eq(checkouts.providerCheckoutId, checkoutId)); } catch (error) { logger.error(\`[chargily webhook] update failed: \${error instanceof Error ? error.message : String(error)}\`); }
        try { const meta = (data.metadata as Record<string, unknown> | undefined) ?? payload.metadata as Record<string, unknown> | undefined; const userId = (meta?.userId as string | undefined) ?? (meta?.chargily_user_id as string | undefined); if (userId) await db.insert(subscriptions).values({ userId, provider: "chargily", providerSubscriptionId: checkoutId, status: "active", metadata: meta as any }).onConflictDoNothing(); } catch (error) { logger.error(\`[chargily webhook] create sub failed: \${error instanceof Error ? error.message : String(error)}\`); }
      }
    }
  } catch (e) { logger.error(\`[webhook:chargily] handler error \${e instanceof Error ? e.message : String(e)}\`); }
  try { await db.insert(webhook_events).values({ provider: "chargily", providerEventId: eventId, type: eventType, payload: payload as any, processed: true }).onConflictDoNothing(); } catch (error) { logger.error(\`[chargily webhook] failed to record: \${error instanceof Error ? error.message : String(error)}\`); }
  logger.info(\`[webhook:chargily] \${eventType} \${eventId} ok\`);
  return ${json}({ ok: true, provider: "chargily", type: eventType, id: eventId });`;
};

export function chargilyWebhookFileContent(router: "next" | "tanstack"): string {
  const isNext = router === "next";
  if (isNext) {
    return `import { NextResponse } from "next/server";
import { verifySignature } from "@chargily/chargily-pay";
import { eq } from "drizzle-orm";
import { db } from "@repo/database";
import { webhook_events, checkouts, subscriptions } from "@repo/database/schema/billing.js";
import { logger } from "@repo/observability";
export async function POST(request: Request): Promise<NextResponse> {
${chargilySharedCore("NextResponse")}
}
`;
  }
  return `import { createFileRoute } from '@tanstack/react-router'
import { verifySignature } from '@chargily/chargily-pay'
import { eq } from 'drizzle-orm'
import { db } from '@repo/database'
import { webhook_events, checkouts, subscriptions } from '@repo/database/schema/billing.js'
import { logger } from '@repo/observability'
async function POST(request: Request): Promise<Response> {
${chargilySharedCore("Response")}
}
export const Route = createFileRoute('/api/webhooks/chargily')({ server: { handlers: { POST }, }, })
`;
}
