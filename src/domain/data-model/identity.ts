import { CONVEX_IDENTITY_CAPABILITY, POSTGRES_IDENTITY_CAPABILITY } from "./capabilities.js";
import { coreIdentityEntities, coreIdentityOperations } from "./fragments/core.js";
import {
  organizationIdentityEntities,
  organizationIdentityOperations,
} from "./fragments/organization.js";
import { securityIdentityEntities, securityIdentityOperations } from "./fragments/security.js";
import { identityAuditEntities, identityAuditOperations } from "./fragments/identity-audit.js";
import type { DataModelBlueprint } from "./types.js";
import { validateDataModelBlueprint } from "./validate.js";
import {
  auth as authVersions,
  convex as convexVersions,
} from "../../../packages/versions/src/index.js";

export const identityDataModelBlueprint = {
  $schema: "../../../schemas/v1-data-model-blueprint.schema.json",
  schemaVersion: 1,
  id: "ghostinit.identity",
  revision: `v1-better-auth-${authVersions["better-auth"]}`,
  compatibility: {
    betterAuth: authVersions["better-auth"],
    passkey: authVersions["@better-auth/passkey"],
    convexBetterAuth: convexVersions["@convex-dev/better-auth"],
    verification: "package-schema-audited-renderer",
  },
  entities: [
    ...coreIdentityEntities,
    ...securityIdentityEntities,
    ...organizationIdentityEntities,
    ...identityAuditEntities,
  ],
  operations: [
    ...coreIdentityOperations,
    ...securityIdentityOperations,
    ...organizationIdentityOperations,
    ...identityAuditOperations,
  ],
  mutationConsistency: {
    unitOfWork: "identity-and-audit",
    rollbackOnAuditFailure: true,
    serializedScopes: ["organizationId:owner-count-and-membership-mutation"],
    conditionalWriteEntities: ["sessions", "rateLimits", "invitations", "members", "teamMembers"],
  },
  targets: {
    postgres: POSTGRES_IDENTITY_CAPABILITY,
    convex: CONVEX_IDENTITY_CAPABILITY,
  },
} as const satisfies DataModelBlueprint;

validateDataModelBlueprint(identityDataModelBlueprint);
