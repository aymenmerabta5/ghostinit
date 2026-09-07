// @allow-long 12-imports: identity API renderer assembles independently testable contract and procedure templates
import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { identityActionsContent } from "./actions.js";
import { identityContractErrorsContent } from "./contract-errors.js";
import { identityContractContent } from "./contract.js";
import { identityContextContent } from "./context.js";
import { identityInvitationContractsContent } from "./invitation-contracts.js";
import { identityOrganizationContractsContent } from "./organization-contracts.js";
import { identityProceduresContent } from "./procedures.js";
import { identitySchemasContent } from "./schemas.js";
import { identitySessionContractsContent } from "./session-contracts.js";
import { identityApiRoot, identityServiceModule } from "./shared.js";
import { identityTeamContractsContent } from "./team-contracts.js";

function identityApiIndexContent(): string {
  return `export { identityContract } from "./contract.js";
export { identityContractErrors } from "./contract-errors.js";
export { createIdentityActions } from "./actions.js";
export { createIdentityProcedures, type IdentityProcedures } from "./procedures.js";
export { type IdentityTransportContext } from "./context.js";
export { identitySessionContracts } from "./session-contracts.js";
export { identityOrganizationContracts } from "./organization-contracts.js";
export { identityInvitationContracts } from "./invitation-contracts.js";
export { identityTeamContracts } from "./team-contracts.js";
`;
}

export function identityApiFiles(mode: ProjectMode): TemplateFile[] {
  const root = identityApiRoot(mode);
  return [
    file(`${root}/contract-errors.ts`, identityContractErrorsContent()),
    file(`${root}/schemas.ts`, identitySchemasContent()),
    file(`${root}/session-contracts.ts`, identitySessionContractsContent()),
    file(`${root}/organization-contracts.ts`, identityOrganizationContractsContent()),
    file(`${root}/invitation-contracts.ts`, identityInvitationContractsContent()),
    file(`${root}/team-contracts.ts`, identityTeamContractsContent()),
    file(`${root}/contract.ts`, identityContractContent()),
    file(`${root}/context.ts`, identityContextContent(mode)),
    file(`${root}/actions.ts`, identityActionsContent(mode)),
    file(`${root}/procedures.ts`, identityProceduresContent()),
    file(`${root}/index.ts`, identityApiIndexContent()),
  ];
}

export interface IdentityApiIntegrationGuide {
  emissionCondition: string;
  rendererImport: string;
  rendererCall: string;
  contractImport: string;
  contractEntry: string;
  contextField: string;
  compositionInstruction: string;
  routerEntry: string;
}

export function identityApiIntegrationGuide(mode: ProjectMode): IdentityApiIntegrationGuide {
  const root = mode === "monorepo" ? "packages/api/src" : "src/server/api";
  const serviceModule = identityServiceModule(mode);
  return {
    emissionCondition: `withAuth && database !== "none"`,
    rendererImport: `import { identityApiFiles } from "./api/identity/index.js";`,
    rendererCall: `files.push(...identityApiFiles("${mode}"));`,
    contractImport: `import { identityContract } from "./identity/contract.js";`,
    contractEntry: `identity: identityContract,`,
    contextField: `identityActor?: import("${serviceModule}").IdentityActor | null; // derive activeOrganizationId, activeTeamId, and authenticatedAt from the verified server session`,
    compositionInstruction:
      `Create ${root}/composition/identity.ts. Adapt Better Auth plus the selected database behind ` +
      `PostgresIdentityAdapter or ConvexIdentityAdapter, return a request-scoped IdentityService, and ` +
      `derive identityActor/authenticatedAt only from verified server session state.`,
    routerEntry: `identity: createIdentityProcedures<ApiContext>(),`,
  };
}
