import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export const PACKED_PATCHED_DEPENDENCIES = {
  "@electric-sql/pglite-socket@0.2.10": "patches/@electric-sql%2Fpglite-socket@0.2.10.patch",
} as const;

/** `package.json#files` is a release contract, not an open-ended pack list. */
export const PACKED_MANIFEST_FILES = [
  "dist/**/*",
  "src/**/*",
  "schemas/**/*",
  "policy/**/*",
  "evidence/compatibility/**/*",
  "docs/engineering/**/*",
  ...Object.values(PACKED_PATCHED_DEPENDENCIES),
  "README.md",
  "VISION.md",
  "CHANGELOG.md",
  "LICENSE",
] as const;

const PACKED_ROOT_FILES = new Set([
  "package.json",
  "README.md",
  "VISION.md",
  "CHANGELOG.md",
  "LICENSE",
  ...Object.values(PACKED_PATCHED_DEPENDENCIES),
]);
const PACKED_PREFIXES = [
  "dist/",
  "src/",
  "schemas/",
  "policy/",
  "evidence/compatibility/",
  "docs/engineering/",
] as const;

export const STALE_DIST_SENTINEL = "removed-source/__ghostinit_stale_publish_sentinel__.d.ts";

export function relativeFiles(root: string): string[] {
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`Package closure does not permit a symlink root: ${root}`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Package closure root is not a directory: ${root}`);
  }
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink() || lstatSync(absolute).isSymbolicLink()) {
        throw new Error(`Package closure does not permit symlinks: ${absolute}`);
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(relative(root, absolute).replaceAll("\\", "/"));
    }
  };
  visit(root);
  return files.sort();
}

function declarationForSource(source: string): string | null {
  if (source.endsWith(".d.ts") || source.endsWith(".d.mts") || source.endsWith(".d.cts")) {
    return null;
  }
  if (source.endsWith(".mts")) return source.slice(0, -4) + ".d.mts";
  if (source.endsWith(".cts")) return source.slice(0, -4) + ".d.cts";
  if (source.endsWith(".tsx")) return source.slice(0, -4) + ".d.ts";
  if (source.endsWith(".ts")) return source.slice(0, -3) + ".d.ts";
  return null;
}

/** Exact publishable output derived from the source tree that exists now. */
export function expectedDistFiles(sourceRoot: string): Set<string> {
  const declarations = relativeFiles(sourceRoot).flatMap((source) => {
    const declaration = declarationForSource(source);
    return declaration ? [declaration, `${declaration}.map`] : [];
  });
  return new Set(["cli.js", "cli.js.map", ...declarations]);
}

export interface PackedClosure {
  readonly files: readonly string[];
  readonly distFiles: readonly string[];
}

/** Require a dist tree to be the exact declaration/bundle closure of one source tree. */
export function verifyDistClosure(
  sourceRoot: string,
  distRoot: string,
  label = "Dist",
): readonly string[] {
  const actualDist = relativeFiles(distRoot);
  const expectedDist = expectedDistFiles(sourceRoot);
  const missing = [...expectedDist].filter((path) => !actualDist.includes(path));
  const stale = actualDist.filter((path) => !expectedDist.has(path));
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `${label} closure mismatch\nMissing: ${missing.join(", ") || "none"}\nStale: ${stale.join(", ") || "none"}`,
    );
  }
  return actualDist;
}

/**
 * Validate an extracted/installed tarball against both the top-level source
 * allowlist and the declaration closure implied by its own packed sources.
 */
export function verifyPackedPackageClosure(packageRoot: string): PackedClosure {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    files?: unknown;
    patchedDependencies?: unknown;
  };
  if (JSON.stringify(manifest.files) !== JSON.stringify(PACKED_MANIFEST_FILES)) {
    throw new Error("Packed package manifest files allowlist does not match the release contract");
  }
  if (
    JSON.stringify(manifest.patchedDependencies) !== JSON.stringify(PACKED_PATCHED_DEPENDENCIES)
  ) {
    throw new Error("Packed package patch metadata does not match the release contract");
  }

  const files = relativeFiles(packageRoot);
  const missingPatches = Object.values(PACKED_PATCHED_DEPENDENCIES).filter(
    (path) => !files.includes(path),
  );
  if (missingPatches.length > 0) {
    throw new Error(`Packed package is missing declared patch files: ${missingPatches.join(", ")}`);
  }
  const unexpected = files.filter(
    (path) =>
      !PACKED_ROOT_FILES.has(path) && !PACKED_PREFIXES.some((prefix) => path.startsWith(prefix)),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Packed package contains paths outside the allowlist: ${unexpected.join(", ")}`,
    );
  }

  const actualDist = verifyDistClosure(
    join(packageRoot, "src"),
    join(packageRoot, "dist"),
    "Packed dist",
  );
  return { files, distFiles: actualDist };
}
