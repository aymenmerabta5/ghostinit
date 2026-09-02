/**
 * Shim for backwards compatibility.
 * Original 1330 LOC god file split into modular architecture folder.
 * All logic now lives in src/lib/architecture/.
 */

export { analyzeProject, analyzeProjectReport } from "./architecture/index.js";
export type { AnalyzeProjectOptions } from "./architecture/index.js";
export type {
  ArchitectureFinding,
  ArchitectureReport,
  PackageInfo,
  CapabilityInfo,
  ImportKind,
  ImportReference,
  LayerInfo,
  ParsedFile,
  ParserDiagnostic,
} from "./architecture/types.js";
