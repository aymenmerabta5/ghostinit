// @allow-long 430: organization authorization, owner invariants, and atomic audit commands stay colocated
export function convexIdentityOrganizationsContent(): string {
  return `// @allow-long 430: organization invariants and atomic audit commands stay together
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import {
  getMembership,
  hasPermission,
  membershipValue,
  recordIdentityAudit,
  requireBoundedText,
  requireIdentityActor,
  requireMembership,
  requireOrganizationSlug,
  requirePermission,
  requireVerifiedActor,
  type IdentityActor,
  type OrganizationRole,
} from "./shared";

const organizationRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
const identityPermission = v.union(
  v.literal("organization:read"),
  v.literal("organization:write"),
  v.literal("member:read"),
  v.literal("member:write"),
  v.literal("invitation:read"),
  v.literal("invitation:write"),
  v.literal("team:read"),
  v.literal("team:write"),
);

function organizationValue(organization: Doc<"identityOrganizations">) {
  return {
    id: organization._id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireIdentityActor(ctx);
    const memberships = await ctx.db
      .query("identityMemberships")
      .withIndex("by_user_organization", (indexQuery) => indexQuery.eq("userId", actor.user._id))
      .collect();
    const organizations = await Promise.all(
      memberships.map(async (membership) => await ctx.db.get(membership.organizationId)),
    );
    return organizations.filter((organization) => organization !== null).map(organizationValue);
  },
});

async function createOrganizationCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  input: { name: string; slug: string },
) {
  requireVerifiedActor(actor);
  const name = requireBoundedText(input.name, "Organization name", 1, 120);
  const slug = requireOrganizationSlug(input.slug);
  const existing = await ctx.db
    .query("identityOrganizations")
    .withIndex("by_slug", (indexQuery) => indexQuery.eq("slug", slug))
    .unique();
  if (existing) {
    const membership = await getMembership(ctx, existing._id, actor.user._id);
    if (membership) return { organization: organizationValue(existing), created: false };
    throw new ConvexError({
      code: "IDENTITY_ORGANIZATION_SLUG_UNAVAILABLE",
      message: "The organization slug is unavailable",
    });
  }
  const occurredAt = Date.now();
  const organizationId = await ctx.db.insert("identityOrganizations", {
    name,
    slug,
    createdByUserId: actor.user._id,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
  await ctx.db.insert("identityMemberships", {
    organizationId,
    userId: actor.user._id,
    role: "owner",
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
  await recordIdentityAudit(ctx, {
    action: "identity.organization.created",
    actorId: actor.user._id,
    organizationId,
    targetId: organizationId,
    metadata: { slug },
    occurredAt,
  });
  const organization = await ctx.db.get(organizationId);
  if (!organization) throw new Error("Created organization was not readable in its transaction");
  return { organization: organizationValue(organization), created: true };
}

const createArgs = { name: v.string(), slug: v.string() };

export const create = mutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await createOrganizationCommand(ctx, actor, args);
  },
});

export const createInternal = internalMutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await createOrganizationCommand(ctx, actor, args);
  },
});

async function setActiveOrganizationCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  organizationId: Id<"identityOrganizations">,
) {
  await requireMembership(ctx, organizationId, actor.user._id);
  if (actor.session.activeOrganizationId === organizationId) {
    return { organizationId, changed: false };
  }
  const occurredAt = Date.now();
  await ctx.db.patch(actor.session._id, {
    activeOrganizationId: organizationId,
    activeTeamId: undefined,
    updatedAt: occurredAt,
  });
  await recordIdentityAudit(ctx, {
    action: "identity.organization.activated",
    actorId: actor.user._id,
    organizationId,
    targetId: actor.session._id,
    metadata: {
      previousOrganizationId: actor.session.activeOrganizationId ?? null,
      clearedTeamId: actor.session.activeTeamId ?? null,
    },
    occurredAt,
  });
  return { organizationId, changed: true };
}

const setActiveArgs = { organizationId: v.id("identityOrganizations") };

export const setActive = mutation({
  args: setActiveArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await setActiveOrganizationCommand(ctx, actor, args.organizationId);
  },
});

export const setActiveInternal = internalMutation({
  args: setActiveArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await setActiveOrganizationCommand(ctx, actor, args.organizationId);
  },
});

export const listMembers = query({
  args: { organizationId: v.id("identityOrganizations") },
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    await requirePermission(ctx, args.organizationId, actor.user._id, "member:read");
    const memberships = await ctx.db
      .query("identityMemberships")
      .withIndex("by_organization_user", (indexQuery) =>
        indexQuery.eq("organizationId", args.organizationId),
      )
      .collect();
    return memberships.map(membershipValue);
  },
});

async function ownerCount(
  ctx: MutationCtx,
  organizationId: Id<"identityOrganizations">,
): Promise<number> {
  const owners = await ctx.db
    .query("identityMemberships")
    .withIndex("by_organization_role", (indexQuery) =>
      indexQuery.eq("organizationId", organizationId).eq("role", "owner"),
    )
    .collect();
  return owners.length;
}

function assertCanChangeRole(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
  nextRole: OrganizationRole,
  owners: number,
): void {
  if (!hasPermission(actorRole, "member:write")) {
    throw new ConvexError({ code: "IDENTITY_ORGANIZATION_FORBIDDEN", message: "Member write permission required" });
  }
  if ((targetRole === "owner" || nextRole === "owner") && actorRole !== "owner") {
    throw new ConvexError({ code: "IDENTITY_MEMBER_FORBIDDEN", message: "Only owners can change owner membership" });
  }
  if (targetRole === "owner" && nextRole !== "owner" && owners <= 1) {
    throw new ConvexError({ code: "IDENTITY_LAST_OWNER", message: "The final owner cannot be demoted" });
  }
}

async function changeMemberRoleCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  input: {
    organizationId: Id<"identityOrganizations">;
    membershipId: Id<"identityMemberships">;
    role: OrganizationRole;
  },
) {
  const actorMembership = await requireMembership(ctx, input.organizationId, actor.user._id);
  const target = await ctx.db.get(input.membershipId);
  if (!target || target.organizationId !== input.organizationId) {
    throw new ConvexError({ code: "IDENTITY_MEMBER_NOT_FOUND", message: "Organization member not found" });
  }
  if (target.role === input.role) return { value: membershipValue(target), changed: false };
  const owners = target.role === "owner" || input.role === "owner"
    ? await ownerCount(ctx, input.organizationId)
    : 2;
  assertCanChangeRole(actorMembership.role, target.role, input.role, owners);
  const occurredAt = Date.now();
  await ctx.db.patch(target._id, { role: input.role, updatedAt: occurredAt });
  await recordIdentityAudit(ctx, {
    action: "identity.member.role_changed",
    actorId: actor.user._id,
    organizationId: input.organizationId,
    targetId: target._id,
    metadata: { previousRole: target.role, role: input.role },
    occurredAt,
  });
  return {
    value: membershipValue({ ...target, role: input.role, updatedAt: occurredAt }),
    changed: true,
  };
}

const changeRoleArgs = {
  organizationId: v.id("identityOrganizations"),
  membershipId: v.id("identityMemberships"),
  role: organizationRole,
};

export const changeMemberRole = mutation({
  args: changeRoleArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await changeMemberRoleCommand(ctx, actor, args);
  },
});

export const changeMemberRoleInternal = internalMutation({
  args: changeRoleArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await changeMemberRoleCommand(ctx, actor, args);
  },
});

async function removeMemberCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  input: {
    organizationId: Id<"identityOrganizations">;
    membershipId: Id<"identityMemberships">;
  },
) {
  const actorMembership = await requireMembership(ctx, input.organizationId, actor.user._id);
  const target = await ctx.db.get(input.membershipId);
  if (!target || target.organizationId !== input.organizationId) {
    throw new ConvexError({ code: "IDENTITY_MEMBER_NOT_FOUND", message: "Organization member not found" });
  }
  if (!hasPermission(actorMembership.role, "member:write")) {
    throw new ConvexError({ code: "IDENTITY_ORGANIZATION_FORBIDDEN", message: "Member write permission required" });
  }
  if (target.role === "owner" && actorMembership.role !== "owner") {
    throw new ConvexError({ code: "IDENTITY_MEMBER_FORBIDDEN", message: "Only owners can remove owners" });
  }
  if (target.role === "owner" && (await ownerCount(ctx, input.organizationId)) <= 1) {
    throw new ConvexError({ code: "IDENTITY_LAST_OWNER", message: "The final owner cannot be removed" });
  }
  const teamMemberships = await ctx.db
    .query("identityTeamMemberships")
    .withIndex("by_organization_user", (indexQuery) =>
      indexQuery.eq("organizationId", input.organizationId).eq("userId", target.userId),
    )
    .collect();
  for (const teamMembership of teamMemberships) await ctx.db.delete(teamMembership._id);
  const sessions = await ctx.db
    .query("identitySessions")
    .withIndex("by_user_created", (indexQuery) => indexQuery.eq("userId", target.userId))
    .collect();
  const occurredAt = Date.now();
  for (const session of sessions) {
    if (session.activeOrganizationId === input.organizationId) {
      await ctx.db.patch(session._id, {
        activeOrganizationId: undefined,
        activeTeamId: undefined,
        updatedAt: occurredAt,
      });
    }
  }
  await ctx.db.delete(target._id);
  await recordIdentityAudit(ctx, {
    action: "identity.member.removed",
    actorId: actor.user._id,
    organizationId: input.organizationId,
    targetId: target._id,
    metadata: { role: target.role, self: target.userId === actor.user._id },
    occurredAt,
  });
  return { membershipId: target._id, changed: true };
}

const removeMemberArgs = {
  organizationId: v.id("identityOrganizations"),
  membershipId: v.id("identityMemberships"),
};

export const removeMember = mutation({
  args: removeMemberArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await removeMemberCommand(ctx, actor, args);
  },
});

export const removeMemberInternal = internalMutation({
  args: removeMemberArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await removeMemberCommand(ctx, actor, args);
  },
});

export const checkPermission = query({
  args: {
    organizationId: v.id("identityOrganizations"),
    permission: identityPermission,
  },
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    const membership = await getMembership(ctx, args.organizationId, actor.user._id);
    return membership ? hasPermission(membership.role, args.permission) : false;
  },
});
`;
}
