import type { ProjectMode } from "../../../lib/addons.js";

export function featureFlagsApiRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/api/src/feature-flags" : "src/server/api/feature-flags";
}

export function featureFlagsServiceModule(mode: ProjectMode): string {
  return mode === "monorepo" ? "@repo/services/feature-flags" : "@/server/services/feature-flags";
}
