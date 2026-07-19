/**
 * Pure path/string utilities.
 * Single responsibility: normalization and small helpers.
 */

import { sep } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "./types.js";
export { MAX_VISITED_FILES, MAX_WALK_DEPTH } from "./constants.js";
export {
  FRAMEWORK_PACKAGES,
  DATABASE_PACKAGES,
  SERVER_ONLY_BILLING_PACKAGES,
  VENDOR_ISOLATION_SUBSTRINGS,
  RESERVED_NAMES,
} from "./constants.js";

export function normalizePath(p: string): string {
  return p.split(sep).join("/");
}

export function getBasePackage(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return `${parts[0]}/${parts[1]}`;
  }
  return specifier.split("/")[0];
}

export function isFrameworkEntryPoint(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return (
    normalized.includes("__root.tsx") ||
    normalized.endsWith("/router.tsx") ||
    normalized.endsWith("router.tsx") ||
    normalized.includes("/router.tsx") ||
    normalized === "router.tsx" ||
    normalized.endsWith("/__root.tsx")
  );
}

export function packageForFile(absFile: string, packages: PackageInfo[]): PackageInfo | undefined {
  return packages.find((pkg) => absFile.startsWith(pkg.dir + sep));
}

export function dedupeFindings(findings: ArchitectureFinding[]): ArchitectureFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.rule}|${f.file}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extname(absFile: string): string {
  const dot = absFile.lastIndexOf(".");
  if (dot === -1) return ".ts";
  return absFile.slice(dot);
}
