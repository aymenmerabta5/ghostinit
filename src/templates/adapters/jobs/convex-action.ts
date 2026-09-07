export function convexJobActionContent(): string {
  return `import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const LEASE_MS = 5 * 60_000;

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown job action failure";
}

export const execute = internalAction({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const workerId = "convex-action:" + args.runId;
    const leaseToken = crypto.randomUUID();
    const claimed = await ctx.runMutation(internal.jobsInternal.claim, {
      runId: args.runId,
      workerId,
      leaseToken,
      leaseMs: LEASE_MS,
    });
    if (!claimed) return { kind: "not-claimable" as const };
    try {
      const heartbeat = async () => {
        const result = await ctx.runMutation(internal.jobsInternal.heartbeat, {
          runId: args.runId,
          workerId,
          leaseToken,
          leaseMs: LEASE_MS,
        });
        if (result.kind === "lease-lost") throw new Error("Convex job lease was lost");
        if (result.kind === "cancellation-requested") throw new Error("Convex job was cancelled");
      };
      await heartbeat();
      let result: Record<string, string | number | boolean | null>;
      switch (claimed.jobType) {
        case "system.echo":
          result = { status: "ok", echoed: JSON.stringify(claimed.payload) };
          break;
        default:
          throw new Error("No Convex action handler is registered for " + claimed.jobType);
      }
      await heartbeat();
      return await ctx.runMutation(internal.jobsInternal.succeed, {
        runId: args.runId,
        workerId,
        leaseToken,
        result,
      });
    } catch (error) {
      return await ctx.runMutation(internal.jobsInternal.fail, {
        runId: args.runId,
        workerId,
        leaseToken,
        error: failureMessage(error),
        retryable: true,
      });
    }
  },
});
`;
}
