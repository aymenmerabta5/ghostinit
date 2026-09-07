import { readdir, realpath, stat } from "node:fs/promises";
import { MAX_VISITED_ENTRIES, MAX_WALK_DEPTH } from "../constants.js";
import type { ArchitectureFinding } from "../types.js";
import { compareText, displayPath, errorCode, isContained, isMissing } from "./collector-utils.js";

export interface PackageManifest {
  name?: string;
  workspaces?: readonly string[] | { packages?: readonly string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface PackageDiscoveryOptions {
  /** Additional globs; root workspaces and conventional defaults are always included. */
  workspacePatterns?: readonly string[];
  maxEntries?: number;
  maxDepth?: number;
}

export interface DiscoveryState {
  entries: number;
  maxEntries: number;
  maxDepth: number;
  stopped: boolean;
  globStates: Set<string>;
}

export interface WorkspaceCandidate {
  dir: string;
  requiresManifest: boolean;
}

export function createDiscoveryState(options: PackageDiscoveryOptions): DiscoveryState {
  return {
    entries: 0,
    maxEntries: options.maxEntries ?? MAX_VISITED_ENTRIES,
    maxDepth: options.maxDepth ?? MAX_WALK_DEPTH,
    stopped: false,
    globStates: new Set(),
  };
}

export function validateDiscoveryOptions(
  state: DiscoveryState,
  findings: ArchitectureFinding[],
): boolean {
  for (const [name, value] of [
    ["maxEntries", state.maxEntries],
    ["maxDepth", state.maxDepth],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      stopPackageDiscovery(
        state,
        findings,
        "package-discovery-invalid-budget",
        `${name} must be a non-negative safe integer`,
        "",
      );
      return false;
    }
  }
  return true;
}

export function consumePackageEntry(
  state: DiscoveryState,
  findings: ArchitectureFinding[],
  dir: string,
  realRoot: string,
): boolean {
  if (state.stopped) return false;
  if (state.entries >= state.maxEntries) {
    stopPackageDiscovery(
      state,
      findings,
      "package-discovery-entry-limit",
      `Package discovery entry limit (${state.maxEntries}) exhausted`,
      displayPath(dir, realRoot),
    );
    return false;
  }
  state.entries += 1;
  return true;
}

export function stopPackageIo(
  state: DiscoveryState,
  findings: ArchitectureFinding[],
  path: string,
  realRoot: string,
  error: unknown,
): void {
  stopPackageDiscovery(
    state,
    findings,
    "package-discovery-io-failure",
    `Unable to cover package path ${displayPath(path, realRoot)}: ${errorCode(error)}`,
    displayPath(path, realRoot),
  );
}

export function stopPackageDiscovery(
  state: DiscoveryState,
  findings: ArchitectureFinding[],
  id: string,
  message: string,
  file: string,
): void {
  if (state.stopped) return;
  state.stopped = true;
  findings.push({ id, severity: "BLOCKER", message, file, rule: "package-discovery" });
}

export async function canonicalOptionalPackageDirectory(
  dir: string,
  realRoot: string,
  findings: ArchitectureFinding[],
  state: DiscoveryState,
): Promise<string | undefined> {
  let info;
  try {
    info = await stat(dir);
  } catch (error) {
    if (isMissing(error)) return undefined;
    stopPackageIo(state, findings, dir, realRoot, error);
    return undefined;
  }
  if (!info.isDirectory()) return undefined;
  let canonical: string;
  try {
    canonical = await realpath(dir);
  } catch (error) {
    stopPackageIo(state, findings, dir, realRoot, error);
    return undefined;
  }
  if (!isContained(canonical, realRoot)) {
    stopPackageDiscovery(
      state,
      findings,
      "workspace-path-outside-project",
      `Workspace path resolves outside project: ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return undefined;
  }
  return canonical;
}

export async function readOptionalPackageDirectory(
  dir: string,
  realRoot: string,
  findings: ArchitectureFinding[],
  state: DiscoveryState,
) {
  try {
    return (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      compareText(a.name, b.name),
    );
  } catch (error) {
    if (isMissing(error)) return undefined;
    stopPackageIo(state, findings, dir, realRoot, error);
    return undefined;
  }
}
