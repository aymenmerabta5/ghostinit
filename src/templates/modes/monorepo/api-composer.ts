import type { TemplateFile } from "../../shared.js";
import { apiPackage } from "../../api.js";
import type { BillingProviderName } from "../../../lib/addons.js";

export function apiComposerFiles(
  billing?: BillingProviderName[],
  hasMessaging?: boolean,
  database?: string,
): TemplateFile[] {
  const hasBilling = (billing ?? []).length > 0;
  const isPostgresMessaging = Boolean(hasMessaging && database === "postgres");
  return apiPackage(hasBilling, isPostgresMessaging);
}
