import type { CapabilityId, ClientSurfaceArtifactKind } from "../capabilities/types.js";
import type { AppTarget } from "../project/choices.js";

export const GENERATION_PLAN_SCHEMA_URI =
  "https://ghostinit.dev/schemas/generation-plan.schema.json" as const;

export const FILE_OWNERS = [
  "root",
  "ui",
  "transport",
  "application",
  "domain",
  "adapter",
  "platform",
  "tooling",
  "documentation",
  "ghostinit",
] as const;
export type FileOwner = (typeof FILE_OWNERS)[number];

export const FILE_LIFECYCLES = ["generator-owned", "seed-once", "structured-merge"] as const;
export type FileLifecycle = (typeof FILE_LIFECYCLES)[number];

export interface PlannedFileProvenanceInput {
  readonly renderer: string;
  readonly source: string;
  readonly capability: CapabilityId | null;
  readonly appId?: string | null;
  readonly target?: AppTarget | null;
  readonly artifacts?: readonly ClientSurfaceArtifactKind[];
  readonly acceptance: readonly string[];
  readonly contribution: readonly string[];
}

export interface PlannedFileProvenance extends PlannedFileProvenanceInput {
  readonly appId: string | null;
  readonly target: AppTarget | null;
  readonly artifacts: readonly ClientSurfaceArtifactKind[];
}

export interface PlannedFileInput {
  readonly logicalPath: string;
  readonly physicalPath: string;
  readonly content: string;
  readonly owner: FileOwner;
  readonly lifecycle: FileLifecycle;
  readonly provenance: PlannedFileProvenanceInput;
}

export interface PlannedFile extends Omit<PlannedFileInput, "provenance"> {
  readonly contentHash: string;
  readonly provenance: PlannedFileProvenance;
}

export interface SecretDestination {
  readonly physicalPath: string;
  readonly format: "dotenv" | "json-field";
  readonly field: string;
}

interface PlannedSecretBase {
  readonly reference: string;
  readonly environmentKey: string;
  readonly destinations: readonly SecretDestination[];
}

export interface ExternalSecretReference extends PlannedSecretBase {
  readonly kind: "require-external";
  readonly provider: string;
  readonly placeholder: string;
}

export interface SelfIssuedSecretOperation extends PlannedSecretBase {
  readonly kind: "generate-self-issued";
  readonly bytes: number;
  readonly encoding: "base64url" | "hex";
}

export type PlannedSecretOperation = ExternalSecretReference | SelfIssuedSecretOperation;

export interface GenerationPlan {
  readonly $schema: typeof GENERATION_PLAN_SCHEMA_URI;
  readonly schemaVersion: 1;
  readonly projectConfigHash: string;
  readonly planHash: string;
  readonly files: readonly PlannedFile[];
  readonly secrets: readonly PlannedSecretOperation[];
}

export interface GenerationPlanInput {
  readonly projectConfigHash: string;
  readonly files: readonly PlannedFileInput[];
  readonly secrets?: readonly PlannedSecretOperation[];
}
