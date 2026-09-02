import { file, type TemplateFile } from "../shared.js";
import type { ProjectMode } from "../../lib/addons.js";
import { resultImportForMode } from "./shared.js";

function billingIndexContent(mode: ProjectMode): string {
  const resultModule = mode === "monorepo" ? "@repo/kernel" : "@/server/kernel/result.js";
  return `import "server-only";
export { createCheckoutService } from "./create-checkout.service.js";
export { listSubscriptionsService } from "./list-subscriptions.service.js";
export { createPortalSessionService } from "./create-portal-session.service.js";
export { createBillingPriceCatalog } from "./billing-price-catalog.js";
export { validateBillingRedirectUrl } from "./redirect-url-policy.js";
export type { BillingProviderName, CheckoutRecord, CheckoutIntentClaim, BillingProviderPort, BillingCheckoutRepositoryPort, BillingCustomerLookupPort, BillingPriceCatalogPort, CreateCheckoutInput, CreateCheckoutDeps, CreateCheckoutOutput } from "./create-checkout.service.js";
export type { BillingPortalErrorCode, PortalCustomerRepositoryPort, PortalProviderPort, PortalSessionRecord, CreatePortalSessionInput, CreatePortalSessionDeps, CreatePortalSessionOutput } from "./create-portal-session.service.js";
export type { BillingRedirectErrorCode, BillingRedirectValidation } from "./redirect-url-policy.js";
export type { BillingSnapshot, BillingSnapshotRepositoryPort } from "./list-subscriptions.service.js";
export type { Result } from "${resultModule}";
`;
}

function billingServerContent(): string {
  return `import "server-only";
export { createCheckoutService, listSubscriptionsService, createPortalSessionService, createBillingPriceCatalog, validateBillingRedirectUrl } from "./index.js";
export { billingCustomerRepository } from "./billing-customer.repository.js";
export { billingCheckoutRepository } from "./billing-checkout.repository.js";
export { billingSnapshotRepository } from "./billing-snapshot.repository.js";
`;
}

export function billingCreateCheckoutContent(mode: ProjectMode): string {
  const resultImport = resultImportForMode(mode);
  return `import "server-only";\n${resultImport}
export type BillingProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface CheckoutRecord { id: string; provider: BillingProviderName; url: string; status: string; }
export interface BillingProviderPort {
  createCheckout(input: {
    userId: string;
    priceId: string;
    successUrl: string;
    failureUrl?: string;
    cancelUrl?: string;
    customerEmail?: string;
    customerId?: string;
    requestKey: string;
    metadata?: Record<string, string>;
    quantity?: number;
  }): Promise<{ id: string; url: string }>;
  createCustomer(input: { email: string; userId: string; idempotencyKey: string }): Promise<{ id: string; providerCustomerId?: string }>;
}
export interface CreateCheckoutInput {
  provider: BillingProviderName;
  userId: string;
  planId: "pro";
  successUrl: string;
  failureUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  quantity?: number;
  requestKey: string;
}
export type CheckoutIntentClaim =
  | { status: "claimed"; leaseToken: string }
  | { status: "completed"; checkout: { id: string; url: string } }
  | { status: "in_flight" };
export interface BillingCheckoutRepositoryPort {
  claim(input: { actorId: string; provider: BillingProviderName; requestKey: string }): Promise<CheckoutIntentClaim>;
  complete(input: { actorId: string; provider: BillingProviderName; requestKey: string; leaseToken: string; providerCheckoutId: string; url: string }): Promise<void>;
}
export interface BillingCustomerLookupPort {
  findProviderCustomerId(input: { actorId: string; provider: BillingProviderName }): Promise<string | null>;
  saveProviderCustomer(input: { actorId: string; provider: BillingProviderName; providerCustomerId: string; email: string }): Promise<string>;
}
export interface BillingPriceCatalogPort {
  resolvePrice(input: { provider: BillingProviderName; planId: "pro" }): Promise<string>;
}
export interface CreateCheckoutDeps {
  billingProvider: BillingProviderPort;
  customerRepository: BillingCustomerLookupPort;
  checkoutRepository: BillingCheckoutRepositoryPort;
  priceCatalog: BillingPriceCatalogPort;
}
export type CreateCheckoutOutput = Result<CheckoutRecord, Error>;
export async function createCheckoutService(input: CreateCheckoutInput, deps: CreateCheckoutDeps): Promise<CreateCheckoutOutput> {
  try {
    if (!input.requestKey) throw new Error("requestKey is required");
    const priceId = await deps.priceCatalog.resolvePrice({ provider: input.provider, planId: input.planId });
    const intent = await deps.checkoutRepository.claim({
      actorId: input.userId,
      provider: input.provider,
      requestKey: input.requestKey,
    });
    if (intent.status === "completed") {
      return ok({ id: intent.checkout.id, provider: input.provider, url: intent.checkout.url, status: "pending" });
    }
    if (intent.status === "in_flight") {
      throw new Error("CHECKOUT_IN_PROGRESS: retry this requestKey after the current attempt finishes");
    }
    let customerId = await deps.customerRepository.findProviderCustomerId({
      actorId: input.userId,
      provider: input.provider,
    });
    if (!customerId) {
      if (!input.customerEmail) throw new Error("customerEmail is required to create a billing customer");
      const customer = await deps.billingProvider.createCustomer({
        email: input.customerEmail,
        userId: input.userId,
        idempotencyKey: \`customer:\${input.provider}:\${input.userId}\`,
      });
      customerId = customer.providerCustomerId ?? customer.id;
      if (!customerId) throw new Error("Billing provider did not return a customer id");
      customerId = await deps.customerRepository.saveProviderCustomer({
        actorId: input.userId,
        provider: input.provider,
        providerCustomerId: customerId,
        email: input.customerEmail,
      });
    }
    const checkout = await deps.billingProvider.createCheckout({
      userId: input.userId,
      priceId,
      successUrl: input.successUrl,
      failureUrl: input.failureUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: input.customerEmail,
      customerId: customerId ?? undefined,
      requestKey: input.requestKey,
      metadata: { planId: input.planId },
      quantity: input.quantity,
    });
    await deps.checkoutRepository.complete({
      actorId: input.userId,
      provider: input.provider,
      requestKey: input.requestKey,
      leaseToken: intent.leaseToken,
      providerCheckoutId: checkout.id,
      url: checkout.url,
    });
    return ok({
      id: checkout.id,
      provider: input.provider,
      url: checkout.url,
      status: "pending",
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
`;
}

export function billingCheckoutRepositoryContent(
  mode: ProjectMode,
  database: "postgres" | "convex",
): string {
  const portImport = "./create-checkout.service.js";
  if (database === "convex") {
    const databaseImport = mode === "monorepo" ? "@repo/database" : "@/server/db";
    return `import "server-only";
import { convexClient } from "${databaseImport}";
import { api } from "../../../../convex/_generated/api";
import type { BillingCheckoutRepositoryPort } from "${portImport}";

function trustedBillingServerToken(): string {
  const token = process.env.BETTER_AUTH_SECRET;
  if (!token || token.length < 32 || token.startsWith("REPLACE_WITH")) {
    throw new Error("BETTER_AUTH_SECRET is required for trusted billing mutations");
  }
  return token;
}

export const billingCheckoutRepository: BillingCheckoutRepositoryPort = {
  async claim({ actorId, provider, requestKey }) {
    return await convexClient.action(api.billingServer.mutate, {
      serverToken: trustedBillingServerToken(),
      operation: "claimCheckoutIntent",
      input: { userId: actorId, provider, requestKey },
    });
  },
  async complete({ actorId, provider, requestKey, leaseToken, providerCheckoutId, url }) {
    await convexClient.action(api.billingServer.mutate, {
      serverToken: trustedBillingServerToken(),
      operation: "completeCheckoutIntent",
      input: { userId: actorId, provider, requestKey, leaseToken, providerCheckoutId, url },
    });
  },
};
`;
  }

  const imports =
    mode === "monorepo"
      ? `import { db } from "@repo/database";
import { checkouts } from "@repo/billing";`
      : `import { db } from "@/server/db";
import { checkouts } from "@/server/db/schema/billing";`;
  return `import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
${imports}
import type { BillingCheckoutRepositoryPort } from "${portImport}";

const CHECKOUT_CREATION_LEASE_MS = 5 * 60 * 1_000;

export const billingCheckoutRepository: BillingCheckoutRepositoryPort = {
  async claim({ actorId, provider, requestKey }) {
    const now = new Date();
    const leaseToken = randomUUID();
    const [created] = await db
      .insert(checkouts)
      .values({ userId: actorId, provider, requestKey, creationState: "creating", creationStartedAt: now, creationLeaseToken: leaseToken, status: "pending" })
      .onConflictDoNothing({ target: [checkouts.userId, checkouts.provider, checkouts.requestKey] })
      .returning({ leaseToken: checkouts.creationLeaseToken });
    if (created?.leaseToken) return { status: "claimed", leaseToken: created.leaseToken };
    const existing = await db.query.checkouts.findFirst({ where: and(eq(checkouts.userId, actorId), eq(checkouts.provider, provider), eq(checkouts.requestKey, requestKey)) });
    if (existing?.creationState === "ready" && existing.providerCheckoutId && existing.url) {
      return { status: "completed", checkout: { id: existing.providerCheckoutId, url: existing.url } };
    }
    if (!existing) throw new Error("Checkout intent claim disappeared");
    if (existing.creationStartedAt && existing.creationStartedAt.getTime() > now.getTime() - CHECKOUT_CREATION_LEASE_MS) {
      return { status: "in_flight" };
    }
    const leaseOwnerGuard = existing.creationLeaseToken ? eq(checkouts.creationLeaseToken, existing.creationLeaseToken) : isNull(checkouts.creationLeaseToken);
    const leaseTimeGuard = existing.creationStartedAt ? eq(checkouts.creationStartedAt, existing.creationStartedAt) : isNull(checkouts.creationStartedAt);
    const [reclaimed] = await db.update(checkouts).set({ creationStartedAt: now, creationLeaseToken: leaseToken, updatedAt: now }).where(and(eq(checkouts.id, existing.id), eq(checkouts.creationState, "creating"), leaseOwnerGuard, leaseTimeGuard)).returning({ leaseToken: checkouts.creationLeaseToken });
    return reclaimed?.leaseToken ? { status: "claimed", leaseToken: reclaimed.leaseToken } : { status: "in_flight" };
  },
  async complete({ actorId, provider, requestKey, leaseToken, providerCheckoutId, url }) {
    const [stored] = await db.update(checkouts).set({ providerCheckoutId, url, creationState: "ready", creationStartedAt: null, creationLeaseToken: null, updatedAt: new Date() }).where(and(eq(checkouts.userId, actorId), eq(checkouts.provider, provider), eq(checkouts.requestKey, requestKey), eq(checkouts.creationState, "creating"), eq(checkouts.creationLeaseToken, leaseToken))).returning({ id: checkouts.id });
    if (stored) return;
    const existing = await db.query.checkouts.findFirst({ where: and(eq(checkouts.userId, actorId), eq(checkouts.provider, provider), eq(checkouts.requestKey, requestKey)) });
    if (existing?.creationState === "ready" && existing.providerCheckoutId === providerCheckoutId) {
      if (existing.url !== url) await db.update(checkouts).set({ url, updatedAt: new Date() }).where(eq(checkouts.id, existing.id));
      return;
    }
    throw new Error("Checkout intent completion lost its lease");
  },
};
`;
}

function billingPriceCatalogContent(): string {
  return `import "server-only";
import type { BillingPriceCatalogPort, BillingProviderName } from "./create-checkout.service.js";

const PRO_PRICE_ENV: Record<BillingProviderName, string> = {
  stripe: "BILLING_STRIPE_PRO_PRICE_ID",
  chargily: "BILLING_CHARGILY_PRO_PRICE_ID",
  paddle: "BILLING_PADDLE_PRO_PRICE_ID",
  polar: "BILLING_POLAR_PRO_PRODUCT_ID",
};

export function createBillingPriceCatalog(readEnvironment: (name: string) => string | undefined): BillingPriceCatalogPort {
  return {
    async resolvePrice({ provider, planId }) {
      if (planId !== "pro") throw new Error("Unsupported billing plan");
      const envName = PRO_PRICE_ENV[provider];
      const value = readEnvironment(envName);
      if (!value || value.startsWith("REPLACE_WITH")) {
        throw new Error(\`Billing plan pro is not configured for \${provider}\`);
      }
      return value;
    },
  };
}
`;
}

function billingRedirectPolicyContent(): string {
  return `import "server-only";
import { ServiceError } from "../errors.js";

export type BillingRedirectErrorCode = "INVALID_REDIRECT";
export type BillingRedirectValidation =
  | { ok: true; value: string }
  | { ok: false; error: ServiceError<BillingRedirectErrorCode> };

const APP_URL_ENVIRONMENT_KEYS = [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "VITE_APP_URL",
  "EXPO_PUBLIC_APP_URL",
  "EXPO_PUBLIC_API_URL",
] as const;

function isLoopbackBillingHostname(hostname: string): boolean {
  const ipv4 = hostname.split(".");
  const isIpv4Loopback =
    ipv4.length === 4 &&
    ipv4[0] === "127" &&
    ipv4.every((part) => {
      const octet = Number(part);
      return Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === part;
    });
  return (
    hostname === "localhost" ||
    isIpv4Loopback ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function trustedOrigin(value: string | undefined): string | null {
  if (!value || value.startsWith("REPLACE_WITH")) return null;
  try {
    const parsed = new URL(value);
    if (
      value !== value.trim() ||
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "" && parsed.pathname !== "/") ||
      value.includes("?") ||
      value.includes("#") ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== "https:" && !isLoopbackBillingHostname(parsed.hostname))
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

interface TrustedDeepLink {
  protocol: string;
  hostname: string;
}

function billingDeepLinkRoute(value: URL): string {
  const route = value.hostname ? \`/\${value.hostname}\${value.pathname}\` : value.pathname;
  return route.replace(/\\/$/, "");
}

function trustedBillingDeepLink(value: string | undefined): TrustedDeepLink | null {
  if (!value || value.startsWith("REPLACE_WITH")) return null;
  try {
    const parsed = new URL(value);
    if (
      value !== value.trim() ||
      parsed.protocol === "https:" ||
      parsed.protocol === "http:" ||
      ["javascript:", "data:", "file:", "blob:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      value.includes("?") ||
      value.includes("#") ||
      parsed.search ||
      parsed.hash ||
      billingDeepLinkRoute(parsed) !== "/billing"
    ) return null;
    return { protocol: parsed.protocol, hostname: parsed.hostname };
  } catch {
    return null;
  }
}

export function validateBillingRedirectUrl(
  value: string,
  label: string,
  readEnvironment: (name: string) => string | undefined,
): BillingRedirectValidation {
  const allowedOrigins = new Set(
    APP_URL_ENVIRONMENT_KEYS.flatMap((name) => {
      const origin = trustedOrigin(readEnvironment(name));
      return origin ? [origin] : [];
    }),
  );
  const allowedDeepLink = trustedBillingDeepLink(readEnvironment("EXPO_PUBLIC_APP_URL"));
  if (allowedOrigins.size === 0 && !allowedDeepLink) {
    return { ok: false, error: new ServiceError("INVALID_REDIRECT", "Billing application origin or deep link is not configured") };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    return { ok: false, error: new ServiceError("INVALID_REDIRECT", \`\${label} must be an absolute application URL\`, { cause }) };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: new ServiceError("INVALID_REDIRECT", \`\${label} must use a configured application destination\`) };
  }
  if (parsed.protocol === "https:" || parsed.protocol === "http:") {
    if (!allowedOrigins.has(parsed.origin)) {
      return { ok: false, error: new ServiceError("INVALID_REDIRECT", \`\${label} must use a configured application origin\`) };
    }
  } else if (
    !allowedDeepLink ||
    parsed.protocol !== allowedDeepLink.protocol ||
    parsed.hostname !== allowedDeepLink.hostname ||
    billingDeepLinkRoute(parsed) !== "/billing"
  ) {
    return { ok: false, error: new ServiceError("INVALID_REDIRECT", \`\${label} must use the configured billing deep link\`) };
  }
  return { ok: true, value: parsed.toString() };
}
`;
}

function portalServiceContent(mode: ProjectMode): string {
  const resultModule = mode === "monorepo" ? "@repo/kernel" : "@/server/kernel/result.js";
  const resultImport = `import type { Result } from "${resultModule}";\nimport { err } from "${resultModule}";`;
  return `import "server-only";\n${resultImport}
import { ServiceError } from "../errors.js";
export type BillingProviderName = "stripe" | "chargily" | "paddle" | "polar";
export type BillingPortalErrorCode = "NOT_SUPPORTED" | "CUSTOMER_NOT_FOUND" | "PORTAL_FAILED" | "INVALID_REDIRECT";
export interface PortalSessionRecord { url: string; }
export interface PortalProviderPort { createPortalSession?(input: { customerId: string; returnUrl: string }): Promise<PortalSessionRecord>; }
export interface PortalCustomerRepositoryPort {
  findProviderCustomerId(input: { actorId: string; provider: BillingProviderName }): Promise<string | null>;
}
export interface CreatePortalSessionInput { provider: BillingProviderName; actorId: string; returnUrl: string; }
export interface CreatePortalSessionDeps {
  billingProvider: PortalProviderPort;
  customerRepository: PortalCustomerRepositoryPort;
}
export type CreatePortalSessionOutput = Result<PortalSessionRecord, ServiceError<BillingPortalErrorCode>>;
export async function createPortalSessionService(input: CreatePortalSessionInput, deps: CreatePortalSessionDeps): Promise<CreatePortalSessionOutput> {
  if (!deps.billingProvider.createPortalSession) {
    return err(new ServiceError("NOT_SUPPORTED", \`\${input.provider} does not support a customer portal\`));
  }
  try {
    const customerId = await deps.customerRepository.findProviderCustomerId({
      actorId: input.actorId,
      provider: input.provider,
    });
    if (!customerId) {
      return err(new ServiceError("CUSTOMER_NOT_FOUND", \`No \${input.provider} customer belongs to the authenticated user\`));
    }
    const session = await deps.billingProvider.createPortalSession({
      customerId,
      returnUrl: input.returnUrl,
    });
    return { ok: true, value: session };
  } catch (e) {
    return err(new ServiceError("PORTAL_FAILED", "Unable to create customer portal session", { cause: e }));
  }
}
`;
}

export function billingCustomerRepositoryContent(
  mode: ProjectMode,
  database: "postgres" | "convex",
): string {
  const portImport = "./create-checkout.service.js";
  if (database === "convex") {
    const authImport =
      mode === "monorepo"
        ? `import { fetchAuthQuery } from "@repo/auth/server";`
        : `import { fetchAuthQuery } from "@/server/auth";`;
    const databaseImport = mode === "monorepo" ? "@repo/database" : "@/server/db";
    return `import "server-only";
${authImport}
import { convexClient } from "${databaseImport}";
import { api } from "../../../../convex/_generated/api";
import type { BillingCustomerLookupPort } from "${portImport}";

function trustedBillingServerToken(): string {
  const token = process.env.BETTER_AUTH_SECRET;
  if (!token || token.length < 32 || token.startsWith("REPLACE_WITH")) throw new Error("BETTER_AUTH_SECRET is required for trusted billing mutations");
  return token;
}

export const billingCustomerRepository: BillingCustomerLookupPort = {
  async findProviderCustomerId({ provider }) {
    const customer = await fetchAuthQuery(api.billing.getCustomerForActor, { provider });
    return customer?.providerCustomerId ?? null;
  },
  async saveProviderCustomer({ actorId, provider, providerCustomerId, email }) {
    const canonicalProviderCustomerId = await convexClient.action(api.billingServer.mutate, {
      serverToken: trustedBillingServerToken(),
      operation: "upsertCustomer",
      input: { userId: actorId, provider, providerCustomerId, email },
    });
    if (typeof canonicalProviderCustomerId !== "string" || !canonicalProviderCustomerId) {
      throw new Error("Billing customer mapping did not return a canonical provider customer id");
    }
    return canonicalProviderCustomerId;
  },
};
`;
  }

  const imports =
    mode === "monorepo"
      ? `import { db } from "@repo/database";
import { customers } from "@repo/billing";`
      : `import { db } from "@/server/db";
import { customers } from "@/server/db/schema/billing";`;
  return `import "server-only";
import { and, eq } from "drizzle-orm";
${imports}
import type { BillingCustomerLookupPort } from "${portImport}";

export const billingCustomerRepository: BillingCustomerLookupPort = {
  async findProviderCustomerId({ actorId, provider }) {
    const [customer] = await db
      .select({ providerCustomerId: customers.providerCustomerId })
      .from(customers)
      .where(and(eq(customers.userId, actorId), eq(customers.provider, provider)))
      .limit(1);
    return customer?.providerCustomerId ?? null;
  },
  async saveProviderCustomer({ actorId, provider, providerCustomerId, email }) {
    const [created] = await db
      .insert(customers)
      .values({ userId: actorId, provider, providerCustomerId, email })
      .onConflictDoNothing({ target: [customers.userId, customers.provider] })
      .returning({ providerCustomerId: customers.providerCustomerId });
    if (created?.providerCustomerId) return created.providerCustomerId;
    const existing = await db.query.customers.findFirst({
      where: and(eq(customers.userId, actorId), eq(customers.provider, provider)),
    });
    if (!existing) throw new Error("Billing customer mapping belongs to another actor");
    if (email && existing.email !== email) {
      await db.update(customers).set({ email, updatedAt: new Date() }).where(eq(customers.id, existing.id));
    }
    return existing.providerCustomerId;
  },
};
`;
}

function listSubscriptionsContent(mode: ProjectMode): string {
  const resultImport = resultImportForMode(mode);
  return `import "server-only";\n${resultImport}
export interface BillingSnapshot {
  subscriptions: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  usageEvents: Array<Record<string, unknown>>;
  licenseKeys: Array<Record<string, unknown>>;
}
export interface BillingSnapshotRepositoryPort {
  findSnapshot(userId: string): Promise<BillingSnapshot>;
}
export async function listSubscriptionsService(userId: string, repository: BillingSnapshotRepositoryPort): Promise<Result<BillingSnapshot, Error>> {
  try {
    return ok(await repository.findSnapshot(userId));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
`;
}

export function billingSnapshotRepositoryContent(
  mode: ProjectMode,
  database: "postgres" | "convex" = "postgres",
): string {
  const portImport = "./list-subscriptions.service.js";
  if (database === "convex") {
    const authImport =
      mode === "monorepo"
        ? `import { fetchAuthQuery } from "@repo/auth/server";`
        : `import { fetchAuthQuery } from "@/server/auth";`;
    return `import "server-only";
${authImport}
import { api } from "../../../../convex/_generated/api";
import type { BillingSnapshotRepositoryPort } from "${portImport}";
export const billingSnapshotRepository: BillingSnapshotRepositoryPort = {
  async findSnapshot(userId: string) {
    void userId;
    return await fetchAuthQuery(api.billing.getBillingSnapshot, {});
  },
};
`;
  }
  const dbImport =
    mode === "monorepo"
      ? `import { eq, inArray } from "drizzle-orm";
import { db } from "@repo/database";
import { subscriptions, invoices, usage_events, license_keys } from "@repo/billing";`
      : `import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { subscriptions, invoices, usage_events, license_keys } from "@/server/billing/schema/billing";`;

  return `import "server-only";
${dbImport}
import type { BillingSnapshotRepositoryPort } from "${portImport}";
export const billingSnapshotRepository: BillingSnapshotRepositoryPort = {
  async findSnapshot(userId: string) {
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    const subIds = subs.map((s: { id: string }) => s.id);
    const [invs, usage, keys] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.userId, userId)),
      subIds.length ? db.select().from(usage_events).where(inArray(usage_events.subscriptionId, subIds)) : Promise.resolve([]),
      subIds.length ? db.select().from(license_keys).where(inArray(license_keys.subscriptionId, subIds)) : Promise.resolve([]),
    ]);
    return {
      subscriptions: subs,
      invoices: invs,
      usageEvents: usage,
      licenseKeys: keys,
    };
  },
};
`;
}

export function billingServiceFiles(
  mode: ProjectMode,
  database: "postgres" | "convex" = "postgres",
): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/services/src" : "src/server/services";
  return [
    file(`${base}/billing/index.ts`, billingIndexContent(mode)),
    file(`${base}/billing/server.ts`, billingServerContent()),
    file(`${base}/billing/create-checkout.service.ts`, billingCreateCheckoutContent(mode)),
    file(`${base}/billing/billing-price-catalog.ts`, billingPriceCatalogContent()),
    file(`${base}/billing/redirect-url-policy.ts`, billingRedirectPolicyContent()),
    file(`${base}/billing/create-portal-session.service.ts`, portalServiceContent(mode)),
    file(
      `${base}/billing/billing-checkout.repository.ts`,
      billingCheckoutRepositoryContent(mode, database),
    ),
    file(
      `${base}/billing/billing-customer.repository.ts`,
      billingCustomerRepositoryContent(mode, database),
    ),
    file(
      `${base}/billing/billing-snapshot.repository.ts`,
      billingSnapshotRepositoryContent(mode, database),
    ),
    file(`${base}/billing/list-subscriptions.service.ts`, listSubscriptionsContent(mode)),
  ];
}
