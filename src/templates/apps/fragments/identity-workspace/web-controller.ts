export function identityWorkspaceTypesContent(): string {
  return `export type OrganizationRole = "owner" | "admin" | "member";

export interface IdentityOrganization { id: string; name: string; slug: string; createdAt: string; updatedAt: string; }
export interface IdentityOrganizationMembership { id: string; organizationId: string; userId: string; role: OrganizationRole; createdAt: string; updatedAt: string; }
export interface IdentityInvitation { id: string; organizationId: string; email: string; role: OrganizationRole; status: "pending" | "accepted" | "cancelled" | "expired"; inviterUserId: string; expiresAt: string; acceptedByUserId: string | null; acceptedMemberId: string | null; createdAt: string; updatedAt: string; }
export interface IdentityTeam { id: string; organizationId: string; name: string; createdAt: string; updatedAt: string; }
export interface IdentityTeamMembership { teamId: string; userId: string; createdAt: string; }
export interface IdentityWorkspaceInitialData {
  organizations: IdentityOrganization[];
  organizationId: string | null;
  teams: IdentityTeam[];
  members: IdentityOrganizationMembership[];
  invitations: IdentityInvitation[];
  teamId: string | null;
  teamMembers: IdentityTeamMembership[];
}

export function organizationRole(value: string): OrganizationRole {
  return value === "owner" || value === "admin" ? value : "member";
}
`;
}
