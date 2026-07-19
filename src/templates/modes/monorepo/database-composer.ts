import type { TemplateFile } from "../../shared.js";
import { databasePackage, startDatabaseFiles } from "../../database.js";

export function databaseComposerFiles(
  projectName: string,
  runtime: "node" | "bun",
): TemplateFile[] {
  return [...databasePackage(projectName, runtime as any), ...startDatabaseFiles(projectName)];
}
