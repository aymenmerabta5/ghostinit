export type DataModelBlueprintVersion = 1;

export type DataModelTarget = "postgres" | "convex";

export type IdentityPluginId = "admin" | "two-factor" | "passkey" | "organization";

export type IdentityClientTarget = "nextjs" | "tanstack-start" | "expo" | "electron";

export type IdentityPasskeyOperationId =
  | "identity.passkey.register"
  | "identity.passkey.authenticate"
  | "identity.passkey.list"
  | "identity.passkey.rename"
  | "identity.passkey.delete";

export type IdentityPasskeyAcceptanceOperationId = `${IdentityPasskeyOperationId}.v1`;

export type IdentityPasskeyClientCapability =
  | {
      readonly status: "supported";
      readonly database: "postgres";
      readonly target: "nextjs" | "tanstack-start";
      readonly operationIds: readonly IdentityPasskeyOperationId[];
      readonly acceptanceOperationIds: readonly IdentityPasskeyAcceptanceOperationId[];
    }
  | {
      readonly status: "unsupported";
      readonly database: DataModelTarget | "none";
      readonly target: IdentityClientTarget;
      readonly operationIds: readonly [];
      readonly acceptanceOperationIds: readonly [];
      readonly reason: string;
    };

export type DataFieldType =
  | "bigint"
  | "boolean"
  | "integer"
  | "json"
  | "text"
  | "timestamp"
  | "uuid"
  | "varchar";

export interface DataFieldReference {
  entity: string;
  field: string;
  onDelete: "cascade" | "restrict" | "set-null";
}

export interface DataFieldBlueprint {
  id: string;
  column: string;
  type: DataFieldType;
  maxLength?: number;
  required?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: boolean | number | string | "now";
  sensitive?: boolean;
  typeScriptType?: string;
  reference?: DataFieldReference;
}

export interface DataIndexBlueprint {
  id: string;
  fields: readonly string[];
  unique?: boolean;
}

export type DataConstraintBlueprint =
  | {
      id: string;
      kind: "foreign-key";
      fields: readonly string[];
      references: DataFieldReference;
    }
  | {
      id: string;
      kind: "unique";
      fields: readonly string[];
    }
  | {
      id: string;
      kind: "check";
      expression: string;
    };

export interface DataLifecycleBlueprint {
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  deletion: "cascade" | "consume" | "explicit" | "expire" | "restrict";
  retention?: string;
}

export interface DataOwnershipBlueprint {
  authority: "application" | "better-auth";
  plugin:
    | "admin"
    | "app-admin-audit"
    | "app-identity-audit"
    | "core"
    | "organization"
    | "passkey"
    | "two-factor";
  ownerField?: string;
  tenantField?: string;
}

export interface DataStorageBlueprint {
  kind: "shared-record" | "table";
  postgresTable?: string;
  postgresExport?: string;
  betterAuthModel?: string;
  convexTable?: string;
  recordDiscriminator?: string;
}

export interface DataEntityBlueprint {
  id: string;
  ownership: DataOwnershipBlueprint;
  storage: DataStorageBlueprint;
  fields: readonly DataFieldBlueprint[];
  indexes: readonly DataIndexBlueprint[];
  constraints: readonly DataConstraintBlueprint[];
  lifecycle: DataLifecycleBlueprint;
  operationIds: readonly string[];
}

export interface DataOperationBlueprint {
  id: string;
  entity: string;
  action: "create" | "delete" | "execute" | "read" | "update";
  authorization:
    | "administrator"
    | "authenticated"
    | "invited-user"
    | "member"
    | "owner"
    | "public-token"
    | "system";
}

export interface DataTargetCapability {
  selectedPlugins: readonly IdentityPluginId[];
  rejectedPlugins: Readonly<Partial<Record<IdentityPluginId, string>>>;
  limitations: readonly string[];
}

export interface DataMutationConsistencyBlueprint {
  unitOfWork: "identity-and-audit";
  rollbackOnAuditFailure: true;
  serializedScopes: readonly string[];
  conditionalWriteEntities: readonly string[];
}

export interface DataModelBlueprint {
  $schema: string;
  schemaVersion: DataModelBlueprintVersion;
  id: string;
  revision: string;
  compatibility: {
    betterAuth: string;
    passkey: string;
    convexBetterAuth: string;
    verification: "package-schema-audited-renderer";
  };
  entities: readonly DataEntityBlueprint[];
  operations: readonly DataOperationBlueprint[];
  mutationConsistency: DataMutationConsistencyBlueprint;
  targets: Record<DataModelTarget, DataTargetCapability>;
}
