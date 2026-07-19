/**
 * Shim for backwards compatibility.
 * Original 1330 LOC god file split into modular architecture folder.
 * All logic now lives in src/lib/architecture/.
 */

export { analyzeProject } from "./architecture/index.js";
export type {
  ArchitectureFinding,
  PackageInfo,
  CapabilityInfo,
  LayerInfo,
  ParsedFile,
} from "./architecture/types.js";
