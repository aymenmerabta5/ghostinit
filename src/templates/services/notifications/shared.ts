import type { ProjectMode } from "../../../lib/addons.js";

export function notificationsServiceRoot(mode: ProjectMode): string {
  return mode === "monorepo"
    ? "packages/services/src/notifications"
    : "src/server/services/notifications";
}

export const notificationsServerOnly = `import "server-only";\n`;
