import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { ProjectPathResolver, normalizePath } from "./paths.js";
import type {
  PackageManifest,
  PackageTarget,
  PackageTargetMap,
  WorkspaceInventory,
} from "./types.js";

interface RawPackageJson {
  name?: string;
  exports?: PackageTarget;
  imports?: PackageTargetMap;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  tsconfig?: string;
  workspaces?: string[] | { packages?: string[] };
}

export interface SelectedPackageTarget {
  status: "matched" | "unmatched" | "blocked";
  target?: string;
}

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".output",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

export async function discoverWorkspacePackages(
  paths: ProjectPathResolver,
): Promise<WorkspaceInventory> {
  const rootRaw = await paths.readJson<RawPackageJson>(join(paths.root, "package.json"));
  const rootManifest = rootRaw ? toManifest(paths, paths.root, rootRaw) : undefined;
  const configured = Array.isArray(rootRaw?.workspaces)
    ? rootRaw.workspaces
    : (rootRaw?.workspaces?.packages ?? []);
  const patterns = configured.length > 0 ? configured : ["apps/*", "packages/*", "tooling/*"];
  const candidates = new Set<string>();

  for (const scanRoot of scanRoots(paths.root, patterns)) {
    await collectManifestDirectories(scanRoot, paths.root, candidates);
  }

  const manifests: PackageManifest[] = [];
  for (const dir of [...candidates].sort(compareText)) {
    const relativeDir = normalizePath(relative(paths.root, dir));
    if (!matchesWorkspace(relativeDir, patterns)) continue;
    const raw = await paths.readJson<RawPackageJson>(join(dir, "package.json"));
    if (raw) manifests.push(toManifest(paths, dir, raw));
  }

  const packagesByName = new Map<string, PackageManifest[]>();
  for (const manifest of manifests) {
    if (!manifest.name) continue;
    const current = packagesByName.get(manifest.name) ?? [];
    current.push(manifest);
    current.sort((left, right) => compareText(left.relativeDir, right.relativeDir));
    packagesByName.set(manifest.name, current);
  }
  return { rootManifest, packagesByName };
}

export async function findNearestPackageManifest(
  paths: ProjectPathResolver,
  fromFile: string,
): Promise<PackageManifest | undefined> {
  let current = dirname(resolve(fromFile));
  while (paths.isInside(current)) {
    const raw = await paths.readJson<RawPackageJson>(join(current, "package.json"));
    if (raw) return toManifest(paths, current, raw);
    if (current === paths.root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

export function packageNameFromSpecifier(specifier: string): string | undefined {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("#")) return undefined;
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    return parts.length >= 2 && parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : undefined;
  }
  return parts[0] || undefined;
}

export function packageSubpath(specifier: string, packageName: string): string {
  const remainder = specifier.slice(packageName.length);
  return remainder ? `.${remainder.startsWith("/") ? remainder : `/${remainder}`}` : ".";
}

export function selectExportsTarget(
  exportsField: PackageTarget | undefined,
  subpath: string,
  conditions: ReadonlySet<string>,
): SelectedPackageTarget {
  if (exportsField === undefined) return { status: "unmatched" };
  if (!isTargetMap(exportsField)) {
    return subpath === "."
      ? selectConditionalTarget(exportsField, conditions)
      : { status: "unmatched" };
  }

  const keys = Object.keys(exportsField);
  const isSubpathMap = keys.some((key) => key.startsWith("."));
  if (!isSubpathMap) {
    return subpath === "."
      ? selectConditionalTarget(exportsField, conditions)
      : { status: "unmatched" };
  }
  return selectMappedTarget(exportsField, subpath, conditions);
}

export function selectImportsTarget(
  importsField: PackageTargetMap | undefined,
  specifier: string,
  conditions: ReadonlySet<string>,
): SelectedPackageTarget {
  return importsField
    ? selectMappedTarget(importsField, specifier, conditions)
    : { status: "unmatched" };
}

function selectMappedTarget(
  mappings: PackageTargetMap,
  key: string,
  conditions: ReadonlySet<string>,
): SelectedPackageTarget {
  if (Object.hasOwn(mappings, key)) {
    return selectConditionalTarget(mappings[key] ?? null, conditions);
  }

  const patterns = Object.keys(mappings)
    .filter((pattern) => pattern.includes("*") && patternMatches(pattern, key))
    .sort((left, right) => {
      const leftPrefix = left.indexOf("*");
      const rightPrefix = right.indexOf("*");
      return rightPrefix - leftPrefix || right.length - left.length || compareText(left, right);
    });
  const pattern = patterns[0];
  if (!pattern) return { status: "unmatched" };
  const capture = capturePattern(pattern, key);
  const selected = selectConditionalTarget(mappings[pattern] ?? null, conditions);
  return selected.target === undefined
    ? selected
    : { status: "matched", target: selected.target.replaceAll("*", capture) };
}

function selectConditionalTarget(
  target: PackageTarget,
  conditions: ReadonlySet<string>,
): SelectedPackageTarget {
  if (target === null) return { status: "blocked" };
  if (typeof target === "string") return { status: "matched", target };
  if (Array.isArray(target)) {
    for (const candidate of target) {
      const selected = selectConditionalTarget(candidate, conditions);
      if (selected.status === "matched") return selected;
    }
    return { status: "blocked" };
  }
  for (const [condition, candidate] of Object.entries(target)) {
    if (condition !== "default" && !conditions.has(condition)) continue;
    return selectConditionalTarget(candidate, conditions);
  }
  return { status: "blocked" };
}

function patternMatches(pattern: string, value: string): boolean {
  const star = pattern.indexOf("*");
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return (
    value.startsWith(prefix) &&
    value.endsWith(suffix) &&
    value.length >= prefix.length + suffix.length
  );
}

function capturePattern(pattern: string, value: string): string {
  const star = pattern.indexOf("*");
  const suffixLength = pattern.length - star - 1;
  return value.slice(star, suffixLength === 0 ? undefined : -suffixLength);
}

function isTargetMap(target: PackageTarget): target is PackageTargetMap {
  return typeof target === "object" && target !== null && !Array.isArray(target);
}

function toManifest(paths: ProjectPathResolver, dir: string, raw: RawPackageJson): PackageManifest {
  return {
    dir: resolve(dir),
    relativeDir: paths.toProjectPath(dir) ?? ".",
    name: raw.name,
    exports: raw.exports,
    imports: raw.imports,
    main: raw.main,
    module: raw.module,
    types: raw.types,
    typings: raw.typings,
    tsconfig: raw.tsconfig,
  };
}

function scanRoots(root: string, patterns: readonly string[]): string[] {
  const roots = new Set<string>();
  for (const rawPattern of patterns) {
    if (rawPattern.startsWith("!")) continue;
    const pattern = normalizePath(rawPattern).replace(/^\.\//, "");
    const first = pattern.split("/")[0] ?? "";
    roots.add(first && !/[?*]/.test(first) ? join(root, first) : root);
  }
  return [...roots].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function collectManifestDirectories(
  dir: string,
  root: string,
  result: Set<string>,
): Promise<void> {
  if (!normalizePath(relative(root, dir)).startsWith("..") && basename(dir) === "node_modules")
    return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) result.add(dir);
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    await collectManifestDirectories(join(dir, entry.name), root, result);
  }
}

function matchesWorkspace(relativeDir: string, patterns: readonly string[]): boolean {
  const includes = patterns.filter((pattern) => !pattern.startsWith("!"));
  const excludes = patterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => pattern.slice(1));
  return (
    includes.some((pattern) => globMatches(pattern, relativeDir)) &&
    !excludes.some((pattern) => globMatches(pattern, relativeDir))
  );
}

function globMatches(pattern: string, value: string): boolean {
  const normalized = normalizePath(pattern).replace(/^\.\//, "").replace(/\/$/, "");
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? "";
    if (char === "*" && normalized[index + 1] === "*") {
      source += normalized[index + 2] === "/" ? "(?:.*/)?" : ".*";
      index += normalized[index + 2] === "/" ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`^${source}$`).test(normalizePath(value));
}
