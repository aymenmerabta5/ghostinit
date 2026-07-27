import type { TemplateFile } from "../../shared.js";
import { apiPackage } from "../../api.js";
import type { BillingProviderName } from "../../../lib/addons.js";

export function apiComposerFiles(billing?: BillingProviderName[]): TemplateFile[] {
  return apiPackage((billing ?? []).length > 0);
}
