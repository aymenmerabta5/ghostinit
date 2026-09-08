/**
 * Database isolation: only infrastructure/database may import db packages.
 */

import type { ArchitectureFinding } from "../types.js";
import { DATABASE_PACKAGES } from "../constants.js";
import { getBasePackage } from "../utils.js";
import { moduleFromPath } from "./module-path.js";
import { getLayerFromFilePath } from "./layer-policy.js";

export function checkDatabaseIsolation(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
  resolvedTarget?: string,
): void {
  const module = moduleFromPath(file);
  const isDomain = getLayerFromFilePath(file)?.name === "Domain";
  if (!module && !isDomain) return;
  if (!isDomain && module?.relativePath.startsWith("infrastructure/database/")) return;
  const target = resolvedTarget?.replace(/\\/g, "/") ?? "";
  if (
    DATABASE_PACKAGES.has(imp) ||
    DATABASE_PACKAGES.has(getBasePackage(imp)) ||
    /(?:^|\/)packages\/database(?:\/|$)/.test(target) ||
    /(?:^|\/)src\/server\/(?:db|database)(?:\/|$)/.test(target)
  ) {
    findings.push({
      id: "database-import-outside-infrastructure",
      severity: "HIGH",
      message: isDomain
        ? `Domain code must not depend on persistence implementations: ${imp}`
        : `Module ${module!.name} imports database package outside infrastructure/database: ${imp}`,
      file,
      rule: "database-isolation",
    });
  }
}
