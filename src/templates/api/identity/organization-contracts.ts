export function identityOrganizationContractsContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
import { identityContractErrors } from "./contract-errors.js";
import {
  identityPermissionSchema,
  organizationMembershipSchema,
  organizationRoleSchema,
  organizationSchema,
} from "./schemas.js";

export const identityOrganizationContracts = {
  list: oc
    .route({ method: "GET", path: "/identity/organizations" })
    .errors(identityContractErrors)
    .input(z.object({}))
    .output(z.array(organizationSchema)),
  create: oc
    .route({ method: "POST", path: "/identity/organizations" })
    .errors(identityContractErrors)
    .input(z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i) }))
    .output(z.object({ organization: organizationSchema, created: z.boolean() })),
  setActive: oc
    .route({ method: "PUT", path: "/identity/organizations/{organizationId}/active" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1) }))
    .output(z.object({ organizationId: z.string(), changed: z.boolean() })),
  listMembers: oc
    .route({ method: "GET", path: "/identity/organizations/{organizationId}/members" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1) }))
    .output(z.array(organizationMembershipSchema)),
  changeMemberRole: oc
    .route({ method: "PATCH", path: "/identity/organizations/{organizationId}/members/{membershipId}/role" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1), membershipId: z.string().min(1), role: organizationRoleSchema }))
    .output(z.object({ value: organizationMembershipSchema, changed: z.boolean() })),
  removeMember: oc
    .route({ method: "DELETE", path: "/identity/organizations/{organizationId}/members/{membershipId}" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1), membershipId: z.string().min(1) }))
    .output(z.object({ membershipId: z.string(), changed: z.boolean() })),
  hasPermission: oc
    .route({ method: "POST", path: "/identity/organizations/{organizationId}/permissions/check" })
    .errors(identityContractErrors)
    .input(z.object({ organizationId: z.string().min(1), permission: identityPermissionSchema }))
    .output(z.object({ allowed: z.boolean() })),
};
`;
}
