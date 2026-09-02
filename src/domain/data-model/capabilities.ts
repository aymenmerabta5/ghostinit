import type {
  DataModelTarget,
  DataTargetCapability,
  IdentityClientTarget,
  IdentityPasskeyAcceptanceOperationId,
  IdentityPasskeyClientCapability,
  IdentityPasskeyOperationId,
  IdentityPluginId,
} from "./types.js";

export const IDENTITY_PASSKEY_OPERATION_IDS = [
  "identity.passkey.authenticate",
  "identity.passkey.delete",
  "identity.passkey.list",
  "identity.passkey.register",
  "identity.passkey.rename",
] as const satisfies readonly IdentityPasskeyOperationId[];

export const IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS = [
  "identity.passkey.authenticate.v1",
  "identity.passkey.delete.v1",
  "identity.passkey.list.v1",
  "identity.passkey.register.v1",
  "identity.passkey.rename.v1",
] as const satisfies readonly IdentityPasskeyAcceptanceOperationId[];

export const POSTGRES_IDENTITY_PLUGINS = [
  "admin",
  "two-factor",
  "passkey",
  "organization",
] as const satisfies readonly IdentityPluginId[];

// @convex-dev/better-auth@0.12.5 ships a static component schema. It includes
// the two-factor core fields, but not the admin, passkey, organization, team,
// or dynamic-RBAC tables. Those plugins must not be advertised by generated
// clients until GhostInit emits a verified local component installation.
export const CONVEX_IDENTITY_CAPABILITY = {
  selectedPlugins: ["two-factor"],
  rejectedPlugins: {
    admin:
      "Convex authorization is application-owned; the bundled component has no Better Auth admin columns.",
    passkey:
      "The bundled Convex component has no passkey table; use a verified local component schema before enabling it.",
    organization:
      "The bundled Convex component has no organization, team, invitation, or dynamic RBAC tables.",
  },
  limitations: [
    "The bundled Convex component schema predates Better Auth account-lockout columns; generated Convex auth retains the schema-safe five-attempt signed-challenge lockout and database-backed two-factor endpoint limits, while explicit cross-challenge accountLockout stays disabled.",
  ],
} as const satisfies DataTargetCapability;

export const POSTGRES_IDENTITY_CAPABILITY = {
  selectedPlugins: POSTGRES_IDENTITY_PLUGINS,
  rejectedPlugins: {},
  limitations: [
    "The renderer is pinned to the audited Better Auth package schema; rerun the conformance tests whenever a pinned auth package changes.",
    "Trusted-device grants are Better Auth verification records plus signed cookies, not a standalone table.",
    "@better-auth/passkey 1.6.30 verifies ceremonies with requireUserVerification=false; the generated surface does not claim biometric or hardware user-verification enforcement.",
  ],
} as const satisfies DataTargetCapability;

export function identityCapabilityFor(target: DataModelTarget): DataTargetCapability {
  return target === "postgres" ? POSTGRES_IDENTITY_CAPABILITY : CONVEX_IDENTITY_CAPABILITY;
}

/**
 * Closed client/runtime matrix for the WebAuthn ceremony advertised by the
 * identity blueprint. A database table alone is not client support: the
 * selected surface must also have an audited secure origin and RP-ID model.
 */
export function identityPasskeyClientCapabilityFor(
  database: DataModelTarget | "none",
  target: IdentityClientTarget,
): IdentityPasskeyClientCapability {
  if (database === "postgres" && (target === "nextjs" || target === "tanstack-start")) {
    return {
      status: "supported",
      database,
      target,
      operationIds: IDENTITY_PASSKEY_OPERATION_IDS,
      acceptanceOperationIds: IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS,
    };
  }

  const reason =
    database === "convex"
      ? "The pinned Convex Better Auth component has no verified passkey schema or plugin binding."
      : database === "none"
        ? "Passkeys require persistent credential storage."
        : target === "expo"
          ? "The pinned Better Auth passkey client is browser WebAuthn-only; no audited Expo native credential binding is installed."
          : "The packaged Electron renderer uses a file/custom transport origin without an audited secure-context and RP-ID binding.";
  return {
    status: "unsupported",
    database,
    target,
    operationIds: [],
    acceptanceOperationIds: [],
    reason,
  };
}
