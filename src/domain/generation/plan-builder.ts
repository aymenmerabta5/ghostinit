import {
  CAPABILITY_IDS,
  CLIENT_SURFACE_ARTIFACT_KINDS,
  type ClientSurfaceArtifactKind,
} from "../capabilities/types.js";
import { APP_TARGETS, PROJECT_NAME_PATTERN } from "../project/choices.js";
import { canonicalHash, deepFreeze, sha256 } from "../project/canonical.js";
import {
  collisionKey,
  compareText,
  GenerationPlanError,
  normalizeIdentifiers,
  requireHash,
  requireIdentifier,
  requirePlanPath,
} from "./plan-validation.js";
import {
  FILE_LIFECYCLES,
  FILE_OWNERS,
  GENERATION_PLAN_SCHEMA_URI,
  type GenerationPlan,
  type GenerationPlanInput,
  type PlannedFile,
  type PlannedFileInput,
  type PlannedFileProvenance,
  type PlannedFileProvenanceInput,
  type PlannedSecretOperation,
  type SecretDestination,
} from "./types.js";

function normalizeArtifacts(
  values: readonly ClientSurfaceArtifactKind[] | undefined,
): ClientSurfaceArtifactKind[] {
  const artifacts = [...new Set(values ?? [])];
  for (const artifact of artifacts) {
    if (!CLIENT_SURFACE_ARTIFACT_KINDS.some((candidate) => candidate === artifact)) {
      throw new GenerationPlanError("invalid-provenance", "Unknown client surface artifact", {
        artifact: String(artifact),
      });
    }
  }
  return artifacts.sort(compareText);
}

function normalizeProvenance(provenance: PlannedFileProvenanceInput): PlannedFileProvenance {
  if (
    provenance.capability !== null &&
    !CAPABILITY_IDS.some((capability) => capability === provenance.capability)
  ) {
    throw new GenerationPlanError("invalid-provenance", "Unknown provenance capability", {
      capability: String(provenance.capability),
    });
  }

  const appId = provenance.appId ?? null;
  const target = provenance.target ?? null;
  if ((appId === null) !== (target === null)) {
    throw new GenerationPlanError(
      "invalid-provenance",
      "Client provenance appId and target must be declared together",
    );
  }
  if (appId !== null && !PROJECT_NAME_PATTERN.test(appId)) {
    throw new GenerationPlanError("invalid-provenance", "Invalid provenance app id", { appId });
  }
  if (target !== null && !APP_TARGETS.some((candidate) => candidate === target)) {
    throw new GenerationPlanError("invalid-provenance", "Unknown provenance app target", {
      target: String(target),
    });
  }
  const artifacts = normalizeArtifacts(provenance.artifacts);
  if (artifacts.length > 0 && appId === null) {
    throw new GenerationPlanError(
      "invalid-provenance",
      "Client surface artifacts require an appId and target",
    );
  }
  if (provenance.capability === null && artifacts.some((artifact) => artifact !== "manifest")) {
    throw new GenerationPlanError(
      "invalid-provenance",
      "Route, adapter, and acceptance artifacts require a capability",
    );
  }

  return {
    renderer: requireIdentifier(provenance.renderer, "renderer"),
    source: requireIdentifier(provenance.source, "source"),
    capability: provenance.capability,
    appId,
    target,
    artifacts,
    acceptance: normalizeIdentifiers(provenance.acceptance, "acceptance"),
    contribution: normalizeIdentifiers(provenance.contribution, "contribution"),
  };
}

function normalizeFile(input: PlannedFileInput): PlannedFile {
  if (!FILE_OWNERS.some((owner) => owner === input.owner)) {
    throw new GenerationPlanError(
      "invalid-file-owner",
      `Unknown file owner ${String(input.owner)}`,
    );
  }
  if (!FILE_LIFECYCLES.some((lifecycle) => lifecycle === input.lifecycle)) {
    throw new GenerationPlanError(
      "invalid-file-lifecycle",
      `Unknown file lifecycle ${String(input.lifecycle)}`,
    );
  }
  if (typeof input.content !== "string") {
    throw new GenerationPlanError("invalid-provenance", "Planned file content must be a string");
  }

  return {
    logicalPath: requirePlanPath(input.logicalPath, "logicalPath"),
    physicalPath: requirePlanPath(input.physicalPath, "physicalPath"),
    content: input.content,
    contentHash: sha256(input.content),
    owner: input.owner,
    lifecycle: input.lifecycle,
    provenance: normalizeProvenance(input.provenance),
  };
}

function fileSort(left: PlannedFile, right: PlannedFile): number {
  return (
    compareText(left.physicalPath, right.physicalPath) ||
    compareText(left.logicalPath, right.logicalPath) ||
    compareText(left.provenance.renderer, right.provenance.renderer)
  );
}

function normalizeDestination(destination: SecretDestination): SecretDestination {
  if (!/^[A-Z][A-Z0-9_]*$/.test(destination.field)) {
    throw new GenerationPlanError(
      "invalid-secret-operation",
      "Secret destination fields must be uppercase environment-style keys",
      { field: destination.field },
    );
  }
  return {
    physicalPath: requirePlanPath(destination.physicalPath, "physicalPath"),
    format: destination.format,
    field: destination.field,
  };
}

function destinationSort(left: SecretDestination, right: SecretDestination): number {
  return (
    compareText(left.physicalPath, right.physicalPath) ||
    compareText(left.format, right.format) ||
    compareText(left.field, right.field)
  );
}

function hasForbiddenSecretValue(operation: PlannedSecretOperation): boolean {
  return ["value", "secret", "content", "materializedValue"].some((key) =>
    Object.prototype.hasOwnProperty.call(operation, key),
  );
}

function normalizeSecret(operation: PlannedSecretOperation): PlannedSecretOperation {
  if (hasForbiddenSecretValue(operation)) {
    throw new GenerationPlanError(
      "secret-value-forbidden",
      "Generation plans may contain secret references and operations, never secret values",
      { reference: operation.reference },
    );
  }
  const reference = requireIdentifier(operation.reference, "reference");
  if (!/^[A-Z][A-Z0-9_]*$/.test(operation.environmentKey)) {
    throw new GenerationPlanError(
      "invalid-secret-operation",
      "Secret environment keys must use uppercase snake case",
      { environmentKey: operation.environmentKey },
    );
  }
  const destinations = operation.destinations.map(normalizeDestination).sort(destinationSort);
  if (destinations.length === 0) {
    throw new GenerationPlanError(
      "invalid-secret-operation",
      "Secret operations require at least one destination",
      { reference },
    );
  }

  if (operation.kind === "require-external") {
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(operation.provider) ||
      !/^REPLACE_WITH_[A-Z0-9_]+$/.test(operation.placeholder)
    ) {
      throw new GenerationPlanError(
        "invalid-secret-operation",
        "External secrets require a provider and a REPLACE_WITH_* placeholder",
        { reference },
      );
    }
    return {
      kind: operation.kind,
      reference,
      environmentKey: operation.environmentKey,
      provider: operation.provider,
      placeholder: operation.placeholder,
      destinations,
    };
  }

  if (
    operation.kind !== "generate-self-issued" ||
    !Number.isInteger(operation.bytes) ||
    operation.bytes < 16 ||
    operation.bytes > 128 ||
    (operation.encoding !== "base64url" && operation.encoding !== "hex")
  ) {
    throw new GenerationPlanError(
      "invalid-secret-operation",
      "Self-issued secrets require 16-128 bytes and a supported encoding",
      { reference },
    );
  }
  return {
    kind: operation.kind,
    reference,
    environmentKey: operation.environmentKey,
    bytes: operation.bytes,
    encoding: operation.encoding,
    destinations,
  };
}

function secretSort(left: PlannedSecretOperation, right: PlannedSecretOperation): number {
  return compareText(left.reference, right.reference) || compareText(left.kind, right.kind);
}

function rejectDuplicateFiles(files: readonly PlannedFile[]): void {
  const paths = new Map<string, PlannedFile>();
  for (const file of files) {
    const key = collisionKey(file.physicalPath);
    const previous = paths.get(key);
    if (previous) {
      throw new GenerationPlanError(
        "duplicate-physical-path",
        `Two planned files target the same physical path: ${file.physicalPath}`,
        {
          firstLogicalPath: previous.logicalPath,
          secondLogicalPath: file.logicalPath,
          physicalPath: file.physicalPath,
        },
      );
    }
    paths.set(key, file);
  }
}

function rejectDuplicateSecrets(secrets: readonly PlannedSecretOperation[]): void {
  const references = new Set<string>();
  const destinations = new Map<string, string>();
  for (const secret of secrets) {
    if (references.has(secret.reference)) {
      throw new GenerationPlanError(
        "duplicate-secret-reference",
        `Secret reference ${secret.reference} is declared more than once`,
        { reference: secret.reference },
      );
    }
    references.add(secret.reference);

    for (const destination of secret.destinations) {
      const key = `${collisionKey(destination.physicalPath)}\u0000${destination.format}\u0000${destination.field}`;
      const previous = destinations.get(key);
      if (previous) {
        throw new GenerationPlanError(
          "duplicate-secret-destination",
          `Secret destination ${destination.physicalPath}:${destination.field} has multiple writers`,
          { firstReference: previous, secondReference: secret.reference },
        );
      }
      destinations.set(key, secret.reference);
    }
  }
}

export function buildGenerationPlan(input: GenerationPlanInput): GenerationPlan {
  requireHash(input.projectConfigHash);
  const files = input.files.map(normalizeFile);
  rejectDuplicateFiles(files);
  files.sort(fileSort);

  const secrets = (input.secrets ?? []).map(normalizeSecret);
  rejectDuplicateSecrets(secrets);
  secrets.sort(secretSort);

  const body = {
    $schema: GENERATION_PLAN_SCHEMA_URI,
    schemaVersion: 1 as const,
    projectConfigHash: input.projectConfigHash,
    files,
    secrets,
  } as const;
  const plan = {
    ...body,
    planHash: canonicalHash(body),
  } satisfies GenerationPlan;
  return deepFreeze(plan);
}
