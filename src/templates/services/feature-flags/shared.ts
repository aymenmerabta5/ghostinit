import type { ProjectMode } from "../../../lib/addons.js";

export function featureFlagsServiceRoot(mode: ProjectMode): string {
  return mode === "monorepo"
    ? "packages/services/src/feature-flags"
    : "src/server/services/feature-flags";
}

export const featureFlagsServerOnly = `import "server-only";\n`;
