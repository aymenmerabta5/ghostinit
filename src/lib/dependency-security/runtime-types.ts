import type { DependencySecurityResult } from "../../domain/dependency-security/types.js";
import type { GenerationPlan } from "../../domain/generation/types.js";
import type { LockOwner } from "../lock.js";
import type { Logger } from "../logger.js";
import type { FsTransaction } from "../fs.js";
import type { SupervisedCommandInput, SupervisedCommandResult } from "../process-supervisor.js";

export interface DependencySecurityPolicy {
  readonly expectedBunVersion: string;
  readonly minimumReleaseAgeSeconds: number;
  /** Canonical standalone auditor supplied by the compiler/CLI, never project code. */
  readonly auditScriptContent: string;
  readonly patchedAdvisories: readonly { readonly package: string; readonly id: string }[];
  readonly protectedPackageVersions?: Readonly<Record<string, string>>;
}

export interface DependencySecurityRunOptions {
  readonly cwd: string;
  readonly mode: "audit" | "fix" | "install";
  readonly bootstrap?: boolean;
  /** @internal An upgrade changed dependency inputs and requires fresh resolution. */
  readonly reconcileLock?: boolean;
  readonly dryRun?: boolean;
  readonly policy: DependencySecurityPolicy;
  readonly logger?: Logger;
  /** An enclosing operation can retain its renewable project lease. */
  readonly leaseOwner?: LockOwner;
  readonly verifyProject?: boolean;
  readonly onContainmentFallback?: (message: string) => void;
  /** @internal Lets an enclosing create transaction compensate committed source writes. */
  readonly onTransactionCommitted?: (transaction: FsTransaction) => void;
  /** @internal Only the enclosing creation operation may defer journal completion. */
  readonly createLifecycle?: DependencySecurityCreateLifecycle;
}

/** Internal closures and state bytes must never be added to a public result. */
export interface DependencySecurityCreateCompletion {
  readonly complete: (input: {
    readonly plan: GenerationPlan;
    readonly stateContent: string;
  }) => Promise<void>;
  readonly fail: (input: {
    readonly cleanupVerified: boolean;
    readonly reason?: "creation-finalization";
  }) => Promise<void>;
}

export type DependencySecurityCleanupReason = "process-tree" | "creation-finalization";

export interface DependencySecurityCreatePublication {
  readonly root: string;
  readonly workspaceRoots: readonly string[];
  readonly manifestPaths: readonly string[];
  readonly beforeLockSha256: string | null;
  readonly afterLockSha256: string;
  readonly journalPath: string;
  readonly journalOperationId: string;
  readonly completion: DependencySecurityCreateCompletion;
}

export interface DependencySecurityCreateLifecycle {
  readonly kind: "existing-empty-root";
  readonly beforeProjectInstall: (
    publication: DependencySecurityCreatePublication,
  ) => Promise<void>;
}

/** @internal Injectable process boundary for deterministic failure/race tests. */
export interface DependencySecurityRuntimeDependencies {
  readonly resolveBun: (version: string) => string;
  readonly runCommand: (
    input: SupervisedCommandInput,
    expectedVersion: string,
  ) => Promise<SupervisedCommandResult>;
}

export type { DependencySecurityResult };

export interface LockedSecurityRelease {
  readonly package: string;
  readonly version: string;
  readonly integrity: string;
  readonly publishedAt: string;
}

export interface SecurityLockEvidence {
  readonly schemaVersion: 1;
  readonly registry: "https://registry.npmjs.org";
  readonly minimumReleaseAgeSeconds: number;
  readonly auditedAt: string;
  readonly lockSha256: string;
  readonly releases: readonly LockedSecurityRelease[];
}
