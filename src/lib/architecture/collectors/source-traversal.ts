import { realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDirectory, pathIncludesSymlink, safeRealpath } from "../graph/symlink.js";
import type { ArchitectureFinding } from "../types.js";
import {
  displayPath,
  isContained,
  isExcludedDirectory,
  isSourceFile,
  pathKey,
} from "./collector-utils.js";
import {
  consumeSourceEntry,
  createSourceState,
  readRequiredSourceDirectory,
  stopSourceCollection,
  stopSourceIo,
  type CollectionState,
  type RequiredCollectionOptions,
  type SourceCollectionOptions,
} from "./source-policy.js";

export async function walkSource(
  dir: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
  depth: number,
  options: SourceCollectionOptions | RequiredCollectionOptions = {},
  sharedState?: CollectionState,
): Promise<void> {
  const state = sharedState ?? createSourceState(options);
  if (state.stopped) return;

  const canonical = await safeRealpath(dir);
  if (!canonical) {
    stopSourceCollection(
      state,
      findings,
      "source-root-coverage-failure",
      `Unable to canonicalize source directory: ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return;
  }
  if (!isContained(canonical, realRoot)) {
    findings.push({
      id: "path-traversal-risk",
      severity: "HIGH",
      message: `Path resolved outside project root: ${displayPath(dir, realRoot)}`,
      file: displayPath(dir, realRoot),
      rule: "source-collection",
    });
    return;
  }

  const canonicalKey = pathKey(canonical);
  if (state.canonicalDirs.has(canonicalKey)) return;
  if (depth > state.options.maxDepth) {
    stopSourceCollection(
      state,
      findings,
      "directory-depth-limit",
      `Directory depth limit (${state.options.maxDepth}) exhausted at ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return;
  }
  state.canonicalDirs.add(canonicalKey);

  const entries = await readRequiredSourceDirectory(canonical, realRoot, findings, state);
  if (!entries) return;
  for (const entry of entries) {
    if (!consumeSourceEntry(state, findings, canonical, realRoot)) return;
    const logicalPath = join(canonical, entry.name);
    if (
      (entry.isDirectory() || entry.isSymbolicLink()) &&
      shouldExcludeDirectory(logicalPath, entry.name, realRoot)
    ) {
      continue;
    }

    if (entry.isSymbolicLink() || pathIncludesSymlink(logicalPath)) {
      await visitSymlink(
        logicalPath,
        entry.isDirectory(),
        realRoot,
        files,
        visited,
        findings,
        depth,
        state,
      );
    } else if (entry.isDirectory()) {
      await walkSource(
        logicalPath,
        realRoot,
        files,
        visited,
        findings,
        depth + 1,
        state.options,
        state,
      );
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      await tryAddSourceFile(logicalPath, realRoot, files, visited, findings, state);
    }
    if (state.stopped) return;
  }
}

async function visitSymlink(
  logicalPath: string,
  dirEntryIsDirectory: boolean,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
  depth: number,
  state: CollectionState,
): Promise<void> {
  const realPath = await safeRealpath(logicalPath);
  if (!realPath) {
    findings.push({
      id: "unresolvable-symlink",
      severity: "MEDIUM",
      message: `Unable to resolve symlink: ${displayPath(logicalPath, realRoot)}`,
      file: displayPath(logicalPath, realRoot),
      rule: "source-collection",
    });
    return;
  }
  if (!isContained(realPath, realRoot)) {
    findings.push({
      id: "path-traversal-risk",
      severity: "HIGH",
      message: `Path resolved outside project root: ${displayPath(logicalPath, realRoot)}`,
      file: displayPath(logicalPath, realRoot),
      rule: "source-collection",
    });
    return;
  }
  if (dirEntryIsDirectory || (await isDirectory(realPath))) {
    await walkSource(realPath, realRoot, files, visited, findings, depth + 1, state.options, state);
  } else if (isSourceFile(logicalPath)) {
    await tryAddSourceFile(realPath, realRoot, files, visited, findings, state, logicalPath);
  }
}

export async function tryAddSourceFile(
  absPath: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
  sharedState?: CollectionState,
  logicalPath = absPath,
): Promise<void> {
  const state = sharedState ?? createSourceState({});
  if (state.stopped || !isSourceFile(logicalPath)) return;

  let realAbsPath: string;
  try {
    realAbsPath = await realpath(absPath);
  } catch (error) {
    stopSourceIo(state, findings, absPath, realRoot, error);
    return;
  }
  if (!isContained(realAbsPath, realRoot)) {
    findings.push({
      id: "path-traversal-risk",
      severity: "HIGH",
      message: `Source file resolved outside project root: ${displayPath(absPath, realRoot)}`,
      file: displayPath(absPath, realRoot),
      rule: "source-collection",
    });
    return;
  }

  let info;
  try {
    info = await stat(realAbsPath);
  } catch (error) {
    stopSourceIo(state, findings, absPath, realRoot, error);
    return;
  }
  if (!info.isFile()) {
    stopSourceCollection(
      state,
      findings,
      "source-file-coverage-failure",
      `Source path is not a regular file: ${displayPath(logicalPath, realRoot)}`,
      displayPath(logicalPath, realRoot),
    );
    return;
  }

  const key = pathKey(realAbsPath);
  if (visited.has(key)) return;
  if (files.length >= state.options.maxSourceFiles) {
    stopSourceCollection(
      state,
      findings,
      "source-collection-limit",
      `Source file limit (${state.options.maxSourceFiles}) exhausted`,
      displayPath(logicalPath, realRoot),
    );
    return;
  }
  visited.add(key);
  files.push(resolve(logicalPath));
}

function shouldExcludeDirectory(path: string, name: string, realRoot: string): boolean {
  if (isExcludedDirectory(name)) return true;
  const rel = displayPath(path, realRoot);
  return rel === "convex/_generated" || rel.includes("/convex/_generated/");
}
