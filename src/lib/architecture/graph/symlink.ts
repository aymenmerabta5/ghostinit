/**
 * Symlink / path-traversal guard.
 * Single responsibility: filesystem safety checks.
 */

import { realpath, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { lstatSync } from "node:fs";
import { normalizePath } from "../utils.js";

export function isInsideProject(absPath: string, realRoot: string): boolean {
  const normalizedPath = normalizePath(absPath);
  const normalizedRoot = normalizePath(realRoot);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export async function safeRealpath(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

export async function isDirectory(absPath: string): Promise<boolean> {
  try {
    return (await stat(absPath)).isDirectory();
  } catch {
    return false;
  }
}

export function pathIncludesSymlink(p: string): boolean {
  let curr = dirname(p);
  const root = parsePathRoot(p);
  let depth = 0;
  const maxDepth = 64;
  while (curr !== root && curr !== "." && curr !== dirname(curr) && depth < maxDepth) {
    try {
      if (lstatSync(curr).isSymbolicLink()) return true;
    } catch {
      // ignore missing
    }
    curr = dirname(curr);
    depth++;
  }
  return false;
}

export function parsePathRoot(p: string): string {
  const match = /^[a-zA-Z]:[\\/]/.exec(p);
  if (match) return match[0];
  if (p.startsWith("/")) return "/";
  if (p.startsWith("\\\\")) {
    const parts = p.split(/[\\/]/).filter(Boolean);
    if (parts.length >= 2) return `\\\\${parts[0]}\\${parts[1]}\\`;
  }
  return "";
}
