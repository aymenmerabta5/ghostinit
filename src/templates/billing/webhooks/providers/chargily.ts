import { convexApiFor, type DbImports, type ConvexImports } from "./shared.js";

type ConvexImp = ConvexImports;

function baseChargilyNext(imp: DbImports): string {
  return [
    `import { verifySignature } from "@chargily/chargily-pay";`,
    'import { eq } from "drizzle-orm";',
    `import { db } from "${imp.db}";`,
    `import { webhook_events, checkouts, subscriptions } from "${imp.billingSchema}";`,
    `import { logger } from "${imp.observability}";`,
    "",
    "export async function POST(req: Request): Promise<Response> {",
    '  const sig = req.headers.get("signature");',
    "  if (!sig) {",
    '    logger.warn("[chargily webhook] missing signature header");',
    "    return new Response(\"Missing signature header 'signature' - return 400\", { status: 400 });",
    "  }",
    "  const buf = Buffer.from(await req.arrayBuffer());",
    '  const secret = process.env.CHARGILY_SECRET_KEY ?? process.env.CHARGILY_WEBHOOK_SECRET ?? "";',
    '  if (!secret || secret.startsWith("REPLACE_WITH")) {',
    '    logger.error("[chargily webhook] CHARGILY_SECRET_KEY missing");',
    '    return new Response("CHARGILY_SECRET_KEY missing - server-only", { status: 400 });',
    "  }",
    "  let valid = false;",
    "  try { valid = verifySignature(buf, sig, secret); } catch (err) { const msg = err instanceof Error ? err.message : String(err); logger.error(`[chargily webhook] signature verification failed: ${msg}`); return new Response('Invalid signature', { status: 403 }); }",
    '  if (!valid) { logger.warn("[chargily webhook] invalid signature"); return new Response("Invalid signature 403", { status: 403 }); }',
    "  let payload: Record<string, unknown>;",
    '  try { payload = JSON.parse(buf.toString("utf-8")) as Record<string, unknown>; } catch (error) { logger.error(`[chargily webhook] invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`); return new Response("Invalid JSON payload", { status: 400 }); }',
    "  const data = (payload.data as Record<string, unknown> | undefined) ?? (payload.checkout as Record<string, unknown> | undefined) ?? payload;",
    "  const eventId = (payload.id as string | undefined) ?? (data.id as string | undefined) ?? (payload.event_id as string | undefined) ?? `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;",
    '  const eventType = (payload.type as string | undefined) ?? (payload.event as string | undefined) ?? `checkout.${(data.status as string | undefined) ?? (payload.status as string | undefined) ?? "updated"}`;',
    '  try { if (!db.query.webhook_events.findFirst) { throw new Error("webhook_events query not available — ensure billing schema is migrated"); } const existing = await db.query.webhook_events.findFirst({ where: eq(webhook_events.providerEventId, eventId), }); if (existing?.processed) { logger.info(`[chargily webhook] already processed ${eventId}`); return new Response("already processed", { status: 200 }); } } catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error(`[chargily webhook] idempotency check failed: ${message}`); }',
    '  try { const status = (data.status as string | undefined) ?? (payload.status as string | undefined); const checkoutId = (data.id as string | undefined) ?? (payload.id as string | undefined); switch (eventType) { case "checkout.paid": case "checkout.completed": case "checkout_paid": { if (checkoutId) { try { await db.update(checkouts).set({ status: "completed" }).where(eq(checkouts.providerCheckoutId, checkoutId)); } catch (error) { logger.error(`[chargily webhook] update checkout completed failed: ${error instanceof Error ? error.message : String(error)}`); } try { const meta = (data.metadata as Record<string, unknown> | undefined) ?? (payload.metadata as Record<string, unknown> | undefined); const userId = (meta?.userId as string | undefined) ?? (meta?.chargily_user_id as string | undefined); if (userId) { await db.insert(subscriptions).values({ userId, provider: "chargily", providerSubscriptionId: checkoutId, status: "active", metadata: meta as any, }).onConflictDoNothing(); } } catch (error) { logger.error(`[chargily webhook] create subscription failed: ${error instanceof Error ? error.message : String(error)}`); } } break; } case "checkout.failed": case "checkout.canceled": case "checkout.expired": { if (checkoutId) { try { const mapped = eventType.includes("failed") ? "failed" : eventType.includes("canceled") ? "failed" : "expired"; await db.update(checkouts).set({ status: mapped as any }).where(eq(checkouts.providerCheckoutId, checkoutId)); } catch (error) { logger.error(`[chargily webhook] update checkout ${eventType} failed: ${error instanceof Error ? error.message : String(error)}`); } if (eventType.includes("failed") || eventType.includes("canceled")) { try { await db.update(subscriptions).set({ status: "canceled" as any }).where(eq(subscriptions.providerSubscriptionId, checkoutId)); } catch (error) { logger.error(`[chargily webhook] cancel subscription failed: ${error instanceof Error ? error.message : String(error)}`); } } } break; } default: { if (checkoutId && status) { try { const mapStatus = (s: string): string => { if (s === "paid" || s === "completed") return "completed"; if (s === "failed" || s === "canceled" || s === "cancelled") return "failed"; if (s === "expired") return "expired"; if (s === "pending" || s === "processing" || s === "open") return "pending"; return "pending"; }; await db.update(checkouts).set({ status: mapStatus(status) as any }).where(eq(checkouts.providerCheckoutId, checkoutId)); } catch (error) { logger.error(`[chargily webhook] generic status update failed: ${error instanceof Error ? error.message : String(error)}`); } } break; } } } catch (error) { logger.error(`[chargily webhook] handler error: ${error instanceof Error ? error.message : String(error)}`); }',
    '  try { await db.insert(webhook_events).values({ provider: "chargily", providerEventId: eventId, type: eventType, payload: payload as any, processed: true, }).onConflictDoNothing(); } catch (error) { logger.error(`[chargily webhook] failed to record event: ${error instanceof Error ? error.message : String(error)}`); }',
    '  logger.info(`[chargily webhook] processed ${eventType} ${eventId}`); return new Response("ok", { status: 200 });',
    "}",
  ].join("\n");
}

function baseChargilyConvexNext(imp: DbImports): string {
  const convexImport = `import { convexClient } from "${imp.db}";`;
  const apiImport = `import { api } from "${convexApiFor(imp, "chargily", "next")}";`;
  return [
    `import { verifySignature } from "@chargily/chargily-pay";`,
    convexImport,
    apiImport,
    `import { logger } from "${imp.observability}";`,
    "",
    "export async function POST(req: Request): Promise<Response> {",
    '  const sig = req.headers.get("signature");',
    '  if (!sig) { logger.warn("[chargily webhook] missing signature"); return new Response("Missing signature", { status: 400 }); }',
    "  const buf = Buffer.from(await req.arrayBuffer());",
    '  const secret = process.env.CHARGILY_SECRET_KEY ?? process.env.CHARGILY_WEBHOOK_SECRET ?? "";',
    '  if (!secret || secret.startsWith("REPLACE_WITH")) { logger.error("[chargily webhook] secret missing"); return new Response("secret missing", { status: 400 }); }',
    "  let valid = false; try { valid = verifySignature(buf, sig, secret); } catch (err) { const msg = err instanceof Error ? err.message : String(err); logger.error(`[chargily] sig fail ${msg}`); return new Response('Invalid signature', { status: 403 }); }",
    '  if (!valid) return new Response("Invalid signature 403", { status: 403 });',
    '  let payload: Record<string, unknown>; try { payload = JSON.parse(buf.toString("utf-8")); } catch { return new Response("Invalid JSON", { status: 400 }); }',
    "  const data = (payload.data as any) ?? (payload.checkout as any) ?? payload;",
    "  const eventId = (payload.id as string | undefined) ?? (data.id as string | undefined) ?? `evt_${Date.now().toString(36)}`; ",
    '  const eventType = (payload.type as string | undefined) ?? (payload.event as string | undefined) ?? `checkout.${data.status ?? "updated"}`;',
    '  try { const existing = await convexClient.query(api.billing.checkWebhookEvent, { provider: "chargily", providerEventId: eventId }); if ((existing as any)?.processed) { logger.info(`[chargily] already processed ${eventId}`); return new Response("already processed", { status: 200 }); } } catch (e) { logger.error(`[chargily] idempotency check failed ${e instanceof Error ? e.message : String(e)}`); }',
    '  try { const status = data.status ?? payload.status; const checkoutId = data.id ?? payload.id; if (eventType === "checkout.paid" || eventType === "checkout.completed" || status === "paid") { if (checkoutId) { await convexClient.mutation(api.billing.upsertCheckout, { provider: "chargily", providerCheckoutId: checkoutId as string, status: "completed" as any, metadata: (data.metadata ?? payload.metadata) as any }); const meta = data.metadata ?? payload.metadata; const userId = (meta as any)?.userId; if (userId) { await convexClient.mutation(api.billing.upsertSubscription, { userId, provider: "chargily", providerSubscriptionId: checkoutId as string, status: "active" as any, metadata: meta as any }); } } } } catch (e) { logger.error(`[chargily] handler error ${e instanceof Error ? e.message : String(e)}`); }',
    '  try { await convexClient.mutation(api.billing.upsertWebhookEvent, { provider: "chargily", providerEventId: eventId, type: eventType, payload: payload as any, processed: true }); } catch (e) { logger.error(`[chargily] record failed ${e instanceof Error ? e.message : String(e)}`); }',
    '  logger.info(`[chargily] processed ${eventType} ${eventId}`); return new Response("ok", { status: 200 });',
    "}",
  ].join("\n");
}

function baseChargilyTanstack(imp: DbImports): string {
  return [
    "import { createFileRoute } from '@tanstack/react-router'",
    "import { verifySignature } from '@chargily/chargily-pay'",
    "import { eq } from 'drizzle-orm'",
    `import { db } from '${imp.db}'`,
    `import { webhook_events, checkouts, subscriptions } from '${imp.billingSchema}'`,
    `import { logger } from '${imp.observability}'`,
    "",
    "async function POST({ request }: { request: Request }): Promise<Response> {",
    "  const sig = request.headers.get('signature')",
    "  if (!sig) return Response.json({ ok: false, error: 'Missing signature' }, { status: 400 })",
    "  const buf = Buffer.from(await request.arrayBuffer())",
    "  const secret = process.env.CHARGILY_SECRET_KEY ?? process.env.CHARGILY_WEBHOOK_SECRET ?? ''",
    "  if (!secret || secret.startsWith('REPLACE_WITH')) return Response.json({ ok: false, error: 'secret missing' }, { status: 400 })",
    "  let valid = false; try { valid = verifySignature(buf, sig, secret) } catch (err) { const msg = err instanceof Error ? err.message : String(err); logger.error(`[chargily] sig fail ${msg}`); return Response.json({ ok: false, error: 'Invalid signature' }, { status: 403 }) }",
    "  if (!valid) return Response.json({ ok: false, error: 'Invalid signature 403' }, { status: 403 })",
    "  let payload: Record<string, unknown>; try { payload = JSON.parse(buf.toString('utf-8')) } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }",
    "  const data = (payload.data as any) ?? payload;",
    "  const eventId = (payload.id as string) ?? (data.id as string) ?? `evt_${Date.now().toString(36)}`;",
    "  const eventType = (payload.type as string) ?? `checkout.${data.status ?? 'updated'}`;",
    "  try { const existing = await db.query.webhook_events.findFirst({ where: eq(webhook_events.providerEventId, eventId) }); if (existing?.processed) { logger.info(`[chargily] already processed ${eventId}`); return Response.json({ ok: true, alreadyProcessed: true }) } } catch (e) { logger.error(`[chargily] idempotency fail ${e instanceof Error ? e.message : String(e)}`) }",
    // Lifecycle parity with the Next.js variant: complete/fail/expire checkouts AND
    // create/cancel subscriptions. Divergence here silently loses subscriptions.
    "  try { const status = (data.status as string | undefined) ?? (payload.status as string | undefined); const checkoutId = (data.id as string | undefined) ?? (payload.id as string | undefined); if (checkoutId) { if (eventType.includes('paid') || eventType.includes('completed')) { await db.update(checkouts).set({ status: 'completed' as any }).where(eq(checkouts.providerCheckoutId, checkoutId)); const meta = (data.metadata ?? payload.metadata) as Record<string, unknown> | undefined; const userId = (meta?.userId ?? meta?.chargily_user_id) as string | undefined; if (userId) { await db.insert(subscriptions).values({ userId, provider: 'chargily', providerSubscriptionId: checkoutId, status: 'active', metadata: meta as any }).onConflictDoNothing() } } else if (eventType.includes('failed') || eventType.includes('canceled') || eventType.includes('expired')) { const mapped = eventType.includes('expired') ? 'expired' : 'failed'; await db.update(checkouts).set({ status: mapped as any }).where(eq(checkouts.providerCheckoutId, checkoutId)); if (!eventType.includes('expired')) { await db.update(subscriptions).set({ status: 'canceled' as any }).where(eq(subscriptions.providerSubscriptionId, checkoutId)) } } else if (status) { const mapStatus = (s: string): string => (s === 'paid' || s === 'completed') ? 'completed' : (s === 'failed' || s === 'canceled' || s === 'cancelled') ? 'failed' : s === 'expired' ? 'expired' : 'pending'; await db.update(checkouts).set({ status: mapStatus(status) as any }).where(eq(checkouts.providerCheckoutId, checkoutId)) } } } catch (e) { logger.error(`[chargily] handler error ${e instanceof Error ? e.message : String(e)}`) }",
    "  try { await db.insert(webhook_events).values({ provider: 'chargily', providerEventId: eventId, type: eventType, payload: payload as any, processed: true }).onConflictDoNothing() } catch (e) { logger.error(`[chargily] record fail ${e instanceof Error ? e.message : String(e)}`) }",
    "  logger.info(`[chargily] ${eventType} ${eventId} ok`); return Response.json({ ok: true, provider: 'chargily', type: eventType, id: eventId })",
    "}",
    "export const Route = createFileRoute('/api/webhooks/chargily')({ server: { handlers: { POST } } })",
  ].join("\n");
}

function baseChargilyTanstackConvex(imp: DbImports): string {
  const convexImport = `import { convexClient } from '${imp.db}'`;
  const apiImport = `import { api } from '${convexApiFor(imp, "chargily", "tanstack")}'`;
  return [
    "import { createFileRoute } from '@tanstack/react-router'",
    "import { verifySignature } from '@chargily/chargily-pay'",
    convexImport,
    apiImport,
    `import { logger } from '${imp.observability}'`,
    "async function POST({ request }: { request: Request }): Promise<Response> {",
    "  const sig = request.headers.get('signature')",
    "  if (!sig) return Response.json({ ok: false, error: 'Missing signature' }, { status: 400 })",
    "  const buf = Buffer.from(await request.arrayBuffer())",
    "  const secret = process.env.CHARGILY_SECRET_KEY ?? process.env.CHARGILY_WEBHOOK_SECRET ?? ''",
    "  if (!secret || secret.startsWith('REPLACE_WITH')) return Response.json({ ok: false, error: 'secret missing' }, { status: 400 })",
    "  let valid = false; try { valid = verifySignature(buf, sig, secret) } catch (err) { logger.error(`[chargily] sig fail ${err instanceof Error ? err.message : String(err)}`); return Response.json({ ok: false, error: 'Invalid signature' }, { status: 403 }) }",
    "  if (!valid) return Response.json({ ok: false, error: 'Invalid signature 403' }, { status: 403 })",
    "  let payload: Record<string, unknown>; try { payload = JSON.parse(buf.toString('utf-8')) } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }",
    "  const data = (payload.data as any) ?? payload;",
    "  const eventId = (payload.id as string) ?? (data.id as string) ?? `evt_${Date.now().toString(36)}`;",
    "  const eventType = (payload.type as string) ?? `checkout.${data.status ?? 'updated'}`;",
    "  try { const existing = await convexClient.query(api.billing.checkWebhookEvent, { provider: 'chargily', providerEventId: eventId }); if ((existing as any)?.processed) return Response.json({ ok: true, alreadyProcessed: true }) } catch (e) { logger.error(`[chargily] idempotency fail ${e instanceof Error ? e.message : String(e)}`) }",
    // Lifecycle parity with the Next.js Convex variant — including subscription upsert.
    "  try { const checkoutId = (data.id ?? payload.id) as string | undefined; if (checkoutId) { if (eventType.includes('paid') || eventType.includes('completed')) { const meta = (data.metadata ?? payload.metadata) as Record<string, unknown> | undefined; await convexClient.mutation(api.billing.upsertCheckout, { provider: 'chargily', providerCheckoutId: checkoutId, status: 'completed' as any, metadata: meta as any }); const userId = (meta?.userId ?? meta?.chargily_user_id) as string | undefined; if (userId) { await convexClient.mutation(api.billing.upsertSubscription, { userId, provider: 'chargily', providerSubscriptionId: checkoutId, status: 'active' as any, metadata: meta as any }) } } else if (eventType.includes('failed') || eventType.includes('canceled') || eventType.includes('expired')) { const mapped = eventType.includes('expired') ? 'expired' : 'failed'; await convexClient.mutation(api.billing.upsertCheckout, { provider: 'chargily', providerCheckoutId: checkoutId, status: mapped as any }) } } } catch (e) { logger.error(`[chargily] handler error ${e instanceof Error ? e.message : String(e)}`) }",
    "  try { await convexClient.mutation(api.billing.upsertWebhookEvent, { provider: 'chargily', providerEventId: eventId, type: eventType, payload: payload as any, processed: true }) } catch (e) { logger.error(`[chargily] record fail ${e instanceof Error ? e.message : String(e)}`) }",
    "  return Response.json({ ok: true, provider: 'chargily', type: eventType, id: eventId })",
    "}",
    "export const Route = createFileRoute('/api/webhooks/chargily')({ server: { handlers: { POST } } })",
  ].join("\n");
}

export function chargilyNextContent(imp: DbImports): string {
  if ((imp as ConvexImp).isConvex) return chargilyNextConvexContent(imp);
  return baseChargilyNext(imp);
}
export function chargilyNextConvexContent(imp: DbImports): string {
  return baseChargilyConvexNext(imp);
}
export function chargilyTanstackContent(imp: DbImports): string {
  if ((imp as ConvexImp).isConvex) return chargilyTanstackConvexContent(imp);
  return baseChargilyTanstack(imp);
}
export function chargilyTanstackConvexContent(imp: DbImports): string {
  return baseChargilyTanstackConvex(imp);
}
