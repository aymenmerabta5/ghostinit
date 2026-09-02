// @allow-long 10-imports: provider renderer composes isolated Convex identity fragments
import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { convexIdentityAuditContent } from "./convex-audit.js";
import { convexIdentityInvitationsContent } from "./convex-invitations.js";
import { convexIdentityOrganizationsContent } from "./convex-organizations.js";
import { convexIdentityProxyContent } from "./convex-proxy.js";
import { convexIdentitySchemaContent } from "./convex-schema.js";
import { convexIdentitySessionsContent } from "./convex-sessions.js";
import { convexIdentitySharedContent } from "./convex-shared.js";
import { convexIdentityTeamsContent } from "./convex-teams.js";

function proxyPath(mode: ProjectMode): string {
  return mode === "monorepo"
    ? "packages/services/src/application/composition/adapters/identity/convex.ts"
    : "src/server/services/application/composition/adapters/identity/convex.ts";
}

/** App-owned Convex identity runtime; never advertise Better Auth organization support. */
export function convexIdentityAdapterFiles(mode: ProjectMode): TemplateFile[] {
  return [
    file("convex/schema/identity.ts", convexIdentitySchemaContent()),
    file("convex/identity/shared.ts", convexIdentitySharedContent()),
    file("convex/identity/sessions.ts", convexIdentitySessionsContent()),
    file("convex/identity/organizations.ts", convexIdentityOrganizationsContent()),
    file("convex/identity/invitations.ts", convexIdentityInvitationsContent()),
    file("convex/identity/teams.ts", convexIdentityTeamsContent()),
    file("convex/identity/audit.ts", convexIdentityAuditContent()),
    file(proxyPath(mode), convexIdentityProxyContent(mode)),
  ];
}

export interface ConvexIdentityAdapterIntegrationGuide {
  schemaImport: string;
  schemaSpread: string;
  authTriggerImport: string;
  authSessionTriggers: string;
  actorRevocationGuard: string;
  canonicalSessionCleanup: string;
  rejectedBetterAuthCapability: string;
  proxyPath: string;
  serviceFactory: "createConvexIdentityService";
  auditFactory: "createConvexIdentityAuditProxy";
  convexFunctionModules: readonly string[];
}

/** Exact central edits required after composing convexIdentityAdapterFiles(). */
export function convexIdentityAdapterIntegrationGuide(
  mode: ProjectMode,
): ConvexIdentityAdapterIntegrationGuide {
  return {
    schemaImport: 'import { identityTables } from "./schema/identity";',
    schemaSpread: "...identityTables,",
    authTriggerImport:
      'import { syncIdentitySessionCreated, syncIdentitySessionDeleted, syncIdentitySessionUpdated } from "./identity/sessions";',
    authSessionTriggers: `session: {
  onCreate: syncIdentitySessionCreated,
  onUpdate: syncIdentitySessionUpdated,
  onDelete: syncIdentitySessionDeleted,
},`,
    actorRevocationGuard:
      "Every app authorization entry must resolve JWT sessionId against identitySessions and deny missing, expired, or revoked rows; use requireIdentityActor for identity functions and mirror that check in shared requireActor for other capabilities.",
    canonicalSessionCleanup:
      "Delete the canonical Better Auth component session before writing the app tombstone so a stolen cookie cannot list or reuse another provider token. Missing provider rows are idempotent; component failures must fail the typed command closed.",
    rejectedBetterAuthCapability:
      'Keep rejectedIdentityPlugins including "organization"; these tables are app-owned and do not make the stock component compatible with organization().',
    proxyPath: proxyPath(mode),
    serviceFactory: "createConvexIdentityService",
    auditFactory: "createConvexIdentityAuditProxy",
    convexFunctionModules: [
      "identity/sessions",
      "identity/organizations",
      "identity/invitations",
      "identity/teams",
      "identity/audit",
    ],
  };
}

export {
  convexIdentityAuditContent,
  convexIdentityInvitationsContent,
  convexIdentityOrganizationsContent,
  convexIdentityProxyContent,
  convexIdentitySchemaContent,
  convexIdentitySessionsContent,
  convexIdentitySharedContent,
  convexIdentityTeamsContent,
};
