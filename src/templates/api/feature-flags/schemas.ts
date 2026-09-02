export function featureFlagsSchemasContent(): string {
  return `import { z } from "zod";

export const featureFlagEvaluationDtoSchema = z.object({
  key: z.string(),
  value: z.union([z.boolean(), z.number(), z.string()]),
  variant: z.string().nullable(),
  reason: z.enum(["targeting-match", "rollout", "provider-default", "disabled"]),
  version: z.string().nullable(),
  evaluatedAt: z.iso.datetime(),
});
`;
}
