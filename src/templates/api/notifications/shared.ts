import type { ProjectMode } from "../../../lib/addons.js";

export function notificationsApiRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/api/src/notifications" : "src/server/api/notifications";
}

export function notificationsServiceModule(mode: ProjectMode): string {
  return mode === "monorepo" ? "@repo/services/notifications" : "@/server/services/notifications";
}
