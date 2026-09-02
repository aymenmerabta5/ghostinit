/**
 * Application purity rule: application layer must not import framework packages.
 */

import type { ArchitectureFinding } from "../types.js";
import { FRAMEWORK_PACKAGES } from "../constants.js";
import { getBasePackage, isRequestApplicationCompositionRoot } from "../utils.js";

export function checkApplicationLayer(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
): void {
  if (!/\/application\//.test(file)) return;
  const base = getBasePackage(imp);
  const requestCompositionRoot = isRequestApplicationCompositionRoot(file);
  // Concrete request composition may use persistence drivers, while the facade
  // and facade remain framework-neutral. HTTP/RPC and UI frameworks are never
  // admitted here.
  if (requestCompositionRoot && new Set(["drizzle-orm", "pg"]).has(base)) return;
  if (FRAMEWORK_PACKAGES.has(imp) || FRAMEWORK_PACKAGES.has(base)) {
    findings.push({
      id: "application-imports-framework",
      severity: "HIGH",
      message: `Application layer imports framework package: ${imp}`,
      file,
      rule: "application-purity",
    });
  }
}
