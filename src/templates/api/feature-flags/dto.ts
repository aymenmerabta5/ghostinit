import type { ProjectMode } from "../../../lib/addons.js";
import { featureFlagsServiceModule } from "./shared.js";

export function featureFlagsDtoContent(mode: ProjectMode): string {
  const serviceModule = featureFlagsServiceModule(mode);
  return `import type { FeatureFlagEvaluation } from "${serviceModule}";

export function toFeatureFlagEvaluationDto(value: FeatureFlagEvaluation) {
  return { ...value, evaluatedAt: value.evaluatedAt.toISOString() };
}
`;
}
