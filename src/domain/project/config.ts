import type {
  CapabilityId,
  DesiredCapabilities,
  ResolvedCapabilities,
} from "../capabilities/types.js";
import type {
  AppTarget,
  DatabaseProvider,
  DeployTarget,
  ExecutionRuntime,
  PackageManagerName,
  PackageManagerVersion,
  ProjectMode,
} from "./choices.js";

export const PROJECT_CONFIG_SCHEMA_URI =
  "https://ghostinit.dev/schemas/project-config.schema.json" as const;
export const RESOLVED_PROJECT_CONFIG_SCHEMA_URI =
  "https://ghostinit.dev/schemas/resolved-project-config.schema.json" as const;

export interface ProjectPackageManager {
  readonly name: PackageManagerName;
  readonly version: PackageManagerVersion;
}

export interface DesiredProjectApp {
  readonly id: string;
  readonly target: AppTarget;
  readonly deploy: DeployTarget;
}

export interface DesiredProjectBackend {
  readonly hostApp: string;
  readonly executionRuntime: ExecutionRuntime;
  readonly database: DatabaseProvider;
}

export interface DesiredProjectConfig {
  readonly $schema: typeof PROJECT_CONFIG_SCHEMA_URI;
  readonly schemaVersion: 2;
  readonly name: string;
  readonly mode: ProjectMode;
  /**
   * Project execution preference, independent of whether a generated backend
   * capability is selected. Optional only so pre-field V2 desired files can be
   * read and normalized from their backend runtime (or Bun when backend=false).
   */
  readonly runtime?: ExecutionRuntime;
  readonly packageManager: ProjectPackageManager;
  readonly apps: readonly DesiredProjectApp[];
  readonly backend: false | DesiredProjectBackend;
  readonly capabilities: DesiredCapabilities;
}

export interface ResolvedProjectApp {
  readonly id: string;
  readonly target: AppTarget;
  readonly deploy: DeployTarget;
}

export interface ResolvedProjectBackend {
  readonly hostApp: string;
  readonly executionRuntime: ExecutionRuntime;
  readonly database: DatabaseProvider;
}

export interface ResolvedProjectConfig {
  readonly $schema: typeof RESOLVED_PROJECT_CONFIG_SCHEMA_URI;
  readonly schemaVersion: 2;
  readonly catalogVersion: 2;
  readonly configHash: string;
  readonly name: string;
  readonly mode: ProjectMode;
  readonly runtime: ExecutionRuntime;
  readonly packageManager: ProjectPackageManager;
  readonly apps: readonly ResolvedProjectApp[];
  readonly backend: false | ResolvedProjectBackend;
  readonly capabilities: ResolvedCapabilities;
  readonly enabledCapabilities: readonly CapabilityId[];
}
