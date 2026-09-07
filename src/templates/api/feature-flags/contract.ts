export function featureFlagsContractContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
import { featureFlagEvaluationDtoSchema } from "./schemas.js";

const remoteKeySchema = z.string().trim().min(1).max(128);

/** These operations expose presentation rollout hints, never authorization decisions. */
export const featureFlagsContract = {
  evaluate: oc
    .route({ method: "GET", path: "/feature-flags/{key}" })
    .input(z.object({ key: remoteKeySchema }))
    .output(featureFlagEvaluationDtoSchema),
  evaluateMany: oc
    .route({ method: "POST", path: "/feature-flags/evaluate" })
    .input(z.object({ keys: z.array(remoteKeySchema).min(1).max(50) }))
    .output(z.object({ evaluations: z.array(featureFlagEvaluationDtoSchema) })),
};
`;
}
