/**
 * Package dependency cycle detection.
 * Single responsibility: DFS cycle check over @repo/* workspace deps.
 */

import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { normalizePath } from "../utils.js";

export function checkPackageCycles(findings: ArchitectureFinding[], packages: PackageInfo[]): void {
  const graph = new Map<string, Set<string>>();
  const pkgByName = new Map<string, PackageInfo>();
  for (const pkg of packages) {
    graph.set(
      pkg.name,
      new Set(Array.from(pkg.dependencies).filter((d) => d.startsWith("@repo/"))),
    );
    pkgByName.set(pkg.name, pkg);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | undefined {
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (!visited.has(dep)) {
        const cycle = dfs(dep);
        if (cycle) return cycle;
      } else if (stack.has(dep)) {
        const start = path.indexOf(dep);
        return path.slice(start).concat(dep);
      }
    }
    path.pop();
    stack.delete(node);
    return undefined;
  }

  for (const pkg of packages) {
    if (!visited.has(pkg.name)) {
      const cycle = dfs(pkg.name);
      if (cycle) {
        const involved = Array.from(new Set(cycle)).sort().join(", ");
        const affectedPkg = pkgByName.get(cycle[0]);
        findings.push({
          id: "package-dependency-cycle",
          severity: "BLOCKER",
          message: `Workspace dependency cycle detected involving ${involved}`,
          file: affectedPkg ? normalizePath(`${affectedPkg.dir}/package.json`) : "",
          rule: "package-cycles",
        });
      }
    }
  }
}
