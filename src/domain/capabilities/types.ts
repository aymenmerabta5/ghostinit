import type {
  AppTarget,
  BillingProvider,
  CacheProvider,
  FeatureFlagProvider,
} from "../project/choices.js";

export const CAPABILITY_IDS = [
  "transport",
  "auth",
  "billing",
  "messaging",
  "email",
  "storage",
  "cache",
  "analytics",
  "i18n",
  "pdf",
  "eve",
  "notifications",
  "featureFlags",
  "jobs",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const CLIENT_BINDING_STATUSES = ["supported", "unsupported", "not-required"] as const;
export type ClientBindingStatus = (typeof CLIENT_BINDING_STATUSES)[number];

export const CLIENT_SURFACE_ARTIFACT_KINDS = [
  "route",
  "adapter",
  "manifest",
  "acceptance",
] as const;
export type ClientSurfaceArtifactKind = (typeof CLIENT_SURFACE_ARTIFACT_KINDS)[number];

export type CapabilityRequirement =
  | {
      readonly kind: "capability";
      readonly capability: CapabilityId;
      readonly when?: "jobs-user-facing-api";
    }
  | {
      readonly kind: "backend";
    }
  | {
      readonly kind: "persistence";
    }
  | {
      readonly kind: "target-binding";
      readonly subject: "any-app" | "backend-host";
      readonly targets: readonly AppTarget[];
    };

export interface CapabilityDefinition {
  readonly id: CapabilityId;
  readonly description: string;
  readonly requirements: readonly CapabilityRequirement[];
  readonly acceptanceOperationIds: readonly string[];
  /** Whether enabling this capability creates an obligation for every selected app. */
  readonly clientSurfaceRequired: boolean;
  /** Closed, target-keyed support matrix. Missing targets are never interpreted as supported. */
  readonly clientBindings: Readonly<Record<AppTarget, CapabilityClientBinding>>;
}

/**
 * Source-controlled proof that an advertised acceptance operation is exercised
 * by an executable Bun test. Client routes may declare that they expose an
 * operation, but a route label is never behavioral evidence by itself.
 */
export interface CapabilityOperationEvidenceArtifact {
  readonly kind: "bun-test";
  readonly path: string;
  readonly testName: string;
}

export interface CapabilityOperationEvidence {
  readonly capability: CapabilityId;
  readonly operationId: string;
  readonly artifacts: readonly CapabilityOperationEvidenceArtifact[];
}

export interface CapabilityClientBinding {
  readonly status: ClientBindingStatus;
  readonly requiredOperationIds: readonly string[];
  readonly requiredArtifacts: readonly ClientSurfaceArtifactKind[];
  readonly reason?: string;
}

export interface DesiredBillingCapability {
  readonly providers: readonly BillingProvider[];
}

export interface DesiredFeatureFlagsCapability {
  /** Remote evaluation only. Compile-time static flags belong outside the capability graph. */
  readonly provider: FeatureFlagProvider;
}

export interface DesiredJobsCapability {
  readonly userFacingApi: boolean;
}

export interface DesiredCapabilities {
  readonly transport?: boolean;
  readonly auth?: boolean;
  readonly billing?: false | DesiredBillingCapability;
  readonly messaging?: boolean;
  readonly email?: boolean;
  readonly storage?: boolean;
  readonly cache?: CacheProvider;
  readonly analytics?: boolean;
  readonly i18n?: boolean;
  readonly pdf?: boolean;
  readonly eve?: boolean;
  readonly notifications?: boolean;
  readonly featureFlags?: false | DesiredFeatureFlagsCapability;
  readonly jobs?: false | DesiredJobsCapability;
}

export interface ResolvedBillingCapability {
  readonly enabled: boolean;
  readonly providers: readonly BillingProvider[];
}

export interface ResolvedCacheCapability {
  readonly enabled: boolean;
  readonly provider: CacheProvider;
}

export interface ResolvedFeatureFlagsCapability {
  readonly enabled: boolean;
  readonly provider: FeatureFlagProvider | null;
}

export interface ResolvedJobsCapability {
  readonly enabled: boolean;
  readonly userFacingApi: boolean;
}

export interface ResolvedCapabilities {
  readonly transport: boolean;
  readonly auth: boolean;
  readonly billing: ResolvedBillingCapability;
  readonly messaging: boolean;
  readonly email: boolean;
  readonly storage: boolean;
  readonly cache: ResolvedCacheCapability;
  readonly analytics: boolean;
  readonly i18n: boolean;
  readonly pdf: boolean;
  readonly eve: boolean;
  readonly notifications: boolean;
  readonly featureFlags: ResolvedFeatureFlagsCapability;
  readonly jobs: ResolvedJobsCapability;
}
