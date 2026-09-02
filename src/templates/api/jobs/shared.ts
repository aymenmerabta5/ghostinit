import type { ProjectMode } from "../../../lib/addons.js";

export function jobsApiRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/api/src/jobs" : "src/server/api/jobs";
}

export function jobsServiceModule(mode: ProjectMode): string {
  return mode === "monorepo" ? "@repo/services/jobs" : "@/server/services/jobs";
}
