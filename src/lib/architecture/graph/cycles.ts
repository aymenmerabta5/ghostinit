/** Deterministic workspace-package cycle detection via strongly connected components. */

import { join, relative } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { normalizePath } from "../utils.js";

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function finishOrder(nodes: string[], graph: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const finished: string[] = [];

  for (const start of nodes) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: { node: string; next: number }[] = [{ node: start, next: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (!frame) break;
      const neighbors = graph.get(frame.node) ?? [];
      const neighbor = neighbors[frame.next];
      if (neighbor !== undefined) {
        frame.next += 1;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push({ node: neighbor, next: 0 });
        }
        continue;
      }
      finished.push(frame.node);
      stack.pop();
    }
  }
  return finished;
}

function stronglyConnectedComponents(nodes: string[], graph: Map<string, string[]>): string[][] {
  const reversed = new Map(nodes.map((node) => [node, [] as string[]]));
  for (const node of nodes) {
    for (const dependency of graph.get(node) ?? []) reversed.get(dependency)?.push(node);
  }
  for (const incoming of reversed.values()) incoming.sort(compareText);

  const assigned = new Set<string>();
  const components: string[][] = [];
  for (const start of finishOrder(nodes, graph).reverse()) {
    if (assigned.has(start)) continue;
    assigned.add(start);
    const component: string[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      component.push(node);
      const incoming = reversed.get(node) ?? [];
      for (let index = incoming.length - 1; index >= 0; index -= 1) {
        const dependency = incoming[index];
        if (dependency !== undefined && !assigned.has(dependency)) {
          assigned.add(dependency);
          stack.push(dependency);
        }
      }
    }
    components.push(component.sort(compareText));
  }
  return components;
}

function manifestPath(pkg: PackageInfo | undefined, root: string | undefined): string {
  if (!pkg) return "";
  const absolute = join(pkg.dir, "package.json");
  if (root) return normalizePath(relative(root, absolute) || "package.json");
  const normalized = normalizePath(absolute);
  const markerIndex = Math.max(
    normalized.lastIndexOf("/apps/"),
    normalized.lastIndexOf("/packages/"),
    normalized.lastIndexOf("/tooling/"),
  );
  return markerIndex >= 0 ? normalized.slice(markerIndex + 1) : normalized;
}

export function checkPackageCycles(
  findings: ArchitectureFinding[],
  packages: PackageInfo[],
  root?: string,
): void {
  const sortedPackages = packages
    .slice()
    .sort((left, right) => compareText(left.name, right.name) || compareText(left.dir, right.dir));
  const packageNames = new Set(sortedPackages.map(({ name }) => name));
  const packageByName = new Map<string, PackageInfo>();
  const dependencySets = new Map<string, Set<string>>();
  for (const pkg of sortedPackages) {
    if (!packageByName.has(pkg.name)) packageByName.set(pkg.name, pkg);
    const dependencies = dependencySets.get(pkg.name) ?? new Set<string>();
    for (const dependency of pkg.dependencies) {
      if (packageNames.has(dependency)) dependencies.add(dependency);
    }
    dependencySets.set(pkg.name, dependencies);
  }

  const nodes = [...packageNames].sort(compareText);
  const graph = new Map(
    nodes.map((node) => [node, [...(dependencySets.get(node) ?? [])].sort(compareText)]),
  );
  const cycles = stronglyConnectedComponents(nodes, graph)
    .filter(
      (component) =>
        component.length > 1 ||
        (component[0] !== undefined && (graph.get(component[0]) ?? []).includes(component[0])),
    )
    .sort((left, right) => compareText(left.join("\0"), right.join("\0")));

  for (const component of cycles) {
    const first = component[0];
    findings.push({
      id: "package-dependency-cycle",
      severity: "BLOCKER",
      message: `Workspace dependency cycle detected involving ${component.join(", ")}`,
      file: manifestPath(first ? packageByName.get(first) : undefined, root),
      rule: "package-cycles",
    });
  }
}
