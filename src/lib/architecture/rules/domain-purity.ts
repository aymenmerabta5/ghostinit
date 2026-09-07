/**
 * Domain purity rule: domain layer must not import framework packages.
 */

import type { ArchitectureFinding } from "../types.js";
import { FRAMEWORK_PACKAGES } from "../constants.js";
import { getBasePackage } from "../utils.js";

export function checkDomainLayer(findings: ArchitectureFinding[], file: string, imp: string): void {
  if (!/\/domain\//.test(file)) return;
  if (FRAMEWORK_PACKAGES.has(imp) || FRAMEWORK_PACKAGES.has(getBasePackage(imp))) {
    findings.push({
      id: "domain-imports-framework",
      severity: "HIGH",
      message: `Domain layer imports framework package: ${imp}`,
      file,
      rule: "domain-purity",
    });
  }
}
