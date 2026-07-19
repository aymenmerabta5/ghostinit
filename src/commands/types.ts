import type { Logger } from "../lib/logger.js";
import type {
  ProjectMode,
  BillingProviderName,
  FeatureName,
  DatabaseProvider,
  FrameworkName,
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
  rawMode?: string | string[];
  rawFramework?: string | string[];
  rawBilling?: string | string[];
  rawFeatures?: string | string[];
  rawDatabase?: string | string[];
  logger: Logger;
}

export interface CommandResult {
  exitCode: number;
}
