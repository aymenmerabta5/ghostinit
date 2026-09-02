import type { ProjectMode } from "../../lib/addons.js";
import type { RequestApplicationSelection } from "./application.js";

function importPath(mode: ProjectMode, monorepo: string, single: string): string {
  return mode === "monorepo" ? monorepo : single;
}

export function requestApplicationServerContent(
  mode: ProjectMode,
  database: "postgres" | "convex",
  selection: RequestApplicationSelection,
): string {
  // This composition root is server-only. Import the owning server entrypoint
  // directly so Convex helper exports never depend on the intentionally narrow
  // public auth barrel.
  const authImport = importPath(mode, "@repo/auth/server", "@/server/auth");
  const billingImport = importPath(mode, "@repo/billing", "@/server/billing");
  const billingServiceImport = importPath(
    mode,
    "../billing/server.js",
    "@/server/services/billing/server",
  );
  const messagingDatabaseImports =
    selection.messaging && database === "postgres"
      ? mode === "monorepo"
        ? `import { conversationParticipants, conversations, db } from "@repo/database";`
        : `import { db } from "@/server/db";
import { conversationParticipants, conversations } from "@/server/db/schema/messaging";`
      : "";
  const actorResolver =
    database === "convex"
      ? `interface VerifiedSession {
  user: { id: string; email: string; emailVerified?: boolean };
  session: { id: string; createdAt: string | Date };
}

async function verifiedSession(headers: Headers): Promise<VerifiedSession | null> {
  const requestUrl = new URL("/api/auth/get-session", "http://ghostinit.local");
  requestUrl.searchParams.set("disableCookieCache", "true");
  requestUrl.searchParams.set("disableRefresh", "true");
  const response = await auth.handler(new Request(requestUrl, { headers }));
  if (!response.ok) return null;
  const value = (await response.json()) as Partial<VerifiedSession> | null;
  return value?.user?.id && value.user.email && value.session?.id && value.session.createdAt
    ? value as VerifiedSession
    : null;
}

async function resolvePrincipal(headers: Headers): Promise<RequestPrincipal | null> {
  const [actor, session] = await Promise.all([getRequestUser(), verifiedSession(headers)]);
  if (!actor || !session || actor.authId !== session.user.id) return null;
  if (actor.banned === true) {
    return {
      userId: String(actor._id), identityUserId: actor.authId, sessionId: session.session.id,
      email: actor.email, emailVerified: actor.emailVerified === true, name: actor.name ?? null,
      role: actor.role ?? "user", banned: true, authenticatedAt: new Date(session.session.createdAt),
      activeOrganizationId: null, activeTeamId: null,
    };
  }
  const identity = await resolveIdentityActorForRequest({
    authSessionId: session.session.id,
    userId: String(actor._id),
  });
  if (!identity) return null;
  return {
    userId: String(actor._id),
    identityUserId: actor.authId,
    sessionId: session.session.id,
    email: actor.email,
    emailVerified: session.user.emailVerified === true && actor.emailVerified === true,
    name: actor.name ?? null,
    role: actor.role ?? "user",
    banned: actor.banned === true,
    authenticatedAt: identity.authenticatedAt,
    activeOrganizationId: identity.activeOrganizationId,
    activeTeamId: identity.activeTeamId,
  };
}`
      : `async function resolvePrincipal(headers: Headers): Promise<RequestPrincipal | null> {
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session?.user) return null;
  const identity = await resolveIdentityActorForRequest({
    sessionId: session.session.id,
    userId: session.user.id,
  });
  if (!identity) return null;
  return {
    userId: identity.user.id,
    identityUserId: identity.user.identityId ?? identity.user.id,
    sessionId: identity.actor.sessionId,
    email: identity.user.email,
    emailVerified: identity.user.emailVerified,
    name: identity.user.name ?? null,
    role: identity.user.role ?? "user",
    banned: identity.user.banned === true,
    authenticatedAt: identity.actor.authenticatedAt,
    activeOrganizationId: identity.actor.activeOrganizationId,
    activeTeamId: identity.actor.activeTeamId,
  };
}`;
  const imports = [
    `import { auth${database === "convex" ? ", getRequestUser" : ""}${database === "convex" && selection.messaging ? ", fetchAuthQuery" : ""} } from "${authImport}";`,
    database === "convex" && selection.messaging
      ? `import { api } from "../../../../convex/_generated/api";`
      : "",
    `import { createRequestApplication${selection.billing ? ", type BillingApplicationPort" : ""}${selection.messaging ? ", type MessagingApplicationPort" : ""} } from "./facade.js";`,
    selection.messaging && database === "postgres"
      ? `import { desc, eq } from "drizzle-orm";
${messagingDatabaseImports}`
      : "",
    selection.billing || (selection.messaging && database === "convex")
      ? `import { RequestApplicationError } from "./errors.js";`
      : "",
    `import { rateLimit } from "./rate-limit.js";`,
    `import type { ${selection.billing ? "BillingCheckoutInput, BillingPaymentLinkInput, BillingPortalInput, " : ""}${selection.messaging && database === "convex" ? "ConversationDto, " : ""}RequestPrincipal } from "./types.js";`,
    selection.admin ? `import { createAdminServiceForRequest } from "./composition/admin.js";` : "",
    selection.identity
      ? `import { createIdentityServiceForRequest, resolveIdentityActorForRequest } from "./composition/identity.js";`
      : "",
    selection.notifications
      ? `import { createNotificationServiceForRequest } from "./composition/notifications.js";`
      : "",
    selection.billing
      ? `import { getBillingProvider } from "${billingImport}";
import {
  billingCheckoutRepository,
  billingCustomerRepository,
  billingSnapshotRepository,
  createBillingPriceCatalog,
  createCheckoutService,
  createPortalSessionService,
  listSubscriptionsService,
  validateBillingRedirectUrl,
} from "${billingServiceImport}";`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const billingComposition = selection.billing
    ? `
function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: Error }, message: string): T {
  if (result.ok) return result.value;
  const code = "code" in result.error && typeof result.error.code === "string"
    ? result.error.code
    : null;
  if (code === "NOT_SUPPORTED") {
    throw new RequestApplicationError("APPLICATION_NOT_IMPLEMENTED", "Customer portal is not supported", { cause: result.error });
  }
  if (code === "CUSTOMER_NOT_FOUND") {
    throw new RequestApplicationError("APPLICATION_NOT_FOUND", "Billing customer not found", { cause: result.error });
  }
  throw new RequestApplicationError("APPLICATION_INTERNAL_ERROR", message, { cause: result.error });
}

const billingPriceCatalog = createBillingPriceCatalog((name) => process.env[name]);
const billing: BillingApplicationPort = {
  async subscriptions(userId) {
    return unwrap(await listSubscriptionsService(userId, billingSnapshotRepository), "Unable to load billing data");
  },
  async createCheckout(principal, input: BillingCheckoutInput) {
    const successUrl = validateBillingRedirectUrl(input.successUrl, "Checkout success URL", (name) => process.env[name]);
    if (!successUrl.ok) throw new RequestApplicationError("APPLICATION_BAD_REQUEST", "Invalid checkout input", { cause: successUrl.error });
    const failureUrl = input.failureUrl ? validateBillingRedirectUrl(input.failureUrl, "Checkout failure URL", (name) => process.env[name]) : null;
    if (failureUrl && !failureUrl.ok) throw new RequestApplicationError("APPLICATION_BAD_REQUEST", "Invalid checkout input", { cause: failureUrl.error });
    const cancelUrl = input.cancelUrl ? validateBillingRedirectUrl(input.cancelUrl, "Checkout cancel URL", (name) => process.env[name]) : null;
    if (cancelUrl && !cancelUrl.ok) throw new RequestApplicationError("APPLICATION_BAD_REQUEST", "Invalid checkout input", { cause: cancelUrl.error });
    const provider = await getBillingProvider(input.provider);
    return unwrap(await createCheckoutService({
      ...input,
      userId: principal.userId,
      customerEmail: principal.email,
      successUrl: successUrl.value,
      failureUrl: failureUrl?.value,
      cancelUrl: cancelUrl?.value,
    }, {
      billingProvider: provider,
      customerRepository: billingCustomerRepository,
      checkoutRepository: billingCheckoutRepository,
      priceCatalog: billingPriceCatalog,
    }), "Failed to create checkout");
  },
  async createPortalSession(principal, input: BillingPortalInput) {
    const returnUrl = validateBillingRedirectUrl(input.returnUrl, "Billing portal return URL", (name) => process.env[name]);
    if (!returnUrl.ok) throw new RequestApplicationError("APPLICATION_BAD_REQUEST", "Invalid portal return URL", { cause: returnUrl.error });
    const provider = await getBillingProvider(input.provider);
    return unwrap(await createPortalSessionService({ actorId: principal.userId, provider: input.provider, returnUrl: returnUrl.value }, {
      billingProvider: provider,
      customerRepository: billingCustomerRepository,
    }), "Failed to create portal session");
  },
  async createPaymentLink(_principal, input: BillingPaymentLinkInput) {
    const provider = await getBillingProvider(input.provider);
    if (!provider.createPaymentLink) {
      throw new RequestApplicationError("APPLICATION_NOT_IMPLEMENTED", "Payment links are not supported");
    }
    try {
      return await provider.createPaymentLink({ ...input, items: input.items.map((item) => ({ ...item })) });
    } catch (error) {
      throw new RequestApplicationError("APPLICATION_INTERNAL_ERROR", "Failed to create payment link", { cause: error });
    }
  },
};
`
    : "";
  const dependencies = [
    "    principal,",
    "    rateLimit,",
    selection.admin ? "    admin: createAdminServiceForRequest(headers)," : "",
    selection.identity ? "    identity: createIdentityServiceForRequest()," : "",
    selection.billing ? "    billing," : "",
    selection.messaging ? "    messaging," : "",
    selection.notifications ? "    notifications: createNotificationServiceForRequest()," : "",
  ]
    .filter(Boolean)
    .join("\n");
  const convexMessagingHelpers =
    selection.messaging && database === "convex"
      ? `
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toConvexConversationDto(value: unknown): ConversationDto {
  if (
    !isRecord(value) ||
    typeof value._id !== "string" ||
    typeof value.createdBy !== "string" ||
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  ) {
    throw new RequestApplicationError(
      "APPLICATION_INTERNAL_ERROR",
      "Conversation data is invalid",
    );
  }
  return {
    id: value._id,
    createdBy: value.createdBy,
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: new Date(value.updatedAt).toISOString(),
  };
}
`
      : "";
  const messagingComposition = !selection.messaging
    ? ""
    : database === "convex"
      ? `
const messaging: MessagingApplicationPort = {
  async listConversations() {
    const values: unknown = await fetchAuthQuery(api.messaging.listConversations, {});
    if (!Array.isArray(values)) {
      throw new RequestApplicationError(
        "APPLICATION_INTERNAL_ERROR",
        "Conversation list is invalid",
      );
    }
    return values.map(toConvexConversationDto);
  },
};
`
      : `
const messaging: MessagingApplicationPort = {
  async listConversations(userId) {
    const values = await db
      .select({
        id: conversations.id,
        createdBy: conversations.createdBy,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(eq(conversationParticipants.userId, userId))
      .orderBy(desc(conversations.updatedAt));
    return values.map((conversation) => ({
      id: conversation.id,
      createdBy: conversation.createdBy,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    }));
  },
};
`;
  return `import "server-only";
${imports}

${actorResolver}
${billingComposition}
${convexMessagingHelpers}
${messagingComposition}
export async function createRequestApplicationForRequest(headers: Headers) {
  const principal = await resolvePrincipal(headers);
  return createRequestApplication({
${dependencies}
  });
}
`;
}
