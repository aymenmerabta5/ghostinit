/**
 * Source file collection with traversal limits and symlink guards.
 * Single responsibility: collect .ts/.tsx/.js/.jsx files from packages and root.
 *
 * Symlink guard (defense-in-depth):
 * - realRoot = realpath(root) canonical once.
 * - walkSource depth > MAX_WALK_DEPTH (64) → directory-depth-limit HIGH, stop recurse.
 * - visited Set keyed by realpath(file) dedupes symlink duplicates, prevents infinite loops.
 * - MAX_VISITED_FILES (50_000) → source-collection-limit HIGH if exceeded.
 * - per entry: if isSymbolicLink() or pathIncludesSymlink(parent chain via lstatSync up to 64):
 *    safeRealpath() → undefined => unresolvable-symlink MEDIUM.
 *    isInsideProject(realPath, realRoot) (normalized prefix check) → outside => path-traversal-risk HIGH, skip.
 *    Dir symlink → recurse on real path; file symlink → tryAddSourceFile(realPath).
 * - tryAddSourceFile: realpath(absPath) then isInsideProject again → outside => path-traversal-risk HIGH.
 * - skip node_modules/.git always.
 * Graph helpers in ../graph/symlink.ts: isInsideProject, safeRealpath, isDirectory, pathIncludesSymlink, parsePathRoot.
 */

import { readdir, realpath, stat } from "node:fs/promises";
import { join, relative, sep, resolve } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { MAX_VISITED_FILES, MAX_WALK_DEPTH, normalizePath } from "../utils.js";
import {
  isInsideProject,
  safeRealpath,
  isDirectory,
  pathIncludesSymlink,
} from "../graph/symlink.js";

export async function collectSourceFiles(
  root: string,
  packages: PackageInfo[],
  findings: ArchitectureFinding[],
): Promise<string[]> {
  const files: string[] = [];
  const visited = new Set<string>();
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    realRoot = resolve(root);
  }

  for (const pkg of packages) {
    for (const srcName of ["src", "tests"]) {
      const src = join(pkg.dir, srcName);
      if (!(await existsDir(src))) continue;
      await walkSource(src, realRoot, files, visited, findings, 0);
    }
    await scanPackageRoot(pkg.dir, realRoot, files, visited, findings);
  }

  const rootSrcCandidates = [join(root, "src"), join(root, "app"), join(root, "src", "routes")];
  for (const candidate of rootSrcCandidates) {
    if (!(await exists(candidate))) continue;
    const isInsidePkg = packages.some((pkg) => candidate.startsWith(pkg.dir + sep));
    if (isInsidePkg) continue;
    try {
      const sr = await stat(candidate);
      if (sr.isDirectory()) {
        await walkSource(candidate, realRoot, files, visited, findings, 0);
      } else if (sr.isFile() && /\.(tsx?|jsx?)$/.test(candidate)) {
        await tryAddSourceFile(candidate, realRoot, files, visited, findings);
      }
    } catch {
      // ignore
    }
  }

  for (const rootFile of ["router.tsx", "src/router.tsx", "src/routes/__root.tsx"]) {
    const abs = join(root, rootFile);
    if (await exists(abs)) {
      await tryAddSourceFile(abs, realRoot, files, visited, findings);
    }
  }

  if (visited.size > MAX_VISITED_FILES) {
    findings.push({
      id: "source-collection-limit",
      severity: "HIGH",
      message: `Scanned file limit exceeded: more than ${MAX_VISITED_FILES} entries visited`,
      file: "",
      rule: "source-collection",
    });
  }

  return files;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function existsDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function scanPackageRoot(
  pkgDir: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(pkgDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const absPath = join(pkgDir, entry.name);
      await tryAddSourceFile(absPath, realRoot, files, visited, findings);
    }
  }
}

export async function walkSource(
  dir: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
  depth: number,
): Promise<void> {
  if (depth > MAX_WALK_DEPTH) {
    findings.push({
      id: "directory-depth-limit",
      severity: "HIGH",
      message: `Directory depth limit (${MAX_WALK_DEPTH}) exceeded at ${normalizePath(relative(realRoot, dir))}`,
      file: normalizePath(relative(realRoot, dir)),
      rule: "source-collection",
    });
    return;
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink() || pathIncludesSymlink(path)) {
      const realPathStat = await safeRealpath(path);
      if (!realPathStat) {
        findings.push({
          id: "unresolvable-symlink",
          severity: "MEDIUM",
          message: `Unable to resolve symlink: ${normalizePath(relative(realRoot, path))}`,
          file: normalizePath(relative(realRoot, path)),
          rule: "source-collection",
        });
        continue;
      }
      if (!isInsideProject(realPathStat, realRoot)) {
        findings.push({
          id: "path-traversal-risk",
          severity: "HIGH",
          message: `Path resolved outside project root: ${normalizePath(relative(realRoot, path))}`,
          file: normalizePath(relative(realRoot, path)),
          rule: "source-collection",
        });
        continue;
      }
      if (entry.isDirectory() || (await isDirectory(realPathStat))) {
        await walkSource(realPathStat, realRoot, files, visited, findings, depth + 1);
        continue;
      }
      await tryAddSourceFile(realPathStat, realRoot, files, visited, findings);
      continue;
    }

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await walkSource(path, realRoot, files, visited, findings, depth + 1);
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      await tryAddSourceFile(path, realRoot, files, visited, findings);
    }
  }
}

export async function tryAddSourceFile(
  absPath: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
): Promise<void> {
  let realAbsPath: string;
  try {
    realAbsPath = await realpath(absPath);
  } catch {
    realAbsPath = resolve(absPath);
  }

  if (!isInsideProject(realAbsPath, realRoot)) {
    findings.push({
      id: "path-traversal-risk",
      severity: "HIGH",
      message: `Source file resolved outside project root: ${normalizePath(relative(realRoot, absPath))}`,
      file: normalizePath(relative(realRoot, absPath)),
      rule: "source-collection",
    });
    return;
  }

  if (visited.has(realAbsPath)) return;
  visited.add(realAbsPath);
  files.push(realAbsPath);
}
