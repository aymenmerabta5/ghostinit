export function jobsSchemasContent(): string {
  return `import { z } from "zod";

export const jobRunDtoSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  scheduleId: z.string().nullable(),
  idempotencyKey: z.string(),
  state: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  payload: z.record(z.string(), z.unknown()),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  availableAt: z.iso.datetime(),
  cancellationRequestedAt: z.iso.datetime().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
`;
}
