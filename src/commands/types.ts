import type { Logger } from "../lib/logger.js";
import type {
  ProjectMode,
  BillingProviderName,
  FeatureName,
  DatabaseProvider,
  FrameworkName,
  PresetName,
  CacheProvider,
  DeployTarget,
} from "../lib/addons.js";

export interface GlobalOptions {
  cwd: string;
  json: boolean;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
  noInstall: boolean;
  runtime: "node" | "bun";
  kind?: "command" | "query";
  check?: boolean;
  ci?: boolean;
  mode?: ProjectMode;
  framework?: FrameworkName;
  billing?: BillingProviderName[];
  features?: FeatureName[];
  database?: DatabaseProvider;
  apps?: import("../lib/addons.js").AppName[];
  preset?: PresetName;
  cache?: CacheProvider;
  deploy?: DeployTarget;
  stack?: string;
  withAuth?: boolean;
  withApi?: boolean;
  withEmail?: boolean;
  withAnalytics?: boolean;
  withCache?: boolean;
  withEve?: boolean;
  withI18n?: boolean;
  withPdf?: boolean;
  withMessaging?: boolean;
  withStorage?: boolean;
  withNotifications?: boolean;
  featureFlags?: import("../lib/addons.js").FeatureFlagProvider;
  withJobs?: boolean;
  fix?: boolean;
  verbose?: boolean;
  list?: boolean;
  rawMode?: string | string[];
  rawFramework?: string | string[];
  rawBilling?: string | string[];
  rawFeatures?: string | string[];
  rawDatabase?: string | string[];
  rawApps?: string | string[];
  rawPreset?: string | string[];
  rawCache?: string | string[];
  rawDeploy?: string | string[];
  rawFeatureFlags?: string | string[];
  logger: Logger;
}

export interface CommandResult {
  exitCode: number;
}
