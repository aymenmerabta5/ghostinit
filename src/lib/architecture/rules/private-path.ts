/**
 * Private path guard: flags imports containing /private/ or /_/.
 */

import type { ArchitectureFinding } from "../types.js";

export function checkPrivatePath(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
  resolvedTarget?: string,
): void {
  if (/(\/private\/|\/_\/)/.test(imp) || /(\/private\/|\/_\/)/.test(resolvedTarget ?? "")) {
    findings.push({
      id: "private-path-import",
      severity: "MEDIUM",
      message: `Import references a private path: ${imp}`,
      file,
      rule: "private-paths",
    });
  }
}
