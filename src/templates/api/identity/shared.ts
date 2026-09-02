import type { ProjectMode } from "../../../lib/addons.js";

export function identityApiRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/api/src/identity" : "src/server/api/identity";
}

export function identityServiceModule(mode: ProjectMode): string {
  return mode === "monorepo" ? "@repo/services/identity" : "@/server/services/identity";
}
