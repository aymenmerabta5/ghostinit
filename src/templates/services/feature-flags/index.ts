import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { featureFlagsAdapterContractContent } from "./adapter-contract.js";
import { featureFlagsContractsContent } from "./contracts.js";
import { featureFlagsErrorsContent } from "./errors.js";
import { featureFlagsPolicyContent } from "./policy.js";
import { featureFlagsPortsContent } from "./ports.js";
import { featureFlagsServiceContent } from "./service.js";
import { featureFlagsServiceRoot } from "./shared.js";

function featureFlagsIndexContent(): string {
  return `import "server-only";
export { createFeatureFlagService, type FeatureFlagService, type FeatureFlagServiceDependencies } from "./service.js";
export { FeatureFlagError, FEATURE_FLAG_ERROR_CODES, isFeatureFlagError } from "./errors.js";
export {
  FEATURE_FLAGS_ARE_NOT_AUTHORIZATION,
  assertFeatureFlagSubject,
  normalizeRemoteFeatureFlagKey,
} from "./policy.js";
export { defineRemoteFeatureFlagAdapter } from "./adapter-contract.js";
export type {
  FeatureFlagEvaluation,
  FeatureFlagEvaluationReason,
  FeatureFlagProviderEvaluation,
  FeatureFlagSubject,
  FeatureFlagValue,
} from "./contracts.js";
export type { RemoteFeatureFlagPort } from "./ports.js";
export type { RemoteFeatureFlagAdapter } from "./adapter-contract.js";
`;
}

export function featureFlagsServiceFiles(mode: ProjectMode): TemplateFile[] {
  const root = featureFlagsServiceRoot(mode);
  return [
    file(`${root}/contracts.ts`, featureFlagsContractsContent()),
    file(`${root}/errors.ts`, featureFlagsErrorsContent()),
    file(`${root}/ports.ts`, featureFlagsPortsContent()),
    file(`${root}/policy.ts`, featureFlagsPolicyContent()),
    file(`${root}/adapter-contract.ts`, featureFlagsAdapterContractContent()),
    file(`${root}/service.ts`, featureFlagsServiceContent()),
    file(`${root}/index.ts`, featureFlagsIndexContent()),
  ];
}

export interface FeatureFlagsServiceIntegrationGuide {
  rendererImport: string;
  rendererCall: string;
  serviceBarrelLine: string;
  packageExport: Readonly<Record<string, string>> | null;
}

export function featureFlagsServiceIntegrationGuide(
  mode: ProjectMode,
): FeatureFlagsServiceIntegrationGuide {
  return {
    rendererImport: `import { featureFlagsServiceFiles } from "./feature-flags/index.js";`,
    rendererCall: `files.push(...featureFlagsServiceFiles("${mode}"));`,
    serviceBarrelLine: `export * as featureFlags from "./feature-flags/index.js";`,
    packageExport:
      mode === "monorepo" ? { "./feature-flags": "./src/feature-flags/index.ts" } : null,
  };
}

export { FEATURE_FLAGS_CAPABILITY_FRAGMENT } from "./capability.js";
