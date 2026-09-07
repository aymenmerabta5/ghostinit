import type { ProjectMode } from "../../../lib/addons.js";
import { identityServiceModule } from "./shared.js";

export function identityDtoContent(mode: ProjectMode): string {
  const serviceModule = identityServiceModule(mode);
  return `import type {
  IdentitySession,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationTeam,
  TeamMembership,
} from "${serviceModule}";

export function toIdentitySessionDto(value: IdentitySession) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    authenticatedAt: value.authenticatedAt.toISOString(),
    expiresAt: value.expiresAt.toISOString(),
    revokedAt: value.revokedAt?.toISOString() ?? null,
    activeOrganizationId: value.activeOrganizationId ?? null,
    activeTeamId: value.activeTeamId ?? null,
  };
}

export function toOrganizationDto(value: Organization) {
  return { ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() };
}

export function toOrganizationMembershipDto(value: OrganizationMembership) {
  return { ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() };
}

export function toOrganizationInvitationDto(value: OrganizationInvitation) {
  return {
    ...value,
    expiresAt: value.expiresAt.toISOString(),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

export function toOrganizationTeamDto(value: OrganizationTeam) {
  return { ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() };
}

export function toTeamMembershipDto(value: TeamMembership) {
  return { ...value, createdAt: value.createdAt.toISOString() };
}
`;
}
