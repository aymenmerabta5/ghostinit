/**
 * Module-to-module isolation: one module must not import another module directly.
 */

import { dirname, resolve } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { normalizePath } from "../utils.js";

export function checkModuleToModule(
  findings: ArchitectureFinding[],
  file: string,
  absFile: string,
  imp: string,
  pkg: PackageInfo | undefined,
  resolvedTarget?: string,
): void {
  if (!pkg || !file.includes("/modules/")) return;
  const moduleMatch = /\/modules\/src\/([a-z0-9-]+)\//.exec(file);
  if (!moduleMatch) return;
  const currentModule = moduleMatch[1];
  if (imp.startsWith("@repo/modules")) {
    const targetMatch = /\/modules\/([a-z0-9-]+)\//.exec(imp);
    if (targetMatch && targetMatch[1] !== currentModule) {
      findings.push({
        id: "module-to-module-import",
        severity: "HIGH",
        message: `Module ${currentModule} imports another module ${targetMatch[1]}: ${imp}`,
        file,
        rule: "module-isolation",
      });
    }
  }
  if (imp.startsWith(".")) {
    const resolved = resolve(dirname(absFile), imp);
    const normalized = normalizePath(resolved);
    const targetMatch = /\/packages\/modules\/src\/([a-z0-9-]+)\//.exec(normalized);
    if (targetMatch && targetMatch[1] !== currentModule) {
      findings.push({
        id: "module-to-module-import",
        severity: "HIGH",
        message: `Module ${currentModule} imports another module ${targetMatch[1]}: ${imp}`,
        file,
        rule: "module-isolation",
      });
    }
  }
  if (resolvedTarget) {
    const targetMatch = /(?:^|\/)packages\/modules\/src\/([a-z0-9-]+)(?:\/|$)/.exec(
      resolvedTarget.replace(/\\/g, "/"),
    );
    if (targetMatch && targetMatch[1] !== currentModule) {
      findings.push({
        id: "module-to-module-import",
        severity: "HIGH",
        message: `Module ${currentModule} imports another module ${targetMatch[1]}: ${imp}`,
        file,
        rule: "module-isolation",
      });
    }
  }
}
