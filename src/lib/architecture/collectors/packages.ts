/** Root plus declared/conventional workspace package discovery. */

import { realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "../types.js";
import {
  comparePaths,
  compareText,
  displayPath,
  errorCode,
  isMissing,
  pathKey,
  samePath,
} from "./collector-utils.js";
import {
  readPackageManifest,
  toPackageInfo,
  workspacesFrom,
  type PackageManifestResult,
} from "./package-manifest.js";
import {
  createDiscoveryState,
  stopPackageDiscovery,
  type PackageDiscoveryOptions,
  type WorkspaceCandidate,
  validateDiscoveryOptions,
} from "./package-policy.js";
import { expandWorkspacePattern } from "./workspace-globs.js";

const DEFAULT_WORKSPACE_PATTERNS = ["apps/*", "packages/*", "tooling/*"] as const;

export async function discoverPackages(
  root: string,
  findings: ArchitectureFinding[] = [],
  options: PackageDiscoveryOptions = {},
): Promise<PackageInfo[]> {
  const state = createDiscoveryState(options);
  if (!validateDiscoveryOptions(state, findings)) return [];

  const absoluteRoot = resolve(root);
  let realRoot: string;
  try {
    realRoot = await realpath(absoluteRoot);
  } catch (error) {
    if (isMissing(error)) return [];
    stopPackageDiscovery(
      state,
      findings,
      "package-root-coverage-failure",
      `Unable to resolve package root: ${errorCode(error)}`,
      "",
    );
    return [];
  }

  const rootResult = await readPackageManifest(absoluteRoot, realRoot, findings, state, true);
  if (state.stopped) return [];
  const workspacePatterns = new Map<string, boolean>();
  for (const pattern of DEFAULT_WORKSPACE_PATTERNS) workspacePatterns.set(pattern, false);
  for (const pattern of workspacesFrom(rootResult?.manifest)) workspacePatterns.set(pattern, true);
  for (const pattern of options.workspacePatterns ?? []) workspacePatterns.set(pattern, true);

  const candidates = new Map<string, WorkspaceCandidate>();
  if (rootResult) {
    candidates.set(pathKey(rootResult.dir), {
      dir: rootResult.dir,
      requiresManifest: true,
    });
  }
  for (const [pattern, requiresManifest] of [...workspacePatterns].sort(([a], [b]) =>
    compareText(a, b),
  )) {
    if (state.stopped) break;
    await expandWorkspacePattern(
      absoluteRoot,
      realRoot,
      pattern,
      requiresManifest,
      candidates,
      findings,
      state,
    );
  }

  const packages: PackageInfo[] = [];
  const manifestPaths = new Set<string>();
  for (const candidate of [...candidates.values()].sort((a, b) => comparePaths(a.dir, b.dir))) {
    if (state.stopped) break;
    if (rootResult && samePath(candidate.dir, rootResult.dir)) {
      addManifestPackage(packages, manifestPaths, rootResult);
      continue;
    }

    const result = await readPackageManifest(candidate.dir, realRoot, findings, state, false);
    if (state.stopped) break;
    if (result) {
      addManifestPackage(packages, manifestPaths, result);
    } else if (candidate.requiresManifest) {
      stopPackageDiscovery(
        state,
        findings,
        "package-manifest-coverage-failure",
        "Declared workspace has no readable package.json",
        displayPath(join(candidate.dir, "package.json"), realRoot),
      );
    } else {
      packages.push({
        name: basename(candidate.dir),
        dir: candidate.dir,
        dependencies: new Set(),
      });
    }
  }

  const names = new Set<string>();
  for (const pkg of packages) {
    if (names.has(pkg.name)) {
      stopPackageDiscovery(
        state,
        findings,
        "duplicate-package-name",
        `Duplicate package name: ${pkg.name}`,
        displayPath(join(pkg.dir, "package.json"), realRoot),
      );
      break;
    }
    names.add(pkg.name);
  }
  return packages.sort((a, b) => comparePaths(a.dir, b.dir) || compareText(a.name, b.name));
}

function addManifestPackage(
  packages: PackageInfo[],
  manifestPaths: Set<string>,
  result: PackageManifestResult,
): void {
  const manifestKey = pathKey(result.canonicalManifestPath);
  if (manifestPaths.has(manifestKey)) return;
  manifestPaths.add(manifestKey);
  packages.push(toPackageInfo(result.dir, result.manifest));
}

export type { PackageDiscoveryOptions } from "./package-policy.js";
