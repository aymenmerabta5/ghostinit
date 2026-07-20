import type { TemplateFile } from "../../shared.js";
import { databasePackage, startDatabaseFiles } from "../../database.js";

type Runtime = "node" | "bun";

export function databaseComposerFiles(projectName: string, runtime: Runtime): TemplateFile[] {
  return [...databasePackage(projectName, runtime), ...startDatabaseFiles(projectName)];
}
