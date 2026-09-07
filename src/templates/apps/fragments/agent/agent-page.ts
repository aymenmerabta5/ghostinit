import { file, type TemplateFile } from "../../../shared.js";
import { agentPageContent } from "./page-content.js";

export function agentPage(): TemplateFile {
  return file("apps/web/src/app/agent/page.tsx", agentPageContent("monorepo"));
}
