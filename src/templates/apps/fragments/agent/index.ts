import type { TemplateFile } from "../../../shared.js";
import { agentPage } from "./agent-page.js";
export { agentPage };
export function agentFiles(): TemplateFile[] {
  return [agentPage()];
}
