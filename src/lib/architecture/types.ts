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

export interface ParsedFile {
  imports: string[];
  directives: Set<string>;
}
