export function identitySchemasContent(): string {
  return `import { z } from "zod";

export const organizationRoleSchema = z.enum(["owner", "admin", "member"]);
export const identityPermissionSchema = z.enum([
  "organization:read",
  "organization:write",
  "member:read",
  "member:write",
  "invitation:read",
  "invitation:write",
  "team:read",
  "team:write",
]);

export const identitySessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.string().datetime(),
  authenticatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  activeOrganizationId: z.string().nullable().optional(),
  activeTeamId: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
});

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const organizationMembershipSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  role: organizationRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const organizationInvitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string().email(),
  role: organizationRoleSchema,
  status: z.enum(["pending", "accepted", "cancelled", "expired"]),
  inviterUserId: z.string(),
  expiresAt: z.string().datetime(),
  acceptedByUserId: z.string().nullable(),
  acceptedMemberId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const organizationTeamSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const teamMembershipSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
  createdAt: z.string().datetime(),
});
`;
}
