export function identityTeamContractsContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
import { identityContractErrors } from "./contract-errors.js";
import { organizationTeamSchema, teamMembershipSchema } from "./schemas.js";

const teamMembershipInput = z.object({
  organizationId: z.string().min(1),
  teamId: z.string().min(1),
  userId: z.string().min(1),
});

export const identityTeamContracts = {
  list: oc
    .route({ method: "GET", path: "/identity/organizations/{organizationId}/teams" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1) }))
    .output(z.array(organizationTeamSchema)),
  create: oc
    .route({ method: "POST", path: "/identity/organizations/{organizationId}/teams" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1), name: z.string().trim().min(1).max(100) }))
    .output(z.object({ team: organizationTeamSchema, created: z.boolean() })),
  setActive: oc
    .route({ method: "PUT", path: "/identity/organizations/{organizationId}/teams/{teamId}/active" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1), teamId: z.string().min(1) }))
    .output(z.object({ teamId: z.string(), changed: z.boolean() })),
  listMembers: oc
    .route({ method: "GET", path: "/identity/organizations/{organizationId}/teams/{teamId}/members" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1), teamId: z.string().min(1) }))
    .output(z.array(teamMembershipSchema)),
  addMember: oc
    .route({ method: "PUT", path: "/identity/organizations/{organizationId}/teams/{teamId}/members/{userId}" })
    .errors(identityContractErrors)
    .input(teamMembershipInput)
    .output(z.object({ value: teamMembershipSchema, changed: z.boolean() })),
  removeMember: oc
    .route({ method: "DELETE", path: "/identity/organizations/{organizationId}/teams/{teamId}/members/{userId}" })
    .errors(identityContractErrors)
    .input(teamMembershipInput)
    .output(z.object({ userId: z.string(), changed: z.boolean() })),
};
`;
}
