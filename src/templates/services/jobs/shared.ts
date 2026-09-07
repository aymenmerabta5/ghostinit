import type { ProjectMode } from "../../../lib/addons.js";

export function jobsServiceRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/services/src/jobs" : "src/server/services/jobs";
}

export const jobsServerOnly = `import "server-only";\n`;
