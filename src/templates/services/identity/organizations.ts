import { serverOnly } from "./shared.js";

export function identityOrganizationsContent(): string {
  return `${serverOnly}
import { IdentityDomainError } from "./errors.js";
import {
  assertCanChangeMemberRole,
  assertCanRemoveMember,
  assertIdentityActor,
  assertRolePermission,
  assertVerifiedEmail,
  hasRolePermission,
  normalizeOrganizationSlug,
} from "./policy.js";
import {
  recordIdentityAudit,
  requireOrganizationMembership,
  requireOrganizationPermission,
  runIdentityMutation,
  type IdentityUseCaseDependencies,
} from "./application.js";
import type {
  IdentityActor,
  IdentityPermission,
  MutationResult,
  Organization,
  OrganizationMembership,
  OrganizationRole,
} from "./contracts.js";

export interface CreateOrganizationInput { name: string; slug: string }
export interface ChangeMemberRoleInput {
  organizationId: string;
  membershipId: string;
  role: OrganizationRole;
}
export interface RemoveMemberInput { organizationId: string; membershipId: string }

export interface OrganizationUseCases {
  list(actor: IdentityActor): Promise<Organization[]>;
  create(actor: IdentityActor, input: CreateOrganizationInput): Promise<{ organization: Organization; created: boolean }>;
  setActive(actor: IdentityActor, organizationId: string): Promise<{ organizationId: string; changed: boolean }>;
  listMembers(actor: IdentityActor, organizationId: string): Promise<OrganizationMembership[]>;
  changeMemberRole(actor: IdentityActor, input: ChangeMemberRoleInput): Promise<MutationResult<OrganizationMembership>>;
  removeMember(actor: IdentityActor, input: RemoveMemberInput): Promise<{ membershipId: string; changed: boolean }>;
  hasPermission(actor: IdentityActor, organizationId: string, permission: IdentityPermission): Promise<boolean>;
}

export function createOrganizationUseCases(dependencies: IdentityUseCaseDependencies): OrganizationUseCases {
  const now = dependencies.now ?? (() => new Date());
  return {
    async list(actor) {
      assertIdentityActor(actor);
      return await dependencies.adapter.query.listOrganizationsForUser(actor.userId);
    },

    async create(actor, input) {
      assertVerifiedEmail(actor);
      const occurredAt = now();
      const slug = normalizeOrganizationSlug(input.slug);
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        const existing = await identity.findOrganizationBySlug(slug);
        if (existing) {
          const membership = await identity.getMembership(existing.id, actor.userId);
          if (membership) return { organization: existing, created: false };
          throw new IdentityDomainError(
            "IDENTITY_ORGANIZATION_SLUG_UNAVAILABLE",
            "The organization slug is unavailable",
          );
        }
        const created = await identity.createOrganization({
          name: input.name.trim(),
          slug,
          ownerUserId: actor.userId,
          createdAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.organization.created",
          actorId: actor.userId,
          organizationId: created.organization.id,
          targetId: created.organization.id,
          metadata: { slug: created.organization.slug },
          occurredAt,
        });
        return { organization: created.organization, created: true };
      });
    },

    async setActive(actor, organizationId) {
      assertIdentityActor(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        await requireOrganizationMembership(identity, actor, organizationId);
        const session = await identity.getSession(actor.sessionId);
        if (!session || session.revokedAt || session.expiresAt.getTime() <= occurredAt.getTime()) {
          throw new IdentityDomainError("IDENTITY_SESSION_NOT_FOUND", "An active session is required");
        }
        if (session.userId !== actor.userId) {
          throw new IdentityDomainError("IDENTITY_SESSION_FORBIDDEN", "The session does not belong to the actor");
        }
        if (actor.activeOrganizationId === organizationId) return { organizationId, changed: false };
        await identity.setActiveOrganization({
          userId: actor.userId,
          sessionId: actor.sessionId,
          organizationId,
          updatedAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.organization.activated",
          actorId: actor.userId,
          organizationId,
          targetId: actor.sessionId,
          metadata: { previousOrganizationId: actor.activeOrganizationId ?? null },
          occurredAt,
        });
        return { organizationId, changed: true };
      });
    },

    async listMembers(actor, organizationId) {
      assertIdentityActor(actor);
      await requireOrganizationPermission(dependencies.adapter.query, actor, organizationId, "member:read");
      return await dependencies.adapter.query.listMemberships(organizationId);
    },

    async changeMemberRole(actor, input) {
      assertIdentityActor(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        const actorMembership = await requireOrganizationMembership(identity, actor, input.organizationId);
        assertRolePermission(actorMembership.role, "member:write");
        const target = await identity.getMembershipById(input.membershipId);
        if (!target || target.organizationId !== input.organizationId) {
          throw new IdentityDomainError("IDENTITY_MEMBER_NOT_FOUND", "Organization member not found");
        }
        if (target.role === input.role) return { value: target, changed: false };
        const ownerCount =
          target.role === "owner" || input.role === "owner" ? await identity.countOwners(input.organizationId) : 2;
        assertCanChangeMemberRole({
          actorRole: actorMembership.role,
          targetRole: target.role,
          nextRole: input.role,
          ownerCount,
        });
        const membership = await identity.updateMembershipRole({
          membershipId: target.id,
          role: input.role,
          updatedAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.member.role_changed",
          actorId: actor.userId,
          organizationId: input.organizationId,
          targetId: target.id,
          metadata: { previousRole: target.role, role: input.role },
          occurredAt,
        });
        return { value: membership, changed: true };
      });
    },

    async removeMember(actor, input) {
      assertIdentityActor(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        const actorMembership = await requireOrganizationMembership(identity, actor, input.organizationId);
        const target = await identity.getMembershipById(input.membershipId);
        if (!target || target.organizationId !== input.organizationId) {
          throw new IdentityDomainError("IDENTITY_MEMBER_NOT_FOUND", "Organization member not found");
        }
        const ownerCount = target.role === "owner" ? await identity.countOwners(input.organizationId) : 2;
        assertCanRemoveMember({ actorRole: actorMembership.role, targetRole: target.role, ownerCount });
        await identity.removeMembership({ membershipId: target.id, removedAt: occurredAt });
        await recordIdentityAudit(audit, {
          action: "identity.member.removed",
          actorId: actor.userId,
          organizationId: input.organizationId,
          targetId: target.id,
          metadata: { role: target.role, self: target.userId === actor.userId },
          occurredAt,
        });
        return { membershipId: target.id, changed: true };
      });
    },

    async hasPermission(actor, organizationId, permission) {
      assertIdentityActor(actor);
      const membership = await dependencies.adapter.query.getMembership(organizationId, actor.userId);
      return membership ? hasRolePermission(membership.role, permission) : false;
    },
  };
}
`;
}
