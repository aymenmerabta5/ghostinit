import type { TemplateFile } from "../../shared.js";
import { databasePackage, startDatabaseFiles } from "../../database.js";
import { convexDatabaseFiles, convexStartDatabaseFiles } from "../../database/convex.js";
import type { AddonInstallerMap, DatabaseProvider } from "../../../lib/addons.js";
import { hasAddon } from "../../../lib/addons.js";

type Runtime = "node" | "bun";

export function databaseComposerFiles(
  projectName: string,
  runtime: Runtime,
  addons?: AddonInstallerMap,
  database?: DatabaseProvider,
): TemplateFile[] {
  const isConvex = database === "convex" || Boolean(addons && hasAddon(addons, "convex"));

  if (isConvex) {
    return [...convexDatabaseFiles(projectName, runtime), ...convexStartDatabaseFiles(projectName)];
  }

  if (database === "none") {
    // minimal - no database package, just empty for bare projects
    return [];
  }

  return [...databasePackage(projectName, runtime), ...startDatabaseFiles(projectName)];
}
