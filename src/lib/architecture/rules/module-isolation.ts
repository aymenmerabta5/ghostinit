/**
 * Module-to-module isolation: one module must not import another module directly.
 */

import { dirname, resolve } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { moduleFromImport, moduleFromPath } from "./module-path.js";

export function checkModuleToModule(
  findings: ArchitectureFinding[],
  file: string,
  absFile: string,
  imp: string,
  _pkg: PackageInfo | undefined,
  resolvedTarget?: string,
): void {
  const current = moduleFromPath(file);
  if (!current) return;
  const targetPath = resolvedTarget ?? (imp.startsWith(".") ? resolve(dirname(absFile), imp) : "");
  const targetName = moduleFromPath(targetPath)?.name ?? moduleFromImport(imp);
  if (!targetName || targetName === current.name) return;
  findings.push({
    id: "module-to-module-import",
    severity: "HIGH",
    message: `Module ${current.name} imports another module ${targetName}: ${imp}`,
    file,
    rule: "module-isolation",
  });
}
