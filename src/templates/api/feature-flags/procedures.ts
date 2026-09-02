export function featureFlagsProceduresContent(): string {
  return `import { implement } from "@orpc/server";
import { createFeatureFlagActions } from "./actions.js";
import { featureFlagsContract } from "./contract.js";
import type { FeatureFlagsTransportContext, ResolveFeatureFlagService } from "./context.js";

export function createFeatureFlagProcedures<TContext extends FeatureFlagsTransportContext>(
  resolveService: ResolveFeatureFlagService<TContext>,
) {
  const implementer = implement<typeof featureFlagsContract, TContext>(featureFlagsContract);
  const actions = createFeatureFlagActions(resolveService);
  return {
    evaluate: implementer.evaluate.handler(actions.evaluate),
    evaluateMany: implementer.evaluateMany.handler(actions.evaluateMany),
  };
}

export type FeatureFlagProcedures<TContext extends FeatureFlagsTransportContext> = ReturnType<
  typeof createFeatureFlagProcedures<TContext>
>;
`;
}
