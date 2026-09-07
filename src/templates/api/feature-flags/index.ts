import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { featureFlagsActionsContent } from "./actions.js";
import { featureFlagsContextContent } from "./context.js";
import { featureFlagsContractContent } from "./contract.js";
import { featureFlagsDtoContent } from "./dto.js";
import { featureFlagsProceduresContent } from "./procedures.js";
import { featureFlagsSchemasContent } from "./schemas.js";
import { featureFlagsApiRoot } from "./shared.js";

function featureFlagsApiIndexContent(): string {
  return `export { featureFlagsContract } from "./contract.js";
export { createFeatureFlagActions } from "./actions.js";
export { createFeatureFlagProcedures, type FeatureFlagProcedures } from "./procedures.js";
export {
  requireFeatureFlagSubject,
  type FeatureFlagsTransportContext,
  type ResolveFeatureFlagService,
} from "./context.js";
`;
}

export function featureFlagsApiFiles(mode: ProjectMode): TemplateFile[] {
  const root = featureFlagsApiRoot(mode);
  return [
    file(`${root}/schemas.ts`, featureFlagsSchemasContent()),
    file(`${root}/contract.ts`, featureFlagsContractContent()),
    file(`${root}/context.ts`, featureFlagsContextContent(mode)),
    file(`${root}/dto.ts`, featureFlagsDtoContent(mode)),
    file(`${root}/actions.ts`, featureFlagsActionsContent()),
    file(`${root}/procedures.ts`, featureFlagsProceduresContent()),
    file(`${root}/index.ts`, featureFlagsApiIndexContent()),
  ];
}

export interface FeatureFlagsApiIntegrationGuide {
  rendererImport: string;
  rendererCall: string;
  contractImport: string;
  contractEntry: string;
  contextField: string;
  routerEntry: string;
  compositionInstruction: string;
}

export function featureFlagsApiIntegrationGuide(
  mode: ProjectMode,
): FeatureFlagsApiIntegrationGuide {
  const serviceModule =
    mode === "monorepo" ? "@repo/services/feature-flags" : "@/server/services/feature-flags";
  return {
    rendererImport: `import { featureFlagsApiFiles } from "./api/feature-flags/index.js";`,
    rendererCall: `files.push(...featureFlagsApiFiles("${mode}"));`,
    contractImport: `import { featureFlagsContract } from "./feature-flags/contract.js";`,
    contractEntry: `featureFlags: featureFlagsContract,`,
    contextField: `featureFlagSubject?: import("${serviceModule}").FeatureFlagSubject | null;`,
    routerEntry: `featureFlags: createFeatureFlagProcedures<ApiContext>((context) => createFeatureFlagServiceForRequest(context)),`,
    compositionInstruction:
      "Derive FeatureFlagSubject from trusted session or anonymous-cookie state, then adapt the chosen remote provider behind RemoteFeatureFlagPort. Never use evaluations for authorization.",
  };
}
