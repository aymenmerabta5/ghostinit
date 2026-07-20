import { ValidationError } from "../../lib/errors.js";
import { validateArtifactName } from "../../lib/reserved.js";
import {
  isValidAddonCombo as checkAddonCombo,
  type BillingProviderName,
  type DatabaseProvider,
  type ProjectMode,
  type AppName,
  type FrameworkName,
} from "../../lib/addons.js";

export { checkAddonCombo as isValidAddonCombo };

export function validateProjectName(name: string): void {
  if (!name || name.length === 0) {
    throw new ValidationError("Project name is required");
  }
  const result = validateArtifactName(name, "project name");
  if (!result.valid) {
    throw new ValidationError(result.reason);
  }
}

export function assertValidAddonCombo(opts: {
  billing: BillingProviderName[] | string[];
  database: DatabaseProvider;
  mode: ProjectMode;
  framework: FrameworkName | string;
  apps?: AppName[] | string[];
}): { valid: boolean; message?: string } {
  return checkAddonCombo({
    billing: opts.billing as BillingProviderName[],
    database: opts.database,
    mode: opts.mode,
    framework: opts.framework as FrameworkName,
    apps: opts.apps as AppName[],
  });
}
