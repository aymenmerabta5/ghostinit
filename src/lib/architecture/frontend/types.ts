/** Dependency-free AST contract shared by the host and generated checker. */
export type FrontendRole =
  | "route"
  | "composition"
  | "workflow"
  | "adapter"
  | "model"
  | "view"
  | "primitive"
  | "infrastructure"
  | "other";

export interface FrontendNode {
  type?: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
}

export interface FrontendImport {
  specifier: string;
  typeOnly: boolean;
  /** Resolved, project-relative target, using forward slashes. */
  target?: string;
}

export interface FrontendOwnershipPolicy {
  schemaVersion: 1;
  workflow: { maxCodeLines: 200; maxReturnedFields: 20 };
  /** Exact app-relative paths; deliberately no glob or suffix exemptions. */
  infrastructure: readonly string[];
}

export interface FrontendFinding {
  id: string;
  severity: "HIGH";
  rule: "frontend-ownership";
  file: string;
  message: string;
  line: number;
  column: number;
}

export interface FrontendAnalysisInput {
  file: string;
  source: string;
  program: unknown;
  comments?: readonly unknown[];
  imports?: readonly FrontendImport[];
  /** Derived from the owning package, never from a permissive path suffix. */
  platform?: "web" | "expo" | "electron";
  policy?: FrontendOwnershipPolicy;
}
