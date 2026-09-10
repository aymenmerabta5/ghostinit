import type { DependencyFieldPath } from "./types.js";
import { DependencySecurityResolutionError } from "./resolutions.js";

export interface DependencySecurityDeclaration {
  readonly parent: Record<string, unknown>;
  readonly key: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function declarationAt(
  manifest: Record<string, unknown>,
  field: readonly string[],
): DependencySecurityDeclaration | null {
  let parent = manifest;
  for (const segment of field.slice(0, -1)) {
    const value = Object.hasOwn(parent, segment) ? parent[segment] : undefined;
    if (!object(value)) return null;
    parent = value;
  }
  const key = field.at(-1)!;
  return Object.hasOwn(parent, key) ? { parent, key } : null;
}

/** Never infer a writer when root and workspaces catalogs both claim a slot. */
export function dependencySecurityDeclaration(
  manifest: Record<string, unknown>,
  field: DependencyFieldPath,
): DependencySecurityDeclaration | null {
  const local = field[0] === "workspaces" ? field.slice(1) : field;
  if (local[0] === "catalog" || local[0] === "catalogs") {
    const packageName = local.at(-1)!;
    const candidates =
      local[0] === "catalog" || local[1] === "default"
        ? [
            ["catalog", packageName],
            ["catalogs", "default", packageName],
          ]
        : [local];
    const locations = candidates.flatMap((candidate) => [candidate, ["workspaces", ...candidate]]);
    if (locations.filter((candidate) => declarationAt(manifest, candidate) !== null).length > 1) {
      throw new DependencySecurityResolutionError(
        "Ambiguous catalog dependency: multiple root, workspaces, or default-alias declarations claim the same package",
      );
    }
  }
  return declarationAt(manifest, field);
}
