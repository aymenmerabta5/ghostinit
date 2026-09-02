import type { TemplateFile } from "../../shared.js";
import { apiPackage, type ApiCapabilitySelection } from "../../api.js";
import type { BillingProviderName } from "../../../lib/addons.js";

export function apiComposerFiles(
  billing?: BillingProviderName[],
  hasMessaging?: boolean,
  database = "postgres",
  capabilities: ApiCapabilitySelection = {},
): TemplateFile[] {
  const hasBilling = (billing ?? []).length > 0;
  const isPostgresMessaging = Boolean(hasMessaging && database === "postgres");
  const hasAuth = capabilities.auth ?? (hasBilling || Boolean(hasMessaging));
  return apiPackage(
    hasBilling,
    isPostgresMessaging,
    hasAuth && database !== "none",
    database === "convex",
    {
      ...capabilities,
      auth: hasAuth,
      identity: capabilities.identity ?? (hasAuth && database !== "none"),
    },
  );
}
