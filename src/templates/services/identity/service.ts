import { serverOnly } from "./shared.js";

export function identityServiceContent(): string {
  return `${serverOnly}
import { createInvitationUseCases } from "./invitations.js";
import { createOrganizationUseCases } from "./organizations.js";
import { createSessionUseCases } from "./sessions.js";
import { createTeamUseCases } from "./teams.js";
import type { IdentityUseCaseDependencies } from "./application.js";

export function createIdentityService(dependencies: IdentityUseCaseDependencies) {
  return {
    sessions: createSessionUseCases(dependencies),
    organizations: createOrganizationUseCases(dependencies),
    invitations: createInvitationUseCases(dependencies),
    teams: createTeamUseCases(dependencies),
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
`;
}
