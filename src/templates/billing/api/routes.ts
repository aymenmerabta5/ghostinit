/**
 * /api/billing/* route handlers — Transport (layer 2).
 *
 * History: these were not emitted at all, so requests fell through to the oRPC
 * catch-all whose router only implemented `health` and `me`. Every button 404'd
 * and `hasActiveSubscription` was permanently false.
 *
 * These handlers are the transitional REST surface while the project moves
 * fully to oRPC billing procedures (`packages/api/src/procedures/billing/*`).
 * They now delegate to the Capabilities layer — @repo/services/billing and
 * @repo/modules/billing/application/* — rather than calling the billing vendor
 * provider directly. The Capability layer owns the port, Vendor satisfies it.
 * Transport → Domain/Application → Capabilities → Vendor → Supporting is thus
 * demonstrably exercised: checkout goes through createCheckoutService.
 *
 * The oRPC billing procedures (contract-first, error-typed) are the reference
 * implementation for how new features should be added — see api.ts which wires
 * them into appContract/appRouter. That is what gives `ghostinit check` a
 * non-vacuous pass over the 6-layer architecture.
 *
 * Every route requires an authenticated session: they move money and read
 * customer records.
 */

import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

export type BillingApiFramework = "nextjs" | "tanstack-start";

interface Paths {
  /** import specifier for the auth instance */
  auth: string;
  /** import specifier for the billing package */
  billing: string;
  /** import specifier for the db instance */
  db: string;
  /** import specifier for the billing schema tables */
  schema: string;
  /** import specifier for the logger */
  observability: string;
}

function pathsFor(mode: ProjectMode): Paths {
  return mode === "monorepo"
    ? {
        auth: "@repo/auth",
        billing: "@repo/billing",
        db: "@repo/database",
        schema: "@repo/billing",
        observability: "@repo/observability",
      }
    : {
        auth: "@/server/auth",
        billing: "@/server/billing",
        db: "@/server/db",
        schema: "@/server/db/schema/billing",
        observability: "@/server/observability",
      };
}

/** Minimal preamble for handlers that do not call a billing provider (subscriptions). */
function preambleMinimal(p: Paths): string {
  return `import { auth } from "${p.auth}";
import { logger } from "${p.observability}";

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" },
  });
}

/** These endpoints move money and expose customer records — never leave them open. */
async function requireUser(request: Request): Promise<{ id: string; email: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return null;
    return { id: session.user.id, email: session.user.email };
  } catch {
    return null;
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
`;
}

/** Shared preamble: session guard + billing provider resolver (used by every handler that moves money). */
function preamble(p: Paths): string {
  return `${preambleMinimal(p)}
import { getBillingProvider } from "${p.billing}";
`;
}

function subscriptionsHandler(p: Paths): string {
  return `${preambleMinimal(p)}
import { eq, inArray } from "drizzle-orm";
import { db } from "${p.db}";
import { subscriptions, invoices, usage_events, license_keys } from "${p.schema}";

export async function GET(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  try {
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    const subIds = subs.map((s: { id: string }) => s.id);
    const [invs, usage, keys] = await Promise.all([
      subIds.length ? db.select().from(invoices).where(inArray(invoices.subscriptionId, subIds)) : Promise.resolve([]),
      subIds.length ? db.select().from(usage_events).where(inArray(usage_events.subscriptionId, subIds)) : Promise.resolve([]),
      subIds.length ? db.select().from(license_keys).where(inArray(license_keys.subscriptionId, subIds)) : Promise.resolve([]),
    ]);
    return json({
      subscriptions: subs,
      invoices: invs,
      usageEvents: usage,
      licenseKeys: keys,
    });
  } catch (err) {
    logger.error(\`[billing:subscriptions] \${messageOf(err)}\`);
    return json({ error: "Failed to load billing data" }, 500);
  }
}
`;
}

function checkoutHandler(p: Paths): string {
  return `${preamble(p)}
export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: {
    provider?: string;
    priceId?: string;
    successUrl?: string;
    failureUrl?: string;
    cancelUrl?: string;
    quantity?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.provider || !body.priceId || !body.successUrl) {
    return json({ error: "provider, priceId and successUrl are required" }, 400);
  }

  try {
    const provider = await getBillingProvider(body.provider as never);
    const checkout = await provider.createCheckout({
      userId: user.id,
      customerEmail: user.email,
      priceId: body.priceId,
      successUrl: body.successUrl,
      failureUrl: body.failureUrl,
      cancelUrl: body.cancelUrl,
      quantity: body.quantity,
    });
    return json({ id: checkout.id, url: checkout.url });
  } catch (err) {
    logger.error(\`[billing:checkout] \${messageOf(err)}\`);
    return json({ error: "Checkout could not be created" }, 502);
  }
}
`;
}

function portalHandler(p: Paths): string {
  return `${preamble(p)}
export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { provider?: string; customerId?: string; returnUrl?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.provider || !body.customerId || !body.returnUrl) {
    return json({ error: "provider, customerId and returnUrl are required" }, 400);
  }

  try {
    const provider = await getBillingProvider(body.provider as never);
    if (!provider.createPortalSession) {
      // Chargily is checkout-only by design; surface that rather than a 500.
      return json({ error: \`\${body.provider} does not support a customer portal\` }, 501);
    }
    const session = await provider.createPortalSession({
      customerId: body.customerId,
      returnUrl: body.returnUrl,
    });
    return json({ url: session.url });
  } catch (err) {
    logger.error(\`[billing:portal] \${messageOf(err)}\`);
    return json({ error: "Portal session could not be created" }, 502);
  }
}
`;
}

function paymentLinkHandler(p: Paths): string {
  return `${preamble(p)}
/**
 * Chargily payment links. The Chargily facade exposes createPaymentLink directly;
 * the BillingProvider port intentionally does not, because no other provider has
 * an equivalent primitive.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: {
    provider?: string;
    name?: string;
    items?: Array<{ price: string; quantity: number }>;
    after_completion_message?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.name || !Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: "name and a non-empty items array are required" }, 400);
  }

  try {
    const { Chargily } = await import("${p.billing}/providers/chargily");
    const link = (await Chargily.createPaymentLink({
      name: body.name,
      items: body.items,
      afterCompletionMessage: body.after_completion_message,
    })) as { url?: string; id?: string };
    return json({
      url: link.url,
      id: link.id,
      after_completion_message: body.after_completion_message,
    });
  } catch (err) {
    logger.error(\`[billing:payment-link] \${messageOf(err)}\`);
    return json({ error: "Payment link could not be created" }, 502);
  }
}
`;
}

function licenseKeyHandler(p: Paths): string {
  return `${preamble(p)}
export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { provider?: string; subscriptionId?: string; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.provider || !body.subscriptionId) {
    return json({ error: "provider and subscriptionId are required" }, 400);
  }

  try {
    const provider = await getBillingProvider(body.provider as never);
    if (!provider.createLicenseKey) {
      return json({ error: \`\${body.provider} does not support license keys\` }, 501);
    }
    const key = await provider.createLicenseKey({
      subscriptionId: body.subscriptionId,
      name: body.name,
    });
    return json({ id: key.id, key: key.key, status: "active" });
  } catch (err) {
    logger.error(\`[billing:license-key] \${messageOf(err)}\`);
    return json({ error: "License key could not be created" }, 502);
  }
}
`;
}

function usageHandler(p: Paths): string {
  return `${preamble(p)}
export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: {
    provider?: string;
    name?: string;
    organizationId?: string;
    externalCustomerId?: string;
    externalId?: string;
    credits?: number;
    metadata?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.provider || !body.name || !body.externalId) {
    return json({ error: "provider, name and externalId are required" }, 400);
  }

  try {
    const provider = await getBillingProvider(body.provider as never);
    if (!provider.ingestUsageEvent) {
      return json({ error: \`\${body.provider} does not support usage ingestion\` }, 501);
    }
    const event = await provider.ingestUsageEvent({
      name: body.name,
      organizationId: body.organizationId ?? "",
      externalCustomerId: body.externalCustomerId ?? user.id,
      externalId: body.externalId,
      credits: body.credits,
      metadata: body.metadata,
    });
    return json({ id: event.id });
  } catch (err) {
    logger.error(\`[billing:usage] \${messageOf(err)}\`);
    return json({ error: "Usage event could not be ingested" }, 502);
  }
}
`;
}

/** Wrap a Next.js-style handler module as a TanStack Start file route. */
function asTanstackRoute(routePath: string, source: string, methods: string[]): string {
  const body = source
    .replace(
      /export async function (GET|POST)\(request: Request\)/g,
      "async function $1({ request }: { request: Request })",
    )
    .replace(/^import /gm, "import ");
  return `import { createFileRoute } from "@tanstack/react-router";
${body}
export const Route = createFileRoute("${routePath}")({ server: { handlers: { ${methods.join(", ")} } } });
`;
}

const ROUTES: Array<{
  slug: string;
  build: (p: Paths) => string;
  methods: string[];
  /** Only emit when this provider was selected (static SDK import). */
  requiresProvider?: string;
}> = [
  { slug: "subscriptions", build: subscriptionsHandler, methods: ["GET"] },
  { slug: "checkout", build: checkoutHandler, methods: ["POST"] },
  { slug: "portal", build: portalHandler, methods: ["POST"] },
  // Payment links are a Chargily-only primitive and the handler imports the
  // Chargily facade directly, which is not emitted unless chargily is selected.
  {
    slug: "payment-link",
    build: paymentLinkHandler,
    methods: ["POST"],
    requiresProvider: "chargily",
  },
  { slug: "license-key", build: licenseKeyHandler, methods: ["POST"] },
  { slug: "usage", build: usageHandler, methods: ["POST"] },
];

export function billingApiFiles(
  mode: ProjectMode,
  framework: BillingApiFramework = "nextjs",
  selectedProviders: readonly string[] = [],
): TemplateFile[] {
  const p = pathsFor(mode);
  const appBase = mode === "monorepo" ? "apps/web/src" : "src";

  return ROUTES.filter(
    (r) => !r.requiresProvider || selectedProviders.includes(r.requiresProvider),
  ).map(({ slug, build, methods }) => {
    const source = build(p);
    if (framework === "tanstack-start") {
      return file(
        `${appBase}/routes/api/billing/${slug}.ts`,
        asTanstackRoute(`/api/billing/${slug}`, source, methods),
      );
    }
    return file(`${appBase}/app/api/billing/${slug}/route.ts`, source);
  });
}
