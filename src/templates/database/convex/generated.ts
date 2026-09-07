import { file, type TemplateFile } from "../../shared.js";

const BOOTSTRAP_HEADER = `// Generated bootstrap for a fresh checkout.
// "bunx --no-install convex dev" replaces this file with deployment-aware codegen output.`;

export function convexGeneratedBootstrapFiles(): TemplateFile[] {
  return [
    file(
      "convex/_generated/api.d.ts",
      `${BOOTSTRAP_HEADER}
import type { AnyApi, AnyComponents } from "convex/server";

export declare const api: AnyApi;
export declare const internal: AnyApi;
export declare const components: AnyComponents;
`,
    ),
    file(
      "convex/_generated/api.js",
      `${BOOTSTRAP_HEADER}
import { anyApi, componentsGeneric } from "convex/server";

export const api = anyApi;
export const internal = anyApi;
export const components = componentsGeneric();
`,
    ),
    file(
      "convex/_generated/dataModel.d.ts",
      `${BOOTSTRAP_HEADER}
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  SystemTableNames,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;
`,
    ),
    file(
      "convex/_generated/server.d.ts",
      `${BOOTSTRAP_HEADER}
import type {
  ActionBuilder,
  GenericActionCtx,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

export declare const query: QueryBuilder<DataModel, "public">;
export declare const internalQuery: QueryBuilder<DataModel, "internal">;
export declare const mutation: MutationBuilder<DataModel, "public">;
export declare const internalMutation: MutationBuilder<DataModel, "internal">;
export declare const action: ActionBuilder<DataModel, "public">;
export declare const internalAction: ActionBuilder<DataModel, "internal">;
export declare const httpAction: HttpActionBuilder;
export declare const env: Record<string, string | undefined>;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
`,
    ),
    file(
      "convex/_generated/server.js",
      `${BOOTSTRAP_HEADER}
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";

export const query = queryGeneric;
export const internalQuery = internalQueryGeneric;
export const mutation = mutationGeneric;
export const internalMutation = internalMutationGeneric;
export const action = actionGeneric;
export const internalAction = internalActionGeneric;
export const httpAction = httpActionGeneric;
export const env = process.env;
`,
    ),
  ];
}
