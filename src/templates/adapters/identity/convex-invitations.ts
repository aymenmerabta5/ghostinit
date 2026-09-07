// @allow-long 380: invitation expiry, replay safety, acceptance, and audit invariants are one review unit
export function convexIdentityInvitationsContent(): string {
  return `import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import {
  getMembership,
  invitationValue,
  membershipValue,
  normalizeIdentityEmail,
  recordIdentityAudit,
  requireIdentityActor,
  requireInvitationEmail,
  requireMembership,
  requirePermission,
  requireVerifiedActor,
  type IdentityActor,
  type OrganizationRole,
} from "./shared";

const organizationRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export const list = query({
  args: { organizationId: v.id("identityOrganizations") },
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    await requirePermission(ctx, args.organizationId, actor.user._id, "invitation:read");
    const invitations = await ctx.db
      .query("identityInvitations")
      .withIndex("by_organization_status", (indexQuery) =>
        indexQuery.eq("organizationId", args.organizationId),
      )
      .collect();
    return invitations.map(invitationValue);
  },
});

async function createInvitationCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  input: {
    organizationId: Id<"identityOrganizations">;
    email: string;
    role: OrganizationRole;
  },
) {
  requireVerifiedActor(actor);
  const actorMembership = await requireMembership(ctx, input.organizationId, actor.user._id);
  if (actorMembership.role === "member") {
    throw new ConvexError({
      code: "IDENTITY_ORGANIZATION_FORBIDDEN",
      message: "Invitation write permission required",
    });
  }
  if (input.role === "owner" && actorMembership.role !== "owner") {
    throw new ConvexError({
      code: "IDENTITY_MEMBER_FORBIDDEN",
      message: "Only an owner can invite another owner",
    });
  }
  const email = requireInvitationEmail(input.email);
  const occurredAt = Date.now();
  const existing = await ctx.db
    .query("identityInvitations")
    .withIndex("by_organization_email_status", (indexQuery) =>
      indexQuery
        .eq("organizationId", input.organizationId)
        .eq("email", email)
        .eq("status", "pending"),
    )
    .unique();
  if (existing && existing.expiresAt > occurredAt) {
    if (existing.role === input.role) return { invitation: invitationValue(existing), created: false };
    throw new ConvexError({
      code: "IDENTITY_INVITATION_ALREADY_PENDING",
      message: "A pending invitation already exists for this address",
    });
  }
  if (existing) {
    await ctx.db.patch(existing._id, { status: "expired", updatedAt: occurredAt });
  }
  const invitationId = await ctx.db.insert("identityInvitations", {
    organizationId: input.organizationId,
    email,
    role: input.role,
    status: "pending",
    inviterUserId: actor.user._id,
    expiresAt: occurredAt + INVITATION_LIFETIME_MS,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
  await recordIdentityAudit(ctx, {
    action: "identity.invitation.created",
    actorId: actor.user._id,
    organizationId: input.organizationId,
    targetId: invitationId,
    metadata: { email, role: input.role },
    occurredAt,
  });
  const invitation = await ctx.db.get(invitationId);
  if (!invitation) throw new Error("Created invitation was not readable in its transaction");
  return { invitation: invitationValue(invitation), created: true };
}

const createArgs = {
  organizationId: v.id("identityOrganizations"),
  email: v.string(),
  role: organizationRole,
};

export const create = mutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await createInvitationCommand(ctx, actor, args);
  },
});

export const createInternal = internalMutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await createInvitationCommand(ctx, actor, args);
  },
});

async function cancelInvitationCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  invitationId: Id<"identityInvitations">,
) {
  const invitation = await ctx.db.get(invitationId);
  if (!invitation) {
    throw new ConvexError({ code: "IDENTITY_INVITATION_NOT_FOUND", message: "Invitation not found" });
  }
  await requirePermission(ctx, invitation.organizationId, actor.user._id, "invitation:write");
  if (invitation.status === "cancelled") {
    return { value: invitationValue(invitation), changed: false };
  }
  if (invitation.status !== "pending") {
    throw new ConvexError({
      code: "IDENTITY_INVITATION_NOT_PENDING",
      message: "Only pending invitations can be cancelled",
    });
  }
  const occurredAt = Date.now();
  await ctx.db.patch(invitation._id, { status: "cancelled", updatedAt: occurredAt });
  await recordIdentityAudit(ctx, {
    action: "identity.invitation.cancelled",
    actorId: actor.user._id,
    organizationId: invitation.organizationId,
    targetId: invitation._id,
    metadata: { email: invitation.email },
    occurredAt,
  });
  return {
    value: invitationValue({ ...invitation, status: "cancelled", updatedAt: occurredAt }),
    changed: true,
  };
}

const cancelArgs = { invitationId: v.id("identityInvitations") };

export const cancel = mutation({
  args: cancelArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await cancelInvitationCommand(ctx, actor, args.invitationId);
  },
});

export const cancelInternal = internalMutation({
  args: cancelArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await cancelInvitationCommand(ctx, actor, args.invitationId);
  },
});

async function acceptInvitationCommand(
  ctx: MutationCtx,
  actor: IdentityActor,
  invitationId: Id<"identityInvitations">,
) {
  requireVerifiedActor(actor);
  const invitation = await ctx.db.get(invitationId);
  if (!invitation) {
    throw new ConvexError({ code: "IDENTITY_INVITATION_NOT_FOUND", message: "Invitation not found" });
  }
  if (normalizeIdentityEmail(invitation.email) !== normalizeIdentityEmail(actor.user.email)) {
    throw new ConvexError({
      code: "IDENTITY_INVITATION_EMAIL_MISMATCH",
      message: "The invitation belongs to a different email address",
    });
  }
  if (invitation.status === "accepted" && invitation.acceptedByUserId === actor.user._id) {
    const membership = invitation.acceptedMembershipId
      ? await ctx.db.get(invitation.acceptedMembershipId)
      : await getMembership(ctx, invitation.organizationId, actor.user._id);
    if (!membership || membership.organizationId !== invitation.organizationId) {
      throw new ConvexError({ code: "IDENTITY_MEMBER_NOT_FOUND", message: "Accepted membership not found" });
    }
    return { value: membershipValue(membership), changed: false };
  }
  const occurredAt = Date.now();
  if (invitation.status === "expired" || invitation.expiresAt <= occurredAt) {
    throw new ConvexError({ code: "IDENTITY_INVITATION_EXPIRED", message: "The invitation has expired" });
  }
  if (invitation.status !== "pending") {
    throw new ConvexError({
      code: "IDENTITY_INVITATION_NOT_PENDING",
      message: "The invitation is no longer pending",
    });
  }
  const existingMembership = await getMembership(ctx, invitation.organizationId, actor.user._id);
  const membershipId = existingMembership?._id ?? await ctx.db.insert("identityMemberships", {
    organizationId: invitation.organizationId,
    userId: actor.user._id,
    role: invitation.role,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
  await ctx.db.patch(invitation._id, {
    status: "accepted",
    acceptedByUserId: actor.user._id,
    acceptedMembershipId: membershipId,
    updatedAt: occurredAt,
  });
  await recordIdentityAudit(ctx, {
    action: "identity.invitation.accepted",
    actorId: actor.user._id,
    organizationId: invitation.organizationId,
    targetId: invitation._id,
    metadata: { membershipId, role: existingMembership?.role ?? invitation.role },
    occurredAt,
  });
  const membership = existingMembership ?? await ctx.db.get(membershipId);
  if (!membership) throw new Error("Accepted membership was not readable in its transaction");
  return { value: membershipValue(membership), changed: true };
}

const acceptArgs = { invitationId: v.id("identityInvitations") };

export const accept = mutation({
  args: acceptArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await acceptInvitationCommand(ctx, actor, args.invitationId);
  },
});

export const acceptInternal = internalMutation({
  args: acceptArgs,
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    return await acceptInvitationCommand(ctx, actor, args.invitationId);
  },
});
`;
}
