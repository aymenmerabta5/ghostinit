/**
 * Shared types for modular architecture checker.
 * Single responsibility: define data structures only (<5 imports, pure).
 */

export interface ArchitectureFinding {
  id: string;
  severity: "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
  file: string;
  rule: string;
  line?: number;
  column?: number;
  specifier?: string;
  importKind?: ImportKind;
  trace?: string[];
}

export interface ArchitectureReport {
  schemaVersion: 2;
  complete: boolean;
  findings: ArchitectureFinding[];
  stats: {
    files: number;
    imports: number;
    resolvedImports: number;
    unresolvedOwnedImports: number;
  };
}

export interface PackageInfo {
  name: string;
  dir: string;
  dependencies: Set<string>;
}

export interface CapabilityInfo {
  kind: string;
  name: string;
}

export interface LayerInfo {
  level: number;
  name: string;
}

export type ImportKind = "import" | "reexport" | "import-equals" | "require" | "dynamic-import";

/** One-based line/column coordinates with zero-based, end-exclusive offsets. */
export interface SourceLocation {
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface ImportReference {
  specifier: string;
  kind: ImportKind;
  typeOnly: boolean;
  location: SourceLocation;
}

export interface ParserDiagnosticLabel {
  message: string | null;
  start: number;
  end: number;
}

export interface ParserDiagnostic {
  severity: "Error" | "Warning" | "Advice";
  message: string;
  labels: ParserDiagnosticLabel[];
  helpMessage: string | null;
  codeframe: string | null;
}

export interface ParsedFile {
  /** Legacy, first-seen list retained for existing architecture rules. */
  imports: string[];
  importReferences: ImportReference[];
  directives: Set<string>;
  /** True only when a use-server module exports async functions and erased types. */
  serverActionValid: boolean;
  diagnostics: ParserDiagnostic[];
}
