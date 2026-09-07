import { currentRequestSchemaContent } from "../../api/current-request-schema.js";

export function desktopApiContractContent(
  hasBilling = false,
  hasAuth = true,
  hasAdmin = false,
  hasMessaging = false,
): string {
  const identitySchemas = hasAuth
    ? `const organizationRoleSchema = z.enum(["owner", "admin", "member"]);
const identitySessionSchema = z.object({ id: z.string(), userId: z.string(), createdAt: z.string().datetime(), authenticatedAt: z.string().datetime(), expiresAt: z.string().datetime(), revokedAt: z.string().datetime().nullable(), activeOrganizationId: z.string().nullable().optional(), activeTeamId: z.string().nullable().optional(), ipAddress: z.string().nullable().optional(), userAgent: z.string().nullable().optional() });
const organizationSchema = z.object({ id: z.string(), name: z.string(), slug: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
const organizationMembershipSchema = z.object({ id: z.string(), organizationId: z.string(), userId: z.string(), role: organizationRoleSchema, createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
const organizationInvitationSchema = z.object({ id: z.string(), organizationId: z.string(), email: z.string().email(), role: organizationRoleSchema, status: z.enum(["pending", "accepted", "cancelled", "expired"]), inviterUserId: z.string(), expiresAt: z.string().datetime(), acceptedByUserId: z.string().nullable(), acceptedMemberId: z.string().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
const organizationTeamSchema = z.object({ id: z.string(), organizationId: z.string(), name: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
const teamMembershipSchema = z.object({ teamId: z.string(), userId: z.string(), createdAt: z.string().datetime() });

`
    : "";
  const identityContract = hasAuth
    ? `,
  me: oc
    .route({ method: "GET", path: "/me" })
    .output(
${currentRequestSchemaContent(6)},
    ),
  identity: {
    sessions: {
      list: oc.route({ method: "GET", path: "/identity/sessions" }).input(z.object({})).output(z.array(identitySessionSchema)),
      revoke: oc.route({ method: "DELETE", path: "/identity/sessions/{sessionId}" }).input(z.object({ sessionId: z.string().min(1) })).output(z.object({ value: identitySessionSchema, changed: z.boolean() })),
      revokeOthers: oc.route({ method: "POST", path: "/identity/sessions/revoke-others" }).input(z.object({})).output(z.object({ revokedCount: z.number().int().nonnegative(), changed: z.boolean() })),
    },
    organizations: {
      list: oc.route({ method: "GET", path: "/identity/organizations" }).input(z.object({})).output(z.array(organizationSchema)),
      create: oc.route({ method: "POST", path: "/identity/organizations" }).input(z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().min(2).max(80) })).output(z.object({ organization: organizationSchema, created: z.boolean() })),
      setActive: oc.route({ method: "PUT", path: "/identity/organizations/{organizationId}/active" }).input(z.object({ organizationId: z.string().min(1) })).output(z.object({ organizationId: z.string(), changed: z.boolean() })),
      listMembers: oc.route({ method: "GET", path: "/identity/organizations/{organizationId}/members" }).input(z.object({ organizationId: z.string().min(1) })).output(z.array(organizationMembershipSchema)),
      changeMemberRole: oc.route({ method: "PATCH", path: "/identity/organizations/{organizationId}/members/{membershipId}/role" }).input(z.object({ organizationId: z.string().min(1), membershipId: z.string().min(1), role: organizationRoleSchema })).output(z.object({ value: organizationMembershipSchema, changed: z.boolean() })),
      removeMember: oc.route({ method: "DELETE", path: "/identity/organizations/{organizationId}/members/{membershipId}" }).input(z.object({ organizationId: z.string().min(1), membershipId: z.string().min(1) })).output(z.object({ membershipId: z.string(), changed: z.boolean() })),
    },
    invitations: {
      list: oc.route({ method: "GET", path: "/identity/organizations/{organizationId}/invitations" }).input(z.object({ organizationId: z.string().min(1) })).output(z.array(organizationInvitationSchema)),
      create: oc.route({ method: "POST", path: "/identity/organizations/{organizationId}/invitations" }).input(z.object({ organizationId: z.string().min(1), email: z.string().email(), role: organizationRoleSchema })).output(z.object({ invitation: organizationInvitationSchema, created: z.boolean() })),
      cancel: oc.route({ method: "DELETE", path: "/identity/invitations/{invitationId}" }).input(z.object({ invitationId: z.string().min(1) })).output(z.object({ value: organizationInvitationSchema, changed: z.boolean() })),
      accept: oc.route({ method: "POST", path: "/identity/invitations/{invitationId}/accept" }).input(z.object({ invitationId: z.string().min(1) })).output(z.object({ value: organizationMembershipSchema, changed: z.boolean() })),
    },
    teams: {
      list: oc.route({ method: "GET", path: "/identity/organizations/{organizationId}/teams" }).input(z.object({ organizationId: z.string().min(1) })).output(z.array(organizationTeamSchema)),
      create: oc.route({ method: "POST", path: "/identity/organizations/{organizationId}/teams" }).input(z.object({ organizationId: z.string().min(1), name: z.string().trim().min(1).max(100) })).output(z.object({ team: organizationTeamSchema, created: z.boolean() })),
      setActive: oc.route({ method: "PUT", path: "/identity/organizations/{organizationId}/teams/{teamId}/active" }).input(z.object({ organizationId: z.string().min(1), teamId: z.string().min(1) })).output(z.object({ teamId: z.string(), changed: z.boolean() })),
      listMembers: oc.route({ method: "GET", path: "/identity/organizations/{organizationId}/teams/{teamId}/members" }).input(z.object({ organizationId: z.string().min(1), teamId: z.string().min(1) })).output(z.array(teamMembershipSchema)),
      addMember: oc.route({ method: "PUT", path: "/identity/organizations/{organizationId}/teams/{teamId}/members/{userId}" }).input(z.object({ organizationId: z.string().min(1), teamId: z.string().min(1), userId: z.string().min(1) })).output(z.object({ value: teamMembershipSchema, changed: z.boolean() })),
      removeMember: oc.route({ method: "DELETE", path: "/identity/organizations/{organizationId}/teams/{teamId}/members/{userId}" }).input(z.object({ organizationId: z.string().min(1), teamId: z.string().min(1), userId: z.string().min(1) })).output(z.object({ userId: z.string(), changed: z.boolean() })),
    },
  }`
    : "";
  const billingContract = hasBilling
    ? `,
  billing: {
    subscriptions: oc
      .route({ method: "GET", path: "/billing/subscriptions" })
      .output(z.object({
        subscriptions: z.array(z.record(z.string(), z.unknown())),
        invoices: z.array(z.record(z.string(), z.unknown())),
        usageEvents: z.array(z.record(z.string(), z.unknown())),
        licenseKeys: z.array(z.record(z.string(), z.unknown())),
      })),
    createCheckout: oc
      .route({ method: "POST", path: "/billing/checkout" })
      .input(z.object({
        provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
        planId: z.literal("pro"),
        successUrl: z.string().url(),
        failureUrl: z.string().url().optional(),
        cancelUrl: z.string().url().optional(),
        quantity: z.number().int().min(1).max(1_000).optional(),
        requestKey: z.string().uuid(),
      }))
      .output(z.object({ id: z.string(), url: z.string() })),
    createPortalSession: oc
      .route({ method: "POST", path: "/billing/portal" })
      .input(z.object({
        provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
        returnUrl: z.string().url(),
      }))
      .output(z.object({ url: z.string() })),
    createPaymentLink: oc
      .route({ method: "POST", path: "/billing/payment-link" })
      .input(z.object({
        provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
        name: z.string().min(1).max(120),
        items: z.array(z.object({ price: z.string().min(1).max(200), quantity: z.number().int().min(1).max(1_000) })).min(1).max(20),
        afterCompletionMessage: z.string().max(500).optional(),
      }))
      .output(z.object({ id: z.string(), url: z.string().url() })),
  }`
    : "";
  const messagingContract = hasMessaging
    ? `,
  messaging: {
    listConversations: oc.route({ method: "GET", path: "/messaging/conversations" }).output(z.object({ conversations: z.array(z.object({ id: z.string(), createdBy: z.string(), createdAt: z.date(), updatedAt: z.date() }).passthrough()) })),
    listMessages: oc.route({ method: "GET", path: "/messaging/messages" }).input(z.object({ conversationId: z.string().min(1), limit: z.number().int().min(1).max(50).optional(), cursor: z.string().min(1).optional() })).output(z.object({ messages: z.array(z.object({ id: z.string(), senderId: z.string(), body: z.string().nullable().optional(), createdAt: z.union([z.string(), z.date()]), attachments: z.array(z.object({ id: z.string().optional(), url: z.string(), mimeType: z.string(), originalName: z.string().optional() })).optional() }).passthrough()), nextCursor: z.string().nullable() })),
    getOrCreateConversation: oc.route({ method: "POST", path: "/messaging/conversations/find-or-create" }).input(z.object({ peerUserId: z.string().min(1) })).output(z.object({ id: z.string().min(1), createdBy: z.string(), createdAt: z.date(), updatedAt: z.date() }).passthrough()),
    sendMessage: oc.route({ method: "POST", path: "/messaging/messages" }).input(z.object({ conversationId: z.string().min(1), clientMessageKey: z.string().min(16).max(128), body: z.string().min(1).max(4000).optional(), attachmentIds: z.array(z.string().min(1)).max(5).optional() })).output(z.object({ id: z.string() }).passthrough()),
  }`
    : "";
  const adminSchema = hasAdmin
    ? `const adminUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
  banned: z.boolean(),
});

`
    : "";
  const adminContract = hasAdmin
    ? `,
  adminUsers: {
    list: oc
      .route({ method: "GET", path: "/admin/users" })
      .input(z.object({ search: z.string().trim().max(120).optional(), page: z.number().int().min(1), limit: z.number().int().min(1).max(100) }))
      .output(z.object({ users: z.array(adminUserSchema), total: z.number().int().nonnegative() })),
    create: oc
      .route({ method: "POST", path: "/admin/users" })
      .input(z.object({ name: z.string().trim().min(1).max(80), email: z.string().email(), password: z.string().min(8).max(128), role: z.enum(["user", "admin"]) }))
      .output(adminUserSchema),
    changeRole: oc
      .route({ method: "PATCH", path: "/admin/users/{userId}/role" })
      .input(z.object({ userId: z.string().min(1), role: z.enum(["user", "admin"]) }))
      .output(z.object({ id: z.string(), role: z.enum(["user", "admin"]) })),
    setBanned: oc
      .route({ method: "PATCH", path: "/admin/users/{userId}/ban" })
      .input(z.object({ userId: z.string().min(1), banned: z.boolean(), reason: z.string().trim().min(1).max(240).optional() }))
      .output(z.object({ id: z.string(), banned: z.boolean() })),
  }`
    : "";
  return `import { oc } from "@orpc/contract";
import { z } from "zod";

${identitySchemas}${adminSchema}export const desktopApiContract = {
  health: oc
    .route({ method: "GET", path: "/health" })
    .output(z.object({ status: z.literal("ok"), time: z.string().datetime() }))${identityContract}${billingContract}${messagingContract}${adminContract},
};
`;
}
