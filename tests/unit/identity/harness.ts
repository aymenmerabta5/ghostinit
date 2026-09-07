// @allow-long 500: in-memory parity adapter implements the complete generated identity port for behavioral tests

export type Role = "owner" | "admin" | "member";

export interface TestSession {
  id: string;
  userId: string;
  createdAt: Date;
  authenticatedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  activeOrganizationId?: string | null;
  activeTeamId?: string | null;
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "cancelled" | "expired";
  inviterUserId: string;
  expiresAt: Date;
  acceptedByUserId: string | null;
  acceptedMemberId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestTeam {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestTeamMembership {
  teamId: string;
  userId: string;
  createdAt: Date;
}

export interface AuditRecord {
  action: string;
  actorId: string;
  organizationId?: string;
  targetId?: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  occurredAt: Date;
}

export interface TestState {
  sequence: number;
  sessions: TestSession[];
  organizations: TestOrganization[];
  memberships: TestMembership[];
  invitations: TestInvitation[];
  teams: TestTeam[];
  teamMemberships: TestTeamMembership[];
  activeOrganizations: Record<string, string>;
  activeTeams: Record<string, string>;
  audits: AuditRecord[];
}

export interface TestActor {
  userId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
  authenticatedAt: Date;
  activeOrganizationId?: string | null;
  activeTeamId?: string | null;
}

function initialState(now: Date): TestState {
  const hour = 60 * 60 * 1000;
  return {
    sequence: 100,
    sessions: [
      {
        id: "session-owner",
        userId: "owner",
        createdAt: now,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + hour),
        revokedAt: null,
      },
      {
        id: "session-owner-2",
        userId: "owner",
        createdAt: now,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + hour),
        revokedAt: null,
      },
      {
        id: "session-member",
        userId: "member",
        createdAt: now,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + hour),
        revokedAt: null,
      },
      {
        id: "session-outsider",
        userId: "outsider",
        createdAt: now,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + hour),
        revokedAt: null,
      },
      {
        id: "session-guest",
        userId: "guest",
        createdAt: now,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + hour),
        revokedAt: null,
      },
    ],
    organizations: [
      { id: "org-a", name: "Alpha", slug: "alpha", createdAt: now, updatedAt: now },
      { id: "org-b", name: "Beta", slug: "beta", createdAt: now, updatedAt: now },
    ],
    memberships: [
      {
        id: "membership-owner",
        organizationId: "org-a",
        userId: "owner",
        role: "owner",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "membership-member",
        organizationId: "org-a",
        userId: "member",
        role: "member",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "membership-outsider",
        organizationId: "org-b",
        userId: "outsider",
        role: "owner",
        createdAt: now,
        updatedAt: now,
      },
    ],
    invitations: [
      {
        id: "invitation-valid",
        organizationId: "org-a",
        email: "guest@example.com",
        role: "member",
        status: "pending",
        inviterUserId: "owner",
        expiresAt: new Date(now.getTime() + hour),
        acceptedByUserId: null,
        acceptedMemberId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "invitation-expired",
        organizationId: "org-a",
        email: "guest@example.com",
        role: "member",
        status: "pending",
        inviterUserId: "owner",
        expiresAt: new Date(now.getTime() - 1),
        acceptedByUserId: null,
        acceptedMemberId: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    teams: [
      {
        id: "team-a",
        organizationId: "org-a",
        name: "Engineering",
        createdAt: now,
        updatedAt: now,
      },
    ],
    teamMemberships: [{ teamId: "team-a", userId: "owner", createdAt: now }],
    activeOrganizations: {},
    activeTeams: {},
    audits: [],
  };
}

export function createIdentityHarness(now: Date, options: { kind?: "postgres" | "convex" } = {}) {
  let state = initialState(now);
  let failAudit = false;
  // Postgres SERIALIZABLE transactions and a Convex MutationCtx both present
  // one committed identity mutation at a time to this conformance model.
  let transactionTail: Promise<void> = Promise.resolve();
  const nextId = (prefix: string) => `${prefix}-${++state.sequence}`;

  const identity = {
    async listSessions(userId: string) {
      return state.sessions.filter((session) => session.userId === userId);
    },
    async getSession(sessionId: string) {
      return state.sessions.find((session) => session.id === sessionId) ?? null;
    },
    async revokeSession(input: { sessionId: string; userId: string; revokedAt: Date }) {
      const session = state.sessions.find(
        (candidate) => candidate.id === input.sessionId && candidate.userId === input.userId,
      );
      if (!session) throw new Error("session missing");
      session.revokedAt = input.revokedAt;
      return session;
    },
    async revokeOtherSessions(input: { userId: string; exceptSessionId: string; revokedAt: Date }) {
      let count = 0;
      for (const session of state.sessions) {
        if (
          session.userId === input.userId &&
          session.id !== input.exceptSessionId &&
          !session.revokedAt
        ) {
          session.revokedAt = input.revokedAt;
          count += 1;
        }
      }
      return count;
    },
    async listOrganizationsForUser(userId: string) {
      const ids = new Set(
        state.memberships
          .filter((membership) => membership.userId === userId)
          .map((membership) => membership.organizationId),
      );
      return state.organizations.filter((organization) => ids.has(organization.id));
    },
    async getOrganization(organizationId: string) {
      return state.organizations.find((organization) => organization.id === organizationId) ?? null;
    },
    async findOrganizationBySlug(slug: string) {
      return state.organizations.find((organization) => organization.slug === slug) ?? null;
    },
    async createOrganization(input: {
      name: string;
      slug: string;
      ownerUserId: string;
      createdAt: Date;
    }) {
      const organization: TestOrganization = {
        id: nextId("org"),
        name: input.name,
        slug: input.slug,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      const ownerMembership: TestMembership = {
        id: nextId("membership"),
        organizationId: organization.id,
        userId: input.ownerUserId,
        role: "owner",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      state.organizations.push(organization);
      state.memberships.push(ownerMembership);
      return { organization, ownerMembership };
    },
    async setActiveOrganization(input: {
      userId: string;
      sessionId: string;
      organizationId: string;
    }) {
      state.activeOrganizations[input.sessionId] = input.organizationId;
      delete state.activeTeams[input.sessionId];
      const session = state.sessions.find((candidate) => candidate.id === input.sessionId);
      if (session) {
        session.activeOrganizationId = input.organizationId;
        session.activeTeamId = null;
      }
    },
    async setActiveTeam(input: {
      userId: string;
      sessionId: string;
      organizationId: string;
      teamId: string;
    }) {
      state.activeOrganizations[input.sessionId] = input.organizationId;
      state.activeTeams[input.sessionId] = input.teamId;
      const session = state.sessions.find((candidate) => candidate.id === input.sessionId);
      if (session) {
        session.activeOrganizationId = input.organizationId;
        session.activeTeamId = input.teamId;
      }
    },
    async listMemberships(organizationId: string) {
      return state.memberships.filter((membership) => membership.organizationId === organizationId);
    },
    async getMembership(organizationId: string, userId: string) {
      return (
        state.memberships.find(
          (membership) =>
            membership.organizationId === organizationId && membership.userId === userId,
        ) ?? null
      );
    },
    async getMembershipById(membershipId: string) {
      return state.memberships.find((membership) => membership.id === membershipId) ?? null;
    },
    async countOwners(organizationId: string) {
      return state.memberships.filter(
        (membership) => membership.organizationId === organizationId && membership.role === "owner",
      ).length;
    },
    async updateMembershipRole(input: { membershipId: string; role: Role; updatedAt: Date }) {
      const membership = state.memberships.find((candidate) => candidate.id === input.membershipId);
      if (!membership) throw new Error("membership missing");
      membership.role = input.role;
      membership.updatedAt = input.updatedAt;
      return membership;
    },
    async removeMembership(input: { membershipId: string }) {
      const removed = state.memberships.find((membership) => membership.id === input.membershipId);
      state.memberships = state.memberships.filter(
        (membership) => membership.id !== input.membershipId,
      );
      if (removed) {
        state.teamMemberships = state.teamMemberships.filter(
          (entry) => entry.userId !== removed.userId,
        );
      }
    },
    async listInvitations(organizationId: string) {
      return state.invitations.filter((invitation) => invitation.organizationId === organizationId);
    },
    async getInvitation(invitationId: string) {
      return state.invitations.find((invitation) => invitation.id === invitationId) ?? null;
    },
    async findPendingInvitation(organizationId: string, normalizedEmail: string) {
      return (
        state.invitations.find(
          (invitation) =>
            invitation.organizationId === organizationId &&
            invitation.email === normalizedEmail &&
            invitation.status === "pending",
        ) ?? null
      );
    },
    async createInvitation(input: {
      organizationId: string;
      email: string;
      role: Role;
      inviterUserId: string;
      expiresAt: Date;
      createdAt: Date;
    }) {
      const invitation: TestInvitation = {
        id: nextId("invitation"),
        ...input,
        status: "pending",
        acceptedByUserId: null,
        acceptedMemberId: null,
        updatedAt: input.createdAt,
      };
      state.invitations.push(invitation);
      return invitation;
    },
    async expireInvitation(input: { invitationId: string; expiredAt: Date }) {
      const invitation = state.invitations.find((candidate) => candidate.id === input.invitationId);
      if (!invitation) throw new Error("invitation missing");
      invitation.status = "expired";
      invitation.updatedAt = input.expiredAt;
      return invitation;
    },
    async cancelInvitation(input: { invitationId: string; cancelledAt: Date }) {
      const invitation = state.invitations.find((candidate) => candidate.id === input.invitationId);
      if (!invitation) throw new Error("invitation missing");
      invitation.status = "cancelled";
      invitation.updatedAt = input.cancelledAt;
      return invitation;
    },
    async acceptInvitation(input: { invitationId: string; userId: string; acceptedAt: Date }) {
      const invitation = state.invitations.find((candidate) => candidate.id === input.invitationId);
      if (!invitation) throw new Error("invitation missing");
      let membership = state.memberships.find(
        (candidate) =>
          candidate.organizationId === invitation.organizationId &&
          candidate.userId === input.userId,
      );
      if (!membership) {
        membership = {
          id: nextId("membership"),
          organizationId: invitation.organizationId,
          userId: input.userId,
          role: invitation.role,
          createdAt: input.acceptedAt,
          updatedAt: input.acceptedAt,
        };
        state.memberships.push(membership);
      }
      invitation.status = "accepted";
      invitation.acceptedByUserId = input.userId;
      invitation.acceptedMemberId = membership.id;
      invitation.updatedAt = input.acceptedAt;
      return { invitation, membership };
    },
    async listTeams(organizationId: string) {
      return state.teams.filter((team) => team.organizationId === organizationId);
    },
    async getTeam(teamId: string) {
      return state.teams.find((team) => team.id === teamId) ?? null;
    },
    async findTeamByName(organizationId: string, normalizedName: string) {
      return (
        state.teams.find(
          (team) =>
            team.organizationId === organizationId &&
            team.name.toLocaleLowerCase("en-US") === normalizedName,
        ) ?? null
      );
    },
    async createTeam(input: { organizationId: string; name: string; createdAt: Date }) {
      const team: TestTeam = {
        id: nextId("team"),
        organizationId: input.organizationId,
        name: input.name,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      state.teams.push(team);
      return team;
    },
    async listTeamMemberships(teamId: string) {
      return state.teamMemberships.filter((entry) => entry.teamId === teamId);
    },
    async getTeamMembership(teamId: string, userId: string) {
      return (
        state.teamMemberships.find((entry) => entry.teamId === teamId && entry.userId === userId) ??
        null
      );
    },
    async addTeamMembership(input: { teamId: string; userId: string; createdAt: Date }) {
      const entry = {
        teamId: input.teamId,
        userId: input.userId,
        createdAt: input.createdAt,
      };
      state.teamMemberships.push(entry);
      return entry;
    },
    async removeTeamMembership(input: { teamId: string; userId: string }) {
      state.teamMemberships = state.teamMemberships.filter(
        (entry) => entry.teamId !== input.teamId || entry.userId !== input.userId,
      );
    },
  };

  const adapter = {
    kind: options.kind,
    query: identity,
    unitOfWork: {
      async run<T>(
        work: (context: {
          identity: typeof identity;
          audit: { record(event: AuditRecord): Promise<void> };
        }) => Promise<T>,
      ): Promise<T> {
        const execute = async (): Promise<T> => {
          const before = structuredClone(state);
          try {
            return await work({
              identity,
              audit: {
                async record(event) {
                  if (failAudit) throw new Error("audit unavailable");
                  state.audits.push(event);
                },
              },
            });
          } catch (error) {
            state = before;
            throw error;
          }
        };
        const result = transactionTail.then(execute, execute);
        transactionTail = result.then(
          () => undefined,
          () => undefined,
        );
        return await result;
      },
    },
  };

  return {
    adapter,
    state: () => state,
    setAuditFailure(value: boolean) {
      failAudit = value;
    },
  };
}

export function createActor(now: Date, overrides: Partial<TestActor> = {}): TestActor {
  return {
    userId: "owner",
    sessionId: "session-owner",
    email: "owner@example.com",
    emailVerified: true,
    authenticatedAt: now,
    activeOrganizationId: "org-a",
    activeTeamId: null,
    ...overrides,
  };
}
