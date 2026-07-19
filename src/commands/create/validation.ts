import { ValidationError } from "../../lib/errors.js";
import { validateArtifactName } from "../../lib/reserved.js";
import { isValidAddonCombo as checkAddonCombo } from "../../lib/addons.js";

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
  billing: string[];
  database: "postgres" | "convex" | "none";
  mode: "monorepo" | "single";
  framework: string;
}): { valid: boolean; message?: string } {
  return checkAddonCombo(opts as any);
}
