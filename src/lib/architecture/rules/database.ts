/**
 * Database isolation: only infrastructure/database may import db packages.
 */

import type { ArchitectureFinding } from "../types.js";
import { DATABASE_PACKAGES } from "../constants.js";
import { getBasePackage } from "../utils.js";

export function checkDatabaseIsolation(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
): void {
  const moduleMatch = /\/modules\/src\/([a-z0-9-]+)\//.exec(file);
  if (!moduleMatch) return;
  const moduleName = moduleMatch[1];
  const databaseDirPattern = new RegExp(`/modules/src/${moduleName}/infrastructure/database/`);
  if (databaseDirPattern.test(file)) return;
  if (DATABASE_PACKAGES.has(imp) || DATABASE_PACKAGES.has(getBasePackage(imp))) {
    findings.push({
      id: "database-import-outside-infrastructure",
      severity: "HIGH",
      message: `Module ${moduleName} imports database package outside infrastructure/database: ${imp}`,
      file,
      rule: "database-isolation",
    });
  }
}
