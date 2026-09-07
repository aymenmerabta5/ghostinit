import { serverOnly } from "./shared.js";

export function identityContractsContent(): string {
  return `${serverOnly}
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const IDENTITY_PERMISSIONS = [
  "organization:read",
  "organization:write",
  "member:read",
  "member:write",
  "invitation:read",
  "invitation:write",
  "team:read",
  "team:write",
] as const;
export type IdentityPermission = (typeof IDENTITY_PERMISSIONS)[number];

export interface IdentityActor {
  userId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
  /** Server-derived time of the last primary or step-up authentication. Never accept this from request input. */
  authenticatedAt: Date;
  /** Server-derived session state. It is a routing hint, never authorization evidence. */
  activeOrganizationId?: string | null;
  /** Server-derived active team. It is a routing hint, never authorization evidence. */
  activeTeamId?: string | null;
}

export interface IdentitySession {
  id: string;
  userId: string;
  createdAt: Date;
  authenticatedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  activeOrganizationId?: string | null;
  activeTeamId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: Date;
  updatedAt: Date;
}

export type InvitationStatus = "pending" | "accepted" | "cancelled" | "expired";
export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  status: InvitationStatus;
  inviterUserId: string;
  expiresAt: Date;
  acceptedByUserId: string | null;
  acceptedMemberId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationTeam {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMembership {
  teamId: string;
  userId: string;
  createdAt: Date;
}

export type IdentityAuditAction =
  | "identity.session.revoked"
  | "identity.session.others_revoked"
  | "identity.organization.created"
  | "identity.organization.activated"
  | "identity.member.role_changed"
  | "identity.member.removed"
  | "identity.invitation.created"
  | "identity.invitation.cancelled"
  | "identity.invitation.accepted"
  | "identity.team.created"
  | "identity.team.activated"
  | "identity.team.member_added"
  | "identity.team.member_removed";

export type IdentityAuditMetadata = Readonly<Record<string, string | number | boolean | null>>;
export interface IdentityAuditEvent {
  action: IdentityAuditAction;
  actorId: string;
  organizationId?: string;
  targetId?: string;
  metadata: IdentityAuditMetadata;
  occurredAt: Date;
}

export interface MutationResult<T> {
  value: T;
  changed: boolean;
}
`;
}
