export function convexIdentitySchemaContent(): string {
  return `import { defineTable } from "convex/server";
import { v } from "convex/values";

const organizationRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);
const invitationStatus = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("cancelled"),
  v.literal("expired"),
);
const identityAuditAction = v.union(
  v.literal("identity.session.revoked"),
  v.literal("identity.session.others_revoked"),
  v.literal("identity.organization.created"),
  v.literal("identity.organization.activated"),
  v.literal("identity.member.role_changed"),
  v.literal("identity.member.removed"),
  v.literal("identity.invitation.created"),
  v.literal("identity.invitation.cancelled"),
  v.literal("identity.invitation.accepted"),
  v.literal("identity.team.created"),
  v.literal("identity.team.activated"),
  v.literal("identity.team.member_added"),
  v.literal("identity.team.member_removed"),
);
const auditMetadataValue = v.union(v.string(), v.number(), v.boolean(), v.null());

/**
 * App-owned identity data. The stock Better Auth Convex component does not
 * implement organizations, roles, invitations, or teams; do not add its
 * organization plugin. Spread these tables into the root defineSchema call.
 */
export const identityTables = {
  identitySessions: defineTable({
    authSessionId: v.string(),
    userId: v.id("users"),
    authenticatedAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    activeOrganizationId: v.optional(v.id("identityOrganizations")),
    activeTeamId: v.optional(v.id("identityTeams")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_auth_session", ["authSessionId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_revoked", ["userId", "revokedAt"])
    .index("by_expires", ["expiresAt"]),

  identityOrganizations: defineTable({
    name: v.string(),
    slug: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_creator", ["createdByUserId"]),

  identityMemberships: defineTable({
    organizationId: v.id("identityOrganizations"),
    userId: v.id("users"),
    role: organizationRole,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_user", ["organizationId", "userId"])
    .index("by_user_organization", ["userId", "organizationId"])
    .index("by_organization_role", ["organizationId", "role"]),

  identityInvitations: defineTable({
    organizationId: v.id("identityOrganizations"),
    email: v.string(),
    role: organizationRole,
    status: invitationStatus,
    inviterUserId: v.id("users"),
    expiresAt: v.number(),
    acceptedByUserId: v.optional(v.id("users")),
    acceptedMembershipId: v.optional(v.id("identityMemberships")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_organization_email_status", ["organizationId", "email", "status"])
    .index("by_email_status", ["email", "status"])
    .index("by_expires", ["expiresAt"]),

  identityTeams: defineTable({
    organizationId: v.id("identityOrganizations"),
    name: v.string(),
    normalizedName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_name", ["organizationId", "normalizedName"]),

  identityTeamMemberships: defineTable({
    organizationId: v.id("identityOrganizations"),
    teamId: v.id("identityTeams"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_team_user", ["teamId", "userId"])
    .index("by_user_team", ["userId", "teamId"])
    .index("by_organization_user", ["organizationId", "userId"]),

  identityAuditEvents: defineTable({
    action: identityAuditAction,
    actorId: v.id("users"),
    organizationId: v.optional(v.id("identityOrganizations")),
    targetId: v.optional(v.string()),
    metadata: v.record(v.string(), auditMetadataValue),
    occurredAt: v.number(),
  })
    .index("by_actor_occurred", ["actorId", "occurredAt"])
    .index("by_organization_occurred", ["organizationId", "occurredAt"])
    .index("by_action_occurred", ["action", "occurredAt"]),
};
`;
}
