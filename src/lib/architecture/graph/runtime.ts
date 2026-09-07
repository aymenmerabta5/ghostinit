/** Cycle-safe client-to-server runtime dependency taint analysis. */

import type { ImportKind } from "../types.js";

export interface RuntimeGraphNode {
  id: string;
  file?: string;
  directives?: ReadonlySet<string> | readonly string[];
  /** A syntactically valid React use-server action module. */
  serverAction?: boolean;
  /** A framework RPC reference whose implementation executes only on the server. */
  serverReferenceBoundary?: boolean;
  client?: boolean;
  server?: boolean;
  serverOnly?: boolean;
  builtin?: boolean;
}

export interface RuntimeGraphEdge {
  from: string;
  to: string;
  kind: ImportKind;
  typeOnly: boolean;
  /** False for metadata-only relationships that cannot load code at runtime. */
  runtime?: boolean;
  specifier?: string;
  /** Marks the target as a server-only module, including unresolved modules. */
  serverOnly?: boolean;
  /** Marks the target as a runtime builtin, including unresolved builtins. */
  builtin?: boolean;
}

export interface RuntimeTaintFinding {
  client: string;
  server: string;
  trace: string[];
  /** Ordered runtime edges corresponding to adjacent trace entries. */
  edges: RuntimeGraphEdge[];
}

export interface RuntimeGraphResult {
  clientSeeds: string[];
  serverSeeds: string[];
  /** At most one deterministic shortest server trace for each client seed. */
  findings: RuntimeTaintFinding[];
}

interface ParentStep {
  from: string;
  edge: RuntimeGraphEdge;
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function compareEdges(left: RuntimeGraphEdge, right: RuntimeGraphEdge): number {
  return (
    compareText(left.from, right.from) ||
    compareText(left.to, right.to) ||
    compareText(left.specifier ?? "", right.specifier ?? "") ||
    compareText(left.kind, right.kind) ||
    Number(left.typeOnly) - Number(right.typeOnly) ||
    Number(left.runtime === false) - Number(right.runtime === false)
  );
}

function hasDirective(node: RuntimeGraphNode, directive: string): boolean {
  for (const candidate of node.directives ?? []) {
    if (candidate === directive) return true;
  }
  return false;
}

function nodePath(node: RuntimeGraphNode): string {
  const path = node.file ?? (/[/\\]/.test(node.id) ? node.id : "");
  return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function isClientPath(path: string): boolean {
  if (/(?:^|\/)(?:tests?|e2e)(?:\/|$)/.test(path)) return false;
  return (
    /(?:^|\/)(?:apps\/mobile|expo|mobile)(?:\/|$)/.test(path) ||
    /(?:^|\/)(?:apps\/)?desktop\/(?:src\/)?renderer(?:\/|$)/.test(path)
  );
}

function isServerPath(path: string): boolean {
  return (
    /(?:^|\/)(?:server|backend|convex|eve)(?:\/|$)/.test(path) ||
    /(?:^|\/)packages\/api(?:\/|$)/.test(path) ||
    /(?:^|\/)(?:app|routes)\/api(?:\/|$)/.test(path) ||
    /(?:^|\/)apps\/desktop\/src\/(?:main|preload)(?:\/|$)/.test(path) ||
    /\.server\.[cm]?[jt]sx?$/.test(path)
  );
}

function isClientSeed(node: RuntimeGraphNode): boolean {
  return node.client === true || hasDirective(node, "use client") || isClientPath(nodePath(node));
}

function isServerSeed(node: RuntimeGraphNode): boolean {
  return (
    node.server === true ||
    node.serverOnly === true ||
    node.builtin === true ||
    hasDirective(node, "use server") ||
    isServerPath(nodePath(node))
  );
}

export function isRuntimeEdge(edge: RuntimeGraphEdge): boolean {
  return !edge.typeOnly && edge.runtime !== false;
}

function reconstructTrace(
  client: string,
  server: string,
  parents: Map<string, ParentStep>,
): { trace: string[]; edges: RuntimeGraphEdge[] } | undefined {
  const trace = [server];
  const edges: RuntimeGraphEdge[] = [];
  let current = server;
  while (current !== client) {
    const step = parents.get(current);
    if (!step) return undefined;
    trace.push(step.from);
    edges.push(step.edge);
    current = step.from;
  }
  trace.reverse();
  edges.reverse();
  return { trace, edges };
}

function walkRuntimeEdges(
  client: string,
  adjacency: Map<string, RuntimeGraphEdge[]>,
): Map<string, ParentStep> {
  const parents = new Map<string, ParentStep>();
  const visited = new Set([client]);
  const queue = [client];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const from = queue[cursor];
    if (from === undefined) continue;
    for (const edge of adjacency.get(from) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      parents.set(edge.to, { from, edge });
      queue.push(edge.to);
    }
  }
  return parents;
}

export function analyzeRuntimeGraph(
  nodes: readonly RuntimeGraphNode[],
  edges: readonly RuntimeGraphEdge[],
): RuntimeGraphResult {
  const recordsById = new Map<string, RuntimeGraphNode[]>();
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    nodeIds.add(node.id);
    const records = recordsById.get(node.id) ?? [];
    records.push(node);
    recordsById.set(node.id, records);
  }
  for (const edge of edges) {
    nodeIds.add(edge.from);
    nodeIds.add(edge.to);
  }

  const clientSeedSet = new Set<string>();
  const serverSeedSet = new Set<string>();
  for (const [id, records] of recordsById) {
    if (records.some(isClientSeed)) clientSeedSet.add(id);
    if (records.some(isServerSeed)) serverSeedSet.add(id);
  }
  for (const edge of edges) {
    if (edge.serverOnly || edge.builtin) serverSeedSet.add(edge.to);
  }

  // A Client Component importing a `use server` module receives a framework
  // reference to the action, not the server module's runtime graph. Stop taint
  // traversal at that explicit React boundary while retaining the action as a
  // server seed for diagnostics originating on the server side.
  const runtimeEdges = edges
    .filter(
      (edge) =>
        isRuntimeEdge(edge) &&
        !recordsById
          .get(edge.to)
          ?.some((node) => node.serverAction === true || node.serverReferenceBoundary === true),
    )
    .slice()
    .sort(compareEdges);
  const adjacency = new Map([...nodeIds].map((id) => [id, [] as RuntimeGraphEdge[]]));
  for (const edge of runtimeEdges) adjacency.get(edge.from)?.push(edge);

  const clientSeeds = [...clientSeedSet].sort(compareText);
  const serverSeeds = [...serverSeedSet].sort(compareText);
  const findings: RuntimeTaintFinding[] = [];
  for (const client of clientSeeds) {
    const parents = walkRuntimeEdges(client, adjacency);
    const candidates: RuntimeTaintFinding[] = [];
    for (const server of serverSeeds) {
      if (server !== client && !parents.has(server)) continue;
      const path = reconstructTrace(client, server, parents);
      if (path) candidates.push({ client, server, ...path });
    }
    candidates.sort(
      (left, right) =>
        left.edges.length - right.edges.length ||
        compareText(left.trace.join("\0"), right.trace.join("\0")) ||
        compareText(left.server, right.server),
    );
    const shortest = candidates[0];
    if (shortest) findings.push(shortest);
  }

  findings.sort(
    (left, right) =>
      compareText(left.client, right.client) ||
      compareText(left.server, right.server) ||
      compareText(left.trace.join("\0"), right.trace.join("\0")),
  );
  return { clientSeeds, serverSeeds, findings };
}

export function findRuntimeTaint(
  nodes: readonly RuntimeGraphNode[],
  edges: readonly RuntimeGraphEdge[],
): RuntimeTaintFinding[] {
  return analyzeRuntimeGraph(nodes, edges).findings;
}
