export function identityInvitationContractsContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
import { identityContractErrors } from "./contract-errors.js";
import { organizationInvitationSchema, organizationMembershipSchema, organizationRoleSchema } from "./schemas.js";

export const identityInvitationContracts = {
  list: oc
    .route({ method: "GET", path: "/identity/organizations/{organizationId}/invitations" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1) }))
    .output(z.array(organizationInvitationSchema)),
  create: oc
    .route({ method: "POST", path: "/identity/organizations/{organizationId}/invitations" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1), email: z.string().email(), role: organizationRoleSchema }))
    .output(z.object({ invitation: organizationInvitationSchema, created: z.boolean() })),
  cancel: oc
    .route({ method: "DELETE", path: "/identity/invitations/{invitationId}" })
    .errors(identityContractErrors)
    .input(z.object({ invitationId: z.string().min(1) }))
    .output(z.object({ value: organizationInvitationSchema, changed: z.boolean() })),
  accept: oc
    .route({ method: "POST", path: "/identity/invitations/{invitationId}/accept" })
    .errors(identityContractErrors)
    .input(z.object({ invitationId: z.string().min(1) }))
    .output(z.object({ value: organizationMembershipSchema, changed: z.boolean() })),
};
`;
}
