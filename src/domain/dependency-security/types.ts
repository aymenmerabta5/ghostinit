/** Provider-neutral contracts for dependency security maintenance. */
export type DependencyFieldPath =
  | readonly [
      (
        | "dependencies"
        | "devDependencies"
        | "optionalDependencies"
        | "peerDependencies"
        | "overrides"
      ),
      string,
    ]
  | readonly ["catalog", string]
  | readonly ["catalogs", string, string]
  | readonly ["workspaces", "catalog", string]
  | readonly ["workspaces", "catalogs", string, string];

/** A verified floor for one explicitly declared dependency; it is compiler input. */
export interface DependencySecurityResolution {
  readonly manifestPath: string;
  readonly field: DependencyFieldPath;
  readonly package: string;
  readonly originalSpec: string;
  readonly version: string;
  readonly integrity: string;
  readonly publishedAt: string;
  readonly auditedAt: string;
  readonly advisories: readonly string[];
}

export interface DependencySecurityResolutions {
  readonly schemaVersion: 1;
  readonly resolutions: readonly DependencySecurityResolution[];
}

export type DependencySecuritySeverity = "low" | "moderate" | "high" | "critical" | "unknown";
export type DependencySecurityDisposition =
  | "patched"
  | "blocked-range"
  | "blocked-release-age"
  | "no-published-fix"
  | "unresolved";

export interface DependencySecurityAdvisory {
  readonly package: string;
  readonly url: string;
  readonly severity: DependencySecuritySeverity;
  readonly disposition: DependencySecurityDisposition;
}

export interface DependencySecurityChange {
  readonly package: string;
  readonly from: string;
  readonly to: string;
  readonly manifests: readonly string[];
}

/** Internal source bytes never belong in a public JSON or log response. */
export interface DependencySecurityFileChange {
  readonly path: string;
  readonly before: string | null;
  readonly after: string;
}

export interface DependencySecurityRepairPlan {
  readonly schemaVersion: 1;
  readonly beforeLockSha256: string | null;
  readonly afterLockSha256: string;
  readonly changes: readonly DependencySecurityChange[];
  readonly resolutions: DependencySecurityResolutions;
  readonly files: readonly DependencySecurityFileChange[];
}

export interface DependencySecurityResult {
  readonly status: "clean" | "fixed" | "partial" | "blocked" | "failed";
  readonly dryRun: boolean;
  readonly applied: boolean;
  readonly installedVerified: boolean;
  readonly changes: readonly DependencySecurityChange[];
  readonly remaining: readonly DependencySecurityAdvisory[];
  readonly verifiedPatchAdvisories: readonly string[];
  readonly message?: string;
  readonly recoveryRequired?: boolean;
}
