import type { ProjectRendererPort } from "../application/ports/project-renderer.js";
import { buildGenerationPlan } from "../domain/generation/plan-builder.js";
import { assertClientSurfaceCoverage } from "../domain/generation/surface-validation.js";
import type {
  GenerationPlan,
  PlannedFileInput,
  PlannedSecretOperation,
} from "../domain/generation/types.js";
import type { ResolvedProjectConfig } from "../domain/project/config.js";
import { applyDependencySecurityResolutions } from "./dependency-security.js";

export interface AggregateGenerationPlanInput {
  readonly config: ResolvedProjectConfig;
  readonly renderers: readonly ProjectRendererPort[];
  readonly additionalFiles?: readonly PlannedFileInput[];
  readonly additionalSecrets?: readonly PlannedSecretOperation[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedRenderers(renderers: readonly ProjectRendererPort[]): ProjectRendererPort[] {
  const result = [...renderers].sort((left, right) => compareText(left.id, right.id));
  const ids = new Set<string>();
  for (const renderer of result) {
    if (!/^[a-z0-9][a-z0-9./:_-]*$/.test(renderer.id)) {
      throw new Error(`Invalid project renderer id: ${renderer.id}`);
    }
    if (ids.has(renderer.id)) {
      throw new Error(`Project renderer ${renderer.id} is registered more than once`);
    }
    ids.add(renderer.id);
  }
  return result;
}

/**
 * Aggregate renderer contributions without deduplication. The domain plan
 * builder intentionally rejects every repeated physical writer, including
 * byte-identical contributions.
 */
export function aggregateGenerationPlan(input: AggregateGenerationPlanInput): GenerationPlan {
  const files: PlannedFileInput[] = [...(input.additionalFiles ?? [])];
  const secrets: PlannedSecretOperation[] = [...(input.additionalSecrets ?? [])];
  for (const renderer of orderedRenderers(input.renderers)) {
    const contribution = renderer.render(input.config);
    files.push(...contribution.files);
    secrets.push(...contribution.secrets);
  }
  const plan = buildGenerationPlan({
    projectConfigHash: input.config.configHash,
    files: applyDependencySecurityResolutions(files, input.config.dependencySecurity),
    secrets,
  });
  assertClientSurfaceCoverage(input.config, plan);
  return plan;
}
