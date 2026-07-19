/**
 * Private path guard: flags imports containing /private/ or /_/.
 */

import type { ArchitectureFinding } from "../types.js";

export function checkPrivatePath(findings: ArchitectureFinding[], file: string, imp: string): void {
  if (/(\/private\/|\/_\/)/.test(imp)) {
    findings.push({
      id: "private-path-import",
      severity: "MEDIUM",
      message: `Import references a private path: ${imp}`,
      file,
      rule: "private-paths",
    });
  }
}
