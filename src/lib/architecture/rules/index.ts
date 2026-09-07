/**
 * Rules barrel - re-exports all architecture rules for composer convenience.
 */
export { checkDomainLayer } from "./domain-purity.js";
export { checkApplicationLayer } from "./application-purity.js";
export { checkPrivatePath } from "./private-path.js";
export { checkDatabaseIsolation } from "./database.js";
export { checkModuleToModule } from "./module-isolation.js";
export { checkServerOnlyClient } from "./client-boundary.js";
export { checkVendorIsolation, isVendorDirectImport } from "./vendor.js";
export {
  checkCapabilityIsolation,
  getCapabilityFromPath,
  getTargetCapabilityFromImport,
} from "./capability.js";
export { checkLayeredDependency, getLayerFromFilePath, getLayerFromImport } from "./layered.js";
export {
  ALLOWED_LAYER_EDGES,
  ARCHITECTURE_POLICY_VERSION,
  isLayerEdgeAllowed,
} from "./layer-policy.js";
export type { ArchitectureLayer } from "./layer-policy.js";
export { checkUndeclaredDependency } from "./undeclared-dep.js";
export { checkDeepRelativeImport } from "./deep-relative-import.js";
export { checkMalformedGeneratedModule } from "./reserved-names.js";
export { checkWebhookStructure } from "./webhook-structure.js";
