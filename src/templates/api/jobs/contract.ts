export function jobsContractContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
import { jobRunDtoSchema } from "./schemas.js";

export const jobsContract = {
  enqueue: oc
    .route({ method: "POST", path: "/jobs/runs" })
    .input(z.object({
      jobId: z.string().min(1).max(128),
      requestKey: z.string().trim().min(1).max(200),
      payload: z.record(z.string(), z.unknown()).optional(),
      maxAttempts: z.number().int().min(1).max(25).optional(),
    }))
    .output(z.object({ run: jobRunDtoSchema, created: z.boolean() })),
  getRun: oc
    .route({ method: "GET", path: "/jobs/runs/{runId}" })
    .input(z.object({ runId: z.string().min(1).max(128) }))
    .output(jobRunDtoSchema),
  cancelRun: oc
    .route({ method: "POST", path: "/jobs/runs/{runId}/cancel" })
    .input(z.object({ runId: z.string().min(1).max(128) }))
    .output(z.object({ run: jobRunDtoSchema, changed: z.boolean() })),
};
`;
}
