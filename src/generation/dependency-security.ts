import type { PlannedFileInput } from "../domain/generation/types.js";
import type { DependencySecurityResolutions } from "../domain/dependency-security/types.js";
import { normalizeDependencySecurityResolutions } from "../domain/dependency-security/resolutions.js";
import { dependencySecurityDeclaration } from "../domain/dependency-security/declarations.js";
import {
  compareSecurityVersions,
  isCompatibleSecurityVersion,
  securityRangeBase,
} from "../domain/dependency-security/versions.js";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Resolve only existing renderer-owned declaration slots, before plan acceptance. */
export function applyDependencySecurityResolutions(
  files: readonly PlannedFileInput[],
  input?: DependencySecurityResolutions,
): readonly PlannedFileInput[] {
  if (input === undefined) return files;
  const document = normalizeDependencySecurityResolutions(input);
  return files.map((file) => {
    const resolutions = document.resolutions.filter(
      ({ manifestPath }) => manifestPath === file.physicalPath,
    );
    if (resolutions.length === 0) return file;
    const manifest: unknown = JSON.parse(file.content);
    if (!object(manifest))
      throw new Error(`Planned manifest ${file.physicalPath} must be an object`);
    let changed = false;
    for (const resolution of resolutions) {
      const declaration = dependencySecurityDeclaration(manifest, resolution.field);
      if (!declaration) continue;
      const { parent, key } = declaration;
      const spec = parent[key];
      if (typeof spec !== "string") continue;
      const base = securityRangeBase(spec);
      // Removed capabilities and declarations, workspace references, and new
      // incompatible catalog families do not inherit an obsolete resolution.
      if (base === null) continue;
      if (compareSecurityVersions(base, resolution.version) >= 0) continue;
      if (!isCompatibleSecurityVersion(spec, resolution.version)) continue;
      parent[key] = resolution.version;
      changed = true;
    }
    if (!changed) return file;
    return {
      ...file,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
      provenance: {
        ...file.provenance,
        acceptance: [
          ...new Set([...file.provenance.acceptance, "dependency.security-resolution.v1"]),
        ],
        contribution: [
          ...new Set([...file.provenance.contribution, "dependency-security.resolution.v1"]),
        ],
      },
    };
  });
}
