export {
  APP_TARGETS,
  BILLING_PROVIDERS,
  CACHE_PROVIDERS,
  DATABASE_PROVIDERS,
  DEPLOY_TARGETS,
  EXECUTION_RUNTIMES,
  FEATURE_FLAG_PROVIDERS,
  PACKAGE_MANAGERS,
  PROJECT_MODES,
  SERVER_APP_TARGETS,
} from "./choices.js";
export type {
  AppTarget,
  BillingProvider,
  CacheProvider,
  DatabaseProvider,
  DeployTarget,
  ExecutionRuntime,
  FeatureFlagProvider,
  PackageManagerName,
  PackageManagerVersion,
  ProjectMode,
  ServerAppTarget,
} from "./choices.js";
export { canonicalHash, canonicalJson, deepFreeze, sha256 } from "./canonical.js";
export { PROJECT_CONFIG_SCHEMA_URI, RESOLVED_PROJECT_CONFIG_SCHEMA_URI } from "./config.js";
export type {
  DesiredProjectApp,
  DesiredProjectBackend,
  DesiredProjectConfig,
  ProjectPackageManager,
  ResolvedProjectApp,
  ResolvedProjectBackend,
  ResolvedProjectConfig,
} from "./config.js";
export { resolveProjectConfig } from "./resolve.js";
export { RESOLUTION_ISSUE_CODES } from "./resolution-issues.js";
export type {
  ResolutionFailure,
  ResolutionIssue,
  ResolutionIssueCode,
  ResolutionIssueSeverity,
  ResolutionResult,
  ResolutionSuccess,
} from "./resolution-issues.js";
