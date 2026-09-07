import { agentPageContent } from "../../../apps/fragments/agent/page-content.js";
import { twoFactorPageContent } from "../../../apps/fragments/auth/index.js";

export function singleTwoFactorPageContent(): string {
  return twoFactorPageContent("next");
}
export function singleAgentPageContent(): string {
  return agentPageContent("single");
}
