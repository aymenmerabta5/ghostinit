export function identityContractContent(): string {
  return `import { identityInvitationContracts } from "./invitation-contracts.js";
import { identityOrganizationContracts } from "./organization-contracts.js";
import { identitySessionContracts } from "./session-contracts.js";
import { identityTeamContracts } from "./team-contracts.js";

export const identityContract = {
  sessions: identitySessionContracts,
  organizations: identityOrganizationContracts,
  invitations: identityInvitationContracts,
  teams: identityTeamContracts,
};
`;
}
