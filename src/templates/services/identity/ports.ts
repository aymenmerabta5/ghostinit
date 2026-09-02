import { serverOnly } from "./shared.js";

export function identityPortsContent(): string {
  return `${serverOnly}
import type {
  IdentityAuditEvent,
  IdentitySession,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationRole,
  OrganizationTeam,
  TeamMembership,
} from "./contracts.js";

export interface IdentityPersistencePort {
  listSessions(userId: string): Promise<IdentitySession[]>;
  getSession(sessionId: string): Promise<IdentitySession | null>;
  revokeSession(input: { sessionId: string; userId: string; revokedAt: Date }): Promise<IdentitySession>;
  revokeOtherSessions(input: { userId: string; exceptSessionId: string; revokedAt: Date }): Promise<number>;

  listOrganizationsForUser(userId: string): Promise<Organization[]>;
  getOrganization(organizationId: string): Promise<Organization | null>;
  findOrganizationBySlug(slug: string): Promise<Organization | null>;
  createOrganization(input: {
    name: string;
    slug: string;
    ownerUserId: string;
    createdAt: Date;
  }): Promise<{ organization: Organization; ownerMembership: OrganizationMembership }>;
  setActiveOrganization(input: {
    userId: string;
    sessionId: string;
    organizationId: string;
    updatedAt: Date;
  }): Promise<void>;
  setActiveTeam(input: {
    userId: string;
    sessionId: string;
    organizationId: string;
    teamId: string;
    updatedAt: Date;
  }): Promise<void>;

  listMemberships(organizationId: string): Promise<OrganizationMembership[]>;
  getMembership(organizationId: string, userId: string): Promise<OrganizationMembership | null>;
  getMembershipById(membershipId: string): Promise<OrganizationMembership | null>;
  countOwners(organizationId: string): Promise<number>;
  updateMembershipRole(input: {
    membershipId: string;
    role: OrganizationRole;
    updatedAt: Date;
  }): Promise<OrganizationMembership>;
  removeMembership(input: { membershipId: string; removedAt: Date }): Promise<void>;

  listInvitations(organizationId: string): Promise<OrganizationInvitation[]>;
  getInvitation(invitationId: string): Promise<OrganizationInvitation | null>;
  findPendingInvitation(organizationId: string, normalizedEmail: string): Promise<OrganizationInvitation | null>;
  createInvitation(input: {
    organizationId: string;
    email: string;
    role: OrganizationRole;
    inviterUserId: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<OrganizationInvitation>;
  expireInvitation(input: { invitationId: string; expiredAt: Date }): Promise<OrganizationInvitation>;
  cancelInvitation(input: { invitationId: string; cancelledAt: Date }): Promise<OrganizationInvitation>;
  acceptInvitation(input: {
    invitationId: string;
    userId: string;
    acceptedAt: Date;
  }): Promise<{ invitation: OrganizationInvitation; membership: OrganizationMembership }>;

  listTeams(organizationId: string): Promise<OrganizationTeam[]>;
  getTeam(teamId: string): Promise<OrganizationTeam | null>;
  findTeamByName(organizationId: string, normalizedName: string): Promise<OrganizationTeam | null>;
  createTeam(input: { organizationId: string; name: string; createdAt: Date }): Promise<OrganizationTeam>;
  listTeamMemberships(teamId: string): Promise<TeamMembership[]>;
  getTeamMembership(teamId: string, userId: string): Promise<TeamMembership | null>;
  addTeamMembership(input: { teamId: string; userId: string; createdAt: Date }): Promise<TeamMembership>;
  removeTeamMembership(input: { teamId: string; userId: string; removedAt: Date }): Promise<void>;
}

export interface IdentityAuditPort {
  /** Transactional audit persistence only; publish/log externally after commit. */
  record(event: IdentityAuditEvent): Promise<void>;
}

export interface IdentityUnitOfWorkContext {
  identity: IdentityPersistencePort;
  audit: IdentityAuditPort;
}

/**
 * The adapter must commit persistence and audit writes atomically. If work
 * throws, including an audit failure, every write made through the context is
 * rolled back. Owner counts and membership changes must be serialized per org.
 * Session, invitation, and team preconditions require conditional writes (or
 * row locks) so a stale read cannot authorize a concurrent mutation.
 */
export interface IdentityUnitOfWorkPort {
  run<T>(work: (context: IdentityUnitOfWorkContext) => Promise<T>): Promise<T>;
}

export interface IdentityAdapterPort {
  readonly query: IdentityPersistencePort;
  readonly unitOfWork: IdentityUnitOfWorkPort;
}
`;
}
