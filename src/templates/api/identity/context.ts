import type { ProjectMode } from "../../../lib/addons.js";

export function identityContextContent(mode: ProjectMode): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type { RequestApplication } from "${applicationModule}";

export interface IdentityTransportContext {
  application: RequestApplication;
}
`;
}
