export function featureFlagsActionsContent(): string {
  return `import { createServiceORPCError } from "../utils/service-error.js";
import {
  requireFeatureFlagSubject,
  type FeatureFlagsTransportContext,
  type ResolveFeatureFlagService,
} from "./context.js";
import { toFeatureFlagEvaluationDto } from "./dto.js";

const featureFlagErrorCodeMap = {
  FEATURE_FLAG_SUBJECT_REQUIRED: "BAD_REQUEST",
  FEATURE_FLAG_INVALID_KEY: "BAD_REQUEST",
  FEATURE_FLAG_STATIC_CONFIG_FORBIDDEN: "BAD_REQUEST",
  FEATURE_FLAG_NOT_FOUND: "NOT_FOUND",
  FEATURE_FLAG_PROVIDER_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION: "INTERNAL_SERVER_ERROR",
} as const;

async function invokeFeatureFlags<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: featureFlagErrorCodeMap,
      fallbackMessage: "Remote feature-flag evaluation failed",
    });
  }
}

type Call<TContext, TInput> = { context: TContext; input: TInput };

export function createFeatureFlagActions<TContext extends FeatureFlagsTransportContext>(
  resolveService: ResolveFeatureFlagService<TContext>,
) {
  return {
    evaluate: async ({ context, input }: Call<TContext, { key: string }>) =>
      await invokeFeatureFlags(async () =>
        toFeatureFlagEvaluationDto(
          await (await resolveService(context)).evaluate(requireFeatureFlagSubject(context), input.key),
        ),
      ),
    evaluateMany: async ({ context, input }: Call<TContext, { keys: string[] }>) =>
      await invokeFeatureFlags(async () => ({
        evaluations: (
          await (await resolveService(context)).evaluateMany(
            requireFeatureFlagSubject(context),
            input.keys,
          )
        ).map(toFeatureFlagEvaluationDto),
      })),
  };
}
`;
}
