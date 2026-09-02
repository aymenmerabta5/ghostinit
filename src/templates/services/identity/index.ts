// @allow-long 12-imports: identity renderer assembles isolated contract, policy, use-case, and adapter templates
import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { identityAdapterContractsContent } from "./adapter-contracts.js";
import { identityApplicationContent } from "./application.js";
import { identityContractsContent } from "./contracts.js";
import { identityErrorsContent } from "./errors.js";
import { identityInvitationsContent } from "./invitations.js";
import { identityOrganizationsContent } from "./organizations.js";
import { identityPolicyContent } from "./policy.js";
import { identityPortsContent } from "./ports.js";
import { identityServiceContent } from "./service.js";
import { identityServiceRoot } from "./shared.js";
import { identitySessionsContent } from "./sessions.js";
import { identityTeamsContent } from "./teams.js";

function identityIndexContent(): string {
  return `export { createIdentityService, type IdentityService } from "./service.js";
export { createSessionUseCases, type SessionUseCases } from "./sessions.js";
export { createOrganizationUseCases, type OrganizationUseCases } from "./organizations.js";
export { createInvitationUseCases, type InvitationUseCases } from "./invitations.js";
export { createTeamUseCases, type TeamUseCases } from "./teams.js";
export {
  DEFAULT_FRESH_SESSION_MAXIMUM_AGE_MS,
  DEFAULT_INVITATION_LIFETIME_MS,
  type IdentityUseCaseDependencies,
} from "./application.js";
export {
  IdentityApplicationError,
  IdentityDomainError,
  IdentityError,
  IDENTITY_APPLICATION_ERROR_CODES,
  IDENTITY_DOMAIN_ERROR_CODES,
  isIdentityError,
} from "./errors.js";
export {
  IDENTITY_PERMISSIONS,
  ORGANIZATION_ROLES,
} from "./contracts.js";
export {
  assertFreshSession,
  assertRolePermission,
  hasRolePermission,
  normalizeIdentityEmail,
} from "./policy.js";
export {
  defineConvexIdentityAdapter,
  definePostgresIdentityAdapter,
} from "./adapter-contracts.js";
export type {
  IdentityActor,
  IdentityAuditAction,
  IdentityAuditEvent,
  IdentityPermission,
  IdentitySession,
  InvitationStatus,
  MutationResult,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationRole,
  OrganizationTeam,
  TeamMembership,
} from "./contracts.js";
export type {
  IdentityAdapterPort,
  IdentityAuditPort,
  IdentityPersistencePort,
  IdentityUnitOfWorkContext,
  IdentityUnitOfWorkPort,
} from "./ports.js";
export type {
  ConvexIdentityAdapter,
  IdentityAdapterParity,
  PostgresIdentityAdapter,
  SupportedIdentityAdapter,
} from "./adapter-contracts.js";
export type { CreateInvitationInput } from "./invitations.js";
export type { ChangeMemberRoleInput, CreateOrganizationInput, RemoveMemberInput } from "./organizations.js";
export type { TeamMembershipInput } from "./teams.js";
`;
}

export function identityServiceFiles(mode: ProjectMode): TemplateFile[] {
  const root = identityServiceRoot(mode);
  return [
    file(`${root}/contracts.ts`, identityContractsContent()),
    file(`${root}/errors.ts`, identityErrorsContent()),
    file(`${root}/ports.ts`, identityPortsContent()),
    file(`${root}/policy.ts`, identityPolicyContent()),
    file(`${root}/application.ts`, identityApplicationContent()),
    file(`${root}/adapter-contracts.ts`, identityAdapterContractsContent()),
    file(`${root}/sessions.ts`, identitySessionsContent()),
    file(`${root}/organizations.ts`, identityOrganizationsContent()),
    file(`${root}/invitations.ts`, identityInvitationsContent()),
    file(`${root}/teams.ts`, identityTeamsContent()),
    file(`${root}/service.ts`, identityServiceContent()),
    file(`${root}/index.ts`, identityIndexContent()),
  ];
}

export interface IdentityServiceIntegrationGuide {
  emissionCondition: string;
  rendererImport: string;
  rendererCall: string;
  serviceBarrelLine: string;
  packageExport: Readonly<Record<string, string>> | null;
}

export function identityServiceIntegrationGuide(
  mode: ProjectMode,
): IdentityServiceIntegrationGuide {
  return {
    emissionCondition: `withAuth && database !== "none"`,
    rendererImport: `import { identityServiceFiles } from "./identity/index.js";`,
    rendererCall: `files.push(...identityServiceFiles("${mode}"));`,
    serviceBarrelLine: `export * as identity from "./identity/index.js";`,
    packageExport: mode === "monorepo" ? { "./identity": "./src/identity/index.ts" } : null,
  };
}
