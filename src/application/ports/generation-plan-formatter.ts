import type { GenerationPlan } from "../../domain/generation/types.js";

/** Pure text-normalization boundary shared by create, sync, and upgrade. */
export interface GenerationPlanFormatterPort {
  format(plan: GenerationPlan): Promise<GenerationPlan>;
}
