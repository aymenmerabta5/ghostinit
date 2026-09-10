import { authRouteBoundaryCode } from "../../../apps/fragments/api/auth-boundary.js";
import { standardApiRequestCode } from "../../../apps/fragments/api/http-request.js";
import { nextOpenApiOperationsRouteContent } from "../../../apps/fragments/api/openapi.js";
import { orpcRequestSecurityContent } from "../../../api/request-security.js";
import { MAX_ORPC_BODY_BYTES } from "../../../api/body-limits.js";
import { currentRequestSchemaContent } from "../../../api/current-request-schema.js";

export function singleOrpcRequestSecurityContent(): string {
  return orpcRequestSecurityContent();
}

export function singleAuthRouteContent(trustedCloudflareRuntime = false): string {
  return [
    'import { auth } from "@/server/auth";',
    "",
    authRouteBoundaryCode(trustedCloudflareRuntime),
    "",
    'const allowedAuthMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);',
    "",
    "async function handle(request: Request): Promise<Response> {",
    "  if (!allowedAuthMethods.has(request.method)) {",
    '    return new Response("Method not allowed", { status: 405 });',
    "  }",
    "  const directPrivilegedRejection = rejectDirectPrivilegedAuthRequest(request);",
    "  if (directPrivilegedRejection) return directPrivilegedRejection;",
    "  const preparedAuthRequest = prepareAuthRequestForRuntime(request);",
    "  if (preparedAuthRequest.rejection) return preparedAuthRequest.rejection;",
    "  return auth.handler(preparedAuthRequest.request);",
    "}",
    "",
    "export const GET = handle;",
    "export const POST = handle;",
    "export const PUT = handle;",
    "export const PATCH = handle;",
    "export const DELETE = handle;",
    "",
  ].join("\n");
}

export function singleOrpcRouteContent(): string {
  return [
    'import { type NextRequest } from "next/server";',
    'import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";',
    'import { appRouter, applyApiContextResponseHeaders, createContext, rejectUnsafeOrpcRequest } from "@/server/api";',
    "",
    "// 15 MiB admits the 14 MiB base64 storage contract plus its JSON/oRPC envelope.",
    `const MAX_ORPC_BODY_BYTES = ${MAX_ORPC_BODY_BYTES};`,
    "const MAX_CONCURRENT_STORAGE_UPLOADS = 2;",
    'const STORAGE_UPLOAD_PATHS = new Set(["/api/storage/upload", "/api/rpc/storage/upload", "/api/storage/objects", "/api/storage/objects/base64", "/api/rpc/storage/uploadBase64"]);',
    "const activeStorageUploadActors = new Set<string>();",
    "let activeStorageUploadCount = 0;",
    "",
    "function normalizedStorageUploadPath(request: Request): string | null {",
    "  try {",
    "    const pathname = decodeURIComponent(new URL(request.url).pathname);",
    '    return pathname.replace(/[/]+$/, "") || "/";',
    "  } catch {",
    "    return null;",
    "  }",
    "}",
    "",
    "function isStorageUploadRequest(request: Request): boolean {",
    '  if (request.method !== "POST") return false;',
    "  const pathname = normalizedStorageUploadPath(request);",
    "  return pathname !== null && STORAGE_UPLOAD_PATHS.has(pathname);",
    "}",
    "",
    "function storageUploadActorId(context: object): string | null {",
    "  if (",
    '    !("storageActor" in context) ||',
    '    typeof context.storageActor !== "object" ||',
    "    context.storageActor === null ||",
    '    !("id" in context.storageActor) ||',
    '    typeof context.storageActor.id !== "string" ||',
    "    context.storageActor.id.length === 0",
    "  ) {",
    "    return null;",
    "  }",
    "  return context.storageActor.id;",
    "}",
    "",
    "function isUnauthenticatedStorageUpload(request: Request, context: object): boolean {",
    "  return isStorageUploadRequest(request) && storageUploadActorId(context) === null;",
    "}",
    "",
    "function acquireStorageUploadAdmission(actorId: string): (() => void) | null {",
    "  if (",
    "    activeStorageUploadCount >= MAX_CONCURRENT_STORAGE_UPLOADS ||",
    "    activeStorageUploadActors.has(actorId)",
    "  ) {",
    "    return null;",
    "  }",
    "  activeStorageUploadCount += 1;",
    "  activeStorageUploadActors.add(actorId);",
    "  let released = false;",
    "  return () => {",
    "    if (released) return;",
    "    released = true;",
    "    activeStorageUploadCount -= 1;",
    "    activeStorageUploadActors.delete(actorId);",
    "  };",
    "}",
    "",
    standardApiRequestCode,
    "",
    "const rpcHandler = new RPCHandler(appRouter, { plugins: [new BodyLimitPlugin({ maxBodySize: MAX_ORPC_BODY_BYTES })] });",
    "",
    "async function handle(request: NextRequest): Promise<Response> {",
    "  const requestBoundaryRejection = rejectUnsafeOrpcRequest(request);",
    "  if (requestBoundaryRejection) return requestBoundaryRejection;",
    "  const context = await createContext(request.headers);",
    "  if (isUnauthenticatedStorageUpload(request, context)) {",
    '    return Response.json({ error: "Authentication is required" }, { status: 401 });',
    "  }",
    "  const storageUploadActor = isStorageUploadRequest(request)",
    "    ? storageUploadActorId(context)",
    "    : null;",
    "  const releaseStorageUploadAdmission = storageUploadActor",
    "    ? acquireStorageUploadAdmission(storageUploadActor)",
    "    : undefined;",
    "  if (storageUploadActor && !releaseStorageUploadAdmission) {",
    '    return Response.json({ error: "Upload capacity is temporarily exhausted" }, { status: 429 });',
    "  }",
    "",
    "  try {",
    '    const rpcResult = await rpcHandler.handle(toStandardApiRequest(request), { prefix: "/api/rpc", context });',
    "    if (rpcResult.matched) {",
    "      const response = applyApiContextResponseHeaders(rpcResult.response, context);",
    '      response.headers.set("X-Content-Type-Options", "nosniff");',
    '      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");',
    "      return response;",
    "    }",
    "",
    '    return new Response("Not found", { status: 404 });',
    "  } finally {",
    "    releaseStorageUploadAdmission?.();",
    "  }",
    "}",
    "",
    "export const GET = handle;",
    "export const POST = handle;",
    "export const PUT = handle;",
    "export const PATCH = handle;",
    "export const DELETE = handle;",
    "",
  ].join("\n");
}

export function singleOpenApiOperationsRouteContent(): string {
  return nextOpenApiOperationsRouteContent("@/server/api");
}

export function singleHealthRouteContent(): string {
  return [
    'import { connection, NextResponse } from "next/server";',
    "",
    "export async function GET(): Promise<NextResponse> {",
    "  // Health timestamps are request-scoped and must never be frozen at build time.",
    "  await connection();",
    "  const response = NextResponse.json({",
    '    status: "ok",',
    "    time: new Date().toISOString(),",
    "  });",
    '  response.headers.set("X-Content-Type-Options", "nosniff");',
    '  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");',
    "  return response;",
    "}",
    "",
  ].join("\n");
}

export function singleOpenapiRouteContent(): string {
  return [
    'import { connection, NextResponse } from "next/server";',
    'import { generateOpenAPISpec } from "@/server/api/openapi";',
    "",
    "export async function GET(): Promise<NextResponse> {",
    "  // Keep development-only schema generation out of build-time prerendering.",
    "  await connection();",
    '  if (process.env.NODE_ENV === "production") {',
    '    return new NextResponse("Not found", { status: 404 });',
    "  }",
    "  const spec = await generateOpenAPISpec();",
    "  return NextResponse.json(spec);",
    "}",
    "",
  ].join("\n");
}

export interface SingleApiCapabilitySelection {
  manualBilling?: boolean;
  readonly auth?: boolean;
  readonly admin?: boolean;
  readonly billing?: boolean;
  readonly identity?: boolean;
  readonly messaging?: boolean;
  readonly notifications?: boolean;
  readonly featureFlags?: boolean;
  readonly jobs?: boolean;
  readonly storage?: boolean;
}

export function singleApiContextContent(
  isConvex = false,
  hasAuth = true,
  capabilities: SingleApiCapabilitySelection = {},
): string {
  const authImport = hasAuth
    ? isConvex
      ? `import { auth, getRequestUser } from "@/server/auth";\n`
      : `import { auth } from "@/server/auth";\n`
    : "";
  const featureFlagImport = capabilities.featureFlags
    ? `import { createAnonymousFeatureFlagSubjectFromSignedCookie, createAuthenticatedFeatureFlagSubject } from "@/server/services/feature-flags/posthog";\n`
    : "";
  const identityResolverImport = capabilities.identity
    ? `import { resolveIdentityActorForRequest } from "./composition/identity";\n`
    : "";
  const actorFields = [
    capabilities.messaging ? `  websocketAuthentication?: "cookie" | "ticket";` : "",
    capabilities.identity
      ? `  identityActor?: import("@/server/services/identity").IdentityActor | null;`
      : "",
    capabilities.notifications
      ? `  notificationActor?: import("@/server/services/notifications").NotificationActor | null;`
      : "",
    capabilities.featureFlags
      ? `  featureFlagSubject?: import("@/server/services/feature-flags").FeatureFlagSubject | null;`
      : "",
    capabilities.featureFlags ? "  featureFlagSetCookie?: string;" : "",
    capabilities.jobs ? `  jobActor?: import("@/server/services/jobs").JobActor | null;` : "",
    capabilities.storage
      ? `  storageActor?: import("@/server/services/storage").StorageActor | null;`
      : "",
  ].filter(Boolean);
  const capabilityFields = [
    capabilities.identity ? `    identityActor: suspended ? null : identityActor,` : "",
    capabilities.notifications ? `    notificationActor: suspended ? null : { userId },` : "",
    capabilities.featureFlags
      ? `    featureFlagSubject: suspended ? null : createAuthenticatedFeatureFlagSubject(userId, { email: verifiedSession.user.email }),`
      : "",
    capabilities.jobs ? `    jobActor: suspended ? null : { userId },` : "",
    capabilities.storage
      ? `    storageActor: suspended ? null : { id: userId, banned: false },`
      : "",
  ].filter(Boolean);
  const requestApplicationCapabilityFields = [
    capabilities.identity ? `    identityActor: suspended ? null : identityActor,` : "",
    capabilities.notifications ? `    notificationActor: suspended ? null : { userId },` : "",
    capabilities.featureFlags
      ? `    featureFlagSubject: suspended ? null : createAuthenticatedFeatureFlagSubject(userId, { email: principal.email }),`
      : "",
    capabilities.jobs ? `    jobActor: suspended ? null : { userId },` : "",
    capabilities.storage
      ? `    storageActor: suspended ? null : { id: userId, banned: false },`
      : "",
  ].filter(Boolean);
  const anonymousSubject = capabilities.featureFlags
    ? `
function anonymousFeatureFlagSubject(headers: Headers) {
  const cookie = headers.get("cookie") ?? "";
  const encoded = cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("ghostinit_anonymous_id="))
    ?.slice("ghostinit_anonymous_id=".length);
  if (!encoded) return null;
  const signedCookie = decodeURIComponent(encoded);
  const signingSecret = process.env.BETTER_AUTH_SECRET;
  if (!signingSecret || signingSecret.length < 32) return null;
  try {
    return createAnonymousFeatureFlagSubjectFromSignedCookie({ signedCookie, signingSecret });
  } catch {
    return null;
  }
}
`
    : "";
  const anonymousReturn = capabilities.featureFlags
    ? `  if (!verifiedSession) {
    return { headers, featureFlagSubject: anonymousFeatureFlagSubject(headers) };
  }`
    : `  if (!verifiedSession) return { headers };`;
  const verifiedSessionHelper = !hasAuth
    ? ""
    : isConvex
      ? `
interface VerifiedSession {
  user: { id: string; email: string; emailVerified?: boolean };
  session: { id: string; createdAt: string | Date; activeOrganizationId?: string | null };
}

async function getVerifiedSession(headers: Headers): Promise<VerifiedSession | null> {
  const requestUrl = new URL("/api/auth/get-session", "http://ghostinit.local");
  requestUrl.searchParams.set("disableCookieCache", "true");
  requestUrl.searchParams.set("disableRefresh", "true");
  const response = await auth.handler(
    new Request(requestUrl, { headers }),
  );
  if (!response.ok) return null;
  const value = (await response.json()) as Partial<VerifiedSession> | null;
  if (!value?.user?.id || !value.user.email || !value.session?.id || !value.session.createdAt) {
    return null;
  }
  return value as VerifiedSession;
}
`
      : `
async function getVerifiedSession(headers: Headers) {
  return await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
}
`;
  const actorLookup = !hasAuth
    ? capabilities.featureFlags
      ? `  return { headers, featureFlagSubject: anonymousFeatureFlagSubject(headers) };`
      : `  return { headers };`
    : isConvex
      ? `  const [actor, verifiedSession] = await Promise.all([
    getRequestUser(),
    getVerifiedSession(headers),
  ]);
${anonymousReturn}
  if (!actor || actor.authId !== verifiedSession.user.id) return { headers };
  const userId = String(actor._id);
${
  capabilities.identity
    ? `  const authoritativeIdentity = await resolveIdentityActorForRequest({
    authSessionId: verifiedSession.session.id,
    userId,
  });
  if (!authoritativeIdentity) return { headers };
  const identityActor = {
    ...authoritativeIdentity,
    email: actor.email,
    emailVerified: actor.emailVerified === true,
  };`
    : ""
}
  const suspended: boolean = actor.banned ?? false;
  return {
    headers,
    sessionId: verifiedSession.session.id,
    user: {
      id: userId,
      identityId: actor.authId,
      email: actor.email,
      emailVerified:
        verifiedSession.user.emailVerified === true && actor.emailVerified === true,
      name: actor.name ?? null,
      role: actor.role ?? "user",
      banned: actor.banned ?? false,
    },
${capabilityFields.join("\n")}
  };`
      : `  const verifiedSession = await getVerifiedSession(headers);
${anonymousReturn}
${
  capabilities.identity
    ? `  const authoritativeIdentity = await resolveIdentityActorForRequest({
    sessionId: verifiedSession.session.id,
    userId: verifiedSession.user.id,
  });
  if (!authoritativeIdentity) return { headers };
  const actor = authoritativeIdentity.user;
  const identityActor = authoritativeIdentity.actor;`
    : "  const actor = verifiedSession.user;"
}
  const userId = actor.id;
  const suspended: boolean = actor.banned ?? false;
  return {
    headers,
    sessionId: verifiedSession.session.id,
    user: {
      id: userId,
      identityId: actor.id,
      email: actor.email,
      emailVerified: verifiedSession.user.emailVerified === true,
      name: actor.name ?? null,
      role: actor.role ?? "user",
      banned: actor.banned ?? false,
    },
${capabilityFields.join("\n")}
  };`;
  if (capabilities.identity) {
    return `${featureFlagImport}${anonymousSubject}import {
  createRequestApplicationForRequest,
  type RequestApplication,
} from "@/server/services/application";

export interface ApiContext {
  headers: Headers;
  application: RequestApplication;
  sessionId?: string;
  user?: {
    id: string;
    identityId?: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
    role?: string | null;
    banned?: boolean | null;
  };
${actorFields.join("\n")}
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const application = await createRequestApplicationForRequest(headers);
  const principal = application.principal;
  if (!principal) return { headers, application${capabilities.featureFlags ? ", featureFlagSubject: anonymousFeatureFlagSubject(headers)" : ""} };
  const suspended = principal.banned;
  const userId = principal.userId;
  const identityActor = {
    userId,
    sessionId: principal.sessionId,
    email: principal.email,
    emailVerified: principal.emailVerified,
    authenticatedAt: principal.authenticatedAt,
    activeOrganizationId: principal.activeOrganizationId,
    activeTeamId: principal.activeTeamId,
  };
  return {
    headers,
    application,
    sessionId: principal.sessionId,
    user: {
      id: userId,
      identityId: principal.identityUserId,
      email: principal.email,
      emailVerified: principal.emailVerified,
      name: principal.name,
      role: principal.role,
      banned: principal.banned,
    },
${requestApplicationCapabilityFields.join("\n")}
  };
}

export function requireUser(context: ApiContext) {
  if (!context.user?.id) throw new Error("UNAUTHORIZED");
  if (context.user.banned) throw new Error("ACCOUNT_SUSPENDED");
  return context.user;
}

export function requireAdmin(context: ApiContext) {
  const user = requireUser(context);
  if (user.role !== "admin" && user.role !== "superAdmin") throw new Error("FORBIDDEN");
  return user;
}

export function applyApiContextResponseHeaders(response: Response, context: ApiContext): Response {
  const cookie = Reflect.get(context, "featureFlagSetCookie");
  if (typeof cookie !== "string" || cookie.length === 0) return response;
  response.headers.append("Set-Cookie", cookie);
  response.headers.set("Cache-Control", "private, no-store");
  const vary = new Set((response.headers.get("Vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  vary.add("Cookie");
  response.headers.set("Vary", [...vary].join(", "));
  return response;
}
`;
  }
  return `${authImport}${featureFlagImport}${identityResolverImport}${verifiedSessionHelper}${anonymousSubject}
export interface ApiContext {
  headers: Headers;
  sessionId?: string;
  user?: {
    id: string;
    identityId?: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
    role?: string | null;
    banned?: boolean | null;
  };
${actorFields.join("\n")}
}

export async function createContext(headers: Headers): Promise<ApiContext> {
${actorLookup}
}

export function requireUser(context: ApiContext) {
  if (!context.user?.id) throw new Error("UNAUTHORIZED");
  if (context.user.banned) throw new Error("ACCOUNT_SUSPENDED");
  return context.user;
}

export function requireAdmin(context: ApiContext) {
  const user = requireUser(context);
  if (user.role !== "admin" && user.role !== "superAdmin") throw new Error("FORBIDDEN");
  return user;
}

export function applyApiContextResponseHeaders(response: Response, context: ApiContext): Response {
  const cookie = Reflect.get(context, "featureFlagSetCookie");
  if (typeof cookie !== "string" || cookie.length === 0) return response;
  response.headers.append("Set-Cookie", cookie);
  response.headers.set("Cache-Control", "private, no-store");
  const vary = new Set(
    (response.headers.get("Vary") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  vary.add("Cookie");
  response.headers.set("Vary", [...vary].join(", "));
  return response;
}
`;
}

export function singleApiHealthProcedureContent(): string {
  return [
    'import { oc } from "@orpc/contract";',
    'import { implement } from "@orpc/server";',
    'import { z } from "zod";',
    'import type { ApiContext } from "../context";',
    "",
    "const contract = {",
    "  health: oc",
    '    .route({ method: "GET", path: "/health" })',
    '    .output(z.object({ status: z.literal("ok"), time: z.string().datetime() })),',
    "};",
    "",
    "export const healthContract = contract.health;",
    "",
    "const implementer = implement<typeof contract, ApiContext>(contract);",
    "",
    "export const health = implementer.health.handler(async () => ({",
    '  status: "ok" as const,',
    "  time: new Date().toISOString(),",
    "}));",
    "",
  ].join("\n");
}

export function singleApiMeProcedureContent(): string {
  return [
    'import { oc } from "@orpc/contract";',
    'import { implement } from "@orpc/server";',
    'import { z } from "zod";',
    'import type { ApiContext } from "../context";',
    "",
    "const contract = {",
    "  me: oc",
    '    .route({ method: "GET", path: "/me" })',
    "    .output(",
    ...`${currentRequestSchemaContent(6)},`.split("\n"),
    "    ),",
    "};",
    "",
    "export const meContract = contract.me;",
    "",
    "const implementer = implement<typeof contract, ApiContext>(contract);",
    "",
    "export const me = implementer.me.handler(async ({ context }) => {",
    "  return await context.application.me();",
    "});",
    "",
  ].join("\n");
}

export function singleApiContractContent(
  hasAdminApi = false,
  hasBilling = false,
  capabilities: SingleApiCapabilitySelection = {},
): string {
  const includeMe = capabilities.auth !== false;
  const adminImports = hasAdminApi
    ? [
        'import { adminListUsersContract } from "./procedures/admin/list-users";',
        'import { adminCreateUserContract } from "./procedures/admin/create-user";',
        'import { adminChangeRoleContract } from "./procedures/admin/change-role";',
        'import { adminSetBannedContract } from "./procedures/admin/set-banned";',
      ]
    : [];
  const adminEntry = hasAdminApi
    ? [
        "  adminUsers: {",
        "    list: adminListUsersContract,",
        "    create: adminCreateUserContract,",
        "    changeRole: adminChangeRoleContract,",
        "    setBanned: adminSetBannedContract,",
        "  },",
      ]
    : [];
  const billingImports = hasBilling
    ? [
        'import { billingSubscriptionsContract } from "./procedures/billing/subscriptions";',
        'import { billingCreateCheckoutContract } from "./procedures/billing/create-checkout";',
        'import { billingCreatePortalSessionContract } from "./procedures/billing/create-portal-session";',
        'import { billingCreatePaymentLinkContract } from "./procedures/billing/create-payment-link";',
        ...(capabilities.manualBilling
          ? ['import { manualBillingContract } from "./procedures/billing/manual";']
          : []),
      ]
    : [];
  const billingEntry = hasBilling
    ? [
        "  billing: {",
        "    subscriptions: billingSubscriptionsContract,",
        "    createCheckout: billingCreateCheckoutContract,",
        "    createPortalSession: billingCreatePortalSessionContract,",
        "    createPaymentLink: billingCreatePaymentLinkContract,",
        ...(capabilities.manualBilling ? ["    manual: manualBillingContract,"] : []),
        "  },",
      ]
    : [];
  const capabilityImports = [
    ...(capabilities.identity ? ['import { identityContract } from "./identity/contract";'] : []),
    ...(capabilities.notifications
      ? ['import { notificationsContract } from "./notifications/contract";']
      : []),
    ...(capabilities.featureFlags
      ? ['import { featureFlagsContract } from "./feature-flags/contract";']
      : []),
    ...(capabilities.jobs ? ['import { jobsContract } from "./jobs/contract";'] : []),
    ...(capabilities.storage ? ['import { storageContract } from "./storage/contract";'] : []),
    ...(capabilities.messaging
      ? [
          'import { messagingListConversationsContract } from "./procedures/messaging/list-conversations";',
          'import { messagingListMessagesContract } from "./procedures/messaging/list-messages";',
          'import { messagingGetOrCreateConversationContract } from "./procedures/messaging/get-or-create-conversation";',
          'import { messagingSendMessageContract } from "./procedures/messaging/send-message";',
          'import { messagingMarkReadContract } from "./procedures/messaging/mark-read";',
          'import { messagingSendTypingContract } from "./procedures/messaging/send-typing";',
          'import { messagingCreateWebsocketTicketContract } from "./procedures/messaging/create-websocket-ticket";',
          'import { messagingSubscribeContract } from "./procedures/messaging/subscribe";',
        ]
      : []),
  ];
  const capabilityEntries = [
    ...(capabilities.identity ? ["  identity: identityContract,"] : []),
    ...(capabilities.notifications ? ["  notifications: notificationsContract,"] : []),
    ...(capabilities.featureFlags ? ["  featureFlags: featureFlagsContract,"] : []),
    ...(capabilities.jobs ? ["  jobs: jobsContract,"] : []),
    ...(capabilities.storage ? ["  storage: storageContract,"] : []),
    ...(capabilities.messaging
      ? [
          "  messaging: {",
          "    listConversations: messagingListConversationsContract,",
          "    listMessages: messagingListMessagesContract,",
          "    getOrCreateConversation: messagingGetOrCreateConversationContract,",
          "    sendMessage: messagingSendMessageContract,",
          "    markRead: messagingMarkReadContract,",
          "    sendTyping: messagingSendTypingContract,",
          "    createWebsocketTicket: messagingCreateWebsocketTicketContract,",
          "    subscribe: messagingSubscribeContract,",
          "  },",
        ]
      : []),
  ];
  return [
    ...adminImports,
    ...billingImports,
    ...capabilityImports,
    'import { healthContract } from "./procedures/health";',
    ...(includeMe ? ['import { meContract } from "./procedures/me";'] : []),
    "",
    "export const appContract = {",
    "  health: healthContract,",
    ...(includeMe ? ["  me: meContract,"] : []),
    ...adminEntry,
    ...billingEntry,
    ...capabilityEntries,
    "};",
    "",
  ].join("\n");
}

export function singleApiRouterContent(
  hasAdminApi = false,
  hasBilling = false,
  capabilities: SingleApiCapabilitySelection = {},
): string {
  const includeMe = capabilities.auth !== false;
  const adminImports = hasAdminApi
    ? [
        'import { adminListUsers } from "./procedures/admin/list-users";',
        'import { adminCreateUser } from "./procedures/admin/create-user";',
        'import { adminChangeRole } from "./procedures/admin/change-role";',
        'import { adminSetBanned } from "./procedures/admin/set-banned";',
      ]
    : [];
  const adminEntry = hasAdminApi
    ? [
        "    adminUsers: {",
        "      list: adminListUsers,",
        "      create: adminCreateUser,",
        "      changeRole: adminChangeRole,",
        "      setBanned: adminSetBanned,",
        "    },",
      ]
    : [];
  const billingImports = hasBilling
    ? [
        'import { billingSubscriptions } from "./procedures/billing/subscriptions";',
        'import { billingCreateCheckout } from "./procedures/billing/create-checkout";',
        'import { billingCreatePortalSession } from "./procedures/billing/create-portal-session";',
        'import { billingCreatePaymentLink } from "./procedures/billing/create-payment-link";',
        ...(capabilities.manualBilling
          ? ['import { manualBillingProcedures } from "./procedures/billing/manual";']
          : []),
      ]
    : [];
  const billingEntry = hasBilling
    ? [
        "    billing: {",
        "      subscriptions: billingSubscriptions,",
        "      createCheckout: billingCreateCheckout,",
        "      createPortalSession: billingCreatePortalSession,",
        "      createPaymentLink: billingCreatePaymentLink,",
        ...(capabilities.manualBilling ? ["      manual: manualBillingProcedures,"] : []),
        "    },",
      ]
    : [];
  const capabilityImports = [
    ...(capabilities.identity
      ? ['import { createIdentityProcedures } from "./identity/procedures";']
      : []),
    ...(capabilities.notifications
      ? ['import { createNotificationProcedures } from "./notifications/procedures";']
      : []),
    ...(capabilities.featureFlags
      ? [
          'import { createFeatureFlagProcedures } from "./feature-flags/procedures";',
          'import { createFeatureFlagServiceForRequest } from "./composition/feature-flags";',
        ]
      : []),
    ...(capabilities.jobs
      ? [
          'import { createJobProcedures } from "./jobs/procedures";',
          'import { createJobsServiceForRequest } from "./composition/jobs";',
        ]
      : []),
    ...(capabilities.storage
      ? [
          'import { createStorageProcedures } from "./storage/procedures";',
          'import { createOwnedStorageServiceForRequest } from "./composition/storage";',
        ]
      : []),
    ...(capabilities.messaging
      ? [
          'import { messagingListConversations } from "./procedures/messaging/list-conversations";',
          'import { messagingListMessages } from "./procedures/messaging/list-messages";',
          'import { messagingGetOrCreateConversation } from "./procedures/messaging/get-or-create-conversation";',
          'import { messagingSendMessage } from "./procedures/messaging/send-message";',
          'import { messagingMarkRead } from "./procedures/messaging/mark-read";',
          'import { messagingSendTyping } from "./procedures/messaging/send-typing";',
          'import { messagingCreateWebsocketTicket } from "./procedures/messaging/create-websocket-ticket";',
          'import { messagingSubscribe } from "./procedures/messaging/subscribe";',
        ]
      : []),
  ];
  const capabilityEntries = [
    ...(capabilities.identity ? ["    identity: createIdentityProcedures<ApiContext>(),"] : []),
    ...(capabilities.notifications
      ? ["    notifications: createNotificationProcedures<ApiContext>(),"]
      : []),
    ...(capabilities.featureFlags
      ? [
          "    featureFlags: createFeatureFlagProcedures<ApiContext>(createFeatureFlagServiceForRequest),",
        ]
      : []),
    ...(capabilities.jobs
      ? ["    jobs: createJobProcedures<ApiContext>(createJobsServiceForRequest),"]
      : []),
    ...(capabilities.storage
      ? ["    storage: createStorageProcedures<ApiContext>(createOwnedStorageServiceForRequest),"]
      : []),
    ...(capabilities.messaging
      ? [
          "    messaging: {",
          "      listConversations: messagingListConversations,",
          "      listMessages: messagingListMessages,",
          "      getOrCreateConversation: messagingGetOrCreateConversation,",
          "      sendMessage: messagingSendMessage,",
          "      markRead: messagingMarkRead,",
          "      sendTyping: messagingSendTyping,",
          "      createWebsocketTicket: messagingCreateWebsocketTicket,",
          "      subscribe: messagingSubscribe,",
          "    },",
        ]
      : []),
  ];
  return [
    ...adminImports,
    ...billingImports,
    ...capabilityImports,
    'import { implement, os } from "@orpc/server";',
    'import { appContract } from "./contract";',
    'import { health } from "./procedures/health";',
    ...(includeMe ? ['import { me } from "./procedures/me";'] : []),
    'import type { ApiContext } from "./context";',
    "",
    "const implementer = implement<typeof appContract, ApiContext>(appContract);",
    "",
    'export const appRouter = os.$context<ApiContext>().prefix("/api").router(',
    "  implementer.router({",
    "    health,",
    ...(includeMe ? ["    me,"] : []),
    ...adminEntry,
    ...billingEntry,
    ...capabilityEntries,
    "  }),",
    ");",
    ...(capabilities.messaging
      ? [
          "",
          'export const messagingWebSocketRouter = os.$context<ApiContext>().prefix("/api").router({',
          "  messaging: {",
          "    sendTyping: messagingSendTyping,",
          "    subscribe: messagingSubscribe,",
          "  },",
          "});",
        ]
      : []),
    "",
  ].join("\n");
}

export function singleApiIndexContent(hasMessaging = false): string {
  return [
    `export { appRouter${hasMessaging ? ", messagingWebSocketRouter" : ""} } from "./router";`,
    'export { appContract } from "./contract";',
    'export { applyApiContextResponseHeaders, createContext, type ApiContext } from "./context";',
    'export { rejectUnsafeOrpcRequest } from "./request-security";',
    "",
  ].join("\n");
}

export function singleApiOpenapiContent(): string {
  return [
    'import { OpenAPIGenerator } from "@orpc/openapi";',
    'import { ZodToJsonSchemaConverter } from "@orpc/zod";',
    'import { appRouter } from "./router";',
    "",
    "export async function generateOpenAPISpec(): Promise<unknown> {",
    "  const generator = new OpenAPIGenerator({",
    "    schemaConverters: [new ZodToJsonSchemaConverter()],",
    "  });",
    "  return generator.generate(appRouter, {",
    '    info: { title: "GhostInit API", version: "0.1.0" },',
    "    // Router paths already include /api; keep the server root relative and portable.",
    '    servers: [{ url: "/" }],',
    "  });",
    "}",
    "",
  ].join("\n");
}

function singleOrpcClientForPath(
  rpcPath: "/api" | "/api/rpc",
  includeRequestClient: boolean,
): string {
  const requestClient = includeRequestClient
    ? [
        "",
        "export interface CreateApiClientOptions {",
        "  url: string | URL;",
        "  headers?: Headers;",
        "}",
        "",
        "export function createApiClient(options?: CreateApiClientOptions): ApiClient {",
        "  if (!options) return orpcClient;",
        "  const requestLink = new RPCLink({ url: options.url, headers: options.headers });",
        "  return createORPCClient<RouterClient<typeof appRouter>>(requestLink);",
        "}",
        "",
        "export function createRequestApiClient(request: Request): ApiClient {",
        "  const headers = new Headers();",
        "  // Preserve browser provenance with the forwarded cookie. Never manufacture a",
        "  // trusted Origin here: a sibling-site request reaching a server boundary",
        "  // must still be rejected by the oRPC ingress.",
        '  for (const name of ["authorization", "cookie", "origin", "sec-fetch-site"] as const) {',
        "    const value = request.headers.get(name);",
        "    if (value) headers.set(name, value);",
        "  }",
        "  const url = new URL(RPC_PATH, request.url);",
        "  return createApiClient({ url, headers });",
        "}",
      ]
    : [];
  return [
    'import { createORPCClient } from "@orpc/client";',
    'import { RPCLink } from "@orpc/client/fetch";',
    'import { createORPCReactQueryUtils } from "@orpc/react-query";',
    'import type { RouterClient } from "@orpc/server";',
    'import type { appRouter } from "@/server/api";',
    "",
    `const RPC_PATH = "${rpcPath}";`,
    "",
    "function browserRpcUrl(): URL {",
    '  if (typeof window === "undefined") {',
    includeRequestClient
      ? '    throw new Error("The shared oRPC client is browser-only. Use createRequestApiClient(request) during SSR.");'
      : '    throw new Error("The shared oRPC client is browser-only. Next Server Components and Server Actions use the request application facade.");',
    "  }",
    "  return new URL(RPC_PATH, window.location.origin);",
    "}",
    "",
    "const link = new RPCLink({ url: browserRpcUrl });",
    "",
    "export const orpcClient = createORPCClient<RouterClient<typeof appRouter>>(link);",
    "export const orpc = createORPCReactQueryUtils(orpcClient);",
    "export type ApiClient = typeof orpcClient;",
    ...requestClient,
    "",
  ].join("\n");
}

export function singleOrpcClientContent(): string {
  return singleOrpcClientForPath("/api/rpc", false);
}

export function singleOrpcClientTanstackContent(): string {
  return singleOrpcClientForPath("/api/rpc", true);
}
