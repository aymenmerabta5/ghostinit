import type { ProjectMode } from "../../../lib/addons.js";

export function identityServiceRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/services/src/identity" : "src/server/services/identity";
}

export const serverOnly = `import "server-only";\n`;
