// @allow-long 530: Convex actor, durable ownership, and atomic admission mutations share one authenticated boundary
import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

export function convexEveFunctionsFile(hasBilling = false): TemplateFile {
  const plan = hasBilling ? "pro" : "sponsored";
  const applicationPolicyLine = hasBilling
    ? ""
    : "// With no billing capability, the application sponsors verified users within the same durable admission limits.\nconst APPLICATION_SPONSORED_EVE_ACCESS = true;\n";
  const entitlementCheck = hasBilling
    ? `    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId", (indexQuery) => indexQuery.eq("userId", actor.user._id))
      .take(100);
    const entitled = subscriptions.some((subscription) => {
      if (subscription.metadata?.planId !== "pro") return false;
      if (subscription.status === "active") {
        return subscription.currentPeriodEnd === undefined || subscription.currentPeriodEnd > now;
      }
      if (subscription.status === "trialing" || subscription.status === "on_trial") {
        return subscription.trialEnd === undefined || subscription.trialEnd > now;
      }
      return false;
    });
    if (!entitled) {
      return {
        ok: false as const,
        code: "EVE_ENTITLEMENT_REQUIRED" as const,
        authSessionId: actor.authSessionId,
        organizationId: organizationId ?? null,
        teamId: teamId ?? null,
        userId: actor.user._id,
      };
    }`
    : `    if (!APPLICATION_SPONSORED_EVE_ACCESS) {
      return {
        ok: false as const,
        code: "EVE_ENTITLEMENT_UNSUPPORTED" as const,
        authSessionId: actor.authSessionId,
        organizationId: organizationId ?? null,
        teamId: teamId ?? null,
        userId: actor.user._id,
      };
    }`;
  return file(
    "convex/eve/sessions.ts",
    `import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireIdentityActor, requireMembership, requireTeam } from "../identity/shared";

type EveCtx = MutationCtx | QueryCtx;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{8,80}$/;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9.]{0,63}$/;
const LEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const TERMINAL_EVENTS = new Set(["session.waiting", "session.failed", "session.completed"]);
const EVE_OPERATION_RATE_WINDOW_MS = 60_000;
const EVE_MAX_OPERATIONS_PER_WINDOW = 10;
const EVE_MAX_CONCURRENT_OPERATIONS = 1;
const EVE_ADMISSION_LEASE_MS = 5 * 60_000;
${applicationPolicyLine}

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireTrustedAdmissionServer(candidate: string): void {
  const expected = process.env.BETTER_AUTH_SECRET;
  if (!expected || expected.length < 32 || expected.startsWith("REPLACE_WITH")) {
    fail("EVE_ADMISSION_NOT_CONFIGURED", "Trusted Eve admission is not configured");
  }
  if (candidate.length !== expected.length) fail("EVE_ADMISSION_FORBIDDEN", "Invalid Eve admission credential");
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (mismatch !== 0) fail("EVE_ADMISSION_FORBIDDEN", "Invalid Eve admission credential");
}

function requireEveSessionId(value: string): string {
  if (!SESSION_ID_PATTERN.test(value)) fail("EVE_SESSION_INVALID", "Invalid Eve session id");
  return value;
}

function requireRuntimeEventId(value: string): string {
  if (!EVENT_ID_PATTERN.test(value)) fail("EVE_EVENT_INVALID", "Invalid Eve runtime event id");
  return value;
}

function requireRuntimeEventType(value: string): string {
  if (!EVENT_TYPE_PATTERN.test(value)) fail("EVE_EVENT_INVALID", "Invalid Eve runtime event type");
  return value;
}

function requireLeaseId(value: string): string {
  if (!LEASE_ID_PATTERN.test(value)) fail("EVE_ADMISSION_LEASE_INVALID", "Invalid Eve admission lease id");
  return value;
}

async function currentActor(ctx: EveCtx) {
  const actor = await requireIdentityActor(ctx);
  const organizationId = actor.session.activeOrganizationId;
  const teamId = actor.session.activeTeamId;
  if (organizationId !== undefined) {
    await requireMembership(ctx, organizationId, actor.user._id);
  }
  if (teamId !== undefined) {
    if (organizationId === undefined) {
      fail("EVE_TENANT_FORBIDDEN", "An active team requires an active organization");
    }
    await requireTeam(ctx, organizationId, teamId);
    const teamMembership = await ctx.db
      .query("identityTeamMemberships")
      .withIndex("by_team_user", (indexQuery) =>
        indexQuery.eq("teamId", teamId).eq("userId", actor.user._id),
      )
      .unique();
    if (!teamMembership || teamMembership.organizationId !== organizationId) {
      fail("EVE_TENANT_FORBIDDEN", "The actor is not an active team member");
    }
  }
  return { actor, organizationId, teamId };
}

function sameOwner(
  record: { userId: unknown; organizationId?: unknown; teamId?: unknown },
  userId: unknown,
  organizationId: unknown,
  teamId: unknown,
): boolean {
  return (
    record.userId === userId &&
    record.organizationId === organizationId &&
    record.teamId === teamId
  );
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const { actor, organizationId, teamId } = await currentActor(ctx);
    return {
      authSessionId: actor.authSessionId,
      authUserId: actor.user.authId,
      email: actor.user.email,
      emailVerified: actor.user.emailVerified === true,
      organizationId: organizationId ?? null,
      role: actor.user.role,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const claim = mutation({
  args: { eveSessionId: v.string(), createdAt: v.number() },
  handler: async (ctx, args) => {
    const eveSessionId = requireEveSessionId(args.eveSessionId);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    const existing = await ctx.db
      .query("eveAgentSessions")
      .withIndex("by_eve_session", (indexQuery) => indexQuery.eq("eveSessionId", eveSessionId))
      .unique();
    if (existing) {
      if (
        existing.retiredAt !== undefined ||
        !sameOwner(existing, actor.user._id, organizationId, teamId)
      ) {
        return {
          result: "conflict" as const,
          authSessionId: actor.authSessionId,
          organizationId: organizationId ?? null,
          teamId: teamId ?? null,
          userId: actor.user._id,
        };
      }
      return {
        result: "existing" as const,
        authSessionId: actor.authSessionId,
        organizationId: organizationId ?? null,
        teamId: teamId ?? null,
        userId: actor.user._id,
      };
    }
    await ctx.db.insert("eveAgentSessions", {
      eveSessionId,
      userId: actor.user._id,
      organizationId,
      teamId,
      createdByAuthSessionId: actor.authSessionId,
      createdAt: args.createdAt,
    });
    return {
      result: "created" as const,
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const authorize = query({
  args: { eveSessionId: v.string() },
  handler: async (ctx, args) => {
    const eveSessionId = requireEveSessionId(args.eveSessionId);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    const record = await ctx.db
      .query("eveAgentSessions")
      .withIndex("by_eve_session", (indexQuery) => indexQuery.eq("eveSessionId", eveSessionId))
      .unique();
    return {
      authorized:
        record !== null &&
        record.retiredAt === undefined &&
        sameOwner(record, actor.user._id, organizationId, teamId),
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const retire = mutation({
  args: { eveSessionId: v.string(), retiredAt: v.number() },
  handler: async (ctx, args) => {
    const eveSessionId = requireEveSessionId(args.eveSessionId);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    const record = await ctx.db
      .query("eveAgentSessions")
      .withIndex("by_eve_session", (indexQuery) => indexQuery.eq("eveSessionId", eveSessionId))
      .unique();
    if (
      !record ||
      record.retiredAt !== undefined ||
      !sameOwner(record, actor.user._id, organizationId, teamId)
    ) {
      return {
        retired: false,
        authSessionId: actor.authSessionId,
        organizationId: organizationId ?? null,
        teamId: teamId ?? null,
        userId: actor.user._id,
      };
    }
    await ctx.db.patch(record._id, { retiredAt: args.retiredAt });
    return {
      retired: true,
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const admit = mutation({
  args: {
    serverToken: v.string(),
    eveSessionId: v.optional(v.string()),
    operation: v.union(v.literal("create"), v.literal("follow"), v.literal("compact")),
  },
  handler: async (ctx, args) => {
    requireTrustedAdmissionServer(args.serverToken);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    if (actor.user.emailVerified !== true) {
      return {
        ok: false as const,
        code: "EVE_ENTITLEMENT_REQUIRED" as const,
        authSessionId: actor.authSessionId,
        organizationId: organizationId ?? null,
        teamId: teamId ?? null,
        userId: actor.user._id,
      };
    }
    const now = Date.now();
${entitlementCheck}

    const rateWindowMs = EVE_OPERATION_RATE_WINDOW_MS;
    const operationLimit = EVE_MAX_OPERATIONS_PER_WINDOW;
    const windowStartedAt = now - rateWindowMs;
    const stale = await ctx.db
      .query("eveAgentAdmissions")
      .withIndex("by_user_expiry", (indexQuery) =>
        indexQuery.eq("userId", actor.user._id).lt("expiresAt", windowStartedAt),
      )
      .take(100);
    for (const admission of stale) {
      if (admission.eveSessionId === undefined) await ctx.db.delete(admission._id);
    }

    const recent = await ctx.db
      .query("eveAgentAdmissions")
      .withIndex("by_user_created", (indexQuery) =>
        indexQuery.eq("userId", actor.user._id).gte("createdAt", windowStartedAt),
      )
      .take(operationLimit);
    if (recent.length >= operationLimit) {
      return {
        ok: false as const,
        code: "EVE_RATE_LIMITED" as const,
        retryAfterSeconds: Math.ceil(rateWindowMs / 1_000),
        authSessionId: actor.authSessionId,
        organizationId: organizationId ?? null,
        teamId: teamId ?? null,
        userId: actor.user._id,
      };
    }

    const active = (
      await ctx.db
        .query("eveAgentAdmissions")
        .withIndex("by_user_release", (indexQuery) =>
          indexQuery.eq("userId", actor.user._id).eq("releasedAt", undefined),
        )
        .take(100)
    )
      .filter((admission) => admission.eveSessionId !== undefined || admission.expiresAt > now)
      .slice(0, EVE_MAX_CONCURRENT_OPERATIONS);
    if (active.length >= EVE_MAX_CONCURRENT_OPERATIONS) {
      return {
        ok: false as const,
        code: "EVE_CONCURRENCY_LIMIT" as const,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(((active[0]?.expiresAt ?? now + EVE_ADMISSION_LEASE_MS) - now) / 1_000),
        ),
        authSessionId: actor.authSessionId,
        organizationId: organizationId ?? null,
        teamId: teamId ?? null,
        userId: actor.user._id,
      };
    }

    const admissionId = await ctx.db.insert("eveAgentAdmissions", {
      userId: actor.user._id,
      organizationId,
      teamId,
      eveSessionId: args.eveSessionId ? requireEveSessionId(args.eveSessionId) : undefined,
      operation: args.operation,
      plan: ${JSON.stringify(plan)},
      createdAt: now,
      expiresAt: now + EVE_ADMISSION_LEASE_MS,
    });
    const leaseId = String(admissionId);
    await ctx.db.patch(admissionId, { leaseId });
    return {
      ok: true as const,
      leaseId,
      plan: ${JSON.stringify(plan)} as const,
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const bindSessionAdmission = mutation({
  args: { serverToken: v.string(), leaseId: v.string(), eveSessionId: v.string() },
  handler: async (ctx, args) => {
    requireTrustedAdmissionServer(args.serverToken);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    const eveSessionId = requireEveSessionId(args.eveSessionId);
    const admission = await ctx.db
      .query("eveAgentAdmissions")
      .withIndex("by_lease", (indexQuery) => indexQuery.eq("leaseId", args.leaseId))
      .unique();
    if (
      !admission ||
      admission.userId !== actor.user._id ||
      (admission.eveSessionId !== undefined && admission.eveSessionId !== eveSessionId)
    ) {
      fail("EVE_ADMISSION_LEASE_INVALID", "Eve admission lease cannot be bound");
    }
    await ctx.db.patch(admission._id, { eveSessionId });
    return {
      bound: true as const,
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const touchSessionAdmission = mutation({
  args: { serverToken: v.string(), eveSessionId: v.string() },
  handler: async (ctx, args) => {
    requireTrustedAdmissionServer(args.serverToken);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    const eveSessionId = requireEveSessionId(args.eveSessionId);
    const now = Date.now();
    const admissions = await ctx.db
      .query("eveAgentAdmissions")
      .withIndex("by_user_session", (indexQuery) =>
        indexQuery.eq("userId", actor.user._id).eq("eveSessionId", eveSessionId),
      )
      .take(100);
    for (const admission of admissions) {
      if (admission.releasedAt === undefined) {
        await ctx.db.patch(admission._id, { expiresAt: now + EVE_ADMISSION_LEASE_MS });
      }
    }
    return {
      touched: true as const,
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const expiredBoundAdmissions = query({
  args: { serverToken: v.string(), inspectedAt: v.number() },
  handler: async (ctx, args) => {
    requireTrustedAdmissionServer(args.serverToken);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    const admissions = await ctx.db
      .query("eveAgentAdmissions")
      .withIndex("by_user_release", (indexQuery) =>
        indexQuery.eq("userId", actor.user._id).eq("releasedAt", undefined),
      )
      .take(100);
    return {
      admissions: admissions.flatMap((admission) =>
        admission.eveSessionId !== undefined &&
        admission.expiresAt <= args.inspectedAt &&
        admission.organizationId === organizationId &&
        admission.teamId === teamId
          ? [{ eveSessionId: admission.eveSessionId, leaseId: admission.leaseId ?? String(admission._id) }]
          : [],
      ),
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const releaseSessionAdmissions = mutation({
  args: {
    serverToken: v.string(),
    eveSessionId: v.string(),
    leaseId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireTrustedAdmissionServer(args.serverToken);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    const eveSessionId = requireEveSessionId(args.eveSessionId);
    const releasedAt = Date.now();
    const admissions = await ctx.db
      .query("eveAgentAdmissions")
      .withIndex("by_user_session", (indexQuery) =>
        indexQuery.eq("userId", actor.user._id).eq("eveSessionId", eveSessionId),
      )
      .take(100);
    let released = 0;
    for (const admission of admissions) {
      if (
        admission.releasedAt === undefined &&
        (args.leaseId !== undefined
          ? admission.leaseId === requireLeaseId(args.leaseId)
          : true)
      ) {
        await ctx.db.patch(admission._id, { releasedAt });
        released += 1;
      }
    }
    return {
      released: released > 0,
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const releaseAdmission = mutation({
  args: { serverToken: v.string(), leaseId: v.string() },
  handler: async (ctx, args) => {
    requireTrustedAdmissionServer(args.serverToken);
    const { actor, organizationId, teamId } = await currentActor(ctx);
    const admission = await ctx.db
      .query("eveAgentAdmissions")
      .withIndex("by_lease", (indexQuery) => indexQuery.eq("leaseId", args.leaseId))
      .unique();
    const owned = admission?.userId === actor.user._id;
    if (admission && owned && admission.releasedAt === undefined) {
      await ctx.db.patch(admission._id, { releasedAt: Date.now() });
    }
    return {
      released: Boolean(admission && owned),
      authSessionId: actor.authSessionId,
      organizationId: organizationId ?? null,
      teamId: teamId ?? null,
      userId: actor.user._id,
    };
  },
});

export const recordRuntimeEvent = mutation({
  args: {
    serverToken: v.string(),
    eventAt: v.number(),
    eventId: v.string(),
    eventType: v.string(),
    eveSessionId: v.string(),
    leaseId: v.optional(v.string()),
    receivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    requireTrustedAdmissionServer(args.serverToken);
    const eveSessionId = requireEveSessionId(args.eveSessionId);
    const eventId = requireRuntimeEventId(args.eventId);
    const eventType = requireRuntimeEventType(args.eventType);
    if (!Number.isFinite(args.eventAt) || !Number.isFinite(args.receivedAt)) {
      fail("EVE_EVENT_INVALID", "Invalid Eve runtime event timestamp");
    }
    const replay = await ctx.db
      .query("eveAgentRuntimeEvents")
      .withIndex("by_event_id", (indexQuery) => indexQuery.eq("eventId", eventId))
      .unique();
    if (replay) return { recorded: false as const, replayed: true as const };
    await ctx.db.insert("eveAgentRuntimeEvents", {
      eventAt: args.eventAt,
      eventId,
      eventType,
      eveSessionId,
      receivedAt: args.receivedAt,
    });
    const runtimeState = await ctx.db
      .query("eveAgentRuntimeSessions")
      .withIndex("by_eve_session", (indexQuery) =>
        indexQuery.eq("eveSessionId", eveSessionId),
      )
      .unique();
    if (runtimeState) {
      await ctx.db.patch(runtimeState._id, {
        lastEventAt: args.eventAt,
        lastEventId: eventId,
        updatedAt: args.receivedAt,
      });
    } else {
      await ctx.db.insert("eveAgentRuntimeSessions", {
        eveSessionId,
        lastEventAt: args.eventAt,
        lastEventId: eventId,
        updatedAt: args.receivedAt,
      });
    }
    let exactLeaseId: unknown;
    if (args.leaseId !== undefined) {
      const leaseId = requireLeaseId(args.leaseId);
      const admission = await ctx.db
        .query("eveAgentAdmissions")
        .withIndex("by_lease", (indexQuery) => indexQuery.eq("leaseId", leaseId))
        .unique();
      if (
        !admission ||
        (admission.eveSessionId !== undefined && admission.eveSessionId !== eveSessionId)
      ) {
        fail("EVE_ADMISSION_LEASE_INVALID", "Eve runtime event lease binding conflicted");
      }
      if (admission.eveSessionId === undefined) {
        await ctx.db.patch(admission._id, { eveSessionId });
      }
      if (admission.releasedAt === undefined) exactLeaseId = admission._id;
      // An explicit stale lease must never degrade into a session-wide match.
      if (exactLeaseId === undefined) return { recorded: true as const };
    }

    const compactLifecycleEvent =
      eventType === "compaction.requested" || eventType === "compaction.completed";
    const terminalEvent = TERMINAL_EVENTS.has(eventType);
    if (args.leaseId === undefined && !compactLifecycleEvent && !terminalEvent) {
      return { recorded: true as const };
    }
    const sessionAdmissions = await ctx.db
      .query("eveAgentAdmissions")
      .withIndex("by_session", (indexQuery) => indexQuery.eq("eveSessionId", eveSessionId))
      .take(100);
    const admissions = args.leaseId !== undefined
      ? sessionAdmissions.filter((admission) => admission._id === exactLeaseId)
      : sessionAdmissions.filter(
          (admission) =>
            admission.operation === "compact" &&
            (!terminalEvent || admission.lastRuntimeEventId !== undefined),
        );
    for (const admission of admissions) {
      if (admission.releasedAt !== undefined) continue;
      if (terminalEvent) {
        await ctx.db.patch(admission._id, {
          lastRuntimeEventAt: args.eventAt,
          lastRuntimeEventId: eventId,
          releasedAt: args.receivedAt,
        });
      } else {
        await ctx.db.patch(admission._id, {
          expiresAt: args.receivedAt + EVE_ADMISSION_LEASE_MS,
          lastRuntimeEventAt: args.eventAt,
          lastRuntimeEventId: eventId,
        });
      }
    }
    return { recorded: true as const };
  },
});
`,
  );
}

export function convexEveActorFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const authImport = mode === "monorepo" ? "@repo/auth/server" : "@/server/auth";
  const convexRoot = mode === "monorepo" ? "../../../../convex" : "../../../convex";
  return file(
    `${base}/actor.ts`,
    `import "server-only";
import { auth, fetchAuthQuery } from "${authImport}";
import { api } from "${convexRoot}/_generated/api";

export interface AuthenticatedEveActor {
  readonly authSessionId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly organizationId: string | null;
  readonly role: string;
  readonly teamId: string | null;
  readonly userId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function authoritativeBetterAuthSession(headers: Headers) {
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) return null;
  let url: URL;
  try {
    url = new URL("/api/auth/get-session", baseURL);
  } catch {
    return null;
  }
  url.searchParams.set("disableCookieCache", "true");
  url.searchParams.set("disableRefresh", "true");
  const response = await auth.handler(new Request(url, { method: "GET", headers }));
  if (!response.ok) return null;
  const value: unknown = await response.json();
  if (!isRecord(value) || !isRecord(value.session) || !isRecord(value.user)) return null;
  const authSessionId = text(value.session.id);
  const authUserId = text(value.user.id);
  return authSessionId && authUserId
    ? { authSessionId, authUserId, emailVerified: value.user.emailVerified === true }
    : null;
}

export async function resolveAuthenticatedEveActor(
  headers: Headers,
): Promise<AuthenticatedEveActor | null> {
  const [verified, current] = await Promise.all([
    authoritativeBetterAuthSession(headers),
    fetchAuthQuery(api.eve.sessions.current, {}),
  ]);
  if (
    !verified ||
    verified.authSessionId !== current.authSessionId ||
    verified.authUserId !== current.authUserId
  ) {
    return null;
  }
  return {
    authSessionId: current.authSessionId,
    email: current.email,
    emailVerified: verified.emailVerified && current.emailVerified === true,
    organizationId: current.organizationId ?? null,
    role: current.role ?? "user",
    teamId: current.teamId ?? null,
    userId: String(current.userId),
  };
}
`,
  );
}

export function convexEveOwnershipAdapterFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const authImport = mode === "monorepo" ? "@repo/auth/server" : "@/server/auth";
  const serviceImport = mode === "monorepo" ? "@repo/services/eve" : "@/server/services/eve";
  const convexRoot = mode === "monorepo" ? "../../../../convex" : "../../../convex";
  return file(
    `${base}/ownership-adapter.ts`,
    `import "server-only";
import { fetchAuthMutation, fetchAuthQuery } from "${authImport}";
import { api } from "${convexRoot}/_generated/api";
import type { AgentSessionActor, AgentSessionOwnershipPort } from "${serviceImport}";

function sameActor(
  value: { authSessionId: string; organizationId: string | null; teamId: string | null; userId: unknown },
  actor: AgentSessionActor,
): boolean {
  return (
    value.authSessionId === actor.authSessionId &&
    value.organizationId === actor.organizationId &&
    value.teamId === actor.teamId &&
    String(value.userId) === actor.userId
  );
}

export const agentSessionOwnershipPort: AgentSessionOwnershipPort = {
  async claim(input) {
    const result = await fetchAuthMutation(api.eve.sessions.claim, {
      eveSessionId: input.eveSessionId,
      createdAt: input.createdAt.getTime(),
    });
    return sameActor(result, input.actor) ? result.result : "conflict";
  },

  async authorize(input) {
    const result = await fetchAuthQuery(api.eve.sessions.authorize, {
      eveSessionId: input.eveSessionId,
    });
    return result.authorized && sameActor(result, input.actor);
  },

  async retire(input) {
    const authorized = await agentSessionOwnershipPort.authorize(input);
    if (!authorized) return false;
    const result = await fetchAuthMutation(api.eve.sessions.retire, {
      eveSessionId: input.eveSessionId,
      retiredAt: input.retiredAt.getTime(),
    });
    return result.retired && sameActor(result, input.actor);
  },
};
`,
  );
}

export function convexEveAdmissionAdapterFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const authImport = mode === "monorepo" ? "@repo/auth/server" : "@/server/auth";
  const serviceImport = mode === "monorepo" ? "@repo/services/eve" : "@/server/services/eve";
  const convexRoot = mode === "monorepo" ? "../../../../convex" : "../../../convex";
  return file(
    `${base}/admission-adapter.ts`,
    `import "server-only";
import { fetchAuthMutation, fetchAuthQuery } from "${authImport}";
import { api } from "${convexRoot}/_generated/api";
import type {
  AgentAdmissionPort,
  AgentRuntimeAdmissionPort,
  AgentSessionActor,
} from "${serviceImport}";

function sameActor(
  value: { authSessionId: string; organizationId: string | null; teamId: string | null; userId: unknown },
  actor: AgentSessionActor,
): boolean {
  return (
    value.authSessionId === actor.authSessionId &&
    value.organizationId === actor.organizationId &&
    value.teamId === actor.teamId &&
    String(value.userId) === actor.userId
  );
}

function trustedAdmissionServerToken(): string {
  const token = process.env.BETTER_AUTH_SECRET;
  if (!token || token.length < 32 || token.startsWith("REPLACE_WITH")) {
    throw new Error("BETTER_AUTH_SECRET is required for trusted Eve admission");
  }
  return token;
}

export const agentAdmissionPort = {
  async admit(input) {
    const result = await fetchAuthMutation(api.eve.sessions.admit, {
      serverToken: trustedAdmissionServerToken(),
      eveSessionId: input.eveSessionId,
      operation: input.operation,
    });
    if (!sameActor(result, input.actor)) {
      throw new Error("Eve admission actor changed during authorization");
    }
    if (result.ok) return { ok: true as const, leaseId: result.leaseId, plan: result.plan };
    const retryAfterSeconds =
      "retryAfterSeconds" in result && typeof result.retryAfterSeconds === "number"
        ? result.retryAfterSeconds
        : undefined;
    return {
      ok: false as const,
      code: result.code,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    };
  },

  async bindSession(input) {
    const result = await fetchAuthMutation(api.eve.sessions.bindSessionAdmission, {
      serverToken: trustedAdmissionServerToken(),
      leaseId: input.leaseId,
      eveSessionId: input.eveSessionId,
    });
    if (!result.bound || !sameActor(result, input.actor)) {
      throw new Error("Eve admission lease could not be bound to its session");
    }
  },

  async listExpiredBoundSessions(input) {
    const result = await fetchAuthQuery(api.eve.sessions.expiredBoundAdmissions, {
      serverToken: trustedAdmissionServerToken(),
      inspectedAt: input.inspectedAt.getTime(),
    });
    if (!sameActor(result, input.actor)) {
      throw new Error("Eve admission actor changed during stale-session inspection");
    }
    return result.admissions;
  },

  async touchSession(input) {
    const result = await fetchAuthMutation(api.eve.sessions.touchSessionAdmission, {
      serverToken: trustedAdmissionServerToken(),
      eveSessionId: input.eveSessionId,
    });
    if (!result.touched || !sameActor(result, input.actor)) {
      throw new Error("Eve admission lease could not be extended");
    }
  },

  async release(input) {
    const result = await fetchAuthMutation(api.eve.sessions.releaseAdmission, {
      serverToken: trustedAdmissionServerToken(),
      leaseId: input.leaseId,
    });
    if (!sameActor(result, input.actor)) {
      throw new Error("Eve admission actor changed before release");
    }
  },

  async releaseSession(input) {
    const result = await fetchAuthMutation(api.eve.sessions.releaseSessionAdmissions, {
      serverToken: trustedAdmissionServerToken(),
      eveSessionId: input.eveSessionId,
      leaseId: input.leaseId,
    });
    if (!sameActor(result, input.actor)) {
      throw new Error("Eve session admission could not be released");
    }
    return result.released;
  },

  async recordRuntimeEvent(input) {
    const result = await fetchAuthMutation(api.eve.sessions.recordRuntimeEvent, {
      serverToken: trustedAdmissionServerToken(),
      eventAt: input.eventAt.getTime(),
      eventId: input.eventId,
      eventType: input.eventType,
      eveSessionId: input.eveSessionId,
      leaseId: input.leaseId,
      receivedAt: input.receivedAt.getTime(),
    });
    if (!result.recorded && !("replayed" in result && result.replayed)) {
      throw new Error("Eve runtime event could not be recorded");
    }
  },
} satisfies AgentAdmissionPort & AgentRuntimeAdmissionPort;
`,
  );
}
