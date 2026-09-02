export { buildGenerationPlan } from "./plan-builder.js";
export {
  assertCapabilityOperationEvidence,
  assertClientSurfaceCoverage,
} from "./surface-validation.js";
export { GENERATION_PLAN_ERROR_CODES, GenerationPlanError } from "./plan-validation.js";
export type { GenerationPlanErrorCode } from "./plan-validation.js";
export { FILE_LIFECYCLES, FILE_OWNERS, GENERATION_PLAN_SCHEMA_URI } from "./types.js";
export type {
  ExternalSecretReference,
  FileLifecycle,
  FileOwner,
  GenerationPlan,
  GenerationPlanInput,
  PlannedFile,
  PlannedFileInput,
  PlannedFileProvenance,
  PlannedFileProvenanceInput,
  PlannedSecretOperation,
  SecretDestination,
  SelfIssuedSecretOperation,
} from "./types.js";
