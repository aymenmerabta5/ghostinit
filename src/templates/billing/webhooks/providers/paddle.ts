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
    "function paddleDeliveryId(eventId: unknown, rawBody: Buffer): string {",
    '  return nonEmptyString(eventId) ?? `body_sha256:${createHash("sha256").update(rawBody).digest("hex")}`;',
    "}",
    'type PaddleEventKind = "transaction_completed" | "transaction_paid" | "subscription_created" | "subscription_updated" | "subscription_canceled";',
    "function paddleEventKind(eventType: string): PaddleEventKind | null {",
    "  switch (eventType) {",
    '    case "transaction_completed": case "TransactionCompleted": case "transaction.completed": return "transaction_completed";',
    '    case "transaction_paid": case "TransactionPaid": case "transaction.paid": return "transaction_paid";',
    '    case "subscription_created": case "SubscriptionCreated": case "subscription.created": return "subscription_created";',
    '    case "subscription_updated": case "SubscriptionUpdated": case "subscription.updated": case "subscription_activated": case "subscription.activated": case "subscription_trialing": case "subscription.trialing": case "subscription_past_due": case "subscription.past_due": case "subscription_paused": case "subscription.paused": case "subscription_resumed": case "subscription.resumed": return "subscription_updated";',
    '    case "subscription_canceled": case "SubscriptionCanceled": case "subscription.canceled": return "subscription_canceled";',
    "    default: return null;",
    "  }",
    "}",
    "function requirePaddleEventResourceId(data: Record<string, unknown>, eventType: string): string {",
    "  const id = nonEmptyString(data.id); if (!id) throw new Error(`Paddle ${eventType} event did not include data.id`); return id;",
    "}",
    'function mapPaddleSubscriptionStatus(value: unknown): "active" | "trialing" | "past_due" | "canceled" | "paused" | "incomplete" {',
    '  const status = nonEmptyString(value); if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "paused") return status; return "incomplete";',
    "}",
  ];
}

function baseNext(imp: DbImports): string {
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
    "",
    ...postgresWebhookClaimHelpers("paddle"),
    "",
    "export async function POST(req: Request): Promise<Response> {",
    ...webhookBodyReadLines("req"),
    '  const sig = req.headers.get("paddle-signature");',
    '  if (!sig) return new Response("Missing paddle-signature header", { status: 400 });',
    '  const rawBodyString = buf.toString("utf-8");',
    '  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? "";',
    '  if (!secret || secret.startsWith("REPLACE_WITH")) return new Response("PADDLE_WEBHOOK_SECRET not configured", { status: 400 });',
    "  let eventType: string; let eventId: string; let eventData: Record<string, unknown>; let eventOccurredAtMs: number | null;",
    "  try {",
    '    const { Paddle, Environment } = await import("@paddle/paddle-node-sdk");',
    '    const paddle = new Paddle(process.env.PADDLE_API_KEY ?? "", { environment: process.env.PADDLE_ENVIRONMENT === "production" ? Environment.production : Environment.sandbox });',
    "    const event = await paddle.webhooks.unmarshal(rawBodyString, secret, sig);",
    '    eventType = nonEmptyString(event.eventType) ?? "unknown";',
    "    eventId = paddleDeliveryId(event.eventId, buf);",
    "    eventData = isRecord(event.data) ? event.data : {};",
    "    eventOccurredAtMs = providerEventMillis(event.occurredAt, eventData.updatedAt, eventData.createdAt);",
    "  } catch (error) {",
    "    const message = error instanceof Error ? error.message : String(error);",
    "    const invalid = /signature|verification|invalid/i.test(message);",
    "    logger.error(`[paddle webhook] verification failed: ${message}`);",
    '    return new Response(invalid ? "Invalid paddle signature" : "Webhook Error", { status: invalid ? 403 : 400 });',
    "  }",
    "  let claim: ClaimResult;",
    "  try { claim = await claimWebhookDelivery(eventId, eventType, eventData); }",
    '  catch { return new Response("Idempotency store unavailable", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  if (claim.status === "completed") return new Response("already processed", { status: 200 });',
    '  if (claim.status === "in_flight") return new Response("delivery in progress", { status: 503, headers: { "Retry-After": "5" } });',
    "  try {",
    "    const customData = isRecord(eventData.customData) ? eventData.customData : undefined;",
    "    const userId = nonEmptyString(customData?.userId) ?? nonEmptyString(customData?.user_id);",
    "    const requestKey = nonEmptyString(customData?.requestKey);",
    "    const customerId = nonEmptyString(eventData.customerId) ?? nonEmptyString(eventData.customer_id);",
    "    switch (paddleEventKind(eventType)) {",
    '      case "transaction_completed": {',
    "        const transactionId = requirePaddleEventResourceId(eventData, eventType);",
    "        const providerEventAt = new Date(requireProviderEventMillis(`Paddle ${eventType}`, eventOccurredAtMs));",
    '        const existingCheckout = await db.query.checkouts.findFirst({ where: and(eq(checkouts.provider, "paddle"), eq(checkouts.providerCheckoutId, transactionId)) });',
    "        const checkoutUserId = userId ?? existingCheckout?.userId ?? null;",
    "        if (!checkoutUserId) throw new Error(`Paddle ${eventType} event did not include actor ownership`);",
    '        if (requestKey) await db.update(checkouts).set({ providerCheckoutId: transactionId, status: "completed", metadata: customData, providerEventAt, creationState: "ready", creationStartedAt: null, creationLeaseToken: null, updatedAt: new Date() }).where(and(eq(checkouts.userId, checkoutUserId), eq(checkouts.provider, "paddle"), eq(checkouts.requestKey, requestKey), eq(checkouts.creationState, "creating")));',
    '        const [storedCheckout] = await db.insert(checkouts).values({ userId: checkoutUserId, provider: "paddle", providerCheckoutId: transactionId, requestKey, status: "completed", metadata: customData, providerEventAt }).onConflictDoUpdate({ target: [checkouts.provider, checkouts.providerCheckoutId], set: { requestKey, status: "completed", metadata: customData, providerEventAt, creationState: "ready", creationStartedAt: null, creationLeaseToken: null, updatedAt: new Date() }, setWhere: and(eq(checkouts.userId, checkoutUserId), sql`${checkouts.providerEventAt} IS NULL OR ${checkouts.providerEventAt} <= ${providerEventAt}`) }).returning({ id: checkouts.id });',
    "        if (!storedCheckout && existingCheckout?.userId !== checkoutUserId) throw new Error(`Paddle checkout ${transactionId} belongs to another actor`);",
    '        if (customerId) await db.insert(customers).values({ userId: checkoutUserId, provider: "paddle", providerCustomerId: customerId, metadata: customData }).onConflictDoUpdate({ target: [customers.userId, customers.provider], set: { metadata: customData, updatedAt: new Date() } });',
    "        break;",
    "      }",
    '      case "transaction_paid": {',
    "        const transactionId = requirePaddleEventResourceId(eventData, eventType);",
    "        const providerEventAt = new Date(requireProviderEventMillis(`Paddle ${eventType}`, eventOccurredAtMs));",
    "        const details = isRecord(eventData.details) ? eventData.details : {}; const totals = isRecord(details.totals) ? details.totals : {};",
    '        const amount = Number.parseInt(nonEmptyString(totals.total) ?? "0", 10);',
    "        const currency = nonEmptyString(eventData.currencyCode) ?? nonEmptyString(eventData.currency_code) ?? undefined;",
    "        const providerSubscriptionId = nonEmptyString(eventData.subscriptionId) ?? nonEmptyString(eventData.subscription_id);",
    '        const localSubscription = providerSubscriptionId ? await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.provider, "paddle"), eq(subscriptions.providerSubscriptionId, providerSubscriptionId)) }) : null;',
    '        const localCustomer = customerId ? await db.query.customers.findFirst({ where: and(eq(customers.provider, "paddle"), eq(customers.providerCustomerId, customerId)) }) : null;',
    "        const invoiceUserId = userId ?? localSubscription?.userId ?? localCustomer?.userId ?? null;",
    "        if (!invoiceUserId) throw new Error(`Paddle ${eventType} event did not include actor ownership`);",
    "        if (localSubscription && localSubscription.userId !== invoiceUserId) throw new Error(`Paddle subscription ${providerSubscriptionId} belongs to another actor`);",
    "        if (localCustomer && localCustomer.userId !== invoiceUserId) throw new Error(`Paddle customer ${customerId} belongs to another actor`);",
    '        const [storedInvoice] = await db.insert(invoices).values({ userId: invoiceUserId, provider: "paddle", providerInvoiceId: transactionId, subscriptionId: localSubscription?.id, customerId: localCustomer?.id, paid: true, amount, currency, status: "paid", metadata: customData, providerEventAt }).onConflictDoUpdate({ target: [invoices.provider, invoices.providerInvoiceId], set: { subscriptionId: localSubscription?.id, customerId: localCustomer?.id, paid: true, amount, currency, status: "paid", metadata: customData, providerEventAt, updatedAt: new Date() }, setWhere: and(eq(invoices.userId, invoiceUserId), sql`${invoices.providerEventAt} IS NULL OR ${invoices.providerEventAt} <= ${providerEventAt}`) }).returning({ id: invoices.id });',
    '        if (!storedInvoice) { const existingInvoice = await db.query.invoices.findFirst({ where: and(eq(invoices.provider, "paddle"), eq(invoices.providerInvoiceId, transactionId)) }); if (!existingInvoice || existingInvoice.userId !== invoiceUserId) throw new Error(`Paddle invoice ${transactionId} belongs to another actor`); }',
    "        break;",
    "      }",
    '      case "subscription_created":',
    '      case "subscription_updated":',
    '      case "subscription_canceled": {',
    "        const subscriptionId = requirePaddleEventResourceId(eventData, eventType);",
    '        const subscriptionStatus = paddleEventKind(eventType) === "subscription_canceled" ? "canceled" as const : mapPaddleSubscriptionStatus(eventData.status);',
    "        const providerEventAt = new Date(requireProviderEventMillis(`Paddle ${eventType}`, eventOccurredAtMs));",
    "        const ordering = sql`${subscriptions.providerEventAt} IS NULL OR ${subscriptions.providerEventAt} < ${providerEventAt} OR (${subscriptions.providerEventAt} = ${providerEventAt} AND (${subscriptionStatus} = 'canceled' OR ${subscriptions.status} NOT IN ('canceled', 'expired')))`;",
    "        if (userId) {",
    '          const [stored] = await db.insert(subscriptions).values({ userId, provider: "paddle", providerSubscriptionId: subscriptionId, status: subscriptionStatus, metadata: customData, providerEventAt }).onConflictDoUpdate({ target: [subscriptions.provider, subscriptions.providerSubscriptionId], set: { status: subscriptionStatus, metadata: customData, providerEventAt, updatedAt: new Date() }, setWhere: and(eq(subscriptions.userId, userId), ordering) }).returning({ id: subscriptions.id });',
    '          if (!stored) { const existing = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.provider, "paddle"), eq(subscriptions.providerSubscriptionId, subscriptionId)) }); if (!existing || existing.userId !== userId) throw new Error(`Paddle subscription ${subscriptionId} belongs to another actor`); }',
    "        } else {",
    '          const [updated] = await db.update(subscriptions).set({ status: subscriptionStatus, providerEventAt, metadata: customData, updatedAt: new Date() }).where(and(eq(subscriptions.provider, "paddle"), eq(subscriptions.providerSubscriptionId, subscriptionId), ordering)).returning({ id: subscriptions.id });',
    '          if (!updated) { const existing = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.provider, "paddle"), eq(subscriptions.providerSubscriptionId, subscriptionId)) }); if (!existing) throw new Error(`Paddle ${eventType} event did not include actor ownership for an unknown subscription`); }',
    "        }",
    "        break;",
    "      }",
    "      default: break;",
    "    }",
    "  } catch (error) {",
    "    const message = error instanceof Error ? error.message : String(error);",
    "    try { await failWebhookDelivery(eventId, claim.leaseToken, message); } catch (releaseError) { logger.error(`[paddle webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`); }",
    '    return new Response("Webhook handler failed", { status: 500, headers: { "Retry-After": "60" } });',
    "  }",
    "  try { await completeWebhookDelivery(eventId, claim.leaseToken); } catch (error) {",
    "    const message = error instanceof Error ? error.message : String(error);",
    "    try { await failWebhookDelivery(eventId, claim.leaseToken, message); } catch (releaseError) { logger.error(`[paddle webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`); }",
    '    return new Response("Webhook event store unavailable", { status: 500, headers: { "Retry-After": "60" } });',
    "  }",
    "  logger.info(`[paddle webhook] processed ${eventType} ${eventId}`);",
    '  return new Response("ok", { status: 200 });',
    "}",
  ].join("\n");
}

function convexNext(imp: DbImports): string {
  const apiSpecifier = convexApiFor(imp, "paddle", "next");
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
    'function scalarMetadata(value: unknown): Record<string, string | number | boolean | null> | undefined { if (!isRecord(value)) return undefined; const output: Record<string, string | number | boolean | null> = {}; for (const [key, item] of Object.entries(value)) if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") output[key] = item; return output; }',
    "",
    "export async function POST(req: Request): Promise<Response> {",
    ...webhookBodyReadLines("req"),
    '  const sig = req.headers.get("paddle-signature");',
    '  if (!sig) return new Response("Missing paddle-signature header", { status: 400 });',
    '  const rawBodyString = buf.toString("utf-8");',
    '  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? "";',
    '  if (!secret || secret.startsWith("REPLACE_WITH")) return new Response("PADDLE_WEBHOOK_SECRET not configured", { status: 400 });',
    "  let eventType: string; let eventId: string; let eventData: Record<string, unknown>; let eventOccurredAtMs: number | null;",
    '  try { const { Paddle, Environment } = await import("@paddle/paddle-node-sdk"); const paddle = new Paddle(process.env.PADDLE_API_KEY ?? "", { environment: process.env.PADDLE_ENVIRONMENT === "production" ? Environment.production : Environment.sandbox }); const event = await paddle.webhooks.unmarshal(rawBodyString, secret, sig); eventType = nonEmptyString(event.eventType) ?? "unknown"; eventId = paddleDeliveryId(event.eventId, buf); eventData = isRecord(event.data) ? event.data : {}; eventOccurredAtMs = providerEventMillis(event.occurredAt, eventData.updatedAt, eventData.createdAt); }',
    '  catch (error) { const message = error instanceof Error ? error.message : String(error); return new Response("Webhook Error", { status: /signature|verification|invalid/i.test(message) ? 403 : 400 }); }',
    '  let claim: { status: "claimed"; leaseToken: string } | { status: "completed" } | { status: "in_flight" }; try { claim = await runBillingMutation("claimWebhookEvent", { provider: "paddle", providerEventId: eventId, type: eventType, payload: normalizeConvexWebhookPayload(eventData) }); }',
    '  catch { return new Response("Idempotency store unavailable", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  if (claim.status === "completed") return new Response("already processed", { status: 200 });',
    '  if (claim.status === "in_flight") return new Response("delivery in progress", { status: 503, headers: { "Retry-After": "5" } });',
    "  try {",
    "    const customData = scalarMetadata(eventData.customData); const userId = nonEmptyString(customData?.userId) ?? nonEmptyString(customData?.user_id); const requestKey = nonEmptyString(customData?.requestKey); const customerId = nonEmptyString(eventData.customerId) ?? nonEmptyString(eventData.customer_id);",
    "    switch (paddleEventKind(eventType)) {",
    '      case "transaction_completed": { const providerEventAt = requireProviderEventMillis(`Paddle ${eventType}`, eventOccurredAtMs); const transactionId = requirePaddleEventResourceId(eventData, eventType); if (!userId) throw new Error(`Paddle ${eventType} event did not include actor ownership`); await runBillingMutation("upsertCheckout", { userId: userId as Id<"users">, provider: "paddle", providerCheckoutId: transactionId, requestKey, status: "completed", customerId, metadata: customData, providerEventAt }); if (customerId) await runBillingMutation("upsertCustomer", { userId: userId as Id<"users">, provider: "paddle", providerCustomerId: customerId, metadata: customData }); break; }',
    '      case "transaction_paid": { const providerEventAt = requireProviderEventMillis(`Paddle ${eventType}`, eventOccurredAtMs); const transactionId = requirePaddleEventResourceId(eventData, eventType); if (!userId) throw new Error(`Paddle ${eventType} event did not include actor ownership`); const details = isRecord(eventData.details) ? eventData.details : {}; const totals = isRecord(details.totals) ? details.totals : {}; const amount = Number.parseInt(nonEmptyString(totals.total) ?? "0", 10); const currency = nonEmptyString(eventData.currencyCode) ?? nonEmptyString(eventData.currency_code) ?? undefined; const subscriptionId = nonEmptyString(eventData.subscriptionId) ?? nonEmptyString(eventData.subscription_id) ?? undefined; await runBillingMutation("upsertInvoice", { userId: userId as Id<"users">, provider: "paddle", providerInvoiceId: transactionId, status: "paid", amount, currency, customerId: customerId ?? undefined, subscriptionId, metadata: customData, providerEventAt }); break; }',
    '      case "subscription_created": case "subscription_updated": case "subscription_canceled": { const providerEventAt = requireProviderEventMillis(`Paddle ${eventType}`, eventOccurredAtMs); const subscriptionId = requirePaddleEventResourceId(eventData, eventType); const status = paddleEventKind(eventType) === "subscription_canceled" ? "canceled" as const : mapPaddleSubscriptionStatus(eventData.status); if (userId) await runBillingMutation("upsertSubscription", { userId: userId as Id<"users">, provider: "paddle", providerSubscriptionId: subscriptionId, status, metadata: customData, providerEventAt }); else await runBillingMutation("updateSubscriptionStatus", { provider: "paddle", providerSubscriptionId: subscriptionId, status, metadata: customData, providerEventAt }); break; }',
    "      default: break;",
    "    }",
    '  } catch (error) { const message = error instanceof Error ? error.message : String(error); try { await runBillingMutation("failWebhookEvent", { provider: "paddle", providerEventId: eventId, leaseToken: claim.leaseToken, error: message }); } catch (releaseError) { logger.error(`[paddle webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`); } return new Response("Webhook handler failed", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  try { await runBillingMutation("completeWebhookEvent", { provider: "paddle", providerEventId: eventId, leaseToken: claim.leaseToken }); } catch (error) { const message = error instanceof Error ? error.message : String(error); try { await runBillingMutation("failWebhookEvent", { provider: "paddle", providerEventId: eventId, leaseToken: claim.leaseToken, error: message }); } catch (releaseError) { logger.error(`[paddle webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`); } return new Response("Webhook event store unavailable", { status: 500, headers: { "Retry-After": "60" } }); }',
    '  return new Response("ok", { status: 200 });',
    "}",
  ].join("\n");
}

function asTanstack(source: string): string {
  const handler = source
    .replace(
      'import { createHash, randomUUID } from "node:crypto";',
      'import { createFileRoute } from "@tanstack/react-router";\nimport { createHash, randomUUID } from "node:crypto";',
    )
    .replace(
      'import { createHash } from "node:crypto";',
      'import { createFileRoute } from "@tanstack/react-router";\nimport { createHash } from "node:crypto";',
    )
    .replace(
      "export async function POST(req: Request): Promise<Response> {",
      "async function POST({ request }: { request: Request }): Promise<Response> {",
    )
    .replaceAll("req.headers", "request.headers")
    .replaceAll("rejectDeclaredBodySize(req)", "rejectDeclaredBodySize(request)");
  return `${handler}\nexport const Route = createFileRoute("/api/webhooks/paddle")({ server: { handlers: { POST } } });\n`;
}

export function paddleNextContent(imp: DbImports): string {
  return (imp as ConvexImp).isConvex ? convexNext(imp) : baseNext(imp);
}
export function paddleNextConvexContent(imp: DbImports): string {
  return convexNext(imp);
}
export function paddleTanstackContent(imp: DbImports): string {
  return asTanstack((imp as ConvexImp).isConvex ? convexNext(imp) : baseNext(imp));
}
export function paddleTanstackConvexContent(imp: DbImports): string {
  return asTanstack(convexNext(imp));
}
