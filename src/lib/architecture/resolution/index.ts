import type { ImportReference } from "../types.js";
import { createImportResolver } from "./resolver.js";
import type { ImportResolverOptions, ResolvedImport } from "./types.js";

export { createImportResolver } from "./resolver.js";
export type {
  ImportResolver,
  ImportResolverOptions,
  ImportResolutionKind,
  ImportResolutionReason,
  ResolvedImport,
} from "./types.js";

/** Convenience API for callers that do not need to reuse resolver caches. */
export async function resolveImports(
  root: string,
  fromFile: string,
  references: readonly ImportReference[],
  options?: ImportResolverOptions,
): Promise<ResolvedImport[]> {
  const resolver = await createImportResolver(root, options);
  return resolver.resolveAll(fromFile, references);
}
