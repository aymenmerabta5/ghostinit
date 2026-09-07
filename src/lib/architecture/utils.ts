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
  const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
  return (
    /^(?:apps\/(?:web|desktop)\/)?src\/(?:renderer\/)?routes\/__root\.[cm]?[jt]sx$/.test(
      normalized,
    ) ||
    /^(?:apps\/(?:web|desktop)\/)?src\/(?:renderer\/)?router\.[cm]?[jt]sx$/.test(normalized) ||
    /^(?:apps\/mobile\/)?app\/_layout\.[cm]?[jt]sx$/.test(normalized)
  );
}

/**
 * The request-bound application server and its concrete composition subtree are
 * the only cross-capability roots inside generated services/application.
 */
export function isRequestApplicationCompositionRoot(file: string): boolean {
  const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
  return (
    /(?:^|\/)packages\/services\/src\/application\/(?:server\.[cm]?[jt]s$|composition(?:\/|$))/.test(
      normalized,
    ) ||
    /(?:^|\/)src\/server\/services\/application\/(?:server\.[cm]?[jt]s$|composition(?:\/|$))/.test(
      normalized,
    )
  );
}

export function packageForFile(absFile: string, packages: PackageInfo[]): PackageInfo | undefined {
  return packages
    .filter((pkg) => absFile === pkg.dir || absFile.startsWith(pkg.dir + sep))
    .toSorted((left, right) => right.dir.length - left.dir.length)[0];
}

export function dedupeFindings(findings: ArchitectureFinding[]): ArchitectureFinding[] {
  const seen = new Set<string>();
  const normalized = findings.map((finding) => ({
    ...finding,
    file: normalizePath(finding.file).replace(/^\.\//, ""),
  }));
  return normalized
    .toSorted((left, right) => {
      const leftLine = left.line ?? 0;
      const rightLine = right.line ?? 0;
      return (
        compareText(left.file, right.file) ||
        leftLine - rightLine ||
        (left.column ?? 0) - (right.column ?? 0) ||
        compareText(left.rule, right.rule) ||
        compareText(left.id, right.id) ||
        compareText(left.specifier ?? "", right.specifier ?? "") ||
        compareText(left.message, right.message)
      );
    })
    .filter((finding) => {
      const key = [
        finding.rule,
        finding.id,
        finding.file,
        finding.line ?? 0,
        finding.column ?? 0,
        finding.specifier ?? "",
        finding.message,
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function extname(absFile: string): string {
  const dot = absFile.lastIndexOf(".");
  if (dot === -1) return ".ts";
  return absFile.slice(dot);
}
