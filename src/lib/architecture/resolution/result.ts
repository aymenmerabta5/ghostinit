import type { ImportReference } from "../types.js";
import type { ImportResolutionReason, ResolvedImport } from "./types.js";

export function resolutionResult(
  reference: ImportReference,
  specifier: string,
  source: string,
  kind: ResolvedImport["kind"],
  owned: boolean,
  reason: ImportResolutionReason,
  target?: string,
  packageName?: string,
): ResolvedImport {
  return { reference, specifier, source, kind, owned, target, packageName, reason };
}
