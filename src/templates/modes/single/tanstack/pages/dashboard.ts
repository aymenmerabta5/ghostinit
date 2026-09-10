import { notFoundFileContent } from "../../../../apps/fragments/layout.js";
import { tanstackSettingsPageContent } from "../../../../apps/fragments/settings/index.js";
import { billingFiles as sharedBillingFiles } from "../../../../apps/fragments/billing/index.js";
import type { TemplateFile } from "../../../../shared.js";
import type { BillingProviderName } from "../../../../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../../../../lib/constants.js";
import { singleDashboardRouteContent } from "./dashboard-feature.js";
export { singleDashboardFeatureFilesTanstack } from "./dashboard-feature.js";

export function singleDashboardRouteTanstackContent(isConvex = false): string {
  return singleDashboardRouteContent(isConvex);
}

export function singleSettingsRouteTanstackContent(
  isConvex = false,
  hasIdentityTransport = true,
  hasBilling = true,
): string {
  return tanstackSettingsPageContent(isConvex, "single", hasIdentityTransport, hasBilling);
}
export function singleTanstackBillingFeatureFiles(
  isConvex = false,
  selected: readonly BillingProviderName[] = BILLING_PROVIDERS,
): TemplateFile[] {
  return sharedBillingFiles("tanstack", isConvex, selected).map((entry) => {
    const path = entry.path.replace(/^apps\/web\//, "");
    if (path === "src/routes/billing.tsx") {
      return {
        ...entry,
        path,
        content: entry.content,
      };
    }
    return {
      ...entry,
      path,
      content: entry.content.replaceAll('from "@repo/auth"', 'from "@/server/auth"'),
    };
  });
}

export function singleBillingRouteTanstackContent(isConvex = false): string {
  return (
    singleTanstackBillingFeatureFiles(isConvex).find(
      ({ path }) => path === "src/routes/billing.tsx",
    )?.content ?? ""
  );
}

export function singleNotFoundRouteTanstackContent(): string {
  return notFoundFileContent("tanstack");
}
