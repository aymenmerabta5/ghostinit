import { serverOnly } from "./shared.js";

export function identityApplicationContent(): string {
  return `${serverOnly}
import { IdentityApplicationError, IdentityDomainError, isIdentityError } from "./errors.js";
import { assertRolePermission } from "./policy.js";
import type { IdentityActor, IdentityAuditEvent, IdentityPermission, OrganizationMembership } from "./contracts.js";
import type { IdentityAdapterPort, IdentityAuditPort, IdentityPersistencePort, IdentityUnitOfWorkContext } from "./ports.js";

export interface IdentityUseCaseDependencies {
  adapter: IdentityAdapterPort;
  now?: () => Date;
  freshSessionMaximumAgeMs?: number;
  invitationLifetimeMs?: number;
}

export const DEFAULT_FRESH_SESSION_MAXIMUM_AGE_MS = 5 * 60 * 1000;
export const DEFAULT_INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export async function runIdentityMutation<T>(
  adapter: IdentityAdapterPort,
  work: (context: IdentityUnitOfWorkContext) => Promise<T>,
): Promise<T> {
  try {
    return await adapter.unitOfWork.run(work);
  } catch (error) {
    if (isIdentityError(error)) throw error;
    throw new IdentityApplicationError("IDENTITY_PERSISTENCE_FAILED", "The identity mutation could not be committed", {
      cause: error,
    });
  }
}

export async function recordIdentityAudit(audit: IdentityAuditPort, event: IdentityAuditEvent): Promise<void> {
  try {
    await audit.record(event);
  } catch (error) {
    throw new IdentityApplicationError("IDENTITY_AUDIT_FAILED", "The identity audit event could not be committed", {
      cause: error,
      meta: { action: event.action },
    });
  }
}

export async function requireOrganizationMembership(
  identity: IdentityPersistencePort,
  actor: IdentityActor,
  organizationId: string,
): Promise<OrganizationMembership> {
  const membership = await identity.getMembership(organizationId, actor.userId);
  if (!membership) {
    throw new IdentityDomainError("IDENTITY_ORGANIZATION_FORBIDDEN", "The actor is not a member of this organization");
  }
  return membership;
}

export async function requireOrganizationPermission(
  identity: IdentityPersistencePort,
  actor: IdentityActor,
  organizationId: string,
  permission: IdentityPermission,
): Promise<OrganizationMembership> {
  const membership = await requireOrganizationMembership(identity, actor, organizationId);
  assertRolePermission(membership.role, permission);
  return membership;
}
`;
}
