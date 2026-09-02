import type { ImportReference } from "../types.js";

export type ImportResolutionKind =
  | "internal"
  | "workspace"
  | "builtin"
  | "external"
  | "generated"
  | "unresolved";

export type ImportResolutionReason =
  | "relative-file"
  | "tsconfig-path"
  | "tsconfig-base-url"
  | "package-import"
  | "workspace-export"
  | "self-reference"
  | "node-builtin"
  | "bun-builtin"
  | "external-package"
  | "external-url"
  | "generated-next-types"
  | "generated-route-tree"
  | "invalid-specifier"
  | "source-outside-project"
  | "target-outside-project"
  | "relative-target-missing"
  | "tsconfig-path-target-missing"
  | "package-import-not-defined"
  | "package-import-blocked"
  | "package-import-target-missing"
  | "workspace-package-ambiguous"
  | "workspace-package-not-found"
  | "workspace-export-not-defined"
  | "workspace-export-blocked"
  | "workspace-target-missing"
  | "self-export-not-defined"
  | "self-export-blocked"
  | "self-target-missing";

/** A resolution result contains project-relative paths only. */
export interface ResolvedImport {
  reference: ImportReference;
  /** Query/hash-free specifier with forward slashes. */
  specifier: string;
  /** Importing file relative to the analyzed project. */
  source: string;
  kind: ImportResolutionKind;
  /** True for targets whose absence is owned by the analyzed project. */
  owned: boolean;
  /** Resolved or intended project-relative target, when one is safe to expose. */
  target?: string;
  packageName?: string;
  /** Stable machine-readable code; it never contains an absolute path. */
  reason: ImportResolutionReason;
}

export interface ImportResolverOptions {
  /** Additional package-export conditions, in priority-neutral membership order. */
  conditions?: readonly string[];
}

export interface ImportResolver {
  resolve(fromFile: string, reference: ImportReference): Promise<ResolvedImport>;
  resolveAll(fromFile: string, references: readonly ImportReference[]): Promise<ResolvedImport[]>;
}

export type PackageTarget = string | null | PackageTarget[] | PackageTargetMap;

export interface PackageTargetMap {
  [key: string]: PackageTarget;
}

export interface PackageManifest {
  dir: string;
  relativeDir: string;
  name?: string;
  exports?: PackageTarget;
  imports?: PackageTargetMap;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  tsconfig?: string;
}

export interface WorkspaceInventory {
  rootManifest?: PackageManifest;
  packagesByName: Map<string, PackageManifest[]>;
}

export interface TypeScriptPathTarget {
  value: string;
  baseDir: string;
}

export interface TypeScriptPathMapping {
  pattern: string;
  targets: TypeScriptPathTarget[];
}

export interface TypeScriptResolutionConfig {
  baseUrl?: string;
  paths?: TypeScriptPathMapping[];
}
