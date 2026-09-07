import type { ProjectMode } from "../../../lib/addons.js";
import { featureFlagsServiceModule } from "./shared.js";

export function featureFlagsContextContent(mode: ProjectMode): string {
  const serviceModule = featureFlagsServiceModule(mode);
  return `import { FeatureFlagError } from "${serviceModule}";
import type { FeatureFlagService, FeatureFlagSubject } from "${serviceModule}";

export interface FeatureFlagsTransportContext {
  /** Server-derived user ID or trusted anonymous ID; never accept it from operation input. */
  featureFlagSubject?: FeatureFlagSubject | null;
}

export type ResolveFeatureFlagService<TContext extends FeatureFlagsTransportContext> = (
  context: TContext,
) => FeatureFlagService | Promise<FeatureFlagService>;

export function requireFeatureFlagSubject(context: FeatureFlagsTransportContext): FeatureFlagSubject {
  if (!context.featureFlagSubject) {
    throw new FeatureFlagError("FEATURE_FLAG_SUBJECT_REQUIRED", "A stable evaluation subject is required");
  }
  return context.featureFlagSubject;
}
`;
}
