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
export { checkUndeclaredDependency } from "./undeclared-dep.js";
export { checkMalformedGeneratedModule } from "./reserved-names.js";
