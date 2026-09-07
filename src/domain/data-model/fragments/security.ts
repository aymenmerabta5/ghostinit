import { entity, field, foreignKey, index, operation, unique } from "../builders.js";
import type { DataEntityBlueprint, DataOperationBlueprint } from "../types.js";

export const securityIdentityEntities = [
  entity({
    id: "passkeys",
    ownership: { authority: "better-auth", plugin: "passkey", ownerField: "userId" },
    storage: {
      kind: "table",
      postgresTable: "passkeys",
      postgresExport: "passkeys",
      betterAuthModel: "passkey",
    },
    fields: [
      field("id", "id", "text", { primaryKey: true, required: true }),
      field("name", "name", "text"),
      field("publicKey", "public_key", "text", { required: true, sensitive: true }),
      field("userId", "user_id", "text", {
        required: true,
        reference: { entity: "users", field: "id", onDelete: "cascade" },
      }),
      field("credentialID", "credential_id", "text", { required: true, unique: true }),
      field("counter", "counter", "integer", { required: true }),
      field("deviceType", "device_type", "text", { required: true }),
      field("backedUp", "backed_up", "boolean", { required: true }),
      field("transports", "transports", "text"),
      field("createdAt", "created_at", "timestamp", { default: "now" }),
      field("aaguid", "aaguid", "text"),
    ],
    indexes: [
      index("passkeys_user_id_idx", ["userId"]),
      index("passkeys_credential_id_idx", ["credentialID"], true),
    ],
    constraints: [
      foreignKey("passkeys_user_fk", ["userId"], "users", "id", "cascade"),
      unique("passkeys_credential_id_unique", ["credentialID"]),
    ],
    lifecycle: { createdAt: "createdAt", deletion: "cascade" },
    operationIds: [
      "identity.passkey.register",
      "identity.passkey.authenticate",
      "identity.passkey.list",
      "identity.passkey.rename",
      "identity.passkey.delete",
    ],
  }),
  entity({
    id: "twoFactors",
    ownership: { authority: "better-auth", plugin: "two-factor", ownerField: "userId" },
    storage: {
      kind: "table",
      postgresTable: "two_factors",
      postgresExport: "twoFactors",
      betterAuthModel: "twoFactor",
      convexTable: "twoFactor",
    },
    fields: [
      field("id", "id", "text", { primaryKey: true, required: true }),
      field("secret", "secret", "text", { required: true, sensitive: true }),
      field("backupCodes", "backup_codes", "text", { required: true, sensitive: true }),
      field("userId", "user_id", "text", {
        required: true,
        reference: { entity: "users", field: "id", onDelete: "cascade" },
      }),
      field("verified", "verified", "boolean", { default: true }),
      field("failedVerificationCount", "failed_verification_count", "integer", { default: 0 }),
      field("lockedUntil", "locked_until", "timestamp"),
    ],
    indexes: [index("two_factors_user_id_idx", ["userId"])],
    constraints: [foreignKey("two_factors_user_fk", ["userId"], "users", "id", "cascade")],
    lifecycle: { deletion: "cascade" },
    operationIds: [
      "identity.two-factor.enable",
      "identity.two-factor.verify",
      "identity.two-factor.disable",
    ],
  }),
  entity({
    id: "rateLimits",
    ownership: { authority: "better-auth", plugin: "core" },
    storage: {
      kind: "table",
      postgresTable: "rate_limits",
      postgresExport: "rateLimits",
      betterAuthModel: "rateLimit",
      convexTable: "rateLimit",
    },
    fields: [
      field("id", "id", "text", { primaryKey: true, required: true }),
      field("key", "key", "text", { required: true, unique: true }),
      field("count", "count", "integer", { required: true }),
      field("lastRequest", "last_request", "bigint", { required: true }),
    ],
    indexes: [index("rate_limits_key_idx", ["key"], true)],
    constraints: [unique("rate_limits_key_unique", ["key"])],
    lifecycle: {
      deletion: "explicit",
      retention: "Better Auth prunes rows after the longest configured rate-limit window.",
    },
    operationIds: ["identity.rate-limit.consume"],
  }),
  entity({
    id: "trustedDeviceGrants",
    ownership: { authority: "better-auth", plugin: "two-factor", ownerField: "userId" },
    storage: {
      kind: "shared-record",
      betterAuthModel: "verification",
      recordDiscriminator: "trust-device-",
    },
    fields: [
      field("identifier", "identifier", "text", { required: true, sensitive: true }),
      field("userId", "value", "text", { required: true }),
      field("expiresAt", "expires_at", "timestamp", { required: true }),
    ],
    indexes: [index("trusted_device_identifier_idx", ["identifier"])],
    constraints: [],
    lifecycle: {
      expiresAt: "expiresAt",
      deletion: "expire",
      retention:
        "Better Auth defaults to 30 days and refreshes the signed cookie and verification record.",
    },
    operationIds: ["identity.two-factor.trust-device", "identity.two-factor.revoke-trusted-device"],
  }),
  entity({
    id: "adminAuditEvents",
    ownership: {
      authority: "application",
      plugin: "app-admin-audit",
      ownerField: "actorId",
    },
    storage: {
      kind: "table",
      postgresTable: "admin_audit_events",
      postgresExport: "adminAuditEvents",
    },
    fields: [
      field("id", "id", "uuid", { primaryKey: true, required: true, default: "random-uuid" }),
      field("actorId", "actor_id", "text", {
        required: true,
        reference: { entity: "users", field: "id", onDelete: "restrict" },
      }),
      field("targetId", "target_id", "text", {
        required: true,
        reference: { entity: "users", field: "id", onDelete: "restrict" },
      }),
      field("action", "action", "text", { required: true }),
      field("metadata", "metadata", "json", {
        required: true,
        typeScriptType: "Record<string, string | number | boolean | null>",
      }),
      field("createdAt", "created_at", "timestamp", { required: true, default: "now" }),
    ],
    indexes: [
      index("admin_audit_actor_idx", ["actorId"]),
      index("admin_audit_target_idx", ["targetId"]),
      index("admin_audit_created_at_idx", ["createdAt"]),
    ],
    constraints: [
      foreignKey("admin_audit_actor_fk", ["actorId"], "users", "id", "restrict"),
      foreignKey("admin_audit_target_fk", ["targetId"], "users", "id", "restrict"),
    ],
    lifecycle: {
      createdAt: "createdAt",
      deletion: "restrict",
      retention:
        "Retain according to the deployment audit policy; user deletion is blocked while referenced.",
    },
    operationIds: ["identity.admin.audit.record", "identity.admin.audit.read"],
  }),
] as const satisfies readonly DataEntityBlueprint[];

export const securityIdentityOperations = [
  operation("identity.passkey.register", "passkeys", "create", "owner"),
  operation("identity.passkey.authenticate", "passkeys", "execute", "public-token"),
  operation("identity.passkey.list", "passkeys", "read", "owner"),
  operation("identity.passkey.rename", "passkeys", "update", "owner"),
  operation("identity.passkey.delete", "passkeys", "delete", "owner"),
  operation("identity.two-factor.enable", "twoFactors", "create", "owner"),
  operation("identity.two-factor.verify", "twoFactors", "execute", "owner"),
  operation("identity.two-factor.disable", "twoFactors", "delete", "owner"),
  operation("identity.rate-limit.consume", "rateLimits", "execute", "system"),
  operation("identity.two-factor.trust-device", "trustedDeviceGrants", "create", "owner"),
  operation("identity.two-factor.revoke-trusted-device", "trustedDeviceGrants", "delete", "owner"),
  operation("identity.admin.audit.record", "adminAuditEvents", "create", "system"),
  operation("identity.admin.audit.read", "adminAuditEvents", "read", "administrator"),
] as const satisfies readonly DataOperationBlueprint[];
