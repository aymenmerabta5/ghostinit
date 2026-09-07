import {
  getCapabilityDefinition,
  getEffectiveCapabilityClientBinding,
} from "../capabilities/support-catalog.js";
import { CAPABILITY_OPERATION_EVIDENCE } from "../capabilities/operation-evidence.js";
import type { CapabilityId, CapabilityOperationEvidence } from "../capabilities/types.js";
import type { ResolvedProjectConfig } from "../project/config.js";
import { GenerationPlanError } from "./plan-validation.js";
import type { GenerationPlan, PlannedFile } from "./types.js";

function requiresClientSurface(config: ResolvedProjectConfig, capability: CapabilityId): boolean {
  const definition = getCapabilityDefinition(capability);
  if (!definition.clientSurfaceRequired) return false;
  return capability !== "jobs" || config.capabilities.jobs.userFacingApi;
}

function appFiles(
  plan: GenerationPlan,
  appId: string,
  target: ResolvedProjectConfig["apps"][number]["target"],
): PlannedFile[] {
  return plan.files.filter(
    (file) => file.provenance.appId === appId && file.provenance.target === target,
  );
}

/**
 * Release evidence is independent from renderer provenance. A generated route
 * may bind an operation ID, but only an executable, source-controlled test can
 * satisfy the behavioral proof obligation.
 */
export function assertCapabilityOperationEvidence(
  config: ResolvedProjectConfig,
  evidence: readonly CapabilityOperationEvidence[] = CAPABILITY_OPERATION_EVIDENCE,
): void {
  const byOperationId = new Map(evidence.map((entry) => [entry.operationId, entry]));
  for (const capability of config.enabledCapabilities) {
    const definition = getCapabilityDefinition(capability);
    const missingOperations = definition.acceptanceOperationIds.filter((operationId) => {
      const entry = byOperationId.get(operationId);
      return (
        entry?.capability !== capability ||
        !entry.artifacts.some(
          (artifact) =>
            artifact.kind === "bun-test" &&
            /^tests\/(?:unit|integration)\/.+\.test\.[cm]?[jt]sx?$/.test(artifact.path) &&
            artifact.testName.trim().length > 0,
        )
      );
    });
    if (missingOperations.length === 0) continue;
    throw new GenerationPlanError(
      "missing-capability-operation-evidence",
      `Capability ${capability} has advertised operations without behavioral evidence`,
      { capability, missingOperations: missingOperations.join(",") },
    );
  }
}

/** Fail closed when a declared supported client binding has incomplete render evidence. */
export function assertClientSurfaceCoverage(
  config: ResolvedProjectConfig,
  plan: GenerationPlan,
  operationEvidence: readonly CapabilityOperationEvidence[] = CAPABILITY_OPERATION_EVIDENCE,
): void {
  assertCapabilityOperationEvidence(config, operationEvidence);
  for (const capability of config.enabledCapabilities) {
    if (!requiresClientSurface(config, capability)) continue;
    for (const app of config.apps) {
      const binding = getEffectiveCapabilityClientBinding({
        capability,
        target: app.target,
        database: config.backend === false ? "none" : config.backend.database,
        billingProviders: config.capabilities.billing.providers,
      });
      if (binding.status !== "supported") {
        throw new GenerationPlanError(
          "missing-client-surface-artifact",
          `Resolved capability ${capability} has no supported ${app.target} binding`,
          { capability, appId: app.id, target: app.target },
        );
      }

      const scoped = appFiles(plan, app.id, app.target);
      const capabilityFiles = scoped.filter((file) => file.provenance.capability === capability);
      const artifacts = new Set([
        ...capabilityFiles.flatMap((file) => file.provenance.artifacts),
        ...scoped
          .filter((file) => file.provenance.artifacts.includes("manifest"))
          .flatMap((file) => file.provenance.artifacts),
      ]);
      const missingArtifacts = binding.requiredArtifacts.filter(
        (artifact) => !artifacts.has(artifact),
      );
      const acceptance = new Set(capabilityFiles.flatMap((file) => file.provenance.acceptance));
      const missingOperations = binding.requiredOperationIds.filter(
        (operation) => !acceptance.has(operation),
      );
      if (missingArtifacts.length === 0 && missingOperations.length === 0) continue;

      throw new GenerationPlanError(
        "missing-client-surface-artifact",
        `GenerationPlan is missing declared ${capability} client-surface evidence for ${app.id}`,
        {
          capability,
          appId: app.id,
          target: app.target,
          missingArtifacts: missingArtifacts.join(","),
          missingOperations: missingOperations.join(","),
        },
      );
    }
  }
}
