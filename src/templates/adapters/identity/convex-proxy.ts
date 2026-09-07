import type { ProjectMode } from "../../../lib/addons.js";

export function convexIdentityProxyContent(mode: ProjectMode): string {
  const serviceImport =
    mode === "monorepo" ? "../../../../identity/index.js" : "@/server/services/identity";
  return `// @allow-long 390: typed Convex transport DTOs and IdentityService facade stay together
import "server-only";
import type {
  ChangeMemberRoleInput,
  CreateInvitationInput,
  CreateOrganizationInput,
  IdentityActor,
  IdentityPermission,
  IdentityService,
  IdentitySession,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationRole,
  OrganizationTeam,
  RemoveMemberInput,
  TeamMembership,
  TeamMembershipInput,
} from "${serviceImport}";

export type ConvexIdentitySession = {
  id: string;
  userId: string;
  createdAt: number;
  authenticatedAt: number;
  expiresAt: number;
  revokedAt: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  activeOrganizationId: string | null;
  activeTeamId: string | null;
};

export type ConvexOrganization = {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
  updatedAt: number;
};

export type ConvexMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: number;
  updatedAt: number;
};

export type ConvexInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "cancelled" | "expired";
  inviterUserId: string;
  expiresAt: number;
  acceptedByUserId: string | null;
  acceptedMemberId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ConvexTeam = {
  id: string;
  organizationId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type ConvexTeamMembership = { teamId: string; userId: string; createdAt: number };
export type ConvexAuditPage = {
  page: Array<{
    id: string;
    action: string;
    actorId: string;
    organizationId: string | null;
    targetId: string | null;
    metadata: Readonly<Record<string, string | number | boolean | null>>;
    occurredAt: number;
  }>;
  isDone: boolean;
  continueCursor: string;
};

/**
 * Bind these methods to generated api.identity.* function references using an
 * authenticated Convex client. Each method is one coarse server command. This
 * executor is intentionally not IdentityAdapterPort: it never claims remote
 * callback transaction atomicity.
 */
export interface ConvexIdentityCommandExecutor {
  listSessions(): Promise<ConvexIdentitySession[]>;
  revokeSession(input: { sessionId: string }): Promise<{ value: ConvexIdentitySession; changed: boolean }>;
  revokeOtherSessions(): Promise<{ revokedCount: number; changed: boolean }>;

  listOrganizations(): Promise<ConvexOrganization[]>;
  createOrganization(input: { name: string; slug: string }): Promise<{ organization: ConvexOrganization; created: boolean }>;
  setActiveOrganization(input: { organizationId: string }): Promise<{ organizationId: string; changed: boolean }>;
  listMembers(input: { organizationId: string }): Promise<ConvexMembership[]>;
  changeMemberRole(input: {
    organizationId: string;
    membershipId: string;
    role: OrganizationRole;
  }): Promise<{ value: ConvexMembership; changed: boolean }>;
  removeMember(input: { organizationId: string; membershipId: string }): Promise<{ membershipId: string; changed: boolean }>;
  checkPermission(input: { organizationId: string; permission: IdentityPermission }): Promise<boolean>;

  listInvitations(input: { organizationId: string }): Promise<ConvexInvitation[]>;
  createInvitation(input: {
    organizationId: string;
    email: string;
    role: OrganizationRole;
  }): Promise<{ invitation: ConvexInvitation; created: boolean }>;
  cancelInvitation(input: { invitationId: string }): Promise<{ value: ConvexInvitation; changed: boolean }>;
  acceptInvitation(input: { invitationId: string }): Promise<{ value: ConvexMembership; changed: boolean }>;

  listTeams(input: { organizationId: string }): Promise<ConvexTeam[]>;
  createTeam(input: { organizationId: string; name: string }): Promise<{ team: ConvexTeam; created: boolean }>;
  listTeamMembers(input: { organizationId: string; teamId: string }): Promise<ConvexTeamMembership[]>;
  addTeamMember(input: { organizationId: string; teamId: string; userId: string }): Promise<{ value: ConvexTeamMembership; changed: boolean }>;
  removeTeamMember(input: { organizationId: string; teamId: string; userId: string }): Promise<{ userId: string; changed: boolean }>;
  setActiveTeam(input: { organizationId: string; teamId: string }): Promise<{ organizationId: string; teamId: string; changed: boolean }>;

  listOrganizationAudit(input: { organizationId: string; cursor: string | null; numItems: number }): Promise<ConvexAuditPage>;
  listMyAudit(input: { cursor: string | null; numItems: number }): Promise<ConvexAuditPage>;
}

function date(value: number, field: string): Date {
  if (!Number.isFinite(value)) throw new Error("Invalid Convex identity timestamp: " + field);
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error("Invalid Convex identity timestamp: " + field);
  return result;
}

function nullableDate(value: number | null, field: string): Date | null {
  return value === null ? null : date(value, field);
}

function toSession(value: ConvexIdentitySession): IdentitySession {
  return {
    ...value,
    createdAt: date(value.createdAt, "session.createdAt"),
    authenticatedAt: date(value.authenticatedAt, "session.authenticatedAt"),
    expiresAt: date(value.expiresAt, "session.expiresAt"),
    revokedAt: nullableDate(value.revokedAt, "session.revokedAt"),
  };
}

function toOrganization(value: ConvexOrganization): Organization {
  return {
    ...value,
    createdAt: date(value.createdAt, "organization.createdAt"),
    updatedAt: date(value.updatedAt, "organization.updatedAt"),
  };
}

function toMembership(value: ConvexMembership): OrganizationMembership {
  return {
    ...value,
    createdAt: date(value.createdAt, "membership.createdAt"),
    updatedAt: date(value.updatedAt, "membership.updatedAt"),
  };
}

function toInvitation(value: ConvexInvitation): OrganizationInvitation {
  return {
    ...value,
    expiresAt: date(value.expiresAt, "invitation.expiresAt"),
    createdAt: date(value.createdAt, "invitation.createdAt"),
    updatedAt: date(value.updatedAt, "invitation.updatedAt"),
  };
}

function toTeam(value: ConvexTeam): OrganizationTeam {
  return {
    ...value,
    createdAt: date(value.createdAt, "team.createdAt"),
    updatedAt: date(value.updatedAt, "team.updatedAt"),
  };
}

function toTeamMembership(value: ConvexTeamMembership): TeamMembership {
  return { ...value, createdAt: date(value.createdAt, "teamMembership.createdAt") };
}

/**
 * IdentityService-compatible facade for the existing oRPC action layer. The
 * API actor is deliberately unused: Convex derives and authorizes its actor
 * from the authenticated request for every coarse command.
 */
export function createConvexIdentityService(executor: ConvexIdentityCommandExecutor): IdentityService {
  return {
    sessions: {
      list: async (_actor: IdentityActor) => (await executor.listSessions()).map(toSession),
      revoke: async (_actor: IdentityActor, sessionId: string) => {
        const result = await executor.revokeSession({ sessionId });
        return { ...result, value: toSession(result.value) };
      },
      revokeOthers: async (_actor: IdentityActor) => await executor.revokeOtherSessions(),
    },
    organizations: {
      list: async (_actor: IdentityActor) => (await executor.listOrganizations()).map(toOrganization),
      create: async (_actor: IdentityActor, input: CreateOrganizationInput) => {
        const result = await executor.createOrganization(input);
        return { ...result, organization: toOrganization(result.organization) };
      },
      setActive: async (_actor: IdentityActor, organizationId: string) =>
        await executor.setActiveOrganization({ organizationId }),
      listMembers: async (_actor: IdentityActor, organizationId: string) =>
        (await executor.listMembers({ organizationId })).map(toMembership),
      changeMemberRole: async (_actor: IdentityActor, input: ChangeMemberRoleInput) => {
        const result = await executor.changeMemberRole(input);
        return { ...result, value: toMembership(result.value) };
      },
      removeMember: async (_actor: IdentityActor, input: RemoveMemberInput) =>
        await executor.removeMember(input),
      hasPermission: async (
        _actor: IdentityActor,
        organizationId: string,
        permission: IdentityPermission,
      ) => await executor.checkPermission({ organizationId, permission }),
    },
    invitations: {
      list: async (_actor: IdentityActor, organizationId: string) =>
        (await executor.listInvitations({ organizationId })).map(toInvitation),
      create: async (_actor: IdentityActor, input: CreateInvitationInput) => {
        const result = await executor.createInvitation(input);
        return { ...result, invitation: toInvitation(result.invitation) };
      },
      cancel: async (_actor: IdentityActor, invitationId: string) => {
        const result = await executor.cancelInvitation({ invitationId });
        return { ...result, value: toInvitation(result.value) };
      },
      accept: async (_actor: IdentityActor, invitationId: string) => {
        const result = await executor.acceptInvitation({ invitationId });
        return { ...result, value: toMembership(result.value) };
      },
    },
    teams: {
      list: async (_actor: IdentityActor, organizationId: string) =>
        (await executor.listTeams({ organizationId })).map(toTeam),
      create: async (_actor: IdentityActor, organizationId: string, name: string) => {
        const result = await executor.createTeam({ organizationId, name });
        return { ...result, team: toTeam(result.team) };
      },
      setActive: async (_actor: IdentityActor, organizationId: string, teamId: string) => {
        const result = await executor.setActiveTeam({ organizationId, teamId });
        return { teamId: result.teamId, changed: result.changed };
      },
      listMembers: async (_actor: IdentityActor, organizationId: string, teamId: string) =>
        (await executor.listTeamMembers({ organizationId, teamId })).map(toTeamMembership),
      addMember: async (_actor: IdentityActor, input: TeamMembershipInput) => {
        const result = await executor.addTeamMember(input);
        return { ...result, value: toTeamMembership(result.value) };
      },
      removeMember: async (_actor: IdentityActor, input: TeamMembershipInput) =>
        await executor.removeTeamMember(input),
    },
  } satisfies IdentityService;
}

/** Backward-compatible name; the returned value is the typed application service facade. */
export function createConvexIdentityCommandProxy(
  executor: ConvexIdentityCommandExecutor,
): IdentityService {
  return createConvexIdentityService(executor);
}

export function createConvexIdentityAuditProxy(executor: ConvexIdentityCommandExecutor) {
  return {
    listOrganization: (input: { organizationId: string; cursor: string | null; numItems: number }) =>
      executor.listOrganizationAudit(input),
    listMine: (input: { cursor: string | null; numItems: number }) => executor.listMyAudit(input),
  } as const;
}
`;
}
