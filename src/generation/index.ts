export { aggregateGenerationPlan } from "./aggregate.js";
export type { AggregateGenerationPlanInput } from "./aggregate.js";
export { emitLegacyTemplateTarget } from "./legacy-template-adapter.js";
export type { LegacyTemplateTarget } from "./legacy-template-adapter.js";
export {
  CORE_RENDER_ACCEPTANCE_ID,
  LegacyRendererCompatibilityError,
  RESOLVED_TEMPLATE_COMPILER_BRIDGE,
  RESOLVED_TEMPLATE_RENDERER_ID,
  compileLegacyTemplateTarget,
  resolvedTemplateRenderer,
  resolvedToLegacyRenderConfig,
} from "./resolved-template-compiler.js";
export { projectRendererRegistry } from "./renderer-registry.js";
export {
  canonicalizeGenerationPlan,
  formatGenerationText,
  generationPlanFormatter,
  GenerationPlanFormatError,
  isGenerationFormatPath,
} from "./plan-formatter.js";
export type { GenerationTextFormatter } from "./plan-formatter.js";
export { FileSecretMaterializer } from "./secret-materializer.js";
export type { SecretEntropy } from "./secret-materializer.js";
