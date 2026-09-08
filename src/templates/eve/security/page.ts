import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";
import { agentPageContent } from "../../apps/fragments/agent/page-content.js";

export function tanstackEveAgentPageFile(mode: ProjectMode): TemplateFile {
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  return file(root + "/routes/agent.tsx", agentPageContent(mode, "tanstack-start"));
}
