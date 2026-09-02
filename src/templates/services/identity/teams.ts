import { serverOnly } from "./shared.js";

export function identityTeamsContent(): string {
  return `${serverOnly}
import { IdentityDomainError } from "./errors.js";
import { assertIdentityActor, normalizeTeamName } from "./policy.js";
import {
  recordIdentityAudit,
  requireOrganizationPermission,
  runIdentityMutation,
  type IdentityUseCaseDependencies,
} from "./application.js";
import type {
  IdentityActor,
  MutationResult,
  OrganizationTeam,
  TeamMembership,
} from "./contracts.js";

export interface TeamMembershipInput {
  organizationId: string;
  teamId: string;
  userId: string;
}

export interface TeamUseCases {
  list(actor: IdentityActor, organizationId: string): Promise<OrganizationTeam[]>;
  create(actor: IdentityActor, organizationId: string, name: string): Promise<{ team: OrganizationTeam; created: boolean }>;
  setActive(actor: IdentityActor, organizationId: string, teamId: string): Promise<{ teamId: string; changed: boolean }>;
  listMembers(actor: IdentityActor, organizationId: string, teamId: string): Promise<TeamMembership[]>;
  addMember(actor: IdentityActor, input: TeamMembershipInput): Promise<MutationResult<TeamMembership>>;
  removeMember(actor: IdentityActor, input: TeamMembershipInput): Promise<{ userId: string; changed: boolean }>;
}

async function requireTeam(
  identity: import("./ports.js").IdentityPersistencePort,
  teamId: string,
  organizationId: string,
): Promise<OrganizationTeam> {
  const team = await identity.getTeam(teamId);
  if (!team || team.organizationId !== organizationId) {
    throw new IdentityDomainError("IDENTITY_TEAM_NOT_FOUND", "Organization team not found");
  }
  return team;
}

export function createTeamUseCases(dependencies: IdentityUseCaseDependencies): TeamUseCases {
  const now = dependencies.now ?? (() => new Date());
  return {
    async list(actor, organizationId) {
      assertIdentityActor(actor);
      await requireOrganizationPermission(dependencies.adapter.query, actor, organizationId, "team:read");
      return await dependencies.adapter.query.listTeams(organizationId);
    },

    async create(actor, organizationId, name) {
      assertIdentityActor(actor);
      const occurredAt = now();
      const normalizedName = normalizeTeamName(name);
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        await requireOrganizationPermission(identity, actor, organizationId, "team:write");
        const existing = await identity.findTeamByName(organizationId, normalizedName);
        if (existing) return { team: existing, created: false };
        const team = await identity.createTeam({
          organizationId,
          name: name.trim().replace(/\\s+/g, " "),
          createdAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.team.created",
          actorId: actor.userId,
          organizationId,
          targetId: team.id,
          metadata: { name: team.name },
          occurredAt,
        });
        return { team, created: true };
      });
    },

    async setActive(actor, organizationId, teamId) {
      assertIdentityActor(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        await requireOrganizationPermission(identity, actor, organizationId, "team:read");
        await requireTeam(identity, teamId, organizationId);
        const teamMembership = await identity.getTeamMembership(teamId, actor.userId);
        if (!teamMembership) {
          throw new IdentityDomainError(
            "IDENTITY_ORGANIZATION_FORBIDDEN",
            "The actor is not a member of this team",
          );
        }
        const session = await identity.getSession(actor.sessionId);
        if (!session || session.revokedAt || session.expiresAt.getTime() <= occurredAt.getTime()) {
          throw new IdentityDomainError("IDENTITY_SESSION_NOT_FOUND", "An active session is required");
        }
        if (session.userId !== actor.userId) {
          throw new IdentityDomainError("IDENTITY_SESSION_FORBIDDEN", "The session does not belong to the actor");
        }
        if (actor.activeOrganizationId === organizationId && actor.activeTeamId === teamId) {
          return { teamId, changed: false };
        }
        await identity.setActiveTeam({
          userId: actor.userId,
          sessionId: actor.sessionId,
          organizationId,
          teamId,
          updatedAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.team.activated",
          actorId: actor.userId,
          organizationId,
          targetId: teamId,
          metadata: { previousTeamId: actor.activeTeamId ?? null },
          occurredAt,
        });
        return { teamId, changed: true };
      });
    },

    async listMembers(actor, organizationId, teamId) {
      assertIdentityActor(actor);
      await requireOrganizationPermission(dependencies.adapter.query, actor, organizationId, "team:read");
      await requireTeam(dependencies.adapter.query, teamId, organizationId);
      return await dependencies.adapter.query.listTeamMemberships(teamId);
    },

    async addMember(actor, input) {
      assertIdentityActor(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        await requireOrganizationPermission(identity, actor, input.organizationId, "team:write");
        await requireTeam(identity, input.teamId, input.organizationId);
        const target = await identity.getMembership(input.organizationId, input.userId);
        if (!target) {
          throw new IdentityDomainError("IDENTITY_MEMBER_NOT_FOUND", "Organization member not found");
        }
        const existing = await identity.getTeamMembership(input.teamId, input.userId);
        if (existing) return { value: existing, changed: false };
        const teamMembership = await identity.addTeamMembership({
          teamId: input.teamId,
          userId: input.userId,
          createdAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.team.member_added",
          actorId: actor.userId,
          organizationId: input.organizationId,
          targetId: input.userId,
          metadata: { teamId: input.teamId },
          occurredAt,
        });
        return { value: teamMembership, changed: true };
      });
    },

    async removeMember(actor, input) {
      assertIdentityActor(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        await requireOrganizationPermission(identity, actor, input.organizationId, "team:write");
        await requireTeam(identity, input.teamId, input.organizationId);
        const target = await identity.getMembership(input.organizationId, input.userId);
        if (!target) {
          throw new IdentityDomainError("IDENTITY_MEMBER_NOT_FOUND", "Organization member not found");
        }
        const existing = await identity.getTeamMembership(input.teamId, input.userId);
        if (!existing) return { userId: input.userId, changed: false };
        await identity.removeTeamMembership({
          teamId: input.teamId,
          userId: input.userId,
          removedAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.team.member_removed",
          actorId: actor.userId,
          organizationId: input.organizationId,
          targetId: input.userId,
          metadata: { teamId: input.teamId },
          occurredAt,
        });
        return { userId: input.userId, changed: true };
      });
    },
  };
}
`;
}
