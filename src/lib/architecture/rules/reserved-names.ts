/**
 * Reserved names guard: modules must not use reserved folder names.
 */

import type { ArchitectureFinding } from "../types.js";
import { RESERVED_NAMES } from "../constants.js";
import { moduleFromPath } from "./module-path.js";

export async function checkMalformedGeneratedModule(
  findings: ArchitectureFinding[],
  relFile: string,
): Promise<void> {
  const moduleName = moduleFromPath(relFile)?.name;
  if (!moduleName) return;
  if (RESERVED_NAMES.has(moduleName)) {
    findings.push({
      id: "reserved-module-name",
      severity: "BLOCKER",
      message: `Module uses reserved name: ${moduleName}`,
      file: relFile,
      rule: "reserved-names",
    });
  }
}
