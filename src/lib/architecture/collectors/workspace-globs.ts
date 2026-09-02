import { join } from "node:path";
import type { ArchitectureFinding } from "../types.js";
import { displayPath, isExcludedDirectory, pathKey } from "./collector-utils.js";
import {
  canonicalOptionalPackageDirectory,
  consumePackageEntry,
  readOptionalPackageDirectory,
  stopPackageDiscovery,
  type DiscoveryState,
  type WorkspaceCandidate,
} from "./package-policy.js";

export async function expandWorkspacePattern(
  root: string,
  realRoot: string,
  rawPattern: string,
  requiresManifest: boolean,
  candidates: Map<string, WorkspaceCandidate>,
  findings: ArchitectureFinding[],
  state: DiscoveryState,
): Promise<void> {
  const pattern = normalizeWorkspacePattern(rawPattern);
  if (!pattern) return;
  if (
    pattern.startsWith("/") ||
    /^[a-zA-Z]:\//.test(pattern) ||
    pattern.split("/").includes("..")
  ) {
    stopPackageDiscovery(
      state,
      findings,
      "workspace-pattern-outside-project",
      `Workspace pattern must stay inside the project: ${rawPattern}`,
      "package.json",
    );
    return;
  }
  await expandSegments(
    root,
    realRoot,
    pattern.split("/"),
    pattern,
    requiresManifest,
    0,
    0,
    candidates,
    findings,
    state,
  );
}

async function expandSegments(
  requestedDir: string,
  realRoot: string,
  segments: string[],
  pattern: string,
  requiresManifest: boolean,
  index: number,
  depth: number,
  candidates: Map<string, WorkspaceCandidate>,
  findings: ArchitectureFinding[],
  state: DiscoveryState,
): Promise<void> {
  if (state.stopped) return;
  if (depth > state.maxDepth) {
    stopPackageDiscovery(
      state,
      findings,
      "package-discovery-depth-limit",
      `Workspace discovery depth limit (${state.maxDepth}) exhausted`,
      displayPath(requestedDir, realRoot),
    );
    return;
  }

  const current = await canonicalOptionalPackageDirectory(requestedDir, realRoot, findings, state);
  if (!current) return;
  const visitKey = `${pattern}|${index}|${pathKey(current)}`;
  if (state.globStates.has(visitKey)) return;
  state.globStates.add(visitKey);

  if (index === segments.length) {
    const key = pathKey(current);
    const existing = candidates.get(key);
    candidates.set(key, {
      dir: current,
      requiresManifest: requiresManifest || existing?.requiresManifest === true,
    });
    return;
  }

  const segment = segments[index] ?? "";
  if (segment === "**") {
    await expandSegments(
      current,
      realRoot,
      segments,
      pattern,
      requiresManifest,
      index + 1,
      depth,
      candidates,
      findings,
      state,
    );
    const entries = await readOptionalPackageDirectory(current, realRoot, findings, state);
    if (!entries) return;
    for (const entry of entries) {
      if (!consumePackageEntry(state, findings, current, realRoot)) return;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (isExcludedDirectory(entry.name)) continue;
      await expandSegments(
        join(current, entry.name),
        realRoot,
        segments,
        pattern,
        requiresManifest,
        index,
        depth + 1,
        candidates,
        findings,
        state,
      );
      if (state.stopped) return;
    }
    return;
  }

  if (!hasGlob(segment)) {
    await expandSegments(
      join(current, segment),
      realRoot,
      segments,
      pattern,
      requiresManifest,
      index + 1,
      depth + 1,
      candidates,
      findings,
      state,
    );
    return;
  }

  const entries = await readOptionalPackageDirectory(current, realRoot, findings, state);
  if (!entries) return;
  const matcher = globSegmentMatcher(segment);
  for (const entry of entries) {
    if (!consumePackageEntry(state, findings, current, realRoot)) return;
    if (!matcher.test(entry.name) || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
    if (isExcludedDirectory(entry.name)) continue;
    await expandSegments(
      join(current, entry.name),
      realRoot,
      segments,
      pattern,
      requiresManifest,
      index + 1,
      depth + 1,
      candidates,
      findings,
      state,
    );
    if (state.stopped) return;
  }
}

function normalizeWorkspacePattern(pattern: string): string {
  return pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function hasGlob(segment: string): boolean {
  return segment.includes("*") || segment.includes("?");
}

function globSegmentMatcher(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}
