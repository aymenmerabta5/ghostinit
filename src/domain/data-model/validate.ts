import type { DataEntityBlueprint, DataModelBlueprint } from "./types.js";

function requireUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function validateEntity(
  entity: DataEntityBlueprint,
  entities: Map<string, DataEntityBlueprint>,
): void {
  requireUnique(
    entity.fields.map((candidate) => candidate.id),
    `${entity.id} field id`,
  );
  requireUnique(
    entity.fields.map((candidate) => candidate.column),
    `${entity.id} column`,
  );
  requireUnique(
    entity.indexes.map((candidate) => candidate.id),
    `${entity.id} index id`,
  );
  requireUnique(
    entity.constraints.map((candidate) => candidate.id),
    `${entity.id} constraint id`,
  );

  const fields = new Set(entity.fields.map((candidate) => candidate.id));
  for (const index of entity.indexes) {
    for (const fieldId of index.fields) {
      if (!fields.has(fieldId))
        throw new Error(`${entity.id}.${index.id} indexes missing field ${fieldId}`);
    }
  }
  for (const constraint of entity.constraints) {
    if (constraint.kind === "check") continue;
    for (const fieldId of constraint.fields) {
      if (!fields.has(fieldId)) {
        throw new Error(`${entity.id}.${constraint.id} constrains missing field ${fieldId}`);
      }
    }
    if (constraint.kind === "foreign-key") {
      const target = entities.get(constraint.references.entity);
      if (!target) {
        throw new Error(
          `${entity.id}.${constraint.id} references missing entity ${constraint.references.entity}`,
        );
      }
      if (!target.fields.some((candidate) => candidate.id === constraint.references.field)) {
        throw new Error(
          `${entity.id}.${constraint.id} references missing field ${constraint.references.entity}.${constraint.references.field}`,
        );
      }
    }
  }

  if (entity.storage.kind === "table") {
    if (!entity.storage.postgresTable || !entity.storage.postgresExport) {
      throw new Error(`Table entity ${entity.id} requires Postgres table and export names`);
    }
    if (!entity.fields.some((candidate) => candidate.primaryKey)) {
      throw new Error(`Table entity ${entity.id} requires a primary key`);
    }
  }
}

export function validateDataModelBlueprint(blueprint: DataModelBlueprint): void {
  if (blueprint.schemaVersion !== 1) throw new Error("Unsupported data model blueprint version");
  requireUnique(
    blueprint.entities.map((candidate) => candidate.id),
    "entity id",
  );
  requireUnique(
    blueprint.operations.map((candidate) => candidate.id),
    "operation id",
  );

  const entities = new Map(blueprint.entities.map((candidate) => [candidate.id, candidate]));
  const operations = new Map(blueprint.operations.map((candidate) => [candidate.id, candidate]));
  for (const entity of blueprint.entities) {
    validateEntity(entity, entities);
    for (const operationId of entity.operationIds) {
      const operation = operations.get(operationId);
      if (!operation) throw new Error(`${entity.id} references missing operation ${operationId}`);
      if (operation.entity !== entity.id) {
        throw new Error(`${operationId} targets ${operation.entity}, expected ${entity.id}`);
      }
    }
  }
  for (const operation of blueprint.operations) {
    const entity = entities.get(operation.entity);
    if (!entity) throw new Error(`${operation.id} targets missing entity ${operation.entity}`);
    if (!entity.operationIds.includes(operation.id)) {
      throw new Error(`${operation.id} is not declared by ${operation.entity}`);
    }
  }

  requireUnique(blueprint.mutationConsistency.serializedScopes, "serialized mutation scope");
  requireUnique(blueprint.mutationConsistency.conditionalWriteEntities, "conditional-write entity");
  for (const entityId of blueprint.mutationConsistency.conditionalWriteEntities) {
    if (!entities.has(entityId)) {
      throw new Error(`Mutation consistency references missing entity ${entityId}`);
    }
  }

  for (const [target, capability] of Object.entries(blueprint.targets)) {
    requireUnique(capability.selectedPlugins, `${target} selected plugin`);
    for (const plugin of capability.selectedPlugins) {
      if (capability.rejectedPlugins[plugin]) {
        throw new Error(`${target} both selects and rejects ${plugin}`);
      }
    }
  }
}
