import { entity, field, foreignKey, index, operation, unique } from "../builders.js";
import type { DataEntityBlueprint, DataOperationBlueprint } from "../types.js";

export const coreIdentityEntities = [
  entity({
    id: "users",
    ownership: { authority: "better-auth", plugin: "core", ownerField: "id" },
    storage: {
      kind: "table",
      postgresTable: "users",
      postgresExport: "users",
      betterAuthModel: "user",
      convexTable: "user",
    },
    fields: [
      field("id", "id", "text", { primaryKey: true, required: true }),
      field("name", "name", "text", { required: true }),
      field("email", "email", "varchar", { maxLength: 255, required: true, unique: true }),
      field("emailVerified", "email_verified", "boolean", { required: true, default: false }),
      field("image", "image", "text"),
      field("createdAt", "created_at", "timestamp", { required: true, default: "now" }),
      field("updatedAt", "updated_at", "timestamp", { required: true, default: "now" }),
      field("role", "role", "text", { default: "user" }),
      field("banned", "banned", "boolean", { default: false }),
      field("banReason", "ban_reason", "text"),
      field("banExpires", "ban_expires", "timestamp"),
      field("twoFactorEnabled", "two_factor_enabled", "boolean", { default: false }),
    ],
    indexes: [index("users_email_idx", ["email"], true)],
    constraints: [unique("users_email_unique", ["email"])],
    lifecycle: { createdAt: "createdAt", updatedAt: "updatedAt", deletion: "explicit" },
    operationIds: [
      "identity.user.create",
      "identity.user.read",
      "identity.user.update",
      "identity.user.delete",
    ],
  }),
  entity({
    id: "accounts",
    ownership: { authority: "better-auth", plugin: "core", ownerField: "userId" },
    storage: {
      kind: "table",
      postgresTable: "accounts",
      postgresExport: "accounts",
      betterAuthModel: "account",
      convexTable: "account",
    },
    fields: [
      field("id", "id", "text", { primaryKey: true, required: true }),
      field("accountId", "account_id", "text", { required: true }),
      field("providerId", "provider_id", "text", { required: true }),
      field("userId", "user_id", "text", {
        required: true,
        reference: { entity: "users", field: "id", onDelete: "cascade" },
      }),
      field("accessToken", "access_token", "text", { sensitive: true }),
      field("refreshToken", "refresh_token", "text", { sensitive: true }),
      field("idToken", "id_token", "text", { sensitive: true }),
      field("accessTokenExpiresAt", "access_token_expires_at", "timestamp"),
      field("refreshTokenExpiresAt", "refresh_token_expires_at", "timestamp"),
      field("scope", "scope", "text"),
      field("password", "password", "text", { sensitive: true }),
      field("createdAt", "created_at", "timestamp", { required: true, default: "now" }),
      field("updatedAt", "updated_at", "timestamp", { required: true, default: "now" }),
    ],
    indexes: [
      index("accounts_user_id_idx", ["userId"]),
      index("accounts_provider_account_idx", ["providerId", "accountId"], true),
    ],
    constraints: [
      foreignKey("accounts_user_fk", ["userId"], "users", "id", "cascade"),
      unique("accounts_provider_account_unique", ["providerId", "accountId"]),
    ],
    lifecycle: { createdAt: "createdAt", updatedAt: "updatedAt", deletion: "cascade" },
    operationIds: ["identity.account.link", "identity.account.read", "identity.account.unlink"],
  }),
  entity({
    id: "sessions",
    ownership: { authority: "better-auth", plugin: "core", ownerField: "userId" },
    storage: {
      kind: "table",
      postgresTable: "sessions",
      postgresExport: "sessions",
      betterAuthModel: "session",
      convexTable: "session",
    },
    fields: [
      field("id", "id", "text", { primaryKey: true, required: true }),
      field("expiresAt", "expires_at", "timestamp", { required: true }),
      field("token", "token", "text", { required: true, unique: true, sensitive: true }),
      field("createdAt", "created_at", "timestamp", { required: true, default: "now" }),
      field("updatedAt", "updated_at", "timestamp", { required: true, default: "now" }),
      // `authenticatedAt` is the server-owned primary/step-up authentication
      // timestamp. Never infer freshness from the refreshable `updatedAt` field.
      field("authenticatedAt", "authenticated_at", "timestamp", {
        required: true,
        default: "now",
      }),
      // Keep a tombstone instead of deleting immediately so revoke retries are
      // idempotent and audit records can refer to the original session id.
      field("revokedAt", "revoked_at", "timestamp"),
      field("ipAddress", "ip_address", "text"),
      field("userAgent", "user_agent", "text"),
      field("userId", "user_id", "text", {
        required: true,
        reference: { entity: "users", field: "id", onDelete: "cascade" },
      }),
      field("impersonatedBy", "impersonated_by", "text", {
        reference: { entity: "users", field: "id", onDelete: "set-null" },
      }),
      field("activeOrganizationId", "active_organization_id", "text", {
        reference: { entity: "organizations", field: "id", onDelete: "set-null" },
      }),
      field("activeTeamId", "active_team_id", "text", {
        reference: { entity: "teams", field: "id", onDelete: "set-null" },
      }),
    ],
    indexes: [
      index("sessions_token_idx", ["token"], true),
      index("sessions_user_id_idx", ["userId"]),
      index("sessions_expires_at_idx", ["expiresAt"]),
      index("sessions_revoked_at_idx", ["revokedAt"]),
    ],
    constraints: [
      unique("sessions_token_unique", ["token"]),
      foreignKey("sessions_user_fk", ["userId"], "users", "id", "cascade"),
      foreignKey("sessions_impersonator_fk", ["impersonatedBy"], "users", "id", "set-null"),
      foreignKey(
        "sessions_active_org_fk",
        ["activeOrganizationId"],
        "organizations",
        "id",
        "set-null",
      ),
      foreignKey("sessions_active_team_fk", ["activeTeamId"], "teams", "id", "set-null"),
    ],
    lifecycle: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      expiresAt: "expiresAt",
      deletion: "expire",
    },
    operationIds: [
      "identity.session.create",
      "identity.session.list",
      "identity.session.get",
      "identity.session.revoke",
      "identity.session.revoke-others",
      "identity.session.expire",
    ],
  }),
  entity({
    id: "verifications",
    ownership: { authority: "better-auth", plugin: "core" },
    storage: {
      kind: "table",
      postgresTable: "verifications",
      postgresExport: "verifications",
      betterAuthModel: "verification",
      convexTable: "verification",
    },
    fields: [
      field("id", "id", "text", { primaryKey: true, required: true }),
      field("identifier", "identifier", "text", { required: true }),
      field("value", "value", "text", { required: true, sensitive: true }),
      field("expiresAt", "expires_at", "timestamp", { required: true }),
      field("createdAt", "created_at", "timestamp", { required: true, default: "now" }),
      field("updatedAt", "updated_at", "timestamp", { required: true, default: "now" }),
    ],
    indexes: [
      index("verifications_identifier_idx", ["identifier"]),
      index("verifications_expires_at_idx", ["expiresAt"]),
    ],
    constraints: [],
    lifecycle: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      expiresAt: "expiresAt",
      deletion: "consume",
    },
    operationIds: [
      "identity.verification.issue",
      "identity.verification.consume",
      "identity.verification.expire",
    ],
  }),
] as const satisfies readonly DataEntityBlueprint[];

export const coreIdentityOperations = [
  operation("identity.user.create", "users", "create", "authenticated"),
  operation("identity.user.read", "users", "read", "authenticated"),
  operation("identity.user.update", "users", "update", "owner"),
  operation("identity.user.delete", "users", "delete", "owner"),
  operation("identity.account.link", "accounts", "create", "owner"),
  operation("identity.account.read", "accounts", "read", "owner"),
  operation("identity.account.unlink", "accounts", "delete", "owner"),
  operation("identity.session.create", "sessions", "create", "system"),
  operation("identity.session.list", "sessions", "read", "owner"),
  operation("identity.session.get", "sessions", "read", "owner"),
  operation("identity.session.revoke", "sessions", "delete", "owner"),
  operation("identity.session.revoke-others", "sessions", "delete", "owner"),
  operation("identity.session.expire", "sessions", "delete", "system"),
  operation("identity.verification.issue", "verifications", "create", "system"),
  operation("identity.verification.consume", "verifications", "delete", "public-token"),
  operation("identity.verification.expire", "verifications", "delete", "system"),
] as const satisfies readonly DataOperationBlueprint[];
