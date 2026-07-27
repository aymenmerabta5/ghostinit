/**
 * Dependency declaration: all imported packages must be declared in package.json.
 */

import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { getBasePackage } from "../utils.js";

/** tsconfig `paths` aliases that resolve inside the package, not to node_modules. */
function isPathAlias(imp: string): boolean {
  return imp.startsWith("@/") || imp.startsWith("~/");
}

export async function checkUndeclaredDependency(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
  pkg: PackageInfo | undefined,
  packageByDir: Map<string, PackageInfo>,
): Promise<void> {
  if (!pkg) return;
  if (imp.startsWith("node:")) return;
  if (imp === "bun:test") return;
  // `@/*` and `~/*` are tsconfig path aliases pointing back into the package's own
  // source, not npm packages. Treating them as external produced a spurious
  // "undeclared dependency @/components" on every app file that uses the alias.
  if (isPathAlias(imp)) return;
  if (!imp.startsWith("@repo/") && !imp.startsWith(".")) {
    const base = getBasePackage(imp);
    if (!pkg.dependencies.has(base) && !base.startsWith("@types/")) {
      findings.push({
        id: "undeclared-dependency",
        severity: "MEDIUM",
        message: `Package ${pkg.name} imports undeclared dependency ${base}`,
        file,
        rule: "dependency-declaration",
      });
    }
  }
  if (imp.startsWith("@repo/")) {
    const targetName = imp.split("/").slice(0, 2).join("/");
    const target = Array.from(packageByDir.values()).find((p) => p.name === targetName);
    if (target && !pkg.dependencies.has(target.name)) {
      findings.push({
        id: "undeclared-workspace-dependency",
        severity: "MEDIUM",
        message: `Package ${pkg.name} imports workspace package ${target.name} without declaring it`,
        file,
        rule: "dependency-declaration",
      });
    }
  }
}
