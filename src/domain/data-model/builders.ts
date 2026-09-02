import type {
  DataConstraintBlueprint,
  DataEntityBlueprint,
  DataFieldBlueprint,
  DataIndexBlueprint,
  DataOperationBlueprint,
} from "./types.js";

export function field(
  id: string,
  column: string,
  type: DataFieldBlueprint["type"],
  options: Omit<DataFieldBlueprint, "column" | "id" | "type"> = {},
): DataFieldBlueprint {
  return { id, column, type, ...options };
}

export function index(id: string, fields: readonly string[], unique = false): DataIndexBlueprint {
  return { id, fields, ...(unique ? { unique: true } : {}) };
}

export function unique(id: string, fields: readonly string[]): DataConstraintBlueprint {
  return { id, kind: "unique", fields };
}

export function foreignKey(
  id: string,
  fields: readonly string[],
  entity: string,
  targetField: string,
  onDelete: "cascade" | "restrict" | "set-null",
): DataConstraintBlueprint {
  return {
    id,
    kind: "foreign-key",
    fields,
    references: { entity, field: targetField, onDelete },
  };
}

export function entity(value: DataEntityBlueprint): DataEntityBlueprint {
  return value;
}

export function operation(
  id: string,
  entityId: string,
  action: DataOperationBlueprint["action"],
  authorization: DataOperationBlueprint["authorization"],
): DataOperationBlueprint {
  return { id, entity: entityId, action, authorization };
}
