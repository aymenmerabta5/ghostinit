import { serverOnly } from "./shared.js";

export function identityInvitationsContent(): string {
  return `${serverOnly}
import { IdentityDomainError } from "./errors.js";
import { assertCanInviteRole, assertIdentityActor, assertVerifiedEmail, normalizeIdentityEmail } from "./policy.js";
import {
  DEFAULT_INVITATION_LIFETIME_MS,
  recordIdentityAudit,
  requireOrganizationMembership,
  requireOrganizationPermission,
  runIdentityMutation,
  type IdentityUseCaseDependencies,
} from "./application.js";
import type {
  IdentityActor,
  MutationResult,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationRole,
} from "./contracts.js";

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: OrganizationRole;
}

export interface InvitationUseCases {
  list(actor: IdentityActor, organizationId: string): Promise<OrganizationInvitation[]>;
  create(actor: IdentityActor, input: CreateInvitationInput): Promise<{ invitation: OrganizationInvitation; created: boolean }>;
  cancel(actor: IdentityActor, invitationId: string): Promise<MutationResult<OrganizationInvitation>>;
  accept(actor: IdentityActor, invitationId: string): Promise<MutationResult<OrganizationMembership>>;
}

export function createInvitationUseCases(dependencies: IdentityUseCaseDependencies): InvitationUseCases {
  const now = dependencies.now ?? (() => new Date());
  const invitationLifetimeMs = dependencies.invitationLifetimeMs ?? DEFAULT_INVITATION_LIFETIME_MS;
  return {
    async list(actor, organizationId) {
      assertIdentityActor(actor);
      await requireOrganizationPermission(
        dependencies.adapter.query,
        actor,
        organizationId,
        "invitation:read",
      );
      return await dependencies.adapter.query.listInvitations(organizationId);
    },

    async create(actor, input) {
      assertVerifiedEmail(actor);
      const occurredAt = now();
      const email = normalizeIdentityEmail(input.email);
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        const actorMembership = await requireOrganizationMembership(identity, actor, input.organizationId);
        assertCanInviteRole(actorMembership.role, input.role);
        const existing = await identity.findPendingInvitation(input.organizationId, email);
        if (existing && existing.expiresAt.getTime() > occurredAt.getTime()) {
          if (existing.role === input.role) return { invitation: existing, created: false };
          throw new IdentityDomainError(
            "IDENTITY_INVITATION_ALREADY_PENDING",
            "A pending invitation already exists for this address",
          );
        }
        if (existing) {
          await identity.expireInvitation({ invitationId: existing.id, expiredAt: occurredAt });
        }
        const invitation = await identity.createInvitation({
          organizationId: input.organizationId,
          email,
          role: input.role,
          inviterUserId: actor.userId,
          expiresAt: new Date(occurredAt.getTime() + invitationLifetimeMs),
          createdAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.invitation.created",
          actorId: actor.userId,
          organizationId: input.organizationId,
          targetId: invitation.id,
          metadata: { email, role: input.role },
          occurredAt,
        });
        return { invitation, created: true };
      });
    },

    async cancel(actor, invitationId) {
      assertIdentityActor(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        const invitation = await identity.getInvitation(invitationId);
        if (!invitation) {
          throw new IdentityDomainError("IDENTITY_INVITATION_NOT_FOUND", "Invitation not found");
        }
        await requireOrganizationPermission(
          identity,
          actor,
          invitation.organizationId,
          "invitation:write",
        );
        if (invitation.status === "cancelled") return { value: invitation, changed: false };
        if (invitation.status !== "pending") {
          throw new IdentityDomainError("IDENTITY_INVITATION_NOT_PENDING", "Only a pending invitation can be cancelled");
        }
        const cancelled = await identity.cancelInvitation({ invitationId, cancelledAt: occurredAt });
        await recordIdentityAudit(audit, {
          action: "identity.invitation.cancelled",
          actorId: actor.userId,
          organizationId: invitation.organizationId,
          targetId: invitation.id,
          metadata: { email: invitation.email },
          occurredAt,
        });
        return { value: cancelled, changed: true };
      });
    },

    async accept(actor, invitationId) {
      assertVerifiedEmail(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        const invitation = await identity.getInvitation(invitationId);
        if (!invitation) {
          throw new IdentityDomainError("IDENTITY_INVITATION_NOT_FOUND", "Invitation not found");
        }
        if (normalizeIdentityEmail(invitation.email) !== normalizeIdentityEmail(actor.email)) {
          throw new IdentityDomainError(
            "IDENTITY_INVITATION_EMAIL_MISMATCH",
            "The invitation belongs to a different email address",
          );
        }
        if (invitation.status === "accepted" && invitation.acceptedByUserId === actor.userId) {
          const membership = invitation.acceptedMemberId
            ? await identity.getMembershipById(invitation.acceptedMemberId)
            : await identity.getMembership(invitation.organizationId, actor.userId);
          if (!membership) {
            throw new IdentityDomainError("IDENTITY_MEMBER_NOT_FOUND", "Accepted invitation membership not found");
          }
          return { value: membership, changed: false };
        }
        if (invitation.status === "expired" || invitation.expiresAt.getTime() <= occurredAt.getTime()) {
          throw new IdentityDomainError("IDENTITY_INVITATION_EXPIRED", "The invitation has expired");
        }
        if (invitation.status !== "pending") {
          throw new IdentityDomainError("IDENTITY_INVITATION_NOT_PENDING", "The invitation is no longer pending");
        }
        const accepted = await identity.acceptInvitation({
          invitationId,
          userId: actor.userId,
          acceptedAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.invitation.accepted",
          actorId: actor.userId,
          organizationId: invitation.organizationId,
          targetId: invitation.id,
          metadata: { membershipId: accepted.membership.id, role: accepted.membership.role },
          occurredAt,
        });
        return { value: accepted.membership, changed: true };
      });
    },
  };
}
`;
}
