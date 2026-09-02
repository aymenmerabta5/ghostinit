// @allow-long 380: tenant-scoped team commands and atomic audit writes stay colocated
export function convexIdentityTeamsContent(): string {
  return `// @allow-long 380: tenant-scoped team commands and audit writes stay together
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import {
  getMembership,
  normalizeTeamName,
  recordIdentityAudit,
  requireBoundedText,
  requireIdentityActor,
  requirePermission,
  requireTeam,
  type IdentityActor,
} from "./shared";

function teamValue(team: {
  _id: Id<"identityTeams">;
  organizationId: Id<"identityOrganizations">;
  name: string;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: team._id,
    organizationId: team.organizationId,
    name: team.name,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

function teamMembershipValue(membership: {
  teamId: Id<"identityTeams">;
  userId: Id<"users">;
  createdAt: number;
}) {
  return { teamId: membership.teamId, userId: membership.userId, createdAt: membership.createdAt };
}

export const list = query({
  args: { organizationId: v.id("identityOrganizations") },
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    await requirePermission(ctx, args.organizationId, actor.user._id, "team:read");
    const teams = await ctx.db
      .query("identityTeams")
      .withIndex("by_organization", (indexQuery) => indexQuery.eq("organizationId", args.organizationId))
      .collect();
    return teams.map(teamValue);
  },
});

async function createTeamCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  input: { organizationId: Id<"identityOrganizations">; name: string },
) {
  await requirePermission(ctx, input.organizationId, actor.user._id, "team:write");
  const name = requireBoundedText(input.name, "Team name", 1, 100);
  const normalizedName = normalizeTeamName(name);
  const existing = await ctx.db
    .query("identityTeams")
    .withIndex("by_organization_name", (indexQuery) =>
      indexQuery.eq("organizationId", input.organizationId).eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing) return { team: teamValue(existing), created: false };
  const occurredAt = Date.now();
  const teamId = await ctx.db.insert("identityTeams", {
    organizationId: input.organizationId,
    name,
    normalizedName,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
  await recordIdentityAudit(ctx, {
    action: "identity.team.created",
    actorId: actor.user._id,
    organizationId: input.organizationId,
    targetId: teamId,
    metadata: { name },
    occurredAt,
  });
  const team = await ctx.db.get(teamId);
  if (!team) throw new Error("Created team was not readable in its transaction");
  return { team: teamValue(team), created: true };
}

const createArgs = { organizationId: v.id("identityOrganizations"), name: v.string() };

export const create = mutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await createTeamCommand(ctx, actor, args);
  },
});

export const createInternal = internalMutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await createTeamCommand(ctx, actor, args);
  },
});

export const listMembers = query({
  args: {
    organizationId: v.id("identityOrganizations"),
    teamId: v.id("identityTeams"),
  },
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    await requirePermission(ctx, args.organizationId, actor.user._id, "team:read");
    await requireTeam(ctx, args.organizationId, args.teamId);
    const memberships = await ctx.db
      .query("identityTeamMemberships")
      .withIndex("by_team_user", (indexQuery) => indexQuery.eq("teamId", args.teamId))
      .collect();
    return memberships.map(teamMembershipValue);
  },
});

async function addTeamMemberCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  input: {
    organizationId: Id<"identityOrganizations">;
    teamId: Id<"identityTeams">;
    userId: Id<"users">;
  },
) {
  await requirePermission(ctx, input.organizationId, actor.user._id, "team:write");
  await requireTeam(ctx, input.organizationId, input.teamId);
  const target = await getMembership(ctx, input.organizationId, input.userId);
  if (!target) {
    throw new ConvexError({ code: "IDENTITY_MEMBER_NOT_FOUND", message: "Organization member not found" });
  }
  const existing = await ctx.db
    .query("identityTeamMemberships")
    .withIndex("by_team_user", (indexQuery) =>
      indexQuery.eq("teamId", input.teamId).eq("userId", input.userId),
    )
    .unique();
  if (existing) return { value: teamMembershipValue(existing), changed: false };
  const occurredAt = Date.now();
  const membershipId = await ctx.db.insert("identityTeamMemberships", {
    organizationId: input.organizationId,
    teamId: input.teamId,
    userId: input.userId,
    createdAt: occurredAt,
  });
  await recordIdentityAudit(ctx, {
    action: "identity.team.member_added",
    actorId: actor.user._id,
    organizationId: input.organizationId,
    targetId: input.userId,
    metadata: { teamId: input.teamId },
    occurredAt,
  });
  return {
    value: teamMembershipValue({ teamId: input.teamId, userId: input.userId, createdAt: occurredAt }),
    changed: true,
    membershipId,
  };
}

const membershipArgs = {
  organizationId: v.id("identityOrganizations"),
  teamId: v.id("identityTeams"),
  userId: v.id("users"),
};

export const addMember = mutation({
  args: membershipArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await addTeamMemberCommand(ctx, actor, args);
  },
});

export const addMemberInternal = internalMutation({
  args: membershipArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await addTeamMemberCommand(ctx, actor, args);
  },
});

async function removeTeamMemberCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  input: {
    organizationId: Id<"identityOrganizations">;
    teamId: Id<"identityTeams">;
    userId: Id<"users">;
  },
) {
  await requirePermission(ctx, input.organizationId, actor.user._id, "team:write");
  await requireTeam(ctx, input.organizationId, input.teamId);
  const existing = await ctx.db
    .query("identityTeamMemberships")
    .withIndex("by_team_user", (indexQuery) =>
      indexQuery.eq("teamId", input.teamId).eq("userId", input.userId),
    )
    .unique();
  if (!existing || existing.organizationId !== input.organizationId) {
    return { userId: input.userId, changed: false };
  }
  const occurredAt = Date.now();
  await ctx.db.delete(existing._id);
  const sessions = await ctx.db
    .query("identitySessions")
    .withIndex("by_user_created", (indexQuery) => indexQuery.eq("userId", input.userId))
    .collect();
  for (const session of sessions) {
    if (session.activeTeamId === input.teamId) {
      await ctx.db.patch(session._id, { activeTeamId: undefined, updatedAt: occurredAt });
    }
  }
  await recordIdentityAudit(ctx, {
    action: "identity.team.member_removed",
    actorId: actor.user._id,
    organizationId: input.organizationId,
    targetId: input.userId,
    metadata: { teamId: input.teamId },
    occurredAt,
  });
  return { userId: input.userId, changed: true };
}

export const removeMember = mutation({
  args: membershipArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await removeTeamMemberCommand(ctx, actor, args);
  },
});

export const removeMemberInternal = internalMutation({
  args: membershipArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await removeTeamMemberCommand(ctx, actor, args);
  },
});

async function setActiveTeamCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  input: { organizationId: Id<"identityOrganizations">; teamId: Id<"identityTeams"> },
) {
  await requirePermission(ctx, input.organizationId, actor.user._id, "team:read");
  await requireTeam(ctx, input.organizationId, input.teamId);
  const membership = await ctx.db
    .query("identityTeamMemberships")
    .withIndex("by_team_user", (indexQuery) =>
      indexQuery.eq("teamId", input.teamId).eq("userId", actor.user._id),
    )
    .unique();
  if (!membership || membership.organizationId !== input.organizationId) {
    throw new ConvexError({
      code: "IDENTITY_ORGANIZATION_FORBIDDEN",
      message: "The actor is not a member of this team",
    });
  }
  if (
    actor.session.activeOrganizationId === input.organizationId &&
    actor.session.activeTeamId === input.teamId
  ) {
    return { organizationId: input.organizationId, teamId: input.teamId, changed: false };
  }
  const occurredAt = Date.now();
  await ctx.db.patch(actor.session._id, {
    activeOrganizationId: input.organizationId,
    activeTeamId: input.teamId,
    updatedAt: occurredAt,
  });
  await recordIdentityAudit(ctx, {
    action: "identity.team.activated",
    actorId: actor.user._id,
    organizationId: input.organizationId,
    targetId: input.teamId,
    metadata: { previousTeamId: actor.session.activeTeamId ?? null },
    occurredAt,
  });
  return { organizationId: input.organizationId, teamId: input.teamId, changed: true };
}

const activeArgs = {
  organizationId: v.id("identityOrganizations"),
  teamId: v.id("identityTeams"),
};

export const setActive = mutation({
  args: activeArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await setActiveTeamCommand(ctx, actor, args);
  },
});

export const setActiveInternal = internalMutation({
  args: activeArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await setActiveTeamCommand(ctx, actor, args);
  },
});
`;
}
