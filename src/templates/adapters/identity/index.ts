import type { ProjectMode } from "../../../lib/addons.js";
import type { TemplateFile } from "../../shared.js";
import * as v from "../../versions.js";
import {
  convexIdentityAdapterFiles,
  convexIdentityAdapterIntegrationGuide,
  type ConvexIdentityAdapterIntegrationGuide,
} from "./convex.js";
import { postgresIdentityAdapterFiles } from "./postgres.js";
import {
  postgresAdminAdapterFiles,
  postgresAdminAdapterIntegrationGuide,
  type PostgresAdminAdapterIntegrationGuide,
} from "./postgres-admin.js";

export type IdentityAdapterDatabase = "postgres" | "convex";

export function identityAdapterFiles(
  mode: ProjectMode,
  database: IdentityAdapterDatabase,
): TemplateFile[] {
  return database === "postgres"
    ? [...postgresIdentityAdapterFiles(mode), ...postgresAdminAdapterFiles(mode)]
    : convexIdentityAdapterFiles(mode);
}

export interface IdentityAdapterIntegrationGuide {
  emissionCondition: string;
  rendererImport: string;
  rendererCall: string;
  compositionPath: string;
  placeholderPath: string;
  replacesPlaceholder: true;
  actorContextFields: readonly ["authenticatedAt", "activeOrganizationId", "activeTeamId"];
  requiredPackageDependencies: Readonly<Record<string, string>>;
  convex: ConvexIdentityAdapterIntegrationGuide | null;
  postgresAdmin: PostgresAdminAdapterIntegrationGuide | null;
  instructions: readonly string[];
}

/**
 * Exact edits for the later central-composer pass. This renderer intentionally
 * owns no shared composer, package manifest, root Convex schema, or auth file.
 */
export function identityAdapterIntegrationGuide(
  mode: ProjectMode,
  database: IdentityAdapterDatabase,
): IdentityAdapterIntegrationGuide {
  const placeholderPath =
    mode === "monorepo"
      ? "packages/services/src/application/composition/identity.ts"
      : "src/server/services/application/composition/identity.ts";
  const convex = database === "convex" ? convexIdentityAdapterIntegrationGuide(mode) : null;
  const compositionPath = convex?.proxyPath ?? placeholderPath;

  return {
    emissionCondition: 'withAuth && database !== "none"',
    rendererImport: 'import { identityAdapterFiles } from "./adapters/identity/index.js";',
    rendererCall: `files.push(...identityAdapterFiles("${mode}", "${database}"));`,
    compositionPath,
    placeholderPath,
    replacesPlaceholder: true,
    actorContextFields: ["authenticatedAt", "activeOrganizationId", "activeTeamId"],
    requiredPackageDependencies:
      database === "postgres" && mode === "monorepo"
        ? { "@repo/database": "workspace:*", "drizzle-orm": `^${v.database["drizzle-orm"]}` }
        : {},
    convex,
    postgresAdmin: database === "postgres" ? postgresAdminAdapterIntegrationGuide(mode) : null,
    instructions:
      database === "postgres"
        ? [
            `Emit the selected adapter instead of the placeholder at ${placeholderPath}.`,
            "The same renderer also replaces the admin composition with the atomic Postgres role and suspension path.",
            "Derive authenticatedAt and active tenant/team only from the verified database session; do not trust request input or a stale cookie-cache payload.",
            "Keep Better Auth organization enabled for Postgres and bind its tables to the generated schema.",
          ]
        : [
            `Emit the Convex proxy at ${compositionPath} and replace the placeholder resolver at ${placeholderPath} with a request-scoped executor bound to authenticated api.identity functions.`,
            "Apply the Convex schema spread, session triggers, and global actor revocation guard described by the provider guide.",
            "Keep Better Auth organization rejected in Convex; organization identity remains app-owned.",
          ],
  };
}

export {
  convexIdentityAdapterFiles,
  convexIdentityAdapterIntegrationGuide,
  postgresAdminAdapterFiles,
  postgresAdminAdapterIntegrationGuide,
  postgresIdentityAdapterFiles,
};
export type { ConvexIdentityAdapterIntegrationGuide, PostgresAdminAdapterIntegrationGuide };
