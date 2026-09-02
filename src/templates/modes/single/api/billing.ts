import { billingApiFiles } from "../../../api/billing.js";
import type { TemplateFile } from "../../../shared.js";

/** Single mode changes packaging paths only; the billing transport contract is canonical. */
export function singleBillingApiFiles(): TemplateFile[] {
  return billingApiFiles("single");
}
