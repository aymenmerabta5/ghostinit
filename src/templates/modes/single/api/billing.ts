import { billingApiFiles } from "../../../api/billing.js";
import { manualBillingApiFiles } from "../../../api/billing-manual.js";
import type { TemplateFile } from "../../../shared.js";

/** Single mode changes packaging paths only; the billing transport contract is canonical. */
export function singleBillingApiFiles(manual = false): TemplateFile[] {
  return [...billingApiFiles("single"), ...(manual ? manualBillingApiFiles("single") : [])];
}
