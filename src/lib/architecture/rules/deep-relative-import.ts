import type { ResolvedImport } from "../resolution/types.js";
import type { ArchitectureFinding } from "../types.js";

const MAX_ALLOWED_LEADING_PARENT_DEPTH = 2;

/** Reject deep relative edges only when a generated app's `@/` alias can replace them. */
export function checkDeepRelativeImport(
  findings: ArchitectureFinding[],
  resolution: ResolvedImport,
): void {
  if (
    resolution.reason !== "relative-file" ||
    !resolution.target ||
    leadingParentDepth(resolution.specifier) <= MAX_ALLOWED_LEADING_PARENT_DEPTH ||
    !sharesApplicationAliasRoot(resolution.source, resolution.target)
  ) {
    return;
  }

  findings.push({
    id: "deep-relative-import",
    severity: "HIGH",
    message: `Deep relative import stays within an application alias root: ${resolution.specifier}`,
    file: resolution.source,
    rule: "application-import-boundary",
  });
}

function leadingParentDepth(specifier: string): number {
  let depth = 0;
  for (const segment of specifier.replaceAll("\\", "/").split("/")) {
    if (segment !== "..") break;
    depth += 1;
  }
  return depth;
}

function sharesApplicationAliasRoot(source: string, target: string): boolean {
  const normalizedSource = normalizeProjectPath(source);
  const normalizedTarget = normalizeProjectPath(target);

  if (normalizedSource.startsWith("apps/web/src/")) {
    return normalizedTarget.startsWith("apps/web/src/");
  }
  if (normalizedSource.startsWith("apps/desktop/src/renderer/")) {
    return normalizedTarget.startsWith("apps/desktop/src/renderer/");
  }
  if (
    normalizedSource.startsWith("apps/mobile/src/") ||
    normalizedSource.startsWith("apps/mobile/app/")
  ) {
    return normalizedTarget.startsWith("apps/mobile/src/");
  }
  return normalizedSource.startsWith("src/") && normalizedTarget.startsWith("src/");
}

function normalizeProjectPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
