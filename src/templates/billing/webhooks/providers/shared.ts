/**
 * Shared webhook helpers — SSOT: BillingProviderName derived from
 * BILLING_PROVIDER_NAMES in providers/interface/types.ts (template) which
 * mirrors BILLING_PROVIDERS in src/lib/constants.ts (CLI).
 * Adding 5th provider: update BILLING_PROVIDER_NAMES + add provider folder.
 * getPath and getDbImports are framework-agnostic helpers.
 */

// SSOT re-export — single source of truth lives in interface/types.ts
export { BILLING_PROVIDER_NAMES } from "../../providers/interface/types.js";
import { BILLING_PROVIDER_NAMES } from "../../providers/interface/types.js";

export type BillingProviderName = (typeof BILLING_PROVIDER_NAMES)[number];
export type WebhookFramework = "next" | "tanstack" | "single";
export type WebhookMode = "monorepo" | "single";

export interface DbImports {
  db: string;
  billingSchema: string;
  observability: string;
}

/**
 * DbImports plus the Convex-specific context a provider fragment needs.
 * `convexApi` is pre-resolved by the factory so provider fragments never
 * hardcode `../../` depths — see convexApiImport below.
 */
export interface ConvexImports extends DbImports {
  isConvex?: boolean;
  isMonorepo?: boolean;
  convexApi?: string;
}

/**
 * Relative specifier from a generated file to the root-level `convex/_generated/api`.
 *
 * The `convex/` directory is always emitted at the project root in BOTH monorepo
 * and single mode (see modes/single/composers/*.ts which filter on `convex/`).
 * Hardcoding a fixed `../../../` depth silently breaks whenever a route sits at a
 * different nesting level — e.g. `apps/web/src/app/api/webhooks/<p>/route.ts` is
 * seven directories deep, not three. Derive it from the file's own path instead.
 */
export function convexApiImport(fromFile: string): string {
  const dir = posixDirname(fromFile);
  const target = "convex/_generated/api";
  if (dir === "") return `./${target}`;
  const up = "../".repeat(dir.split("/").length);
  return `${up}${target}`;
}

/**
 * Resolve the `convex/_generated/api` specifier for a provider fragment.
 *
 * Prefers the value the factory already computed from the real emitted path;
 * falls back to deriving it from getPath() so a fragment rendered outside the
 * factory (tests, direct calls) still gets a correct depth rather than a
 * hardcoded guess.
 */
export function convexApiFor(
  imp: DbImports,
  provider: BillingProviderName,
  framework: Exclude<WebhookFramework, "single">,
): string {
  const provided = (imp as ConvexImports).convexApi;
  if (provided) return provided;
  const mode: WebhookMode = imp.db.includes("@repo/database") ? "monorepo" : "single";
  return convexApiImport(getPath(provider, framework, mode));
}

function posixDirname(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
}

export function getDbImports(isMonorepo: boolean): DbImports {
  if (isMonorepo) {
    return {
      db: "@repo/database",
      billingSchema: "@repo/billing",
      observability: "@repo/observability",
    };
  }
  return {
    db: "@/server/db",
    billingSchema: "@/server/db/schema/billing",
    observability: "@/server/observability",
  };
}

export function getPath(
  provider: BillingProviderName,
  framework: WebhookFramework,
  mode: WebhookMode,
): string {
  const isMonorepo = mode === "monorepo";
  if (framework === "tanstack") {
    return isMonorepo
      ? `apps/web/src/routes/api/webhooks/${provider}.ts`
      : `src/routes/api/webhooks/${provider}.ts`;
  }
  return isMonorepo
    ? `apps/web/src/app/api/webhooks/${provider}/route.ts`
    : `src/app/api/webhooks/${provider}/route.ts`;
}

export const RAW_BODY_COMMENT =
  "// CRITICAL: stream the raw request body once with the bounded reader; never parse or re-encode before signature verification";

export const IDEMPOTENCY_COMMENT =
  "// Idempotent via webhook_events unique(provider+providerEventId) — required query, no optional chaining swallowing";

/** One MiB is ample for provider event envelopes while bounding ingress memory. */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

/**
 * Render the shared raw-body gate used by every generated webhook route.
 *
 * The declared length is rejected before the body is consumed. The byte length
 * is checked while streaming because Content-Length can be absent or false.
 * At most one MiB is accumulated and the reader is cancelled on overflow. The
 * resulting Buffer preserves the exact bytes required by signature verification;
 * the route must never decode and re-encode before verification.
 */
export function webhookBodyLimitHelpers(): string[] {
  return [
    `const MAX_WEBHOOK_BODY_BYTES = ${MAX_WEBHOOK_BODY_BYTES};`,
    "",
    "function payloadTooLarge(): Response {",
    '  return new Response("Webhook payload too large", { status: 413 });',
    "}",
    "",
    "function rejectDeclaredBodySize(request: Request): Request | Response {",
    '  const contentLength = request.headers.get("content-length");',
    "  if (contentLength !== null) {",
    "    const normalizedLength = contentLength.trim();",
    "    if (!/^\\d+$/.test(normalizedLength)) {",
    '      return new Response("Invalid Content-Length", { status: 400 });',
    "    }",
    "    const declaredBytes = Number(normalizedLength);",
    "    if (!Number.isSafeInteger(declaredBytes)) return payloadTooLarge();",
    "    if (declaredBytes > MAX_WEBHOOK_BODY_BYTES) return payloadTooLarge();",
    "  }",
    "  return request;",
    "}",
    "",
    "async function readBoundedWebhookBody(request: Request): Promise<Buffer | Response> {",
    "  const body = request.body;",
    "  if (!body) return Buffer.alloc(0);",
    "  const reader = body.getReader();",
    "  const chunks: Uint8Array[] = [];",
    "  let totalBytes = 0;",
    "  try {",
    "    while (true) {",
    "      const { done, value } = await reader.read();",
    "      if (done) break;",
    "      if (!value || value.byteLength === 0) continue;",
    "      if (totalBytes + value.byteLength > MAX_WEBHOOK_BODY_BYTES) {",
    '        try { await reader.cancel("Webhook payload too large"); } catch {}',
    "        return payloadTooLarge();",
    "      }",
    "      chunks.push(value);",
    "      totalBytes += value.byteLength;",
    "    }",
    "  } finally {",
    "    reader.releaseLock();",
    "  }",
    "  const result = Buffer.allocUnsafe(totalBytes);",
    "  let offset = 0;",
    "  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }",
    "  return result;",
    "}",
  ];
}

/** Render the single byte-preserving read directly inside the route handler. */
export function webhookBodyReadLines(requestName: string): string[] {
  return [
    `  const declaredBodyRejection = rejectDeclaredBodySize(${requestName});`,
    "  if (declaredBodyRejection instanceof Response) return declaredBodyRejection;",
    "  const bodyResult = await readBoundedWebhookBody(declaredBodyRejection);",
    "  if (bodyResult instanceof Response) return bodyResult;",
    "  const buf = bodyResult;",
  ];
}

/** Parse provider-authenticated occurrence times for monotonic state updates. */
export function webhookEventOrderHelpers(): string[] {
  return [
    "function providerEventMillis(...values: unknown[]): number | null {",
    "  for (const value of values) {",
    "    if (value instanceof Date) { const millis = value.getTime(); if (Number.isFinite(millis) && millis > 0) return millis; continue; }",
    '    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value < 1_000_000_000_000 ? value * 1_000 : value;',
    '    if (typeof value === "string" && value.trim()) { const millis = Date.parse(value); if (Number.isFinite(millis) && millis > 0) return millis; }',
    "  }",
    "  return null;",
    "}",
    "",
    "function requireProviderEventMillis(label: string, ...values: unknown[]): number {",
    "  const millis = providerEventMillis(...values);",
    "  if (millis === null) throw new Error(`${label} did not include a valid provider event time`);",
    "  return millis;",
    "}",
  ];
}

/** Render a leased atomic claim for PostgreSQL webhook routes. */
export function postgresWebhookClaimHelpers(provider: BillingProviderName): string[] {
  return [
    "type WebhookPayload = NonNullable<typeof webhook_events.$inferInsert.payload>;",
    'type ClaimResult = { status: "claimed"; leaseToken: string } | { status: "completed" } | { status: "in_flight" };',
    "const WEBHOOK_LEASE_MS = 5 * 60 * 1_000;",
    "",
    "async function claimWebhookDelivery(providerEventId: string, type: string, payload: WebhookPayload): Promise<ClaimResult> {",
    "  const now = new Date();",
    "  const leaseToken = randomUUID();",
    `  const [inserted] = await db.insert(webhook_events).values({ provider: "${provider}", providerEventId, type, payload, processed: false, attemptCount: 1, processingStartedAt: now, leaseToken })`,
    "    .onConflictDoNothing({ target: [webhook_events.provider, webhook_events.providerEventId] })",
    "    .returning({ leaseToken: webhook_events.leaseToken });",
    '  if (inserted?.leaseToken) return { status: "claimed", leaseToken: inserted.leaseToken };',
    `  const existing = await db.query.webhook_events.findFirst({ where: and(eq(webhook_events.provider, "${provider}"), eq(webhook_events.providerEventId, providerEventId)) });`,
    '  if (existing?.processed) return { status: "completed" };',
    '  if (!existing) throw new Error("Webhook delivery claim disappeared");',
    '  if (existing.processingStartedAt && existing.processingStartedAt.getTime() > now.getTime() - WEBHOOK_LEASE_MS) return { status: "in_flight" };',
    "  // CAS the persisted owner token (and its timestamp) so exactly one stale-worker reclaim wins.",
    "  const leaseOwnerGuard = existing.leaseToken ? eq(webhook_events.leaseToken, existing.leaseToken) : isNull(webhook_events.leaseToken);",
    "  const leaseTimeGuard = existing.processingStartedAt ? eq(webhook_events.processingStartedAt, existing.processingStartedAt) : isNull(webhook_events.processingStartedAt);",
    "  const [reclaimed] = await db.update(webhook_events).set({ type, payload, processingStartedAt: now, leaseToken, lastError: null, attemptCount: sql`${webhook_events.attemptCount} + 1` }).where(and(",
    `    eq(webhook_events.provider, "${provider}"), eq(webhook_events.providerEventId, providerEventId), eq(webhook_events.processed, false), leaseOwnerGuard, leaseTimeGuard,`,
    "  )).returning({ leaseToken: webhook_events.leaseToken });",
    '  return reclaimed?.leaseToken ? { status: "claimed", leaseToken: reclaimed.leaseToken } : { status: "in_flight" };',
    "}",
    "",
    "async function failWebhookDelivery(providerEventId: string, leaseToken: string, error: string): Promise<void> {",
    `  await db.update(webhook_events).set({ processingStartedAt: null, leaseToken: null, lastError: error.slice(0, 2_000) }).where(and(eq(webhook_events.provider, "${provider}"), eq(webhook_events.providerEventId, providerEventId), eq(webhook_events.processed, false), eq(webhook_events.leaseToken, leaseToken)));`,
    "}",
    "",
    "async function completeWebhookDelivery(providerEventId: string, leaseToken: string): Promise<void> {",
    `  const [completed] = await db.update(webhook_events).set({ processed: true, processedAt: new Date(), processingStartedAt: null, leaseToken: null, lastError: null }).where(and(eq(webhook_events.provider, "${provider}"), eq(webhook_events.providerEventId, providerEventId), eq(webhook_events.processed, false), eq(webhook_events.leaseToken, leaseToken))).returning({ id: webhook_events.id });`,
    '  if (!completed) throw new Error("Webhook delivery completion was not stored");',
    "}",
  ];
}

/** Render the secret-authenticated bridge from framework routes to Convex internal mutations. */
export function convexBillingServerHelpers(): string[] {
  return [
    'type BillingServerOperation = "claimWebhookEvent" | "completeWebhookEvent" | "failWebhookEvent" | "claimCheckoutIntent" | "completeCheckoutIntent" | "upsertCustomer" | "upsertSubscription" | "updateSubscriptionStatus" | "claimProviderSubscriptionState" | "commitProviderSubscriptionState" | "cancelProviderSubscriptionState" | "createProviderSubscriptionState" | "upsertCheckout" | "upsertInvoice" | "recordUsageEvent" | "upsertProduct" | "upsertPrice";',
    "function trustedBillingServerToken(): string {",
    "  const token = process.env.BETTER_AUTH_SECRET;",
    '  if (!token || token.length < 32 || token.startsWith("REPLACE_WITH")) throw new Error("BETTER_AUTH_SECRET is required for trusted billing mutations");',
    "  return token;",
    "}",
    "async function runBillingMutation<T = unknown>(operation: BillingServerOperation, input: Record<string, unknown>): Promise<T> {",
    "  return await convexClient.action(api.billingServer.mutate, { serverToken: trustedBillingServerToken(), operation, input }) as T;",
    "}",
  ];
}
