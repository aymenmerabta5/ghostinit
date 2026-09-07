import { describe, expect, test } from "bun:test";
import {
  identityAdapterFiles,
  identityAdapterIntegrationGuide,
} from "../../../src/templates/adapters/identity/index.js";
import { convexIdentityAdapterFiles } from "../../../src/templates/adapters/identity/convex.js";
import { postgresAdminAdapterFiles } from "../../../src/templates/adapters/identity/postgres-admin.js";
import { postgresIdentityAdapterFiles } from "../../../src/templates/adapters/identity/postgres.js";
import { adapterSource, syntaxFailures } from "./adapter-harness.js";

const variants = [
  ["monorepo", "postgres"],
  ["single", "postgres"],
  ["monorepo", "convex"],
  ["single", "convex"],
] as const;

describe("identity adapter renderers", () => {
  test.each(variants)("the root renderer delegates %s/%s without a composer", (mode, database) => {
    const expected =
      database === "postgres"
        ? [...postgresIdentityAdapterFiles(mode), ...postgresAdminAdapterFiles(mode)]
        : convexIdentityAdapterFiles(mode);

    expect(identityAdapterFiles(mode, database)).toEqual(expected);
  });

  test("selects mode-specific Postgres composition paths", () => {
    expect(postgresIdentityAdapterFiles("monorepo").map((entry) => entry.path)).toEqual([
      "packages/services/src/application/composition/identity.ts",
    ]);
    expect(postgresIdentityAdapterFiles("single").map((entry) => entry.path)).toEqual([
      "src/server/services/application/composition/identity.ts",
    ]);
  });

  test("selects mode-specific Convex proxy paths while sharing app-owned functions", () => {
    const sharedPaths = [
      "convex/schema/identity.ts",
      "convex/identity/shared.ts",
      "convex/identity/sessions.ts",
      "convex/identity/organizations.ts",
      "convex/identity/invitations.ts",
      "convex/identity/teams.ts",
      "convex/identity/audit.ts",
    ];

    expect(convexIdentityAdapterFiles("monorepo").map((entry) => entry.path)).toEqual([
      ...sharedPaths,
      "packages/services/src/application/composition/adapters/identity/convex.ts",
    ]);
    expect(convexIdentityAdapterFiles("single").map((entry) => entry.path)).toEqual([
      ...sharedPaths,
      "src/server/services/application/composition/adapters/identity/convex.ts",
    ]);
  });

  test.each(variants)("renders parseable, executable source for %s/%s", (mode, database) => {
    expect(syntaxFailures(identityAdapterFiles(mode, database))).toEqual([]);
  });

  test.each(variants)("does not render capability placeholders for %s/%s", (mode, database) => {
    const source = adapterSource(identityAdapterFiles(mode, database));

    expect(source).not.toMatch(/\b(?:TODO|FIXME|NOT_IMPLEMENTED)\b/);
    expect(source).not.toMatch(
      /identity (?:adapter|capability|service|operation)[^\n"']*(?:unsupported|unavailable|not implemented)/i,
    );
    expect(source).not.toMatch(
      /throw new Error\([^\n]*(?:unsupported|unavailable|not implemented)/i,
    );
  });

  test.each(variants)("describes direct integration for %s/%s", (mode, database) => {
    const guide = identityAdapterIntegrationGuide(mode, database);
    const expectedPath =
      database === "postgres"
        ? mode === "monorepo"
          ? "packages/services/src/application/composition/identity.ts"
          : "src/server/services/application/composition/identity.ts"
        : mode === "monorepo"
          ? "packages/services/src/application/composition/adapters/identity/convex.ts"
          : "src/server/services/application/composition/adapters/identity/convex.ts";

    expect(guide.emissionCondition).toContain('database !== "none"');
    expect(guide.compositionPath).toBe(expectedPath);
    expect(guide.rendererImport).toContain("identityAdapterFiles");
    expect(guide.rendererCall).toContain(`"${mode}"`);
    expect(guide.rendererCall).toContain(`"${database}"`);
    expect(guide.replacesPlaceholder).toBe(true);
    expect(guide.actorContextFields.join(" ")).toMatch(
      /authenticatedAt.*activeOrganizationId.*activeTeamId/,
    );
    expect(guide.postgresAdmin === null).toBe(database !== "postgres");
    if (database === "postgres") {
      expect(guide.postgresAdmin?.compositionPath).toContain("/composition/admin.ts");
    }
  });
});
