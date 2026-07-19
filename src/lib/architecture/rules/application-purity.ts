/**
 * Application purity rule: application layer must not import framework packages.
 */

import type { ArchitectureFinding } from "../types.js";
import { FRAMEWORK_PACKAGES } from "../constants.js";
import { getBasePackage, isFrameworkEntryPoint } from "../utils.js";

export function checkApplicationLayer(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
): void {
  if (isFrameworkEntryPoint(file)) return;
  if (!/\/application\//.test(file)) return;
  if (FRAMEWORK_PACKAGES.has(imp) || FRAMEWORK_PACKAGES.has(getBasePackage(imp))) {
    findings.push({
      id: "application-imports-framework",
      severity: "HIGH",
      message: `Application layer imports framework package: ${imp}`,
      file,
      rule: "application-purity",
    });
  }
}
