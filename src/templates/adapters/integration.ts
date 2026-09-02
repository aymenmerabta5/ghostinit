// @allow-long 1100: one post-composition pass owns adapter replacement, schema wiring, workers, and manifests
import type { DatabaseProvider, ProjectMode } from "../../lib/addons.js";
import { file, type TemplateFile, type TemplateRuntime } from "../shared.js";
import { identityAdapterFiles, identityAdapterIntegrationGuide } from "./identity/index.js";
import {
  notificationAdapterFiles,
  notificationAdapterIntegrationGuide,
} from "./notifications/index.js";
import { featureFlagAdapterFiles } from "./feature-flags/index.js";
import { jobsAdapterFiles, jobsAdapterIntegrationGuide } from "./jobs/index.js";
import { nodeTypeScriptWorkerLoaderContent } from "./jobs/scripts.js";
import { storageAdapterFiles, storageAdapterIntegrationGuide } from "./storage/index.js";

export interface AdapterCapabilitySelection {
  identity?: boolean;
  notifications?: boolean;
  featureFlags?: boolean;
  jobs?: boolean;
  jobsApi?: boolean;
  storage?: boolean;
  messaging?: boolean;
}

export interface AdapterIntegrationOptions {
  mode: ProjectMode;
  database: DatabaseProvider;
  runtime?: TemplateRuntime;
  capabilities: AdapterCapabilitySelection;
}

function upsertFiles(files: TemplateFile[], additions: readonly TemplateFile[]): TemplateFile[] {
  const replacements = new Map(additions.map((entry) => [entry.path, entry]));
  const replaced = new Set<string>();
  const result = files.map((entry) => {
    const replacement = replacements.get(entry.path);
    if (!replacement) return entry;
    replaced.add(entry.path);
    return replacement;
  });
  for (const addition of additions) {
    if (!replaced.has(addition.path)) result.push(addition);
  }
  return result;
}

function sortStringRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function patchFile(
  files: TemplateFile[],
  path: string,
  transform: (content: string) => string,
  required = true,
): TemplateFile[] {
  let found = false;
  const result = files.map((entry) => {
    if (entry.path !== path) return entry;
    found = true;
    return { ...entry, content: transform(entry.content) };
  });
  if (required && !found) throw new Error(`Adapter integration requires ${path}`);
  return result;
}

function addLines(content: string, lines: readonly string[]): string {
  const missing = lines.filter((line) => !content.includes(line));
  if (missing.length === 0) return content;
  const trimmed = content.trimEnd();
  return `${trimmed}\n${missing.join("\n")}\n`;
}

function addImports(content: string, imports: readonly string[]): string {
  const missing = imports.filter((entry) => !content.includes(entry));
  return missing.length === 0 ? content : `${missing.join("\n")}\n${content}`;
}

function postgresSchemaExports(capabilities: AdapterCapabilitySelection): string[] {
  return [
    ...(capabilities.notifications
      ? ['export { notificationDeviceTokens, notifications } from "./notifications";']
      : []),
    ...(capabilities.jobs
      ? [
          'export { jobDefinitions, jobRunEvents, jobRuns, jobRunState, jobSchedules } from "./jobs";',
        ]
      : []),
    ...(capabilities.storage
      ? ['export { storedObjects, storageBlobCleanupQueue } from "./storage";']
      : []),
  ];
}

function patchSingleDatabaseIndex(
  content: string,
  capabilities: AdapterCapabilitySelection,
): string {
  const schemas = [
    ...(capabilities.notifications ? ["notifications"] : []),
    ...(capabilities.jobs ? ["jobs"] : []),
    ...(capabilities.storage ? ["storage"] : []),
  ];
  if (schemas.length === 0) return content;
  const importAnchor = "import { Pool, type PoolConfig } from 'pg';";
  if (!content.includes(importAnchor)) {
    throw new Error(
      "Postgres adapter integration could not find the single database import anchor",
    );
  }
  let patched = content;
  const importLines = schemas.map(
    (schema) => `import * as ${schema}Schema from './schema/${schema}';`,
  );
  const missingImports = importLines.filter((entry) => !patched.includes(entry));
  if (missingImports.length > 0) {
    patched = patched.replace(importAnchor, `${importAnchor}\n${missingImports.join("\n")}`);
  }
  const spreads = schemas.map((schema) => `...${schema}Schema`);
  const missingSpreads = spreads.filter((entry) => !patched.includes(entry));
  if (missingSpreads.length === 0) return patched;
  if (/schema:\s*\{[^}]*\}/s.test(patched)) {
    return patched.replace(/schema:\s*\{([^}]*)\}/s, (_match, body: string) => {
      const existing = body.trim().replace(/,\s*$/, "");
      const joined = [...(existing ? [existing] : []), ...missingSpreads].join(", ");
      return `schema: { ${joined} }`;
    });
  }
  if (!patched.includes("drizzle(pool);")) {
    throw new Error("Postgres adapter integration could not find the single drizzle constructor");
  }
  return patched.replace(
    "drizzle(pool);",
    `drizzle(pool, { schema: { ${missingSpreads.join(", ")} } });`,
  );
}

function patchConvexSchema(content: string, capabilities: AdapterCapabilitySelection): string {
  const modules = [
    ...(capabilities.identity
      ? [
          {
            importLine: 'import { identityTables } from "./schema/identity";',
            spread: "...identityTables,",
          },
        ]
      : []),
    ...(capabilities.notifications
      ? [
          {
            importLine: 'import { notificationTables } from "./schema/notifications";',
            spread: "...notificationTables,",
          },
        ]
      : []),
    ...(capabilities.jobs
      ? [{ importLine: 'import { jobTables } from "./schema/jobs";', spread: "...jobTables," }]
      : []),
    ...(capabilities.storage
      ? [
          {
            importLine: 'import { storageTables } from "./schema/storage";',
            spread: "...storageTables,",
          },
        ]
      : []),
  ];
  let patched = addImports(
    content,
    modules.map(({ importLine }) => importLine),
  );
  const marker = "export default defineSchema({";
  if (!patched.includes(marker))
    throw new Error("Convex adapter integration requires defineSchema");
  const missingSpreads = modules.filter(({ spread }) => !patched.includes(spread));
  if (missingSpreads.length > 0) {
    patched = patched.replace(
      marker,
      `${marker}\n${missingSpreads.map(({ spread }) => `  ${spread}`).join("\n")}`,
    );
  }
  return patched;
}

function patchConvexIdentityAuth(content: string): string {
  const importLine =
    'import { syncIdentitySessionCreated, syncIdentitySessionDeleted, syncIdentitySessionUpdated } from "./identity/sessions";';
  let patched = addImports(content, [importLine]);
  if (!patched.includes("onCreate: syncIdentitySessionCreated")) {
    const marker = "  triggers: {\n    user: {";
    if (!patched.includes(marker)) {
      throw new Error("Convex identity integration could not find authComponent triggers");
    }
    patched = patched.replace(
      marker,
      `  triggers: {
    session: {
      onCreate: syncIdentitySessionCreated,
      onUpdate: syncIdentitySessionUpdated,
      onDelete: syncIdentitySessionDeleted,
    },
    user: {`,
    );
  }
  return patched;
}

function patchConvexActorGuard(content: string): string {
  if (content.includes("AUTH_SESSION_REVOKED")) return content;
  const marker = `  if (isUserBanned(actor)) {
    throw new ConvexError({ code: "USER_BANNED", message: "This account is banned" });
  }
  return actor;`;
  if (!content.includes(marker)) {
    throw new Error("Convex identity integration could not find the app actor banned guard");
  }
  return content.replace(
    marker,
    `  if (isUserBanned(actor)) {
    throw new ConvexError({ code: "USER_BANNED", message: "This account is banned" });
  }
  const tokenIdentity = await ctx.auth.getUserIdentity();
  const authSessionId = tokenIdentity?.sessionId;
  if (typeof authSessionId !== "string" || authSessionId.length === 0) {
    throw new ConvexError({ code: "AUTH_SESSION_REVOKED", message: "The session has no app revocation binding" });
  }
  const appSession = await ctx.db
    .query("identitySessions")
    .withIndex("by_auth_session", (query) => query.eq("authSessionId", authSessionId))
    .unique();
  const now = Date.now();
  if (!appSession || appSession.userId !== actor._id || appSession.revokedAt !== undefined || appSession.expiresAt <= now) {
    throw new ConvexError({ code: "AUTH_SESSION_REVOKED", message: "The app identity session is no longer active" });
  }
  return actor;`,
  );
}

function convexIdentityComposition(mode: ProjectMode): TemplateFile {
  const path =
    mode === "monorepo"
      ? "packages/services/src/application/composition/identity.ts"
      : "src/server/services/application/composition/identity.ts";
  const authImport = mode === "monorepo" ? "@repo/auth/server" : "@/server/auth";
  const adapterImport =
    mode === "monorepo"
      ? "./adapters/identity/convex.js"
      : "@/server/services/application/composition/adapters/identity/convex";
  return file(
    path,
    `import "server-only";
import { fetchAuthMutation, fetchAuthQuery } from "${authImport}";
import { api } from "../../../../../convex/_generated/api";
import type { GenericId as Id } from "convex/values";
import { createConvexIdentityService, type ConvexIdentityCommandExecutor } from "${adapterImport}";

const allowedIdentityCodes = new Set([
  "IDENTITY_UNAUTHENTICATED",
  "IDENTITY_VALIDATION_ERROR",
  "IDENTITY_EMAIL_NOT_VERIFIED",
  "IDENTITY_SESSION_NOT_FOUND",
  "IDENTITY_SESSION_FORBIDDEN",
  "IDENTITY_SESSION_NOT_FRESH",
  "IDENTITY_ORGANIZATION_NOT_FOUND",
  "IDENTITY_ORGANIZATION_FORBIDDEN",
  "IDENTITY_ORGANIZATION_SLUG_UNAVAILABLE",
  "IDENTITY_MEMBER_NOT_FOUND",
  "IDENTITY_MEMBER_FORBIDDEN",
  "IDENTITY_LAST_OWNER",
  "IDENTITY_INVITATION_NOT_FOUND",
  "IDENTITY_INVITATION_EMAIL_MISMATCH",
  "IDENTITY_INVITATION_EXPIRED",
  "IDENTITY_INVITATION_NOT_PENDING",
  "IDENTITY_INVITATION_ALREADY_PENDING",
  "IDENTITY_TEAM_NOT_FOUND",
  "IDENTITY_TEAM_NAME_UNAVAILABLE",
]);

function translatedIdentityError(error: unknown): Error & { code: string } {
  const data = error && typeof error === "object" ? Reflect.get(error, "data") : null;
  const rawCode = data && typeof data === "object" ? Reflect.get(data, "code") : null;
  const rawMessage = data && typeof data === "object" ? Reflect.get(data, "message") : null;
  const mapped =
    rawCode === "AUTH_SESSION_REVOKED"
      ? "IDENTITY_SESSION_NOT_FOUND"
      : rawCode === "AUTH_MAPPING_MISSING" || rawCode === "USER_BANNED"
        ? "IDENTITY_UNAUTHENTICATED"
        : typeof rawCode === "string" && allowedIdentityCodes.has(rawCode)
          ? rawCode
          : "IDENTITY_PERSISTENCE_FAILED";
  return Object.assign(
    new Error(typeof rawMessage === "string" ? rawMessage : "The identity provider failed"),
    { code: mapped, cause: error },
  );
}

async function invokeConvexIdentity<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw translatedIdentityError(error);
  }
}

const executor: ConvexIdentityCommandExecutor = {
  listSessions: async () => await fetchAuthQuery(api.identity.sessions.list, {}),
  revokeSession: async (input) => await fetchAuthMutation(api.identity.sessions.revoke, { sessionId: input.sessionId as Id<"identitySessions"> }),
  revokeOtherSessions: async () => await fetchAuthMutation(api.identity.sessions.revokeOthers, {}),
  listOrganizations: async () => await fetchAuthQuery(api.identity.organizations.list, {}),
  createOrganization: async (input) => await fetchAuthMutation(api.identity.organizations.create, input),
  setActiveOrganization: async (input) => await fetchAuthMutation(api.identity.organizations.setActive, { organizationId: input.organizationId as Id<"identityOrganizations"> }),
  listMembers: async (input) => await fetchAuthQuery(api.identity.organizations.listMembers, { organizationId: input.organizationId as Id<"identityOrganizations"> }),
  changeMemberRole: async (input) => await fetchAuthMutation(api.identity.organizations.changeMemberRole, {
    organizationId: input.organizationId as Id<"identityOrganizations">,
    membershipId: input.membershipId as Id<"identityMemberships">,
    role: input.role,
  }),
  removeMember: async (input) => await fetchAuthMutation(api.identity.organizations.removeMember, {
    organizationId: input.organizationId as Id<"identityOrganizations">,
    membershipId: input.membershipId as Id<"identityMemberships">,
  }),
  checkPermission: async (input) => await fetchAuthQuery(api.identity.organizations.checkPermission, {
    organizationId: input.organizationId as Id<"identityOrganizations">,
    permission: input.permission,
  }),
  listInvitations: async (input) => await fetchAuthQuery(api.identity.invitations.list, { organizationId: input.organizationId as Id<"identityOrganizations"> }),
  createInvitation: async (input) => await fetchAuthMutation(api.identity.invitations.create, { ...input, organizationId: input.organizationId as Id<"identityOrganizations"> }),
  cancelInvitation: async (input) => await fetchAuthMutation(api.identity.invitations.cancel, { invitationId: input.invitationId as Id<"identityInvitations"> }),
  acceptInvitation: async (input) => await fetchAuthMutation(api.identity.invitations.accept, { invitationId: input.invitationId as Id<"identityInvitations"> }),
  listTeams: async (input) => await fetchAuthQuery(api.identity.teams.list, { organizationId: input.organizationId as Id<"identityOrganizations"> }),
  createTeam: async (input) => await fetchAuthMutation(api.identity.teams.create, { ...input, organizationId: input.organizationId as Id<"identityOrganizations"> }),
  listTeamMembers: async (input) => await fetchAuthQuery(api.identity.teams.listMembers, {
    organizationId: input.organizationId as Id<"identityOrganizations">,
    teamId: input.teamId as Id<"identityTeams">,
  }),
  addTeamMember: async (input) => await fetchAuthMutation(api.identity.teams.addMember, {
    organizationId: input.organizationId as Id<"identityOrganizations">,
    teamId: input.teamId as Id<"identityTeams">,
    userId: input.userId as Id<"users">,
  }),
  removeTeamMember: async (input) => await fetchAuthMutation(api.identity.teams.removeMember, {
    organizationId: input.organizationId as Id<"identityOrganizations">,
    teamId: input.teamId as Id<"identityTeams">,
    userId: input.userId as Id<"users">,
  }),
  setActiveTeam: async (input) => await fetchAuthMutation(api.identity.teams.setActive, {
    organizationId: input.organizationId as Id<"identityOrganizations">,
    teamId: input.teamId as Id<"identityTeams">,
  }),
  listOrganizationAudit: async (input) => await fetchAuthQuery(api.identity.audit.listForOrganization, {
    organizationId: input.organizationId as Id<"identityOrganizations">,
    paginationOpts: { cursor: input.cursor, numItems: input.numItems },
  }),
  listMyAudit: async (input) => await fetchAuthQuery(api.identity.audit.listMine, {
    paginationOpts: { cursor: input.cursor, numItems: input.numItems },
  }),
};

const guardedExecutor = new Proxy(executor, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) =>
      invokeConvexIdentity(async () => await Reflect.apply(value, target, args));
  },
});

export async function resolveIdentityActorForRequest(input: {
  authSessionId: string;
  userId: string;
}) {
  const current = await invokeConvexIdentity(async () =>
    await fetchAuthQuery(api.identity.sessions.current, {}),
  );
  if (
    current.authSessionId !== input.authSessionId ||
    String(current.userId) !== input.userId
  ) {
    return null;
  }
  return {
    userId: input.userId,
    sessionId: current.session.id,
    email: "",
    emailVerified: false,
    authenticatedAt: new Date(current.session.authenticatedAt),
    activeOrganizationId: current.session.activeOrganizationId ?? null,
    activeTeamId: current.session.activeTeamId ?? null,
  };
}

export function createIdentityServiceForRequest() {
  return createConvexIdentityService(guardedExecutor);
}
`,
  );
}

function notificationComposition(mode: ProjectMode, database: "postgres" | "convex"): TemplateFile {
  const path =
    mode === "monorepo"
      ? "packages/services/src/application/composition/notifications.ts"
      : "src/server/services/application/composition/notifications.ts";
  const serviceImport =
    mode === "monorepo" ? "../../notifications/index.js" : "@/server/services/notifications";
  const adapterRoot =
    mode === "monorepo"
      ? "./adapters/notifications"
      : "@/server/services/application/composition/adapters/notifications";
  const databaseImports =
    database === "postgres"
      ? `import { postgresNotificationAdapter } from "${adapterRoot}/postgres${mode === "monorepo" ? ".js" : ""}";`
      : `import { fetchAuthMutation, fetchAuthQuery } from "${mode === "monorepo" ? "@repo/auth/server" : "@/server/auth"}";
import { api } from "../../../../../convex/_generated/api";
import type { GenericId as Id } from "convex/values";
import { createConvexNotificationAdapter } from "${adapterRoot}/convex${mode === "monorepo" ? ".js" : ""}";`;
  const repository =
    database === "postgres"
      ? "postgresNotificationAdapter"
      : `createConvexNotificationAdapter({
    createSelf: async (input) => await fetchAuthMutation(api.notifications.createSelf, input),
    listInbox: async (input) => await fetchAuthQuery(api.notifications.listInbox, input),
    markRead: async (input) => await fetchAuthMutation(api.notifications.markRead, {
      notificationId: input.notificationId as Id<"notifications">,
    }),
    registerDevice: async (input) => await fetchAuthMutation(api.notifications.registerDevice, {
      platform: input.platform,
      pushToken: input.pushToken,
    }),
  })`;
  return file(
    path,
    `import "server-only";
import { createNotificationService } from "${serviceImport}";
import { fingerprintNotificationDeviceToken } from "${adapterRoot}/token-protection${mode === "monorepo" ? ".js" : ""}";
${databaseImports}

export function createNotificationServiceForRequest() {
  return createNotificationService({
    repository: ${repository},
    deviceTokens: { fingerprint: fingerprintNotificationDeviceToken },
  });
}
`,
  );
}

function featureFlagComposition(mode: ProjectMode): TemplateFile {
  const path =
    mode === "monorepo"
      ? "packages/api/src/composition/feature-flags.ts"
      : "src/server/api/composition/feature-flags.ts";
  const serviceImport =
    mode === "monorepo" ? "@repo/services/feature-flags" : "@/server/services/feature-flags";
  const adapterImport =
    mode === "monorepo"
      ? "@repo/services/feature-flags/posthog"
      : "@/server/services/feature-flags/posthog";
  const contextImport = mode === "monorepo" ? "../context.js" : "../context";
  return file(
    path,
    `import "server-only";
import { createFeatureFlagService, FeatureFlagError } from "${serviceImport}";
import {
  createAnonymousFeatureFlagSubjectAndCookie,
  createAnonymousFeatureFlagSubjectFromSignedCookie,
  createAuthenticatedFeatureFlagSubject,
  createPostHogFeatureFlagAdapter,
} from "${adapterImport}";
import type { ApiContext } from "${contextImport}";

function timeoutMs(): number {
  const value = Number(process.env.FEATURE_FLAG_TIMEOUT_MS ?? "2500");
  if (!Number.isInteger(value) || value < 100 || value > 30000) {
    throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "FEATURE_FLAG_TIMEOUT_MS is outside safe bounds");
  }
  return value;
}

function featureFlagService() {
  return createFeatureFlagService({
    provider: createPostHogFeatureFlagAdapter({
      apiKey: process.env.POSTHOG_API_KEY ?? "",
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      timeoutMs: timeoutMs(),
    }),
  });
}

export async function evaluateAuthenticatedFeatureFlag(
  user: { id: string; email: string; role: string | null; banned: boolean },
  key: string,
) {
  if (user.banned) {
    throw new FeatureFlagError("FEATURE_FLAG_SUBJECT_REQUIRED", "An active user is required");
  }
  const subject = createAuthenticatedFeatureFlagSubject(user.id, {
    email: user.email,
    ...(user.role ? { role: user.role } : {}),
  });
  return await featureFlagService().evaluate(subject, key);
}

export function createFeatureFlagServiceForRequest(context: ApiContext) {
  const user: unknown = Reflect.get(context, "user");
  const userId: unknown = user && typeof user === "object" ? Reflect.get(user, "id") : null;
  const banned: unknown = user && typeof user === "object" ? Reflect.get(user, "banned") : null;
  if (user && typeof user === "object" && !Array.isArray(user) && banned !== true && typeof userId === "string") {
    const email: unknown = Reflect.get(user, "email");
    const emailVerified: unknown = Reflect.get(user, "emailVerified");
    const role: unknown = Reflect.get(user, "role");
    context.featureFlagSubject = createAuthenticatedFeatureFlagSubject(userId, {
      ...(typeof email === "string" ? { email } : {}),
      ...(typeof emailVerified === "boolean" ? { emailVerified } : {}),
      ...(typeof role === "string" ? { role } : {}),
    });
  } else if (!context.featureFlagSubject) {
    const encoded = (context.headers.get("cookie") ?? "")
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("ghostinit_anonymous_id="))
      ?.slice("ghostinit_anonymous_id=".length);
    const secret = process.env.BETTER_AUTH_SECRET;
    try {
      if (!secret || secret.length < 32) {
        context.featureFlagSubject = null;
      } else if (encoded) {
        context.featureFlagSubject = createAnonymousFeatureFlagSubjectFromSignedCookie({
            signedCookie: decodeURIComponent(encoded),
            signingSecret: secret,
          });
      } else {
        const issued = createAnonymousFeatureFlagSubjectAndCookie({ signingSecret: secret });
        context.featureFlagSubject = issued.subject;
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
        context.featureFlagSetCookie =
          "ghostinit_anonymous_id=" + encodeURIComponent(issued.signedCookie) +
          "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + issued.maxAgeSeconds + secure;
      }
    } catch {
      if (!secret || secret.length < 32) {
        context.featureFlagSubject = null;
      } else {
        const issued = createAnonymousFeatureFlagSubjectAndCookie({ signingSecret: secret });
        context.featureFlagSubject = issued.subject;
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
        context.featureFlagSetCookie =
          "ghostinit_anonymous_id=" + encodeURIComponent(issued.signedCookie) +
          "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + issued.maxAgeSeconds + secure;
      }
    }
  }
  return featureFlagService();
}
`,
  );
}

function jobsComposition(mode: ProjectMode, database: "postgres" | "convex"): TemplateFile {
  const path =
    mode === "monorepo"
      ? "packages/api/src/composition/jobs.ts"
      : "src/server/api/composition/jobs.ts";
  const serviceImport = mode === "monorepo" ? "@repo/services/jobs" : "@/server/services/jobs";
  const adapterRoot = mode === "monorepo" ? "../adapters/jobs" : "@/server/adapters/jobs";
  const contextImport = mode === "monorepo" ? "../context.js" : "../context";
  const content =
    database === "postgres"
      ? `import "server-only";
import { randomBytes } from "node:crypto";
import { createJobsService, JobError } from "${serviceImport}";
import { postgresJobsAdapter } from "${adapterRoot}/postgres${mode === "monorepo" ? ".js" : ""}";
import { cronJobScheduleCalculator } from "${adapterRoot}/schedule-calculator${mode === "monorepo" ? ".js" : ""}";
import type { ApiContext } from "${contextImport}";

function leaseDurationMs(): number {
  const value = Number(process.env.JOB_LEASE_MS ?? "30000");
  if (!Number.isInteger(value) || value < 3000 || value > 900000) {
    throw new JobError("JOB_INVALID_RETRY_POLICY", "JOB_LEASE_MS is outside safe bounds");
  }
  return value;
}

export function createJobsServiceForRequest(_context: ApiContext) {
  return createJobsService({
    persistence: postgresJobsAdapter,
    scheduleCalculator: cronJobScheduleCalculator,
    leaseTokens: { create: () => randomBytes(32).toString("base64url") },
    leaseDurationMs: leaseDurationMs(),
  });
}
`
      : `import "server-only";
import { JobError, type JobsService } from "${serviceImport}";
import { fetchAuthMutation, fetchAuthQuery } from "${mode === "monorepo" ? "@repo/auth/server" : "@/server/auth"}";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { createConvexJobsRequestAdapter } from "${adapterRoot}/convex-client${mode === "monorepo" ? ".js" : ""}";
import type { ApiContext } from "${contextImport}";

function unavailableConvexWorkerOperation(): never {
  throw new JobError("JOB_WORKER_REQUIRED", "Convex jobs run through internal functions and scheduled actions");
}

export function createJobsServiceForRequest(_context: ApiContext): JobsService {
  const requestAdapter = createConvexJobsRequestAdapter({
    enqueue: async (input) => await fetchAuthMutation(api.jobs.enqueue, input),
    get: async (input) => await fetchAuthQuery(api.jobs.get, { runId: input.runId as Id<"jobRuns"> }),
    cancel: async (input) => await fetchAuthMutation(api.jobs.cancel, { runId: input.runId as Id<"jobRuns"> }),
  });
  return {
    runs: requestAdapter.runs,
    schedules: {
      async materialize() { return unavailableConvexWorkerOperation(); },
      async tick() { return unavailableConvexWorkerOperation(); },
    },
    workers: {
      async claim() { return unavailableConvexWorkerOperation(); },
      async heartbeat() { return unavailableConvexWorkerOperation(); },
      async succeed() { return unavailableConvexWorkerOperation(); },
      async fail() { return unavailableConvexWorkerOperation(); },
      async acknowledgeCancellation() { return unavailableConvexWorkerOperation(); },
      async recoverExpiredLeases() { return unavailableConvexWorkerOperation(); },
    },
  };
}
`;
  return file(path, content);
}

function storageComposition(mode: ProjectMode, database: "postgres" | "convex"): TemplateFile {
  const path =
    mode === "monorepo"
      ? "packages/api/src/composition/storage.ts"
      : "src/server/api/composition/storage.ts";
  const serviceImport =
    mode === "monorepo" ? "@repo/services/storage" : "@/server/services/storage";
  const adapterRoot = mode === "monorepo" ? "../adapters/storage" : "@/server/adapters/storage";
  const contextImport = mode === "monorepo" ? "../context.js" : "../context";
  if (database === "postgres") {
    return file(
      path,
      `import "server-only";
import { createOwnedStorageService } from "${serviceImport}";
import { postgresOwnedStorageAdapter } from "${adapterRoot}/postgres${mode === "monorepo" ? ".js" : ""}";
import type { ApiContext } from "${contextImport}";

export function createOwnedStorageServiceForRequest(_context: ApiContext) {
  return createOwnedStorageService(postgresOwnedStorageAdapter);
}
`,
    );
  }
  return file(
    path,
    `import "server-only";
import { fetchAuthAction, fetchAuthMutation, fetchAuthQuery } from "${mode === "monorepo" ? "@repo/auth/server" : "@/server/auth"}";
import { createOwnedStorageService } from "${serviceImport}";
import { createConvexOwnedStoragePort } from "${adapterRoot}/convex${mode === "monorepo" ? ".js" : ""}";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ApiContext } from "${contextImport}";

export function createOwnedStorageServiceForRequest(_context: ApiContext) {
  return createOwnedStorageService(
    createConvexOwnedStoragePort({
      upload: async (input) =>
        await fetchAuthAction(api.storage.upload, {
          bytes: input.bytes,
          mimeType: input.mimeType,
          originalName: input.originalName,
        }),
      download: async (input) =>
        await fetchAuthQuery(api.storage.download, { id: input.id as Id<"storedObjects"> }),
      remove: async (input) =>
        await fetchAuthMutation(api.storage.remove, { id: input.id as Id<"storedObjects"> }),
    }),
  );
}
`,
  );
}

function postgresStorageCleanupWorker(mode: ProjectMode, messaging: boolean): TemplateFile {
  const path =
    mode === "monorepo"
      ? "packages/api/src/workers/storage/cleanup.ts"
      : "src/server/workers/storage/cleanup.ts";
  const adapterImport = `../../adapters/storage/postgres${mode === "monorepo" ? ".js" : ""}`;
  const messagingImports = messaging
    ? mode === "monorepo"
      ? `import { db, messageAttachments, storageBlobCleanupQueue } from "@repo/database";
import { and, asc, inArray, isNull, lte, sql } from "drizzle-orm";`
      : `import { and, asc, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { messageAttachments } from "../../db/schema/messaging";
import { storageBlobCleanupQueue } from "../../db/schema/storage";`
    : "";
  const stageExpiredAttachments = messaging
    ? `async function stageExpiredMessagingAttachments(now: Date): Promise<number> {
  return await db.transaction(async (transaction) => {
    const candidates = await transaction
      .select({ id: messageAttachments.id, ownerId: messageAttachments.ownerId })
      .from(messageAttachments)
      .where(and(isNull(messageAttachments.messageId), lte(messageAttachments.expiresAt, now)))
      .orderBy(asc(messageAttachments.expiresAt), asc(messageAttachments.id))
      .limit(CLEANUP_BATCH_LIMIT)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return 0;
    const ownerIds = [...new Set(candidates.map(({ ownerId }) => ownerId))].sort();
    for (const ownerId of ownerIds) {
      await transaction.execute(
        sql\`select pg_advisory_xact_lock(hashtextextended(\${"storage-owner:" + ownerId}, 0))\`,
      );
    }
    const candidateIds = candidates.map(({ id }) => id);
    const removed = await transaction
      .delete(messageAttachments)
      .where(
        and(
          inArray(messageAttachments.id, candidateIds),
          isNull(messageAttachments.messageId),
          lte(messageAttachments.expiresAt, now),
        ),
      )
      .returning({
        storageKey: messageAttachments.storageKey,
        ownerId: messageAttachments.ownerId,
        byteSize: messageAttachments.byteSize,
      });
    if (removed.length !== candidateIds.length) {
      throw new Error("Expired attachment cleanup lost its row locks");
    }
    const tombstones = await transaction
      .insert(storageBlobCleanupQueue)
      .values(
        removed.map(({ storageKey, ownerId, byteSize }) => ({
          storageKey,
          source: "expired-messaging-attachment",
          ownerId,
          byteSize,
          availableAt: now,
          updatedAt: now,
        })),
      )
      .returning({ id: storageBlobCleanupQueue.id });
    if (tombstones.length !== removed.length) {
      throw new Error("Expired attachment cleanup did not retain every blob key");
    }
    return removed.length;
  });
}`
    : `async function stageExpiredMessagingAttachments(_now: Date): Promise<number> {
  return 0;
}`;
  return file(
    path,
    `import "server-only";
${messagingImports}
import { runPostgresStorageCleanupBatch } from "${adapterImport}";

const CLEANUP_BATCH_LIMIT = 100;
const CLEANUP_POLL_MS = 60_000;
const STORAGE_CLEANUP_WORKER_ENTRY = "--ghostinit-storage-cleanup-worker";

${stageExpiredAttachments}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export async function runPostgresStorageCleanupCycle() {
  const now = new Date();
  const expiredAttachments = await stageExpiredMessagingAttachments(now);
  const blobs = await runPostgresStorageCleanupBatch({ limit: CLEANUP_BATCH_LIMIT });
  return { expiredAttachments, ...blobs };
}

export async function runPostgresStorageCleanupWorker(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const result = await runPostgresStorageCleanupCycle();
      if (result.expiredAttachments > 0 || result.reservationsReleased > 0 || result.claimed > 0) {
        console.info(JSON.stringify({ scope: "storage-cleanup", event: "batch", ...result }));
      }
    } catch {
      console.error(JSON.stringify({ scope: "storage-cleanup", event: "batch-failed" }));
    }
    await sleep(CLEANUP_POLL_MS, signal);
  }
}

function isDirectExecution(): boolean {
  return process.argv.includes(STORAGE_CLEANUP_WORKER_ENTRY);
}

if (isDirectExecution()) {
  const shutdown = new AbortController();
  process.once("SIGINT", () => shutdown.abort());
  process.once("SIGTERM", () => shutdown.abort());
  await runPostgresStorageCleanupWorker(shutdown.signal);
}
`,
  );
}

function mergeConvexCrons(
  files: TemplateFile[],
  capabilities: AdapterCapabilitySelection,
  jobsCronContent?: string,
): TemplateFile[] {
  if (!capabilities.jobs && !capabilities.storage && !capabilities.messaging) return files;
  const existing = files.find((entry) => entry.path === "convex/crons.ts");
  let content =
    jobsCronContent ??
    existing?.content ??
    `import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

export default crons;
`;
  const storageLine =
    'crons.interval("cleanup pending uploads", { minutes: 15 }, internal.storageInternal.cleanupExpiredUploads, { limit: 500 });';
  if (capabilities.storage && !content.includes(storageLine)) {
    if (!content.includes("export default crons;")) {
      throw new Error("Convex adapter integration could not merge storage cleanup into crons");
    }
    content = content.replace("export default crons;", `${storageLine}\n\nexport default crons;`);
  }
  const orphanStorageLine =
    'crons.interval("stage managed storage orphans", { minutes: 5 }, internal.storageInternal.stageManagedOrphanPage, { limit: 50 });';
  if (capabilities.storage && !content.includes(orphanStorageLine)) {
    if (!content.includes("export default crons;")) {
      throw new Error(
        "Convex adapter integration could not merge orphan storage cleanup into crons",
      );
    }
    content = content.replace(
      "export default crons;",
      `${orphanStorageLine}\n\nexport default crons;`,
    );
  }
  const managedCleanupLine =
    'crons.interval("cleanup managed storage blobs", { minutes: 5 }, internal.storageInternal.cleanupManagedBlobBatch, { limit: 25 });';
  if (capabilities.storage && !content.includes(managedCleanupLine)) {
    if (!content.includes("export default crons;")) {
      throw new Error("Convex adapter integration could not merge managed blob cleanup into crons");
    }
    content = content.replace(
      "export default crons;",
      `${managedCleanupLine}\n\nexport default crons;`,
    );
  }
  const messagingLine =
    'crons.interval("cleanup messaging uploads", { minutes: 15 }, internal.messagingInternal.cleanupExpiredUploads, { limit: 100 });';
  if (capabilities.messaging && !content.includes(messagingLine)) {
    if (!content.includes("export default crons;")) {
      throw new Error("Convex adapter integration could not merge messaging cleanup into crons");
    }
    content = content.replace("export default crons;", `${messagingLine}\n\nexport default crons;`);
  }
  return upsertFiles(files, [file("convex/crons.ts", content)]);
}

function patchJsonManifest(
  files: TemplateFile[],
  path: string,
  transform: (manifest: Record<string, unknown>) => void,
  required = true,
): TemplateFile[] {
  return patchFile(
    files,
    path,
    (content) => {
      const manifest = JSON.parse(content) as Record<string, unknown>;
      transform(manifest);
      return `${JSON.stringify(manifest, null, 2)}\n`;
    },
    required,
  );
}

function patchManifests(files: TemplateFile[], options: AdapterIntegrationOptions): TemplateFile[] {
  const { mode, database, capabilities } = options;
  const runtime = options.runtime ?? "bun";
  let result = files;
  if (mode === "monorepo" && result.some((entry) => entry.path === "packages/api/package.json")) {
    const dependencies = {
      ...(capabilities.identity && database !== "none"
        ? identityAdapterIntegrationGuide(mode, database).requiredPackageDependencies
        : {}),
      ...(capabilities.notifications && database !== "none"
        ? notificationAdapterIntegrationGuide({ mode, database }).apiDependencies
        : {}),
      ...(capabilities.jobs && database !== "none"
        ? jobsAdapterIntegrationGuide({
            mode,
            database,
            runtime,
            userFacingApi: capabilities.jobsApi === true,
          }).apiDependencies
        : {}),
      ...(capabilities.storage && database !== "none"
        ? storageAdapterIntegrationGuide({ mode, database }).dependencies
        : {}),
    };
    result = patchJsonManifest(result, "packages/api/package.json", (manifest) => {
      const current = (manifest.dependencies ?? {}) as Record<string, string>;
      Object.assign(current, dependencies);
      const apiStillUsesAnalytics = result.some(
        (entry) =>
          entry.path.startsWith("packages/api/src/") &&
          entry.content.includes('from "@repo/analytics'),
      );
      if (!apiStillUsesAnalytics) delete current["@repo/analytics"];
      manifest.dependencies = sortStringRecord(current);
      const exports = (manifest.exports ?? {}) as Record<string, string>;
      const capabilityExports: Record<string, [boolean | undefined, string]> = {
        "./identity": [capabilities.identity, "./src/identity/index.ts"],
        "./notifications": [capabilities.notifications, "./src/notifications/index.ts"],
        "./feature-flags": [capabilities.featureFlags, "./src/feature-flags/index.ts"],
        "./jobs": [capabilities.jobsApi, "./src/jobs/index.ts"],
        "./storage": [capabilities.storage, "./src/storage/index.ts"],
        "./workers/storage/cleanup": [
          capabilities.storage && database === "postgres",
          "./src/workers/storage/cleanup.ts",
        ],
      };
      for (const [key, [enabled, target]] of Object.entries(capabilityExports)) {
        if (enabled) exports[key] = target;
        else delete exports[key];
      }
      manifest.exports = sortStringRecord(exports);
    });
  } else if (capabilities.storage && database === "postgres") {
    const dependencies = storageAdapterIntegrationGuide({ mode, database }).dependencies;
    result = patchJsonManifest(result, "package.json", (manifest) => {
      const current = (manifest.dependencies ?? {}) as Record<string, string>;
      Object.assign(current, dependencies);
      manifest.dependencies = sortStringRecord(current);
    });
  }
  if (capabilities.jobs && database !== "none") {
    const scripts = jobsAdapterIntegrationGuide({
      mode,
      database,
      runtime,
      userFacingApi: capabilities.jobsApi === true,
    }).packageScripts;
    result = patchJsonManifest(result, "package.json", (manifest) => {
      const current = (manifest.scripts ?? {}) as Record<string, string>;
      for (const [name, command] of Object.entries(scripts)) {
        current[name] = command;
      }
      manifest.scripts = sortStringRecord(current);
    });
  }
  if (capabilities.storage && database === "postgres") {
    const workerPath =
      mode === "monorepo"
        ? "packages/api/src/workers/storage/cleanup.ts"
        : "src/server/workers/storage/cleanup.ts";
    const runner =
      runtime === "bun"
        ? "bun --conditions=react-server"
        : "node --import ./scripts/typescript-worker-loader.mjs --conditions=react-server --experimental-strip-types";
    result = patchJsonManifest(result, "package.json", (manifest) => {
      const current = (manifest.scripts ?? {}) as Record<string, string>;
      current["storage:cleanup-worker"] =
        `${runner} ${workerPath} --ghostinit-storage-cleanup-worker`;
      manifest.scripts = sortStringRecord(current);
    });
  }
  return result;
}

/**
 * Replace capability placeholders only after all base composers have run. This
 * keeps selection centralized while preserving duplicate-file conflict checks
 * for every unrelated template.
 */
export function integrateAdapterFiles(
  baseFiles: readonly TemplateFile[],
  options: AdapterIntegrationOptions,
): TemplateFile[] {
  const { mode, database } = options;
  const capabilities: AdapterCapabilitySelection = {
    identity: options.capabilities.identity === true && database !== "none",
    notifications: options.capabilities.notifications === true && database !== "none",
    featureFlags: options.capabilities.featureFlags === true,
    jobs: options.capabilities.jobs === true && database !== "none",
    jobsApi:
      options.capabilities.jobs === true &&
      options.capabilities.jobsApi === true &&
      database !== "none",
    storage: options.capabilities.storage === true && database !== "none",
    messaging: options.capabilities.messaging === true && database === "convex",
  };
  const persistentDatabase = database === "none" ? null : database;
  const additions: TemplateFile[] = [
    ...(capabilities.identity && persistentDatabase
      ? identityAdapterFiles(mode, persistentDatabase)
      : []),
    ...(capabilities.notifications && persistentDatabase
      ? notificationAdapterFiles({ mode, database: persistentDatabase })
      : []),
    ...(capabilities.featureFlags ? featureFlagAdapterFiles({ mode }) : []),
    ...(capabilities.jobs && persistentDatabase
      ? jobsAdapterFiles({
          mode,
          database: persistentDatabase,
          runtime: options.runtime,
          userFacingApi: capabilities.jobsApi === true,
        })
      : []),
    ...(capabilities.storage && persistentDatabase
      ? storageAdapterFiles({
          mode,
          database: persistentDatabase,
          messaging: options.capabilities.messaging === true,
        })
      : []),
  ];
  const withoutCron = additions.filter((entry) => entry.path !== "convex/crons.ts");
  const jobsCronContent = additions.find((entry) => entry.path === "convex/crons.ts")?.content;
  let files = upsertFiles([...baseFiles], withoutCron);
  const compositions: TemplateFile[] = [
    ...(capabilities.identity && database === "convex" ? [convexIdentityComposition(mode)] : []),
    ...(capabilities.notifications && persistentDatabase
      ? [notificationComposition(mode, persistentDatabase)]
      : []),
    ...(capabilities.featureFlags ? [featureFlagComposition(mode)] : []),
    ...(capabilities.jobsApi && persistentDatabase
      ? [jobsComposition(mode, persistentDatabase)]
      : []),
    ...(capabilities.storage && persistentDatabase
      ? [storageComposition(mode, persistentDatabase)]
      : []),
    ...(capabilities.storage && database === "postgres"
      ? [postgresStorageCleanupWorker(mode, options.capabilities.messaging === true)]
      : []),
    ...(capabilities.storage && database === "postgres" && (options.runtime ?? "bun") === "node"
      ? [file("scripts/typescript-worker-loader.mjs", nodeTypeScriptWorkerLoaderContent())]
      : []),
  ];
  files = upsertFiles(files, compositions);

  if (database === "postgres") {
    const schemaPath =
      mode === "monorepo"
        ? "packages/database/src/schema/index.ts"
        : "src/server/db/schema/index.ts";
    const exportLines = postgresSchemaExports(capabilities);
    if (exportLines.length > 0) {
      const exists = files.some((entry) => entry.path === schemaPath);
      files = exists
        ? patchFile(files, schemaPath, (content) => addLines(content, exportLines))
        : [...files, file(schemaPath, `${exportLines.join("\n")}\n`)];
    }
    if (mode === "single" && exportLines.length > 0) {
      files = patchFile(files, "src/server/db/index.ts", (content) =>
        patchSingleDatabaseIndex(content, capabilities),
      );
    }
  }

  if (database === "convex" && persistentDatabase) {
    const hasConvexTables =
      capabilities.identity ||
      capabilities.notifications ||
      capabilities.jobs ||
      capabilities.storage;
    if (hasConvexTables) {
      files = patchFile(files, "convex/schema.ts", (content) =>
        patchConvexSchema(content, capabilities),
      );
    }
    if (capabilities.identity) {
      files = patchFile(files, "convex/auth.ts", patchConvexIdentityAuth);
      files = patchFile(files, "convex/lib/auth.ts", patchConvexActorGuard);
    }
    files = mergeConvexCrons(files, capabilities, jobsCronContent);
  }

  return patchManifests(files, { ...options, capabilities });
}
