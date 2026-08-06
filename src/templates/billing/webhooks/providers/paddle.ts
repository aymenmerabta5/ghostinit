import { convexApiFor, type DbImports, type ConvexImports } from "./shared.js";

type ConvexImp = ConvexImports;

function baseNext(imp: DbImports): string {
  return [
    'import { eq } from "drizzle-orm";',
    `import { db } from "${imp.db}";`,
    `import { webhook_events, checkouts, subscriptions, invoices } from "${imp.billingSchema}";`,
    `import { logger } from "${imp.observability}";`,
    "",
    "export async function POST(req: Request): Promise<Response> {",
    '  const sig = req.headers.get("paddle-signature");',
    '  if (!sig) { logger.warn("[paddle webhook] missing paddle-signature header"); return new Response("Missing paddle-signature header", { status: 400 }); }',
    "  const buf = Buffer.from(await req.arrayBuffer());",
    '  const rawBody = buf.toString("utf-8");',
    '  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? "";',
    '  if (!secret || secret.startsWith("REPLACE_WITH")) { logger.error("[paddle webhook] PADDLE_WEBHOOK_SECRET not configured"); return new Response("PADDLE_WEBHOOK_SECRET not configured", { status: 400 }); }',
    "  let event: { eventType: string; eventId: string; data: Record<string, unknown>; occurredAt?: string };",
    '  try { const { Paddle, Environment } = await import("@paddle/paddle-node-sdk"); const paddle = new Paddle(process.env.PADDLE_API_KEY ?? "", { environment: (process.env.PADDLE_ENVIRONMENT === "production" ? Environment.production : Environment.sandbox) as any, }); const ev = (await paddle.webhooks.unmarshal(rawBody, secret, sig)) as any; event = { eventType: ev.eventType, eventId: ev.eventId ?? ev.id ?? `evt_${Date.now()}`, data: ev.data as Record<string, unknown>, occurredAt: ev.occurredAt, }; } catch (err: any) { const msg = err?.message ?? String(err); const isInvalid = msg.toLowerCase().includes("signature") || msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("verification"); logger.error(`[paddle webhook] ${isInvalid ? "signature verification failed 403" : "webhook error 400"}: ${msg}`); return new Response(isInvalid ? "Invalid paddle signature" : "Webhook Error", { status: isInvalid ? 403 : 400 }); }',
    '  try { if (!db.query.webhook_events.findFirst) { throw new Error("webhook_events query not available — ensure billing schema is migrated"); } const existing = await db.query.webhook_events.findFirst({ where: eq(webhook_events.providerEventId, event.eventId), }); if (existing?.processed) { logger.info(`[paddle webhook] already processed ${event.eventId}`); return new Response("already processed", { status: 200 }); } } catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error(`[paddle webhook] idempotency check failed: ${message}`); }',
    '  try { const data = event.data as Record<string, unknown>; const txnId = (data.id as string | undefined) ?? (event.eventId as string); const customData = data.customData as Record<string, unknown> | undefined; const customerId = (data.customerId as string | undefined) ?? (data as any).customer_id; switch (event.eventType) { case "transaction_completed": case "TransactionCompleted": case "transaction.completed": { try { if (txnId) { await db.update(checkouts).set({ status: "completed" }).where(eq(checkouts.providerCheckoutId, txnId)); } const userId = (customData?.userId as string | undefined) ?? (customData?.user_id as string | undefined); const subId = (data.subscriptionId as string | undefined) ?? (data as any).subscription_id ?? txnId; if (userId && subId) { await db.insert(subscriptions).values({ userId, provider: "paddle", providerSubscriptionId: subId, status: "active", customerId: customerId as any, metadata: customData as any, }).onConflictDoNothing(); } } catch (error) { logger.error(`[paddle webhook] transaction_completed handler failed: ${error instanceof Error ? error.message : String(error)}`); } break; } case "transaction_paid": case "TransactionPaid": case "transaction.paid": { try { await db.insert(invoices).values({ provider: "paddle", providerInvoiceId: txnId, paid: true, amount: (data as any).details?.totals?.total ? Number.parseInt((data as any).details.totals.total, 10) : 0, status: "paid", }).onConflictDoNothing(); } catch (error) { logger.error(`[paddle webhook] transaction_paid handler failed: ${error instanceof Error ? error.message : String(error)}`); } break; } case "subscription_created": case "SubscriptionCreated": case "subscription.created": { try { const userId = (customData?.userId as string | undefined) ?? ""; if (userId && txnId) { await db.insert(subscriptions).values({ userId, provider: "paddle", providerSubscriptionId: txnId, status: "active", customerId: customerId as any, metadata: customData as any, }).onConflictDoNothing(); } } catch (error) { logger.error(`[paddle webhook] subscription_created failed: ${error instanceof Error ? error.message : String(error)}`); } break; } case "subscription_canceled": case "SubscriptionCanceled": case "subscription.canceled": { try { await db.update(subscriptions).set({ status: "canceled" as any }).where(eq(subscriptions.providerSubscriptionId, txnId)); } catch (error) { logger.error(`[paddle webhook] subscription_canceled failed: ${error instanceof Error ? error.message : String(error)}`); } break; } default: break; } } catch (error) { logger.error(`[paddle webhook] handler error: ${error instanceof Error ? error.message : String(error)}`); }',
    '  try { await db.insert(webhook_events).values({ provider: "paddle", providerEventId: event.eventId, type: event.eventType, payload: event.data as any, processed: true, }).onConflictDoNothing(); } catch (error) { logger.error(`[paddle webhook] failed to record event: ${error instanceof Error ? error.message : String(error)}`); }',
    '  logger.info(`[paddle webhook] processed ${event.eventType} ${event.eventId}`); return new Response("ok", { status: 200 });',
    "}",
  ].join("\n");
}

function convexNext(imp: DbImports): string {
  const convexImport = `import { convexClient } from "${imp.db}";`;
  const apiImport = `import { api } from "${convexApiFor(imp, "paddle", "next")}";`;
  return [
    convexImport,
    apiImport,
    `import { logger } from "${imp.observability}";`,
    "export async function POST(req: Request): Promise<Response> {",
    '  const sig = req.headers.get("paddle-signature");',
    '  if (!sig) return new Response("Missing signature", { status: 400 });',
    '  const buf = Buffer.from(await req.arrayBuffer()); const rawBody = buf.toString("utf-8");',
    '  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? "";',
    '  if (!secret || secret.startsWith("REPLACE_WITH")) return new Response("PADDLE_WEBHOOK_SECRET not configured", { status: 400 });',
    "  let eventType: string; let eventId: string; let eventData: Record<string, unknown>;",
    '  try { const { Paddle, Environment } = await import("@paddle/paddle-node-sdk"); const paddle = new Paddle(process.env.PADDLE_API_KEY ?? "", { environment: (process.env.PADDLE_ENVIRONMENT === "production" ? Environment.production : Environment.sandbox) as any }); const ev = (await paddle.webhooks.unmarshal(rawBody, secret, sig)) as any; eventType = ev.eventType; eventId = ev.eventId ?? ev.id ?? `evt_${Date.now()}`; eventData = ev.data ?? ev; } catch (err: any) { const msg = err?.message ?? String(err); const isInvalid = msg.toLowerCase().includes("signature"); logger.error(`[paddle] ${msg}`); return new Response("Webhook Error", { status: isInvalid ? 403 : 400 }); }',
    '  try { const existing = await convexClient.query(api.billing.checkWebhookEvent, { provider: "paddle", providerEventId: eventId }); if ((existing as any)?.processed) { logger.info(`[paddle] already processed ${eventId}`); return new Response("already processed", { status: 200 }); } } catch (e) { logger.error(`[paddle] idempotency fail ${e instanceof Error ? e.message : String(e)}`); }',
    '  try { const customData = (eventData as any).customData; const txnId = (eventData as any).id ?? eventId; if (eventType.includes("transaction_completed") || eventType.includes("completed")) { await convexClient.mutation(api.billing.upsertCheckout, { provider: "paddle", providerCheckoutId: txnId as string, status: "completed" as any, customerId: (eventData as any).customerId ?? (eventData as any).customer_id, metadata: customData as any }); const userId = (customData as any)?.userId ?? (customData as any)?.user_id; const subId = (eventData as any).subscriptionId ?? txnId; if (userId && subId) await convexClient.mutation(api.billing.upsertSubscription, { userId, provider: "paddle", providerSubscriptionId: subId as string, status: "active" as any, customerId: (eventData as any).customerId, metadata: customData as any }); } } catch (e) { logger.error(`[paddle] handler error ${e instanceof Error ? e.message : String(e)}`); }',
    '  try { await convexClient.mutation(api.billing.upsertWebhookEvent, { provider: "paddle", providerEventId: eventId, type: eventType, payload: eventData as any, processed: true }); } catch (e) { logger.error(`[paddle] record fail ${e instanceof Error ? e.message : String(e)}`); }',
    '  logger.info(`[paddle] processed ${eventType} ${eventId}`); return new Response("ok", { status: 200 });',
    "}",
  ].join("\n");
}

function tanstackBase(imp: DbImports): string {
  return [
    "import { createFileRoute } from '@tanstack/react-router'",
    "import { eq } from 'drizzle-orm'",
    `import { db } from '${imp.db}'`,
    `import { webhook_events, checkouts, subscriptions, invoices } from '${imp.billingSchema}'`,
    `import { logger } from '${imp.observability}'`,
    "async function POST({ request }: { request: Request }): Promise<Response> {",
    "  const sig = request.headers.get('paddle-signature')",
    "  if (!sig) return Response.json({ ok: false, error: 'Missing signature' }, { status: 400 })",
    "  const buf = Buffer.from(await request.arrayBuffer())",
    "  const rawBody = buf.toString('utf-8')",
    "  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? ''",
    "  if (!secret || secret.startsWith('REPLACE_WITH')) return Response.json({ ok: false, error: 'secret not configured' }, { status: 400 })",
    "  let eventType: string; let eventId: string; let eventData: Record<string, unknown>;",
    "  try { const { Paddle, Environment } = await import('@paddle/paddle-node-sdk'); const paddle = new Paddle(process.env.PADDLE_API_KEY ?? '', { environment: (process.env.PADDLE_ENVIRONMENT === 'production' ? Environment.production : Environment.sandbox) as any }); const ev = (await paddle.webhooks.unmarshal(rawBody, secret, sig)) as any; eventType = ev.eventType; eventId = ev.eventId ?? ev.id ?? `evt_${Date.now()}`; eventData = ev.data ?? ev; } catch (err: any) { const msg = err?.message ?? String(err); const isInvalid = msg.toLowerCase().includes('signature'); logger.error(`[paddle] ${msg}`); return Response.json({ ok: false, error: 'Webhook Error' }, { status: isInvalid ? 403 : 400 }) }",
    "  try { const existing = await db.query.webhook_events.findFirst({ where: eq(webhook_events.providerEventId, eventId) }); if (existing?.processed) return Response.json({ ok: true, alreadyProcessed: true }) } catch (e) { logger.error(`[paddle] idempotency fail ${e instanceof Error ? e.message : String(e)}`) }",
    "  try { const customData = (eventData as any).customData; const txnId = (eventData as any).id ?? eventId; if (eventType.includes('completed')) { await db.update(checkouts).set({ status: \"completed\" as any }).where(eq(checkouts.providerCheckoutId, txnId)); const userId = (customData as any)?.userId ?? (customData as any)?.user_id; const subId = (eventData as any).subscriptionId ?? txnId; if (userId && subId) await db.insert(subscriptions).values({ userId, provider: 'paddle', providerSubscriptionId: subId, status: 'active', customerId: (eventData as any).customerId as any, metadata: customData as any }).onConflictDoNothing() } } catch (e) { logger.error(`[paddle] handler error ${e instanceof Error ? e.message : String(e)}`) }",
    "  try { await db.insert(webhook_events).values({ provider: 'paddle', providerEventId: eventId, type: eventType, payload: eventData as any, processed: true }).onConflictDoNothing() } catch (e) { logger.error(`[paddle] record fail`) }",
    "  logger.info(`[paddle] ${eventType} ${eventId} ok`); return Response.json({ ok: true, provider: 'paddle', type: eventType, id: eventId })",
    "}",
    "export const Route = createFileRoute('/api/webhooks/paddle')({ server: { handlers: { POST } } })",
  ].join("\n");
}

function tanstackConvex(imp: DbImports): string {
  const convexImport = `import { convexClient } from '${imp.db}'`;
  const apiImport = `import { api } from '${convexApiFor(imp, "paddle", "tanstack")}'`;
  return [
    "import { createFileRoute } from '@tanstack/react-router'",
    convexImport,
    apiImport,
    `import { logger } from '${imp.observability}'`,
    "async function POST({ request }: { request: Request }): Promise<Response> {",
    "  const sig = request.headers.get('paddle-signature')",
    "  if (!sig) return Response.json({ ok: false, error: 'Missing signature' }, { status: 400 })",
    "  const buf = Buffer.from(await request.arrayBuffer()); const rawBody = buf.toString('utf-8');",
    "  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? ''",
    "  if (!secret || secret.startsWith('REPLACE_WITH')) return Response.json({ ok: false, error: 'secret not configured' }, { status: 400 })",
    "  let eventType: string; let eventId: string; let eventData: Record<string, unknown>;",
    "  try { const { Paddle, Environment } = await import('@paddle/paddle-node-sdk'); const paddle = new Paddle(process.env.PADDLE_API_KEY ?? '', { environment: (process.env.PADDLE_ENVIRONMENT === 'production' ? Environment.production : Environment.sandbox) as any }); const ev = (await paddle.webhooks.unmarshal(rawBody, secret, sig)) as any; eventType = ev.eventType; eventId = ev.eventId ?? ev.id ?? `evt_${Date.now()}`; eventData = ev.data ?? ev; } catch (err: unknown) { const msg = err instanceof Error ? err.message : String(err); const isInvalid = msg.toLowerCase().includes('signature') || msg.toLowerCase().includes('verification'); logger.error(`[paddle] ${isInvalid ? 'signature verification failed 403' : 'webhook error 400'}: ${msg}`); return Response.json({ ok: false, error: isInvalid ? 'Invalid signature' : 'Webhook Error' }, { status: isInvalid ? 403 : 400 }) }",
    "  try { const existing = await convexClient.query(api.billing.checkWebhookEvent, { provider: 'paddle', providerEventId: eventId }); if ((existing as any)?.processed) return Response.json({ ok: true, alreadyProcessed: true }) } catch (e) { logger.error(`[paddle] idempotency fail`) }",
    "  try { const customData = (eventData as any).customData; const txnId = (eventData as any).id ?? eventId; if (eventType.includes('completed')) { await convexClient.mutation(api.billing.upsertCheckout, { provider: 'paddle', providerCheckoutId: txnId as string, status: 'completed' as any, customerId: (eventData as any).customerId, metadata: customData }); const userId = (customData as any)?.userId; const subId = (eventData as any).subscriptionId ?? txnId; if (userId && subId) await convexClient.mutation(api.billing.upsertSubscription, { userId, provider: 'paddle', providerSubscriptionId: subId as string, status: 'active' as any, customerId: (eventData as any).customerId, metadata: customData }) } } catch (e) { logger.error(`[paddle] handler error`) }",
    "  try { await convexClient.mutation(api.billing.upsertWebhookEvent, { provider: 'paddle', providerEventId: eventId, type: eventType, payload: eventData as any, processed: true }) } catch (e) { logger.error(`[paddle] record fail`) }",
    "  return Response.json({ ok: true, provider: 'paddle', type: eventType, id: eventId })",
    "}",
    "export const Route = createFileRoute('/api/webhooks/paddle')({ server: { handlers: { POST } } })",
  ].join("\n");
}

export function paddleNextContent(imp: DbImports): string {
  if ((imp as ConvexImp).isConvex) return paddleNextConvexContent(imp);
  return baseNext(imp);
}
export function paddleNextConvexContent(imp: DbImports): string {
  return convexNext(imp);
}
export function paddleTanstackContent(imp: DbImports): string {
  if ((imp as ConvexImp).isConvex) return paddleTanstackConvexContent(imp);
  return tanstackBase(imp);
}
export function paddleTanstackConvexContent(imp: DbImports): string {
  return tanstackConvex(imp);
}
