// @allow-long 900: central oRPC package renderer keeps capability selection, context, composition roots, and router aggregation auditable
import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";
import { adminApiFiles } from "./api/admin.js";
import { billingApiFiles } from "./api/billing.js";
import { featureFlagsApiFiles } from "./api/feature-flags/index.js";
import { identityApiFiles } from "./api/identity/index.js";
import { jobsApiFiles } from "./api/jobs/index.js";
import { messagingApiFiles } from "./api/messaging.js";
import { notificationsApiFiles } from "./api/notifications/index.js";
import { apiRateLimitContent } from "./api/rate-limit.js";
import { storageApiFiles } from "./api/storage/index.js";
import { orpcRequestSecurityContent } from "./api/request-security.js";

export interface ApiCapabilitySelection {
  auth?: boolean;
  identity?: boolean;
  notifications?: boolean;
  featureFlags?: boolean;
  jobs?: boolean;
  storage?: boolean;
}

function featureFlagsCompositionFile(): TemplateFile {
  return file(
    "packages/api/src/composition/feature-flags.ts",
    `import "server-only";
import { getPostHogServer } from "@repo/analytics/server";
import {
  createFeatureFlagService,
  defineRemoteFeatureFlagAdapter,
  FeatureFlagError,
} from "@repo/services/feature-flags";
import type { ApiContext } from "../context.js";

const postHogProvider = defineRemoteFeatureFlagAdapter({
  kind: "posthog",
  async evaluateMany({ subject, keys }) {
    const client = getPostHogServer();
    if (!client) {
      throw new FeatureFlagError(
        "FEATURE_FLAG_PROVIDER_UNAVAILABLE",
        "PostHog feature flags are not configured",
      );
    }
    const personProperties = Object.fromEntries(
      Object.entries(subject.attributes).map(([key, value]) => [key, String(value)]),
    );
    return await Promise.all(
      keys.map(async (key) => {
        const value = await client.getFeatureFlag(key, subject.key, {
          personProperties,
          sendFeatureFlagEvents: false,
        });
        if (value === undefined) {
          throw new FeatureFlagError("FEATURE_FLAG_NOT_FOUND", "Remote feature flag not found");
        }
        return {
          key,
          value,
          variant: typeof value === "string" ? value : null,
          reason: value === false ? ("disabled" as const) : ("rollout" as const),
          version: null,
        };
      }),
    );
  },
});

export function createFeatureFlagServiceForRequest(_context: ApiContext) {
  return createFeatureFlagService({ provider: postHogProvider });
}
`,
  );
}

function jobsCompositionFile(): TemplateFile {
  return file(
    "packages/api/src/composition/jobs.ts",
    `import "server-only";
import { randomBytes } from "node:crypto";
import {
  createJobsService,
  JobError,
  type JobPersistencePort,
} from "@repo/services/jobs";
import type { ApiContext } from "../context.js";

async function unavailableJobOperation(..._args: readonly unknown[]): Promise<never> {
  throw new JobError(
    "JOB_PERSISTENCE_FAILED",
    "The selected database does not yet provide a durable job persistence adapter",
  );
}

const unavailablePersistence: JobPersistencePort = {
  getDefinition: unavailableJobOperation,
  getSchedule: unavailableJobOperation,
  listDueSchedules: unavailableJobOperation,
  advanceSchedule: unavailableJobOperation,
  enqueueRun: unavailableJobOperation,
  getOwnedRun: unavailableJobOperation,
  requestCancellationOwned: unavailableJobOperation,
  claimNextRun: unavailableJobOperation,
  getLeasedRun: unavailableJobOperation,
  heartbeatRun: unavailableJobOperation,
  completeRun: unavailableJobOperation,
  settleFailedRun: unavailableJobOperation,
  acknowledgeCancellation: unavailableJobOperation,
  listExpiredLeases: unavailableJobOperation,
  recoverExpiredLease: unavailableJobOperation,
};

export function createJobsServiceForRequest(_context: ApiContext) {
  return createJobsService({
    persistence: unavailablePersistence,
    scheduleCalculator: { nextAfter: unavailableJobOperation },
    leaseTokens: { create: () => randomBytes(32).toString("base64url") },
  });
}
`,
  );
}

function convexAdminApiFiles(): TemplateFile[] {
  const composition = `import "server-only";
import { auth, fetchAuthMutation, fetchAuthQuery } from "@repo/auth/server";
import { logger } from "@repo/observability";
import * as admin from "../../admin/index";
import { api } from "../../../../../convex/_generated/api";

interface ConvexAdminUser {
  _id: string;
  authId: string;
  name?: string | null;
  email: string;
  role?: string | null;
  banned?: boolean | null;
}

interface ConvexPage {
  page: ConvexAdminUser[];
  isDone: boolean;
  continueCursor: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toAdminUser(user: ConvexAdminUser): admin.AdminUser {
  return {
    id: user.authId,
    name: user.name ?? null,
    email: user.email,
    role: user.role === "admin" ? "admin" : "user",
    banned: user.banned === true,
  };
}

async function listAllUsers(): Promise<ConvexAdminUser[]> {
  const users: ConvexAdminUser[] = [];
  let cursor: string | null = null;
  do {
    const result = await fetchAuthQuery(api.users.list, {
      paginationOpts: { cursor, numItems: 100 },
    }) as ConvexPage;
    users.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  return users;
}

async function createUserThroughVerifiedAdmin(
  input: admin.CreateAdminUserInput,
): Promise<admin.AdminUser> {
  const response = await auth.handler(
    new Request("http://ghostinit.local/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: input.email, name: input.name, password: input.password }),
    }),
  );
  if (!response.ok) {
    throw new admin.AdminServiceError("ADMIN_CREATE_FAILED", "Unable to create user");
  }
  const result: unknown = await response.json();
  if (!isRecord(result) || !isRecord(result.user)) {
    throw new admin.AdminServiceError(
      "ADMIN_CREATE_FAILED",
      "The identity provider returned an invalid user",
    );
  }
  const userId = typeof result.user.id === "string" ? result.user.id : null;
  const email = typeof result.user.email === "string" ? result.user.email : null;
  const name = typeof result.user.name === "string" ? result.user.name : null;
  if (!userId || !email) {
    throw new admin.AdminServiceError(
      "ADMIN_CREATE_FAILED",
      "The identity provider returned an invalid user",
    );
  }
  if (input.role === "admin") {
    await fetchAuthMutation(api.users.setRoleByAuthId, { authId: userId, role: "admin" });
  }
  return { id: userId, email, name, role: input.role, banned: false };
}

export function createAdminServiceForRequest(_headers: Headers): admin.AdminService {
  const identity: admin.AdminIdentityPort = {
    async listUsers(input) {
      const all = await listAllUsers();
      const search = input.search?.trim().toLowerCase();
      const filtered = search
        ? all.filter(
            (user) =>
              user.email.toLowerCase().includes(search) ||
              (user.name ?? "").toLowerCase().includes(search),
          )
        : all;
      const offset = (input.page - 1) * input.limit;
      return {
        users: filtered.slice(offset, offset + input.limit).map(toAdminUser),
        total: filtered.length,
      };
    },
    async getUser(userId) {
      const user = (await listAllUsers()).find((candidate) => candidate.authId === userId);
      return user ? toAdminUser(user) : null;
    },
    async countAdmins() {
      return (await listAllUsers()).filter(
        (user) => user.role === "admin" && user.banned !== true,
      ).length;
    },
    createUser: createUserThroughVerifiedAdmin,
    async changeRole(userId, role) {
      await fetchAuthMutation(api.users.setRoleByAuthId, { authId: userId, role });
    },
    async setBanned(userId, banned, reason) {
      await fetchAuthMutation(api.users.setBannedByAuthId, {
        authId: userId,
        banned,
        ...(reason ? { reason } : {}),
      });
    },
  };
  return admin.createAdminService({
    identity,
    // Convex role/ban mutations persist their own authoritative audit rows.
    audit: {
      async record(event) {
        logger.info("Admin audit event", {
          ...event,
          occurredAt: event.occurredAt.toISOString(),
        });
      },
    },
  });
}
`;
  return adminApiFiles().map((entry) =>
    entry.path === "packages/services/src/application/composition/admin.ts"
      ? { ...entry, content: composition }
      : entry,
  );
}

/**
 * @param hasBilling — billing oRPC procedures and the billing domain demo are
 * emitted only when this is true. Without billing, @repo/billing does not exist
 * and including a `getBillingProvider` import fails the generation-matrix guard.
 * @param hasMessaging — messaging oRPC procedures (postgres DM-only) via @repo/realtime
 */
export function apiPackage(
  hasBilling = true,
  hasMessaging = false,
  hasAdminApi = true,
  isConvex = false,
  capabilities: ApiCapabilitySelection = {},
): TemplateFile[] {
  const hasAuth =
    capabilities.auth ??
    (hasAdminApi ||
      hasBilling ||
      hasMessaging ||
      capabilities.identity === true ||
      capabilities.notifications === true);
  const hasIdentity = hasAuth && (capabilities.identity ?? hasAdminApi);
  const hasNotifications = hasAuth && capabilities.notifications === true;
  const hasFeatureFlags = capabilities.featureFlags === true;
  const hasJobs = hasAuth && capabilities.jobs === true;
  const hasStorage = hasAuth && capabilities.storage === true;
  const emitAdminApi = hasAuth && hasAdminApi;
  const actorContextFields = [
    hasMessaging ? '  websocketAuthentication?: "cookie" | "ticket";' : "",
    hasIdentity ? '  identityActor?: import("@repo/services/identity").IdentityActor | null;' : "",
    hasNotifications
      ? '  notificationActor?: import("@repo/services/notifications").NotificationActor | null;'
      : "",
    hasFeatureFlags
      ? '  featureFlagSubject?: import("@repo/services/feature-flags").FeatureFlagSubject | null;'
      : "",
    hasFeatureFlags ? "  featureFlagSetCookie?: string;" : "",
    hasJobs ? '  jobActor?: import("@repo/services/jobs").JobActor | null;' : "",
    hasStorage ? '  storageActor?: import("@repo/services/storage").StorageActor | null;' : "",
  ]
    .filter(Boolean)
    .join("\n");
  const actorContextValues = [
    hasIdentity
      ? `    identityActor: !user.banned && authenticatedAt
      ? {
          userId: user.id,
          sessionId,
          email: user.email,
          emailVerified: user.emailVerified,
          authenticatedAt,
          activeOrganizationId,
          activeTeamId,
        }
      : null,`
      : "",
    hasNotifications ? `    notificationActor: user.banned ? null : { userId: user.id },` : "",
    hasFeatureFlags
      ? `    featureFlagSubject: user.banned ? null : {
      kind: "user",
      key: user.id,
      attributes: {
        email: user.email,
        emailVerified: user.emailVerified,
        ...(user.role ? { role: user.role } : {}),
      },
    },`
      : "",
    hasJobs ? `    jobActor: user.banned ? null : { userId: user.id },` : "",
    hasStorage ? `    storageActor: user.banned ? null : { id: user.id, banned: false },` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const postgresIdentitySetup = hasIdentity
    ? `  const authoritativeIdentity = await resolveIdentityActorForRequest({
    sessionId,
    userId: session.user.id,
  });
  if (!authoritativeIdentity) return { headers };
  const authenticatedAt = authoritativeIdentity.actor.authenticatedAt;
  const activeOrganizationId = authoritativeIdentity.actor.activeOrganizationId;
  const activeTeamId = authoritativeIdentity.actor.activeTeamId;
`
    : "";
  const postgresUserSetup = hasIdentity
    ? "  const user = authoritativeIdentity.user;"
    : `  const user = {
    id: session.user.id,
    identityId: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified === true,
    name: session.user.name,
    role: session.user.role ?? "user",
    banned: session.user.banned ?? null,
  };`;
  const convexIdentitySetup = hasIdentity
    ? `  const authoritativeIdentity = await resolveIdentityActorForRequest({
    authSessionId: session.sessionId,
    userId: String(actor._id),
  });
  if (!authoritativeIdentity) return { headers };
  const authenticatedAt = authoritativeIdentity.authenticatedAt;
  const activeOrganizationId = authoritativeIdentity.activeOrganizationId;
  const activeTeamId = authoritativeIdentity.activeTeamId;
`
    : "";
  const authlessContextContent = hasFeatureFlags
    ? `import { createAnonymousFeatureFlagSubjectFromSignedCookie } from "@repo/services/feature-flags/posthog";

export interface ApiContext {
  headers: Headers;
  featureFlagSubject?: import("@repo/services/feature-flags").FeatureFlagSubject | null;
  featureFlagSetCookie?: string;
}

function signedAnonymousCookie(headers: Headers): string | null {
  const encoded = (headers.get("cookie") ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("ghostinit_anonymous_id="))
    ?.slice("ghostinit_anonymous_id=".length);
  return encoded ? decodeURIComponent(encoded) : null;
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const signedCookie = signedAnonymousCookie(headers);
  const signingSecret = process.env.BETTER_AUTH_SECRET;
  if (!signedCookie || !signingSecret || signingSecret.length < 32) {
    return { headers, featureFlagSubject: null };
  }
  try {
    return {
      headers,
      featureFlagSubject: createAnonymousFeatureFlagSubjectFromSignedCookie({
        signedCookie,
        signingSecret,
      }),
    };
  } catch {
    return { headers, featureFlagSubject: null };
  }
}
`
    : `export interface ApiContext { headers: Headers; }

export async function createContext(headers: Headers): Promise<ApiContext> {
  return { headers };
}
`;
  const requestApplicationContextContent = `import {
  createRequestApplicationForRequest,
  type RequestApplication,
} from "@repo/services/application";

export interface ApiContext {
  headers: Headers;
  application: RequestApplication;
  user?: {
    id: string;
    identityId?: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
    role?: string | null;
    banned?: boolean | null;
  };
  sessionId?: string;
${actorContextFields}
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const application = await createRequestApplicationForRequest(headers);
  const principal = application.principal;
  if (!principal) return { headers, application };
  const user = {
    id: principal.userId,
    identityId: principal.identityUserId,
    email: principal.email,
    emailVerified: principal.emailVerified,
    name: principal.name,
    role: principal.role,
    banned: principal.banned,
  };
  const sessionId = principal.sessionId;
  const authenticatedAt = principal.authenticatedAt;
  const activeOrganizationId = principal.activeOrganizationId;
  const activeTeamId = principal.activeTeamId;
  return {
    headers,
    application,
    user,
    sessionId,
${actorContextValues}
  };
}

export function requireUser(ctx: ApiContext) {
  if (!ctx.user?.id) throw new Error("UNAUTHORIZED");
  if (ctx.user.banned) throw new Error("ACCOUNT_SUSPENDED");
  return ctx.user;
}

export function requireAdmin(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (user.role !== "admin" && user.role !== "superAdmin") throw new Error("FORBIDDEN");
  return user;
}
`;
  const contextContent = !hasAuth
    ? authlessContextContent
    : hasIdentity
      ? requestApplicationContextContent
      : isConvex
        ? `import { getRequestUser } from "@repo/auth";
import { auth } from "@repo/auth";
import { isAdminRole } from "@repo/auth/access";
${hasIdentity ? 'import { resolveIdentityActorForRequest } from "./composition/identity.js";' : ""}

interface VerifiedAuthSession {
  sessionId: string;
  authenticatedAt: Date | null;
  activeOrganizationId: string | null;
  userId: string;
  email: string;
  emailVerified: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function verifiedDate(value: unknown): Date | null {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseVerifiedAuthSession(value: unknown): VerifiedAuthSession | null {
  if (!isRecord(value) || !isRecord(value.session) || !isRecord(value.user)) return null;
  const sessionId = optionalString(value.session.id);
  const userId = optionalString(value.user.id);
  const email = optionalString(value.user.email);
  if (!sessionId || !userId || !email) return null;
  return {
    sessionId,
    authenticatedAt: verifiedDate(value.session.createdAt),
    activeOrganizationId: optionalString(value.session.activeOrganizationId),
    userId,
    email,
    emailVerified: value.user.emailVerified === true,
  };
}

async function getVerifiedAuthSession(headers: Headers): Promise<VerifiedAuthSession | null> {
  let requestUrl: URL;
  try {
    requestUrl = new URL(
      "/api/auth/get-session",
      process.env.BETTER_AUTH_URL ?? "http://ghostinit.local",
    );
  } catch {
    return null;
  }
  requestUrl.searchParams.set("disableCookieCache", "true");
  requestUrl.searchParams.set("disableRefresh", "true");
  const response = await auth.handler(new Request(requestUrl, { method: "GET", headers }));
  if (!response.ok) return null;
  return parseVerifiedAuthSession(await response.json());
}

export interface ApiContext {
  headers: Headers;
  user?: {
    id: string;
    identityId?: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
    role?: string | null;
    banned?: boolean | null;
  };
  sessionId?: string;
${actorContextFields}
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const sessionPromise = getVerifiedAuthSession(headers);
  const actor = await getRequestUser();
  const session = await sessionPromise;
  if (!session || !actor || actor.authId !== session.userId) return { headers };
  const user = {
    id: String(actor._id),
    identityId: session.userId,
    email: session.email,
    emailVerified: session.emailVerified && actor.emailVerified === true,
    name: actor.name ?? null,
    role: actor.role ?? "user",
    banned: actor.banned ?? null,
  };
  const sessionId = session.sessionId;
${convexIdentitySetup}
  return {
    headers,
    user,
    sessionId,
${actorContextValues}
  };
}

export function requireUser(ctx: ApiContext) {
  if (!ctx.user?.id) throw new Error("UNAUTHORIZED");
  if (ctx.user.banned) throw new Error("ACCOUNT_SUSPENDED");
  return ctx.user;
}

export function requireAdmin(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  return user;
}
`
        : `import { auth } from "@repo/auth";
import { isAdminRole } from "@repo/auth/access";
${hasIdentity ? 'import { resolveIdentityActorForRequest } from "./composition/identity.js";' : ""}

export interface ApiContext {
  headers: Headers;
  user?: {
    id: string;
    identityId?: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
    role?: string | null;
    banned?: boolean | null;
  };
  sessionId?: string;
${actorContextFields}
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session?.user) return { headers };
  const sessionId = session.session.id;
${postgresIdentitySetup}
${postgresUserSetup}
  return {
    headers,
    user,
    sessionId,
${actorContextValues}
  };
}

export function requireUser(ctx: ApiContext) {
  if (!ctx.user?.id) throw new Error("UNAUTHORIZED");
  if (ctx.user.banned) throw new Error("ACCOUNT_SUSPENDED");
  return ctx.user;
}

export function requireAdmin(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  return user;
}
`;
  const contextResponseHeadersContent = `export function applyApiContextResponseHeaders(
  response: Response,
  context: ApiContext,
): Response {
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
  return [
    file(
      "packages/api/package.json",
      packageJson({
        name: "@repo/api",
        scripts: codeScripts(),
        exports: {
          ".": "./src/index.ts",
          "./openapi": "./src/openapi.ts",
          ...(hasMessaging ? { "./messaging-outbox": "./src/messaging-outbox.ts" } : {}),
          ...(hasFeatureFlags
            ? { "./feature-flag-service": "./src/composition/feature-flags.ts" }
            : {}),
        },
        dependencies: {
          "@orpc/server": `^${v.orpc["@orpc/server"]}`,
          "@orpc/contract": `^${v.orpc["@orpc/contract"]}`,
          "@orpc/client": `^${v.orpc["@orpc/client"]}`,
          "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
          "@orpc/zod": `^${v.orpc["@orpc/zod"]}`,
          ...(hasAuth ? { "@repo/auth": "workspace:*" } : {}),
          ...((emitAdminApi && !isConvex) || hasMessaging
            ? { "@repo/database": "workspace:*" }
            : {}),
          ...(emitAdminApi ||
          hasBilling ||
          hasMessaging ||
          hasIdentity ||
          hasNotifications ||
          hasFeatureFlags ||
          hasJobs ||
          hasStorage
            ? { "@repo/services": "workspace:*" }
            : {}),
          ...(emitAdminApi ? { "@repo/observability": "workspace:*" } : {}),
          ...(hasFeatureFlags ? { "@repo/analytics": "workspace:*" } : {}),
          ...(hasMessaging || (hasBilling && !isConvex)
            ? {
                ...(hasMessaging
                  ? { "@repo/realtime": "workspace:*", "@repo/storage": "workspace:*" }
                  : {}),
                "drizzle-orm": `^${v.database["drizzle-orm"]}`,
              }
            : {}),
          ...(emitAdminApi ||
          hasMessaging ||
          hasIdentity ||
          hasNotifications ||
          hasFeatureFlags ||
          hasJobs ||
          hasStorage
            ? { "server-only": `^${v.runtime["server-only"]}` }
            : {}),
          zod: `^${v.validation.zod}`,
        },
        devDependencies: {
          // tsconfig declares types: ["node"] — must be depended on or TS2688.
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/api/tsconfig.json",
      tsconfig({
        compilerOptions: { types: ["node"], jsx: "react-jsx" },
        include: ["src/**/*"],
      }),
    ),
    file("packages/api/src/request-security.ts", orpcRequestSecurityContent()),
    file("packages/api/src/context.ts", `${contextContent}\n${contextResponseHeadersContent}`),
    file(
      "packages/api/src/procedures/health.ts",
      `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../context.js";

// Pure oRPC only - oc.route per Context7 /dinwwwh/orpc
const contract = {
  health: oc
    .route({ method: "GET", path: "/health" })
    .output(z.object({ status: z.literal("ok"), time: z.string().datetime() })),
};

export const healthContract = contract.health;

const implementer = implement<typeof contract, ApiContext>(contract);

export const health = implementer.health.handler(async () => ({
  status: "ok" as const,
  time: new Date().toISOString(),
}));
`,
    ),
    ...(hasAuth
      ? [
          file(
            "packages/api/src/middleware/auth.ts",
            `import { ORPCError } from "@orpc/server";
import { isAdminRole } from "@repo/auth/access";
import type { ApiContext } from "../context.js";
import { createCodedORPCError } from "../utils/service-error.js";

// oRPC middleware — Stagio pattern: protected + admin with banned check
export async function protectedProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  if (ctx.user.banned) throw createCodedORPCError("FORBIDDEN", "ACCOUNT_SUSPENDED", { message: "Account suspended" });
  return ctx.user;
}
export async function adminProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  if (!isAdminRole(ctx.user.role)) throw new ORPCError("FORBIDDEN", { message: "Forbidden — admin only" });
  return ctx.user;
}
`,
          ),
        ]
      : []),
    file("packages/api/src/middleware/rate-limit.ts", apiRateLimitContent()),
    file(
      "packages/api/src/utils/service-error.ts",
      `import { ORPCError } from "@orpc/server";

type ORPCStatusCode = ConstructorParameters<typeof ORPCError>[0];

interface CodedORPCErrorOptions {
  message: string;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

interface CodedORPCErrorData {
  code: string;
  meta?: Record<string, unknown>;
}

interface CodedServiceError extends Error {
  code: string;
  meta?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCodedServiceError(error: unknown): error is CodedServiceError {
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string") {
    return false;
  }
  return !("meta" in error) || error.meta === undefined || isRecord(error.meta);
}

const requestApplicationCodeAliases: Readonly<Record<string, string>> = {
  APPLICATION_UNAUTHENTICATED: "UNAUTHENTICATED",
  APPLICATION_ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  APPLICATION_EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  APPLICATION_ADMIN_REQUIRED: "ADMIN_FORBIDDEN",
  APPLICATION_CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
  APPLICATION_BAD_REQUEST: "BAD_REQUEST",
  APPLICATION_NOT_FOUND: "NOT_FOUND",
  APPLICATION_NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  APPLICATION_CONFLICT: "CONFLICT",
  APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS",
  APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  APPLICATION_INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
};

export function createCodedORPCError(status: ORPCStatusCode, code: string, { message, meta, cause }: CodedORPCErrorOptions) {
  return new ORPCError<ORPCStatusCode, CodedORPCErrorData>(status, {
    message,
    data: { code, ...(meta ? { meta } : {}) },
    cause,
  });
}
export function throwCodedORPCError(status: ORPCStatusCode, code: string, options: CodedORPCErrorOptions): never {
  throw createCodedORPCError(status, code, options);
}
export function createServiceORPCError(error: unknown, { codeMap, fallbackMessage, fallbackCode = "BAD_REQUEST" }: { codeMap: Record<string, ORPCStatusCode>; fallbackMessage: string; fallbackCode?: ORPCStatusCode }): never {
  if (error instanceof ORPCError) throw error;
  if (isCodedServiceError(error)) {
    const publicCode = requestApplicationCodeAliases[error.code] ?? error.code;
    throw createCodedORPCError(codeMap[error.code] ?? fallbackCode, publicCode, {
      message: error.message,
      meta: error.meta,
      cause: error.cause ?? error,
    });
  }
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: fallbackMessage, cause: error });
}
`,
    ),
    ...(hasAuth
      ? [
          file(
            "packages/api/src/procedures/me.ts",
            `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../context.js";

// Pure oRPC only - oc.route + implement + authenticated context auth.api.getSession

const contract = {
  me: oc
    .route({ method: "GET", path: "/me" })
    .output(
      z.object({
        user: z
          .object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
            role: z.string().nullable(),
            banned: z.boolean(),
          })
          .nullable(),
        sessionId: z.string().nullable(),
        activeOrganizationId: z.string().nullable(),
        activeTeamId: z.string().nullable(),
      }),
    ),
};

export const meContract = contract.me;

const implementer = implement<typeof contract, ApiContext>(contract);

export const me = implementer.me.handler(async ({ context }) => {
  return await context.application.me();
});
`,
          ),
        ]
      : []),
    ...(emitAdminApi ? (isConvex ? convexAdminApiFiles() : adminApiFiles()) : []),
    // Procedures that demonstrate the full 6-layer chain:
    // app/api/** (or apps/web fetch) → @repo/api/procedures/* (Transport, oRPC contract-first)
    // → @repo/modules/billing (public Domain application entrypoint, use-cases)
    // → @repo/services/billing/* (Capabilities, business rules + port adapters)
    // → @repo/billing/providers/* (Vendors, SDK wrapper implementations)
    // → @repo/database + @repo/config (Supporting)
    // This is what `ghostinit check` enforces via oxc-parser — it fails on upward
    // imports and on Transport→Vendors direct imports. That check used to be
    // vacuous because the only procedures (health, me) called no use-case.
    ...(hasBilling ? billingApiFiles("monorepo") : []),
    ...(hasMessaging ? messagingApiFiles() : []),
    ...(hasIdentity ? identityApiFiles("monorepo") : []),
    ...(hasNotifications ? notificationsApiFiles("monorepo") : []),
    ...(hasFeatureFlags
      ? [...featureFlagsApiFiles("monorepo"), featureFlagsCompositionFile()]
      : []),
    ...(hasJobs ? [...jobsApiFiles("monorepo"), jobsCompositionFile()] : []),
    ...(hasStorage ? storageApiFiles("monorepo") : []),
    file(
      "packages/api/src/contract.ts",
      [
        'import { healthContract } from "./procedures/health.js";',
        ...(hasAuth ? ['import { meContract } from "./procedures/me.js";'] : []),
        ...(emitAdminApi
          ? [
              `import { adminListUsersContract } from "./procedures/admin/list-users.js";
import { adminCreateUserContract } from "./procedures/admin/create-user.js";
import { adminChangeRoleContract } from "./procedures/admin/change-role.js";
import { adminSetBannedContract } from "./procedures/admin/set-banned.js";`,
            ]
          : []),
        ...(hasBilling
          ? [
              `import { billingSubscriptionsContract } from "./procedures/billing/subscriptions.js";
import { billingCreateCheckoutContract } from "./procedures/billing/create-checkout.js";
import { billingCreatePortalSessionContract } from "./procedures/billing/create-portal-session.js";
import { billingCreatePaymentLinkContract } from "./procedures/billing/create-payment-link.js";`,
            ]
          : []),
        ...(hasMessaging
          ? [
              `import { messagingListConversationsContract } from "./procedures/messaging/list-conversations.js";
import { messagingListMessagesContract } from "./procedures/messaging/list-messages.js";
import { messagingGetOrCreateConversationContract } from "./procedures/messaging/get-or-create-conversation.js";
import { messagingSendMessageContract } from "./procedures/messaging/send-message.js";
import { messagingMarkReadContract } from "./procedures/messaging/mark-read.js";
import { messagingSendTypingContract } from "./procedures/messaging/send-typing.js";
import { messagingCreateWebsocketTicketContract } from "./procedures/messaging/create-websocket-ticket.js";
import { messagingSubscribeContract } from "./procedures/messaging/subscribe.js";`,
            ]
          : []),
        ...(hasIdentity ? ['import { identityContract } from "./identity/contract.js";'] : []),
        ...(hasNotifications
          ? ['import { notificationsContract } from "./notifications/contract.js";']
          : []),
        ...(hasFeatureFlags
          ? ['import { featureFlagsContract } from "./feature-flags/contract.js";']
          : []),
        ...(hasJobs ? ['import { jobsContract } from "./jobs/contract.js";'] : []),
        ...(hasStorage ? ['import { storageContract } from "./storage/contract.js";'] : []),
        "",
        "export const appContract = {",
        "  health: healthContract,",
        ...(hasAuth ? ["  me: meContract,"] : []),
        ...(emitAdminApi
          ? [
              `  adminUsers: {
    list: adminListUsersContract,
    create: adminCreateUserContract,
    changeRole: adminChangeRoleContract,
    setBanned: adminSetBannedContract,
  },`,
            ]
          : []),
        ...(hasBilling
          ? [
              `  billing: {
    subscriptions: billingSubscriptionsContract,
    createCheckout: billingCreateCheckoutContract,
    createPortalSession: billingCreatePortalSessionContract,
    createPaymentLink: billingCreatePaymentLinkContract,
  },`,
            ]
          : []),
        ...(hasMessaging
          ? [
              `  messaging: {
    listConversations: messagingListConversationsContract,
    listMessages: messagingListMessagesContract,
    getOrCreateConversation: messagingGetOrCreateConversationContract,
    sendMessage: messagingSendMessageContract,
    markRead: messagingMarkReadContract,
    sendTyping: messagingSendTypingContract,
    createWebsocketTicket: messagingCreateWebsocketTicketContract,
    subscribe: messagingSubscribeContract,
  },`,
            ]
          : []),
        ...(hasIdentity ? ["  identity: identityContract,"] : []),
        ...(hasNotifications ? ["  notifications: notificationsContract,"] : []),
        ...(hasFeatureFlags ? ["  featureFlags: featureFlagsContract,"] : []),
        ...(hasJobs ? ["  jobs: jobsContract,"] : []),
        ...(hasStorage ? ["  storage: storageContract,"] : []),
        "};",
        "",
      ].join("\n"),
    ),
    file(
      "packages/api/src/router.ts",
      [
        `import { implement, os } from "@orpc/server";
import { appContract } from "./contract.js";
import { health } from "./procedures/health.js";
import type { ApiContext } from "./context.js";`,
        ...(hasAuth ? ['import { me } from "./procedures/me.js";'] : []),
        ...(emitAdminApi
          ? [
              `import { adminListUsers } from "./procedures/admin/list-users.js";
import { adminCreateUser } from "./procedures/admin/create-user.js";
import { adminChangeRole } from "./procedures/admin/change-role.js";
import { adminSetBanned } from "./procedures/admin/set-banned.js";`,
            ]
          : []),
        ...(hasBilling
          ? [
              `import { billingSubscriptions } from "./procedures/billing/subscriptions.js";
import { billingCreateCheckout } from "./procedures/billing/create-checkout.js";
import { billingCreatePortalSession } from "./procedures/billing/create-portal-session.js";
import { billingCreatePaymentLink } from "./procedures/billing/create-payment-link.js";`,
            ]
          : []),
        ...(hasMessaging
          ? [
              `import { messagingListConversations } from "./procedures/messaging/list-conversations.js";
import { messagingListMessages } from "./procedures/messaging/list-messages.js";
import { messagingGetOrCreateConversation } from "./procedures/messaging/get-or-create-conversation.js";
import { messagingSendMessage } from "./procedures/messaging/send-message.js";
import { messagingMarkRead } from "./procedures/messaging/mark-read.js";
import { messagingSendTyping } from "./procedures/messaging/send-typing.js";
import { messagingCreateWebsocketTicket } from "./procedures/messaging/create-websocket-ticket.js";
import { messagingSubscribe } from "./procedures/messaging/subscribe.js";`,
            ]
          : []),
        ...(hasIdentity
          ? [`import { createIdentityProcedures } from "./identity/procedures.js";`]
          : []),
        ...(hasNotifications
          ? [`import { createNotificationProcedures } from "./notifications/procedures.js";`]
          : []),
        ...(hasFeatureFlags
          ? [
              `import { createFeatureFlagProcedures } from "./feature-flags/procedures.js";
import { createFeatureFlagServiceForRequest } from "./composition/feature-flags.js";`,
            ]
          : []),
        ...(hasJobs
          ? [
              `import { createJobProcedures } from "./jobs/procedures.js";
import { createJobsServiceForRequest } from "./composition/jobs.js";`,
            ]
          : []),
        ...(hasStorage
          ? [
              `import { createStorageProcedures } from "./storage/procedures.js";
import { createOwnedStorageServiceForRequest } from "./composition/storage.js";`,
            ]
          : []),
        "",
        "const implementer = implement<typeof appContract, ApiContext>(appContract);",
        "",
        'export const appRouter = os.$context<ApiContext>().prefix("/api").router(',
        "  implementer.router({",
        "    health,",
        ...(hasAuth ? ["    me,"] : []),
        ...(emitAdminApi
          ? [
              `    adminUsers: {
      list: adminListUsers,
      create: adminCreateUser,
      changeRole: adminChangeRole,
      setBanned: adminSetBanned,
    },`,
            ]
          : []),
        ...(hasBilling
          ? [
              `    billing: {
      subscriptions: billingSubscriptions,
      createCheckout: billingCreateCheckout,
      createPortalSession: billingCreatePortalSession,
      createPaymentLink: billingCreatePaymentLink,
    },`,
            ]
          : []),
        ...(hasMessaging
          ? [
              `    messaging: {
      listConversations: messagingListConversations,
      listMessages: messagingListMessages,
      getOrCreateConversation: messagingGetOrCreateConversation,
      sendMessage: messagingSendMessage,
      markRead: messagingMarkRead,
      sendTyping: messagingSendTyping,
      createWebsocketTicket: messagingCreateWebsocketTicket,
      subscribe: messagingSubscribe,
    },`,
            ]
          : []),
        ...(hasIdentity ? ["    identity: createIdentityProcedures<ApiContext>(),"] : []),
        ...(hasNotifications
          ? ["    notifications: createNotificationProcedures<ApiContext>(),"]
          : []),
        ...(hasFeatureFlags
          ? [
              "    featureFlags: createFeatureFlagProcedures<ApiContext>((context) => createFeatureFlagServiceForRequest(context)),",
            ]
          : []),
        ...(hasJobs
          ? [
              "    jobs: createJobProcedures<ApiContext>((context) => createJobsServiceForRequest(context)),",
            ]
          : []),
        ...(hasStorage
          ? [
              "    storage: createStorageProcedures<ApiContext>((context) => createOwnedStorageServiceForRequest(context)),",
            ]
          : []),
        "  }),",
        ");",
        ...(hasMessaging
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
      ].join("\n"),
    ),
    file(
      "packages/api/src/index.ts",
      `export { appRouter${hasMessaging ? ", messagingWebSocketRouter" : ""} } from "./router.js";
export { appContract } from "./contract.js";
export { applyApiContextResponseHeaders, createContext, type ApiContext } from "./context.js";
export { rejectUnsafeOrpcRequest } from "./request-security.js";
`,
    ),
    file(
      "packages/api/src/openapi.ts",
      `import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { appRouter } from "./router.js";

// oRPC contract-first, os.prefix("/api") + oc.route.
// The constructor option is \`schemaConverters\` (OpenAPIGeneratorOptions in
// @orpc/openapi); \`converters\` is not a known property and failed to typecheck.

export async function generateOpenAPISpec(): Promise<unknown> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });
  return generator.generate(appRouter, {
    info: { title: "GhostInit API", version: "0.1.0" },
    // Router paths already include /api; a relative server keeps the document portable
    // without producing /api/api operation URLs.
    servers: [{ url: "/" }],
  });
}
`,
    ),
  ];
}
