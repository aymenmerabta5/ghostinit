import { readdir, stat } from "node:fs/promises";
import { MAX_VISITED_ENTRIES, MAX_VISITED_FILES, MAX_WALK_DEPTH } from "../constants.js";
import { safeRealpath } from "../graph/symlink.js";
import type { ArchitectureFinding } from "../types.js";
import { compareText, displayPath, errorCode, isContained, isMissing } from "./collector-utils.js";

export interface SourceCollectionOptions {
  /** Extra project-relative or absolute roots to scan recursively. */
  sourceRoots?: readonly string[];
  /** Set false only when a caller supplies the complete source-root policy. */
  includeDefaultRoots?: boolean;
  maxSourceFiles?: number;
  maxEntries?: number;
  maxDepth?: number;
}

export interface RequiredCollectionOptions {
  sourceRoots: readonly string[];
  includeDefaultRoots: boolean;
  maxSourceFiles: number;
  maxEntries: number;
  maxDepth: number;
}

export interface CollectionState {
  options: RequiredCollectionOptions;
  entries: number;
  stopped: boolean;
  canonicalDirs: Set<string>;
  shallowDirs: Set<string>;
}

export function resolveSourceOptions(options: SourceCollectionOptions): RequiredCollectionOptions {
  return {
    sourceRoots: options.sourceRoots ?? [],
    includeDefaultRoots: options.includeDefaultRoots ?? true,
    maxSourceFiles: options.maxSourceFiles ?? MAX_VISITED_FILES,
    maxEntries: options.maxEntries ?? MAX_VISITED_ENTRIES,
    maxDepth: options.maxDepth ?? MAX_WALK_DEPTH,
  };
}

export function createSourceState(options: SourceCollectionOptions): CollectionState {
  return {
    options: resolveSourceOptions(options),
    entries: 0,
    stopped: false,
    canonicalDirs: new Set(),
    shallowDirs: new Set(),
  };
}

export function validateSourceOptions(
  state: CollectionState,
  findings: ArchitectureFinding[],
): boolean {
  for (const [name, value] of [
    ["maxSourceFiles", state.options.maxSourceFiles],
    ["maxEntries", state.options.maxEntries],
    ["maxDepth", state.options.maxDepth],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      stopSourceCollection(
        state,
        findings,
        "source-collection-invalid-budget",
        `${name} must be a non-negative safe integer`,
        "",
      );
      return false;
    }
  }
  return true;
}

export function consumeSourceEntry(
  state: CollectionState,
  findings: ArchitectureFinding[],
  dir: string,
  realRoot: string,
): boolean {
  if (state.stopped) return false;
  if (state.entries >= state.options.maxEntries) {
    stopSourceCollection(
      state,
      findings,
      "source-entry-limit",
      `Directory entry limit (${state.options.maxEntries}) exhausted`,
      displayPath(dir, realRoot),
    );
    return false;
  }
  state.entries += 1;
  return true;
}

export function stopSourceIo(
  state: CollectionState,
  findings: ArchitectureFinding[],
  path: string,
  realRoot: string,
  error: unknown,
): void {
  stopSourceCollection(
    state,
    findings,
    "source-collection-io-failure",
    `Unable to cover source path ${displayPath(path, realRoot)}: ${errorCode(error)}`,
    displayPath(path, realRoot),
  );
}

export function stopSourceCollection(
  state: CollectionState,
  findings: ArchitectureFinding[],
  id: string,
  message: string,
  file: string,
): void {
  if (state.stopped) return;
  state.stopped = true;
  findings.push({ id, severity: "BLOCKER", message, file, rule: "source-collection" });
}

export async function canonicalOptionalSourceDirectory(
  dir: string,
  realRoot: string,
  findings: ArchitectureFinding[],
  state: CollectionState,
): Promise<string | undefined> {
  let info;
  try {
    info = await stat(dir);
  } catch (error) {
    if (isMissing(error)) return undefined;
    stopSourceIo(state, findings, dir, realRoot, error);
    return undefined;
  }
  if (!info.isDirectory()) return undefined;
  const canonical = await safeRealpath(dir);
  if (!canonical) {
    stopSourceCollection(
      state,
      findings,
      "source-root-coverage-failure",
      `Unable to canonicalize source directory: ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return undefined;
  }
  if (!isContained(canonical, realRoot)) {
    stopSourceCollection(
      state,
      findings,
      "source-root-outside-project",
      `Source directory resolves outside project: ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return undefined;
  }
  return canonical;
}

export async function readOptionalSourceDirectory(
  dir: string,
  realRoot: string,
  findings: ArchitectureFinding[],
  state: CollectionState,
) {
  try {
    return (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      compareText(a.name, b.name),
    );
  } catch (error) {
    if (isMissing(error)) return undefined;
    stopSourceIo(state, findings, dir, realRoot, error);
    return undefined;
  }
}

export async function readRequiredSourceDirectory(
  dir: string,
  realRoot: string,
  findings: ArchitectureFinding[],
  state: CollectionState,
) {
  try {
    return (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      compareText(a.name, b.name),
    );
  } catch (error) {
    stopSourceIo(state, findings, dir, realRoot, error);
    return undefined;
  }
}
