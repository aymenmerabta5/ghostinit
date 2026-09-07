/** Deterministic root orchestration for bounded source traversal. */

import { realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { normalizePath } from "../utils.js";
import {
  comparePaths,
  displayPath,
  errorCode,
  isExcludedDirectory,
  isMissing,
  isSourceFile,
  pathKey,
  samePath,
} from "./collector-utils.js";
import {
  canonicalOptionalSourceDirectory,
  consumeSourceEntry,
  createSourceState,
  readRequiredSourceDirectory,
  stopSourceCollection,
  type CollectionState,
  type SourceCollectionOptions,
  validateSourceOptions,
} from "./source-policy.js";
import { tryAddSourceFile, walkSource } from "./source-traversal.js";

const ROOT_SOURCE_DIRS = ["src", "app", "tests", "convex", "agent"] as const;
const APP_SOURCE_DIRS = ["src", "app", "tests", "e2e", "agent", "evals"] as const;
const PACKAGE_SOURCE_DIRS = ["src", "tests"] as const;
const DEFAULT_PACKAGE_CONTAINERS = ["apps", "packages", "tooling"] as const;

interface SourceCandidate {
  dir: string;
  required: boolean;
}

export async function collectSourceFiles(
  root: string,
  packages: PackageInfo[],
  findings: ArchitectureFinding[],
  options: SourceCollectionOptions = {},
): Promise<string[]> {
  const files: string[] = [];
  const visited = new Set<string>();
  const state = createSourceState(options);
  if (!validateSourceOptions(state, findings)) return files;

  const absoluteRoot = resolve(root);
  let realRoot: string;
  try {
    realRoot = await realpath(absoluteRoot);
  } catch (error) {
    if (isMissing(error)) return files;
    stopSourceCollection(
      state,
      findings,
      "source-root-coverage-failure",
      `Unable to resolve project root: ${errorCode(error)}`,
      "",
    );
    return files;
  }

  const packageDirs = new Set<string>([absoluteRoot]);
  for (const pkg of packages) packageDirs.add(resolve(pkg.dir));
  const candidates: SourceCandidate[] = [];

  if (state.options.includeDefaultRoots) {
    addRoots(candidates, absoluteRoot, ROOT_SOURCE_DIRS);
    await addDefaultContainerRoots(
      absoluteRoot,
      realRoot,
      packageDirs,
      candidates,
      findings,
      state,
    );
    for (const pkgDir of packageDirs) {
      if (!samePath(pkgDir, absoluteRoot)) {
        addRoots(candidates, pkgDir, sourceDirsForPackage(absoluteRoot, pkgDir));
      }
    }
  }
  for (const configuredRoot of state.options.sourceRoots) {
    candidates.push({ dir: resolve(absoluteRoot, configuredRoot), required: true });
  }

  for (const pkgDir of [...packageDirs].sort(comparePaths)) {
    if (state.stopped) break;
    await scanPackageRoot(pkgDir, realRoot, files, visited, findings, state);
  }
  for (const candidate of dedupeCandidates(candidates)) {
    if (state.stopped) break;
    await scanCandidate(candidate, realRoot, files, visited, findings, state);
  }
  return files.sort(comparePaths);
}

async function addDefaultContainerRoots(
  root: string,
  realRoot: string,
  packageDirs: Set<string>,
  candidates: SourceCandidate[],
  findings: ArchitectureFinding[],
  state: CollectionState,
): Promise<void> {
  for (const containerName of DEFAULT_PACKAGE_CONTAINERS) {
    if (state.stopped) return;
    const container = await canonicalOptionalSourceDirectory(
      join(root, containerName),
      realRoot,
      findings,
      state,
    );
    if (!container) continue;
    const entries = await readRequiredSourceDirectory(container, realRoot, findings, state);
    if (!entries) continue;
    for (const entry of entries) {
      if (!consumeSourceEntry(state, findings, container, realRoot)) return;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (isExcludedDirectory(entry.name)) continue;
      const pkgDir = join(container, entry.name);
      packageDirs.add(pkgDir);
      addRoots(
        candidates,
        pkgDir,
        containerName === "apps" ? APP_SOURCE_DIRS : PACKAGE_SOURCE_DIRS,
      );
    }
  }
}

async function scanPackageRoot(
  pkgDir: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
  state: CollectionState,
): Promise<void> {
  const canonical = await canonicalOptionalSourceDirectory(pkgDir, realRoot, findings, state);
  if (!canonical) return;
  const key = pathKey(canonical);
  if (state.shallowDirs.has(key)) return;
  state.shallowDirs.add(key);

  const entries = await readRequiredSourceDirectory(canonical, realRoot, findings, state);
  if (!entries) return;
  for (const entry of entries) {
    if (!consumeSourceEntry(state, findings, canonical, realRoot)) return;
    if ((entry.isFile() || entry.isSymbolicLink()) && isSourceFile(entry.name)) {
      const logicalPath = join(canonical, entry.name);
      await tryAddSourceFile(logicalPath, realRoot, files, visited, findings, state, logicalPath);
      if (state.stopped) return;
    }
  }
}

async function scanCandidate(
  candidate: SourceCandidate,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
  state: CollectionState,
): Promise<void> {
  const canonical = await canonicalOptionalSourceDirectory(
    candidate.dir,
    realRoot,
    findings,
    state,
  );
  if (!canonical && candidate.required && !state.stopped) {
    stopSourceCollection(
      state,
      findings,
      "configured-source-root-missing",
      `Configured source root does not exist: ${displayPath(candidate.dir, realRoot)}`,
      displayPath(candidate.dir, realRoot),
    );
  }
  if (!canonical) return;
  await walkSource(canonical, realRoot, files, visited, findings, 0, state.options, state);
}

function sourceDirsForPackage(root: string, pkgDir: string): readonly string[] {
  const rel = normalizePath(relative(root, pkgDir));
  return rel === "apps" || rel.startsWith("apps/") ? APP_SOURCE_DIRS : PACKAGE_SOURCE_DIRS;
}

function addRoots(candidates: SourceCandidate[], parent: string, names: readonly string[]): void {
  for (const name of names) candidates.push({ dir: join(parent, name), required: false });
}

function dedupeCandidates(candidates: SourceCandidate[]): SourceCandidate[] {
  const byPath = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    const key = pathKey(candidate.dir);
    const existing = byPath.get(key);
    byPath.set(key, {
      dir: candidate.dir,
      required: candidate.required || existing?.required === true,
    });
  }
  return [...byPath.values()].sort((a, b) => comparePaths(a.dir, b.dir));
}

export { tryAddSourceFile, walkSource } from "./source-traversal.js";
export type { SourceCollectionOptions } from "./source-policy.js";
