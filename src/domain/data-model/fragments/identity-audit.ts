import { entity, field, foreignKey, index, operation } from "../builders.js";
import type { DataEntityBlueprint, DataOperationBlueprint } from "../types.js";

/** Application-owned audit log used by the identity unit of work. */
export const identityAuditEntities = [
  entity({
    id: "identityAuditEvents",
    ownership: {
      authority: "application",
      plugin: "app-identity-audit",
      ownerField: "actorId",
      tenantField: "organizationId",
    },
    storage: {
      kind: "table",
      postgresTable: "identity_audit_events",
      postgresExport: "identityAuditEvents",
    },
    fields: [
      field("id", "id", "uuid", { primaryKey: true, required: true, default: "random-uuid" }),
      field("actorId", "actor_id", "text", {
        required: true,
        reference: { entity: "users", field: "id", onDelete: "restrict" },
      }),
      field("organizationId", "organization_id", "text", {
        reference: { entity: "organizations", field: "id", onDelete: "set-null" },
      }),
      // Targets may be sessions, invitations, memberships, teams, or users, so
      // a polymorphic foreign key would be both incomplete and misleading.
      field("targetId", "target_id", "text"),
      field("action", "action", "text", { required: true }),
      field("metadata", "metadata", "json", {
        required: true,
        typeScriptType: "Record<string, string | number | boolean | null>",
      }),
      field("createdAt", "created_at", "timestamp", { required: true }),
    ],
    indexes: [
      index("identity_audit_actor_idx", ["actorId"]),
      index("identity_audit_organization_idx", ["organizationId"]),
      index("identity_audit_created_at_idx", ["createdAt"]),
    ],
    constraints: [
      foreignKey("identity_audit_actor_fk", ["actorId"], "users", "id", "restrict"),
      foreignKey(
        "identity_audit_organization_fk",
        ["organizationId"],
        "organizations",
        "id",
        "set-null",
      ),
    ],
    lifecycle: {
      createdAt: "createdAt",
      deletion: "restrict",
      retention: "Retain according to the deployment identity-audit policy.",
    },
    operationIds: ["identity.audit.record", "identity.audit.read"],
  }),
] as const satisfies readonly DataEntityBlueprint[];

export const identityAuditOperations = [
  operation("identity.audit.record", "identityAuditEvents", "create", "system"),
  operation("identity.audit.read", "identityAuditEvents", "read", "administrator"),
] as const satisfies readonly DataOperationBlueprint[];
