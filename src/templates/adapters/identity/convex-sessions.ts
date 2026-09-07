// @allow-long 320: session lifecycle synchronization and actor-scoped commands share one security boundary
export function convexIdentitySessionsContent(): string {
  return `import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import { findUserByAuthId } from "../lib/auth";
import {
  identitySessionValue,
  recordIdentityAudit,
  requireFreshIdentitySession,
  requireIdentityActor,
  type IdentityActor,
} from "./shared";

type AuthSessionRecord = {
  _id: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function optionalText(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Delete the authoritative Better Auth component session before reporting a
 * typed revocation. The app tombstone remains the local authorization fence,
 * but leaving the provider session alive would let a stolen cookie call
 * /api/auth/list-sessions and exchange itself for another active token.
 * Missing provider rows are an idempotent success; component failures abort
 * the command so the API never claims that a reusable token was revoked.
 */
async function revokeCanonicalAuthSession(ctx: MutationCtx, authSessionId: string): Promise<void> {
  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: { model: "session", where: [{ field: "_id", operator: "eq", value: authSessionId }] },
  });
}

/**
 * Wire these callbacks into authComponent.triggers.session. They receive
 * trusted Better Auth component records; no browser supplies user/session IDs.
 */
export async function syncIdentitySessionCreated(
  ctx: MutationCtx,
  authSession: AuthSessionRecord,
): Promise<void> {
  const user = await findUserByAuthId(ctx, authSession.userId);
  if (!user) {
    throw new ConvexError({ code: "AUTH_MAPPING_MISSING", message: "Session user has no app mapping" });
  }
  const existing = await ctx.db
    .query("identitySessions")
    .withIndex("by_auth_session", (query) => query.eq("authSessionId", authSession._id))
    .unique();
  const values = {
    userId: user._id,
    authenticatedAt: authSession.createdAt,
    expiresAt: authSession.expiresAt,
    ipAddress: optionalText(authSession.ipAddress),
    userAgent: optionalText(authSession.userAgent),
    updatedAt: authSession.updatedAt,
  };
  if (existing) {
    if (existing.userId !== user._id) {
      throw new ConvexError({ code: "IDENTITY_SESSION_COLLISION", message: "Session ownership mismatch" });
    }
    await ctx.db.patch(existing._id, values);
    return;
  }
  await ctx.db.insert("identitySessions", {
    authSessionId: authSession._id,
    ...values,
    createdAt: authSession.createdAt,
  });
}

export async function syncIdentitySessionUpdated(
  ctx: MutationCtx,
  authSession: AuthSessionRecord,
): Promise<void> {
  const existing = await ctx.db
    .query("identitySessions")
    .withIndex("by_auth_session", (query) => query.eq("authSessionId", authSession._id))
    .unique();
  if (!existing) {
    await syncIdentitySessionCreated(ctx, authSession);
    return;
  }
  await ctx.db.patch(existing._id, {
    expiresAt: authSession.expiresAt,
    ipAddress: optionalText(authSession.ipAddress),
    userAgent: optionalText(authSession.userAgent),
    updatedAt: Math.max(existing.updatedAt, authSession.updatedAt),
  });
}

export async function syncIdentitySessionDeleted(
  ctx: MutationCtx,
  authSession: AuthSessionRecord,
): Promise<void> {
  const existing = await ctx.db
    .query("identitySessions")
    .withIndex("by_auth_session", (query) => query.eq("authSessionId", authSession._id))
    .unique();
  if (!existing || existing.revokedAt !== undefined) return;
  const revokedAt = Math.max(authSession.updatedAt, Date.now());
  await ctx.db.patch(existing._id, { revokedAt, updatedAt: revokedAt });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireIdentityActor(ctx);
    const sessions = await ctx.db
      .query("identitySessions")
      .withIndex("by_user_created", (indexQuery) => indexQuery.eq("userId", actor.user._id))
      .order("desc")
      .collect();
    return sessions.map(identitySessionValue);
  },
});

/** Authoritative current app session for server transport context construction. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireIdentityActor(ctx);
    return {
      authSessionId: actor.authSessionId,
      userId: actor.user._id,
      session: identitySessionValue(actor.session),
    };
  },
});

async function revokeSessionCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  sessionId: Doc<"identitySessions">["_id"],
) {
  const target = await ctx.db.get(sessionId);
  if (!target) {
    throw new ConvexError({ code: "IDENTITY_SESSION_NOT_FOUND", message: "Session not found" });
  }
  if (target.userId !== actor.user._id) {
    throw new ConvexError({ code: "IDENTITY_SESSION_FORBIDDEN", message: "Session ownership mismatch" });
  }
  if (target.revokedAt !== undefined) {
    await revokeCanonicalAuthSession(ctx, target.authSessionId);
    return { value: identitySessionValue(target), changed: false };
  }
  const occurredAt = Date.now();
  if (target._id !== actor.session._id) requireFreshIdentitySession(actor, occurredAt);
  await revokeCanonicalAuthSession(ctx, target.authSessionId);
  await ctx.db.patch(target._id, { revokedAt: occurredAt, updatedAt: occurredAt });
  await recordIdentityAudit(ctx, {
    action: "identity.session.revoked",
    actorId: actor.user._id,
    targetId: target._id,
    metadata: { currentSession: target._id === actor.session._id },
    occurredAt,
  });
  return {
    value: identitySessionValue({ ...target, revokedAt: occurredAt, updatedAt: occurredAt }),
    changed: true,
  };
}

const revokeArgs = { sessionId: v.id("identitySessions") };

/** One public gateway, one local MutationCtx command, one atomic write plus audit. */
export const revoke = mutation({
  args: revokeArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await revokeSessionCommand(ctx, actor, args.sessionId);
  },
});

export const revokeInternal = internalMutation({
  args: revokeArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await revokeSessionCommand(ctx, actor, args.sessionId);
  },
});

async function revokeOtherSessionsCommand(ctx: MutationCtx, actor: IdentityActor) {
  const occurredAt = Date.now();
  requireFreshIdentitySession(actor, occurredAt);
  const sessions = await ctx.db
    .query("identitySessions")
    .withIndex("by_user_created", (indexQuery) => indexQuery.eq("userId", actor.user._id))
    .collect();
  const otherSessions = sessions.filter((session) => session._id !== actor.session._id);
  const targets = otherSessions.filter(
    (session) =>
      session.revokedAt === undefined &&
      session.expiresAt > occurredAt,
  );
  for (const target of otherSessions) {
    await revokeCanonicalAuthSession(ctx, target.authSessionId);
  }
  if (targets.length === 0) return { revokedCount: 0, changed: false };
  for (const target of targets) {
    await ctx.db.patch(target._id, { revokedAt: occurredAt, updatedAt: occurredAt });
  }
  await recordIdentityAudit(ctx, {
    action: "identity.session.others_revoked",
    actorId: actor.user._id,
    targetId: actor.session._id,
    metadata: { revokedCount: targets.length },
    occurredAt,
  });
  return { revokedCount: targets.length, changed: true };
}

export const revokeOthers = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireIdentityActor(ctx);
    return await revokeOtherSessionsCommand(ctx, actor);
  },
});

export const revokeOthersInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireIdentityActor(ctx);
    return await revokeOtherSessionsCommand(ctx, actor);
  },
});
`;
}
