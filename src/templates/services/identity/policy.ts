import { serverOnly } from "./shared.js";

export function identityPolicyContent(): string {
  return `${serverOnly}
import { IdentityDomainError } from "./errors.js";
import type { IdentityActor, IdentityPermission, OrganizationRole } from "./contracts.js";

const ROLE_PERMISSIONS: Readonly<Record<OrganizationRole, ReadonlySet<IdentityPermission>>> = {
  owner: new Set([
    "organization:read", "organization:write", "member:read", "member:write",
    "invitation:read", "invitation:write", "team:read", "team:write",
  ]),
  admin: new Set([
    "organization:read", "member:read", "member:write",
    "invitation:read", "invitation:write", "team:read", "team:write",
  ]),
  member: new Set(["organization:read", "member:read", "team:read"]),
};

export function normalizeIdentityEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function normalizeOrganizationSlug(slug: string): string {
  return slug.trim().toLocaleLowerCase("en-US");
}

export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\\s+/g, " ").toLocaleLowerCase("en-US");
}

export function assertIdentityActor(actor: IdentityActor): void {
  if (!actor.userId || !actor.sessionId || !actor.email) {
    throw new IdentityDomainError("IDENTITY_UNAUTHENTICATED", "A complete authenticated actor is required");
  }
}

export function assertVerifiedEmail(actor: IdentityActor): void {
  assertIdentityActor(actor);
  if (!actor.emailVerified) {
    throw new IdentityDomainError("IDENTITY_EMAIL_NOT_VERIFIED", "A verified email address is required");
  }
}

export function assertFreshSession(actor: IdentityActor, now: Date, maximumAgeMs: number): void {
  assertIdentityActor(actor);
  const ageMs = now.getTime() - actor.authenticatedAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maximumAgeMs) {
    throw new IdentityDomainError("IDENTITY_SESSION_NOT_FRESH", "Recent authentication is required");
  }
}

export function hasRolePermission(role: OrganizationRole, permission: IdentityPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertRolePermission(role: OrganizationRole, permission: IdentityPermission): void {
  if (!hasRolePermission(role, permission)) {
    throw new IdentityDomainError("IDENTITY_ORGANIZATION_FORBIDDEN", "The active member lacks the required permission", {
      meta: { permission, role },
    });
  }
}

export function assertCanChangeMemberRole(input: {
  actorRole: OrganizationRole;
  targetRole: OrganizationRole;
  nextRole: OrganizationRole;
  ownerCount: number;
}): void {
  assertRolePermission(input.actorRole, "member:write");
  if ((input.targetRole === "owner" || input.nextRole === "owner") && input.actorRole !== "owner") {
    throw new IdentityDomainError("IDENTITY_MEMBER_FORBIDDEN", "Only an owner can change owner membership");
  }
  if (input.targetRole === "owner" && input.nextRole !== "owner" && input.ownerCount <= 1) {
    throw new IdentityDomainError("IDENTITY_LAST_OWNER", "The final owner cannot be demoted");
  }
}

export function assertCanRemoveMember(input: {
  actorRole: OrganizationRole;
  targetRole: OrganizationRole;
  ownerCount: number;
}): void {
  assertRolePermission(input.actorRole, "member:write");
  if (input.targetRole === "owner" && input.actorRole !== "owner") {
    throw new IdentityDomainError("IDENTITY_MEMBER_FORBIDDEN", "Only an owner can remove an owner");
  }
  if (input.targetRole === "owner" && input.ownerCount <= 1) {
    throw new IdentityDomainError("IDENTITY_LAST_OWNER", "The final owner cannot be removed");
  }
}

export function assertCanInviteRole(actorRole: OrganizationRole, invitedRole: OrganizationRole): void {
  assertRolePermission(actorRole, "invitation:write");
  if (invitedRole === "owner" && actorRole !== "owner") {
    throw new IdentityDomainError("IDENTITY_MEMBER_FORBIDDEN", "Only an owner can invite another owner");
  }
}
`;
}
