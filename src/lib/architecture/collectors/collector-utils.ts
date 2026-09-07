import { extname, relative, resolve } from "node:path";
import { SOURCE_COLLECTION_EXCLUDED_DIRECTORIES, SOURCE_FILE_EXTENSIONS } from "../constants.js";
import { normalizePath } from "../utils.js";

export function isSourceFile(path: string): boolean {
  return SOURCE_FILE_EXTENSIONS.has(extname(path).toLowerCase());
}

export function isExcludedDirectory(name: string): boolean {
  return SOURCE_COLLECTION_EXCLUDED_DIRECTORIES.has(name.toLowerCase());
}

export function displayPath(path: string, root: string): string {
  return normalizePath(relative(root, path));
}

export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function comparePaths(a: string, b: string): number {
  return compareText(normalizePath(a), normalizePath(b));
}

export function pathKey(path: string): string {
  const normalized = normalizePath(resolve(path));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

export function isContained(path: string, root: string): boolean {
  const candidate = pathKey(path);
  const boundary = pathKey(root);
  return candidate === boundary || candidate.startsWith(`${boundary}/`);
}

export function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "ENOENT" ||
      (error as { code?: unknown }).code === "ENOTDIR")
  );
}

export function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code ?? "UNKNOWN");
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}
