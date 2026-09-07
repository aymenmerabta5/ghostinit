import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  auth as authVersions,
  convex as convexVersions,
} from "../../packages/versions/src/index.js";
import {
  identityDataModelBlueprint,
  renderBetterAuthSchemaBindings,
  renderPostgresIdentitySchema,
  validateDataModelBlueprint,
} from "../../src/domain/data-model/index.js";

const requiredEntities = [
  "users",
  "accounts",
  "sessions",
  "verifications",
  "passkeys",
  "twoFactors",
  "rateLimits",
  "trustedDeviceGrants",
  "adminAuditEvents",
  "organizations",
  "members",
  "invitations",
  "teams",
  "teamMembers",
  "organizationRoles",
] as const;

describe("identity data model blueprint", () => {
  it("is valid against the versioned JSON schema and cross-reference validator", () => {
    const schema = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../schemas/v1-data-model-blueprint.schema.json"),
        "utf8",
      ),
    ) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

    expect(validate(identityDataModelBlueprint)).toBe(true);
    expect(validate.errors).toBeNull();
    expect(() => validateDataModelBlueprint(identityDataModelBlueprint)).not.toThrow();
  });

  it("covers the complete identity, organization, and RBAC lifecycle", () => {
    const entities = new Map(
      identityDataModelBlueprint.entities.map((entity) => [entity.id, entity]),
    );
    for (const entityId of requiredEntities) {
      const entity = entities.get(entityId);
      expect(entity, entityId).toBeDefined();
      expect(entity?.operationIds.length ?? 0).toBeGreaterThan(0);
      expect(entity?.lifecycle.deletion).toBeDefined();
    }

    const operationIds = identityDataModelBlueprint.operations.map((operation) => operation.id);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(operationIds).toContain("identity.passkey.authenticate");
    expect(operationIds).toContain("identity.two-factor.trust-device");
    expect(operationIds).toContain("identity.invitation.accept");
    expect(operationIds).toContain("identity.rbac.permission.check");
    expect(operationIds).toContain("identity.session.revoke-others");
    expect(operationIds).toContain("identity.member.count-owners");
    expect(operationIds).toContain("identity.team.find-by-name");
    expect(operationIds).toContain("identity.rate-limit.consume");
    expect(identityDataModelBlueprint.mutationConsistency).toEqual({
      unitOfWork: "identity-and-audit",
      rollbackOnAuditFailure: true,
      serializedScopes: ["organizationId:owner-count-and-membership-mutation"],
      conditionalWriteEntities: ["sessions", "rateLimits", "invitations", "members", "teamMembers"],
    });
  });

  it("pins the audited package schema and rejects unsupported Convex advertising", () => {
    expect(identityDataModelBlueprint.compatibility.betterAuth).toBe(authVersions["better-auth"]);
    expect(identityDataModelBlueprint.compatibility.passkey).toBe(
      authVersions["@better-auth/passkey"],
    );
    expect(identityDataModelBlueprint.compatibility.convexBetterAuth).toBe(
      convexVersions["@convex-dev/better-auth"],
    );
    expect(identityDataModelBlueprint.targets.postgres.selectedPlugins).toEqual([
      "admin",
      "two-factor",
      "passkey",
      "organization",
    ]);
    expect(identityDataModelBlueprint.targets.convex.selectedPlugins).toEqual(["two-factor"]);
    expect(identityDataModelBlueprint.targets.convex.rejectedPlugins.passkey).toContain(
      "no passkey table",
    );
    expect(identityDataModelBlueprint.targets.convex.rejectedPlugins.organization).toContain(
      "no organization",
    );
  });

  it("renders Better Auth compatible Drizzle fields, constraints, and explicit bindings", () => {
    const schema = renderPostgresIdentitySchema(identityDataModelBlueprint);
    expect(schema).toContain('export const users = pgTable("users"');
    expect(schema).toContain('emailVerified: boolean("email_verified").default(false).notNull()');
    expect(schema).toContain('accountId: text("account_id").notNull()');
    expect(schema).toContain('providerId: text("provider_id").notNull()');
    expect(schema).toContain('export const passkeys = pgTable("passkeys"');
    expect(schema).toContain('export const rateLimits = pgTable("rate_limits"');
    expect(schema).toContain('uniqueIndex("rate_limits_key_idx").on(table.key)');
    expect(schema).toContain('lastRequest: bigint("last_request", { mode: "number" }).notNull()');
    expect(schema).toContain('export const organizationRoles = pgTable("organization_roles"');
    expect(schema).toContain('uniqueIndex("members_organization_user_idx")');
    expect(schema).toContain('{ onDelete: "cascade" }');
    expect(schema).toContain('{ onDelete: "set null" }');
    expect(schema).toContain(
      'metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>()',
    );

    const bindings = renderBetterAuthSchemaBindings(identityDataModelBlueprint);
    expect(bindings).toContain("user: users,");
    expect(bindings).toContain("twoFactor: twoFactors,");
    expect(bindings).toContain("passkey: passkeys,");
    expect(bindings).toContain("rateLimit: rateLimits,");
    expect(bindings).toContain("teamMember: teamMembers,");
    expect(bindings).toContain("organizationRole: organizationRoles,");
    expect(bindings).not.toContain("adminAuditEvents");
    expect(bindings).not.toContain("trustedDeviceGrants");
  });
});
