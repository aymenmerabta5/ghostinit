import {
  convexApiFor,
  convexBillingServerHelpers,
  postgresWebhookClaimHelpers,
  webhookBodyLimitHelpers,
  webhookBodyReadLines,
  webhookEventOrderHelpers,
  type DbImports,
  type ConvexImports,
} from "./shared.js";
import { convexWebhookPayloadHelpers } from "./convex-payload.js";

type ConvexImp = ConvexImports;

function eventHelpers(): string[] {
  return [
    'function nonEmptyString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }',
    'function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }',
    "function polarDeliveryId(headers: Record<string, string>, rawBody: Buffer): string {",
    '  return nonEmptyString(headers["webhook-id"]) ?? `body_sha256:${createHash("sha256").update(rawBody).digest("hex")}`;',
    "}",
    'type PolarEventKind = "subscription" | "checkout" | "order";',
    "function polarEventKind(eventType: string): PolarEventKind | null {",
    "  switch (eventType) {",
    '    case "subscription.created": case "subscription.updated": case "subscription.active": case "subscription.canceled": case "subscription.uncanceled": case "subscription.revoked": case "subscription.past_due": return "subscription";',
    '    case "checkout.created": case "checkout.updated": case "checkout.expired": return "checkout";',
    '    case "order.created": case "order.paid": return "order";',
    "    default: return null;",
    "  }",
    "}",
    'function scalarMetadata(value: unknown): Record<string, string | number | boolean | null> | undefined { if (!isRecord(value)) return undefined; const output: Record<string, string | number | boolean | null> = {}; for (const [key, item] of Object.entries(value)) if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") output[key] = item; return output; }',
  ];
}

function postgresBase(imp: DbImports): string {
  return [
    'import { createHash, randomUUID } from "node:crypto";',
    'import { and, eq, isNull, sql } from "drizzle-orm";',
    `import { db } from "${imp.db}";`,
    `import { webhook_events, checkouts, subscriptions, invoices, customers } from "${imp.billingSchema}";`,
    `import { logger } from "${imp.observability}";`,
    "",
    ...webhookBodyLimitHelpers(),
    "",
    ...eventHelpers(),
    ...webhookEventOrderHelpers(),
    'function mapPolarSubscriptionStatus(value: unknown): typeof subscriptions.$inferSelect.status { const status = nonEmptyString(value); if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "unpaid" || status === "incomplete" || status === "incomplete_expired" || status === "paused" || status === "expired" || status === "on_trial" || status === "trial_ended") return status; return "incomplete"; }',
    "",
    ...postgresWebhookClaimHelpers("polar"),
    "",
    "export async function POST(req: Request): Promise<Response> {",
    ...webhookBodyReadLines("req"),
    '  const secret = process.env.POLAR_WEBHOOK_SECRET ?? "";',
    '  if (!secret || secret.startsWith("REPLACE_WITH")) return new Response("POLAR_WEBHOOK_SECRET not configured", { status: 400 });',
    "  const headers: Record<string, string> = {}; req.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });",
    "  let eventType: string; let eventId: string; let eventPayload: Record<string, unknown>; let data: Record<string, unknown>; let eventOccurredAtMs: number | null;",
    '  try { const { validateEvent } = await import("@polar-sh/sdk/webhooks"); const validated = validateEvent(buf, headers, secret); eventPayload = isRecord(validated) ? validated : {}; data = isRecord(eventPayload.data) ? eventPayload.data : eventPayload; eventType = nonEmptyString(eventPayload.type) ?? "unknown"; eventId = polarDeliveryId(headers, buf); eventOccurredAtMs = providerEventMillis(eventPayload.timestamp, eventPayload.occurredAt, data.modifiedAt, data.updatedAt, data.createdAt); }',
    '  catch (error) { const message = error instanceof Error ? error.message : String(error); logger.error(`[polar webhook] verification failed: ${message}`); return new Response("Invalid polar signature", { status: 403 }); }',
    "  let claim: ClaimResult; try { claim = await claimWebhookDelivery(eventId, eventType, eventPayload); }",
    '  catch { return new Response("Idempotency store unavailable", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  if (claim.status === "completed") return new Response("already processed", { status: 200 });',
    '  if (claim.status === "in_flight") return new Response("delivery in progress", { status: 503, headers: { "Retry-After": "5" } });',
    "  try {",
    "    const resourceId = nonEmptyString(data.id); const metadata = scalarMetadata(data.metadata); const userId = nonEmptyString(metadata?.userId) ?? nonEmptyString(data.externalCustomerId); const requestKey = nonEmptyString(metadata?.requestKey); const customerId = nonEmptyString(data.customerId); const eventKind = polarEventKind(eventType);",
    "    if (eventKind && !resourceId) throw new Error(`Polar ${eventType} event did not include data.id`);",
    '    if (eventKind === "subscription" && resourceId) { const status = eventType === "subscription.canceled" || eventType === "subscription.revoked" ? "canceled" : mapPolarSubscriptionStatus(data.status); const providerEventAt = new Date(requireProviderEventMillis(`Polar ${eventType}`, eventOccurredAtMs)); if (!userId) throw new Error(`Polar ${eventType} event did not include actor ownership`); const [storedSubscription] = await db.insert(subscriptions).values({ userId, provider: "polar", providerSubscriptionId: resourceId, status, metadata, providerEventAt }).onConflictDoUpdate({ target: [subscriptions.provider, subscriptions.providerSubscriptionId], set: { status, metadata, providerEventAt, updatedAt: new Date() }, setWhere: and(eq(subscriptions.userId, userId), sql`${subscriptions.providerEventAt} IS NULL OR ${subscriptions.providerEventAt} < ${providerEventAt} OR (${subscriptions.providerEventAt} = ${providerEventAt} AND (${status} = \'canceled\' OR ${subscriptions.status} NOT IN (\'canceled\', \'expired\')))` ) }).returning({ id: subscriptions.id }); if (!storedSubscription) { const existingSubscription = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.provider, "polar"), eq(subscriptions.providerSubscriptionId, resourceId)) }); if (!existingSubscription || existingSubscription.userId !== userId) throw new Error(`Polar subscription ${resourceId} belongs to another actor`); } if (customerId) await db.insert(customers).values({ userId, provider: "polar", providerCustomerId: customerId, metadata }).onConflictDoUpdate({ target: [customers.userId, customers.provider], set: { metadata, updatedAt: new Date() } }); }',
    '    else if (eventKind === "checkout" && resourceId) { if (!userId) throw new Error(`Polar ${eventType} event did not include actor ownership`); const status = data.status === "confirmed" || data.status === "succeeded" ? "completed" : data.status === "expired" ? "expired" : "pending"; const providerEventAt = new Date(requireProviderEventMillis(`Polar ${eventType}`, eventOccurredAtMs)); const ordering = sql`${checkouts.providerEventAt} IS NULL OR ${checkouts.providerEventAt} < ${providerEventAt} OR (${checkouts.providerEventAt} = ${providerEventAt} AND (${status} = \'completed\' OR (${status} = \'expired\' AND ${checkouts.status} NOT IN (\'completed\', \'paid\')) OR ${checkouts.status} IN (\'pending\', \'open\')))`; if (requestKey) await db.update(checkouts).set({ providerCheckoutId: resourceId, url: nonEmptyString(data.url), status, metadata, providerEventAt, creationState: "ready", creationStartedAt: null, creationLeaseToken: null, updatedAt: new Date() }).where(and(eq(checkouts.userId, userId), eq(checkouts.provider, "polar"), eq(checkouts.requestKey, requestKey), eq(checkouts.creationState, "creating"))); const [stored] = await db.insert(checkouts).values({ userId, provider: "polar", providerCheckoutId: resourceId, requestKey, url: nonEmptyString(data.url), status, metadata, providerEventAt }).onConflictDoUpdate({ target: [checkouts.provider, checkouts.providerCheckoutId], set: { requestKey, status, metadata, providerEventAt, creationState: "ready", creationStartedAt: null, creationLeaseToken: null, updatedAt: new Date() }, setWhere: and(eq(checkouts.userId, userId), ordering) }).returning({ id: checkouts.id }); if (!stored) { const existing = await db.query.checkouts.findFirst({ where: and(eq(checkouts.provider, "polar"), eq(checkouts.providerCheckoutId, resourceId)) }); if (!existing || existing.userId !== userId) throw new Error(`Polar checkout ${resourceId} belongs to another actor`); } }',
    '    else if (eventKind === "order" && resourceId) { if (!userId) throw new Error(`Polar ${eventType} event did not include actor ownership`); const providerEventAt = new Date(requireProviderEventMillis(`Polar ${eventType}`, eventOccurredAtMs)); const amount = typeof data.totalAmount === "number" ? data.totalAmount : typeof data.amount === "number" ? data.amount : 0; const paid = eventType === "order.paid" || data.paid === true || data.status === "paid"; const status = paid ? "paid" as const : "open" as const; const currency = nonEmptyString(data.currency) ?? undefined; const providerSubscriptionId = nonEmptyString(data.subscriptionId) ?? nonEmptyString(data.subscription_id); const localSubscription = providerSubscriptionId ? await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.provider, "polar"), eq(subscriptions.providerSubscriptionId, providerSubscriptionId)) }) : null; const localCustomer = customerId ? await db.query.customers.findFirst({ where: and(eq(customers.provider, "polar"), eq(customers.providerCustomerId, customerId)) }) : null; if (localSubscription && localSubscription.userId !== userId) throw new Error(`Polar subscription ${providerSubscriptionId} belongs to another actor`); if (localCustomer && localCustomer.userId !== userId) throw new Error(`Polar customer ${customerId} belongs to another actor`); const [storedInvoice] = await db.insert(invoices).values({ userId, provider: "polar", providerInvoiceId: resourceId, subscriptionId: localSubscription?.id, customerId: localCustomer?.id, paid, amount, currency, status, metadata, providerEventAt }).onConflictDoUpdate({ target: [invoices.provider, invoices.providerInvoiceId], set: { subscriptionId: localSubscription?.id, customerId: localCustomer?.id, paid, amount, currency, status, metadata, providerEventAt, updatedAt: new Date() }, setWhere: and(eq(invoices.userId, userId), sql`(${invoices.paid} = false OR ${paid}) AND (${invoices.providerEventAt} IS NULL OR ${invoices.providerEventAt} <= ${providerEventAt})`) }).returning({ id: invoices.id }); if (!storedInvoice) { const existingInvoice = await db.query.invoices.findFirst({ where: and(eq(invoices.provider, "polar"), eq(invoices.providerInvoiceId, resourceId)) }); if (!existingInvoice || existingInvoice.userId !== userId) throw new Error(`Polar invoice ${resourceId} belongs to another actor`); } }',
    '  } catch (error) { const message = error instanceof Error ? error.message : String(error); try { await failWebhookDelivery(eventId, claim.leaseToken, message); } catch (releaseError) { logger.error(`[polar webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`); } return new Response("Webhook handler failed", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  try { await completeWebhookDelivery(eventId, claim.leaseToken); } catch (error) { const message = error instanceof Error ? error.message : String(error); try { await failWebhookDelivery(eventId, claim.leaseToken, message); } catch (releaseError) { logger.error(`[polar webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`); } return new Response("Webhook event store unavailable", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  return new Response("ok", { status: 200 });',
    "}",
  ].join("\n");
}

function convexBase(imp: DbImports): string {
  const apiSpecifier = convexApiFor(imp, "polar", "next");
  const dataModelSpecifier = apiSpecifier.replace(/\/api$/, "/dataModel");
  return [
    'import { createHash } from "node:crypto";',
    `import { convexClient } from "${imp.db}";`,
    `import { api } from "${apiSpecifier}";`,
    `import type { Id } from "${dataModelSpecifier}";`,
    `import { logger } from "${imp.observability}";`,
    "",
    ...convexBillingServerHelpers(),
    "",
    ...convexWebhookPayloadHelpers(),
    "",
    ...webhookBodyLimitHelpers(),
    "",
    ...eventHelpers(),
    ...webhookEventOrderHelpers(),
    'function mapPolarSubscriptionStatus(value: unknown) { const status = nonEmptyString(value); if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "unpaid" || status === "incomplete" || status === "incomplete_expired" || status === "paused" || status === "expired" || status === "on_trial" || status === "trial_ended") return status; return "incomplete" as const; }',
    "",
    "export async function POST(req: Request): Promise<Response> {",
    ...webhookBodyReadLines("req"),
    '  const secret = process.env.POLAR_WEBHOOK_SECRET ?? ""; if (!secret || secret.startsWith("REPLACE_WITH")) return new Response("POLAR_WEBHOOK_SECRET not configured", { status: 400 });',
    "  const headers: Record<string, string> = {}; req.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });",
    "  let eventType: string; let eventId: string; let eventPayload: Record<string, unknown>; let data: Record<string, unknown>; let eventOccurredAtMs: number | null;",
    '  try { const { validateEvent } = await import("@polar-sh/sdk/webhooks"); const validated = validateEvent(buf, headers, secret); eventPayload = isRecord(validated) ? validated : {}; data = isRecord(eventPayload.data) ? eventPayload.data : eventPayload; eventType = nonEmptyString(eventPayload.type) ?? "unknown"; eventId = polarDeliveryId(headers, buf); eventOccurredAtMs = providerEventMillis(eventPayload.timestamp, eventPayload.occurredAt, data.modifiedAt, data.updatedAt, data.createdAt); }',
    '  catch { return new Response("Invalid polar signature", { status: 403 }); }',
    '  let claim: { status: "claimed"; leaseToken: string } | { status: "completed" } | { status: "in_flight" }; try { claim = await runBillingMutation("claimWebhookEvent", { provider: "polar", providerEventId: eventId, type: eventType, payload: normalizeConvexWebhookPayload(eventPayload) }); } catch { return new Response("Idempotency store unavailable", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  if (claim.status === "completed") return new Response("already processed", { status: 200 }); if (claim.status === "in_flight") return new Response("delivery in progress", { status: 503, headers: { "Retry-After": "5" } });',
    '  try { const resourceId = nonEmptyString(data.id); const metadata = scalarMetadata(data.metadata); const userId = nonEmptyString(metadata?.userId) ?? nonEmptyString(data.externalCustomerId); const requestKey = nonEmptyString(metadata?.requestKey); const customerId = nonEmptyString(data.customerId); const eventKind = polarEventKind(eventType); if (eventKind && !resourceId) throw new Error(`Polar ${eventType} event did not include data.id`); if (eventKind === "subscription" && resourceId) { const providerEventAt = requireProviderEventMillis(`Polar ${eventType}`, eventOccurredAtMs); const status = eventType === "subscription.canceled" || eventType === "subscription.revoked" ? "canceled" as const : mapPolarSubscriptionStatus(data.status); if (!userId) throw new Error(`Polar ${eventType} event did not include actor ownership`); await runBillingMutation("upsertSubscription", { userId: userId as Id<"users">, provider: "polar", providerSubscriptionId: resourceId, status, metadata, providerEventAt }); if (customerId) await runBillingMutation("upsertCustomer", { userId: userId as Id<"users">, provider: "polar", providerCustomerId: customerId, metadata }); } else if (eventKind === "checkout" && resourceId) { if (!userId) throw new Error(`Polar ${eventType} event did not include actor ownership`); const providerEventAt = requireProviderEventMillis(`Polar ${eventType}`, eventOccurredAtMs); const status = data.status === "confirmed" || data.status === "succeeded" ? "completed" as const : data.status === "expired" ? "expired" as const : "pending" as const; await runBillingMutation("upsertCheckout", { userId: userId as Id<"users">, provider: "polar", providerCheckoutId: resourceId, requestKey, status, url: nonEmptyString(data.url) ?? undefined, metadata, providerEventAt }); } else if (eventKind === "order" && resourceId) { if (!userId) throw new Error(`Polar ${eventType} event did not include actor ownership`); const providerEventAt = requireProviderEventMillis(`Polar ${eventType}`, eventOccurredAtMs); const amount = typeof data.totalAmount === "number" ? data.totalAmount : typeof data.amount === "number" ? data.amount : 0; const status = eventType === "order.paid" || data.paid === true || data.status === "paid" ? "paid" as const : "open" as const; await runBillingMutation("upsertInvoice", { userId: userId as Id<"users">, provider: "polar", providerInvoiceId: resourceId, status, amount, currency: nonEmptyString(data.currency) ?? undefined, customerId: customerId ?? undefined, subscriptionId: nonEmptyString(data.subscriptionId) ?? nonEmptyString(data.subscription_id) ?? undefined, metadata, providerEventAt }); } }',
    '  catch (error) { const message = error instanceof Error ? error.message : String(error); try { await runBillingMutation("failWebhookEvent", { provider: "polar", providerEventId: eventId, leaseToken: claim.leaseToken, error: message }); } catch (releaseError) { logger.error(`[polar webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`); } return new Response("Webhook handler failed", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  try { await runBillingMutation("completeWebhookEvent", { provider: "polar", providerEventId: eventId, leaseToken: claim.leaseToken }); } catch (error) { const message = error instanceof Error ? error.message : String(error); try { await runBillingMutation("failWebhookEvent", { provider: "polar", providerEventId: eventId, leaseToken: claim.leaseToken, error: message }); } catch (releaseError) { logger.error(`[polar webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`); } return new Response("Webhook event store unavailable", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  return new Response("ok", { status: 200 });',
    "}",
  ].join("\n");
}

export function polarRouteBaseContent(imp: DbImports): string {
  return (imp as ConvexImp).isConvex ? convexBase(imp) : postgresBase(imp);
}
export function polarNextContent(imp: DbImports): string {
  return polarRouteBaseContent(imp);
}
export function polarNextConvexContent(imp: DbImports): string {
  return convexBase(imp);
}
