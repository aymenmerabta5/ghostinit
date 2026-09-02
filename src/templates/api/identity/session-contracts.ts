export function identitySessionContractsContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
import { identityContractErrors } from "./contract-errors.js";
import { identitySessionSchema } from "./schemas.js";

export const identitySessionContracts = {
  list: oc
    .route({ method: "GET", path: "/identity/sessions" })
    .errors(identityContractErrors)
    .input(z.object({}))
    .output(z.array(identitySessionSchema)),
  revoke: oc
    .route({ method: "DELETE", path: "/identity/sessions/{sessionId}" })
    .errors(identityContractErrors)
    .input(z.object({ sessionId: z.string().min(1) }))
    .output(z.object({ value: identitySessionSchema, changed: z.boolean() })),
  revokeOthers: oc
    .route({ method: "POST", path: "/identity/sessions/revoke-others" })
    .errors(identityContractErrors)
    .input(z.object({}))
    .output(z.object({ revokedCount: z.number().int().nonnegative(), changed: z.boolean() })),
};
`;
}
