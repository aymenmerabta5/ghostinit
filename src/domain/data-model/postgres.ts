import type { DataEntityBlueprint, DataFieldBlueprint, DataModelBlueprint } from "./types.js";

export interface PostgresIdentityRenderOptions {
  quote?: '"' | "'";
}

function quoted(value: string, quote: '"' | "'"): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll(quote, `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}

function topologicalTables(blueprint: DataModelBlueprint): DataEntityBlueprint[] {
  const tables = blueprint.entities.filter((entity) => entity.storage.kind === "table");
  const byId = new Map(tables.map((entity) => [entity.id, entity]));
  const output: DataEntityBlueprint[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (entity: DataEntityBlueprint): void => {
    if (visited.has(entity.id)) return;
    if (visiting.has(entity.id)) return;
    visiting.add(entity.id);
    for (const field of entity.fields) {
      const dependency = field.reference && byId.get(field.reference.entity);
      if (dependency) visit(dependency);
    }
    visiting.delete(entity.id);
    visited.add(entity.id);
    output.push(entity);
  };
  for (const entity of tables) visit(entity);
  return output;
}

function columnBuilder(field: DataFieldBlueprint, quote: '"' | "'"): string {
  const column = quoted(field.column, quote);
  switch (field.type) {
    case "bigint":
      return `bigint(${column}, { mode: "number" })`;
    case "boolean":
      return `boolean(${column})`;
    case "integer":
      return `integer(${column})`;
    case "json":
      return `jsonb(${column})`;
    case "timestamp":
      return `timestamp(${column}, { withTimezone: true })`;
    case "uuid":
      return `uuid(${column})`;
    case "varchar":
      return `varchar(${column}, { length: ${field.maxLength ?? 255} })`;
    case "text":
      return `text(${column})`;
  }
}

function renderDefault(field: DataFieldBlueprint, quote: '"' | "'"): string {
  if (field.default === undefined) return "";
  if (field.default === "now") return ".defaultNow()";
  if (field.default === "random-uuid") return ".defaultRandom()";
  if (typeof field.default === "string") return `.default(${quoted(field.default, quote)})`;
  return `.default(${String(field.default)})`;
}

function renderField(
  field: DataFieldBlueprint,
  exportByEntity: ReadonlyMap<string, string>,
  quote: '"' | "'",
): string {
  let expression = columnBuilder(field, quote);
  if (field.typeScriptType) expression += `.$type<${field.typeScriptType}>()`;
  if (field.primaryKey) expression += ".primaryKey()";
  expression += renderDefault(field, quote);
  if (field.required && !field.primaryKey) expression += ".notNull()";
  if (field.reference) {
    const target = exportByEntity.get(field.reference.entity);
    if (!target) throw new Error(`Missing Postgres target for ${field.reference.entity}`);
    const onDelete =
      field.reference.onDelete === "set-null" ? "set null" : field.reference.onDelete;
    expression += `.references(() => ${target}.${field.reference.field}, { onDelete: ${quoted(onDelete, quote)} })`;
  }
  return `  ${field.id}: ${expression},`;
}

function renderTable(
  entity: DataEntityBlueprint,
  exportByEntity: ReadonlyMap<string, string>,
  quote: '"' | "'",
): string {
  const exportName = entity.storage.postgresExport;
  const tableName = entity.storage.postgresTable;
  if (!exportName || !tableName) throw new Error(`Missing Postgres storage for ${entity.id}`);
  const fields = entity.fields.map((field) => renderField(field, exportByEntity, quote)).join("\n");
  const indexes = entity.indexes
    .map((candidate) => {
      const builder = candidate.unique ? "uniqueIndex" : "index";
      const columns = candidate.fields.map((field) => `table.${field}`).join(", ");
      return `    ${builder}(${quoted(candidate.id, quote)}).on(${columns}),`;
    })
    .join("\n");
  const extra = indexes ? `, (table) => [\n${indexes}\n  ]` : "";
  return `export const ${exportName} = pgTable(${quoted(tableName, quote)}, {\n${fields}\n}${extra});`;
}

export function renderPostgresIdentitySchema(
  blueprint: DataModelBlueprint,
  options: PostgresIdentityRenderOptions = {},
): string {
  const quote = options.quote ?? '"';
  const tables = topologicalTables(blueprint);
  const exportByEntity = new Map(
    tables.map((entity) => [entity.id, entity.storage.postgresExport as string]),
  );
  const imports = `import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from ${quoted("drizzle-orm/pg-core", quote)};`;
  const body = tables.map((entity) => renderTable(entity, exportByEntity, quote)).join("\n\n");
  return `${imports}\n\n${body}\n`;
}

export function renderBetterAuthSchemaBindings(
  blueprint: DataModelBlueprint,
  indent = "      ",
): string {
  return blueprint.entities
    .filter(
      (entity) => entity.storage.kind === "table" && entity.storage.betterAuthModel !== undefined,
    )
    .map(
      (entity) =>
        `${indent}${entity.storage.betterAuthModel}: ${entity.storage.postgresExport as string},`,
    )
    .join("\n");
}
