import { file, type TemplateFile } from "../../../shared.js";
import type { ProjectMode, AddonInstallerMap } from "../../../../lib/addons.js";
import { normalize, selectedProviders } from "./shared.js";
import { billingIconsContent } from "./icons.js";
import { billingHeaderContent } from "./header.js";
import { billingEmptyContent } from "./empty.js";
import { billingHookContent } from "./hook.js";
import { billingModelContent } from "./model.js";
import { billingScreenContent } from "./screen.js";
import { billingActionsContent } from "./actions.js";
import { providerPanelContent } from "./providers.js";
import { polarBenefitsContent, polarSubscriptionsContent } from "./providers/polar.js";
import { stripeInvoicesContent } from "./providers/stripe-invoices.js";
import { stripeSubscriptionsContent } from "./providers/stripe-subscriptions.js";
import { billingTabsContent } from "./tabs.js";
import { mainPageContent } from "./main.js";
import { billingInvoicesContent } from "../invoices.js";
import { billingMoneyFile } from "../money.js";
import { billingStatusContent } from "../status.js";
import {
  billingPaymentLinkFormContent,
  billingPaymentLinkViewContent,
  billingProviderUrlContent,
} from "../payment-link-form.js";
import {
  billingActionsHookContent,
  billingClientMutationsContent,
  billingClientTypesContent,
  billingFormSchemaContent,
  billingPaymentLinkHookContent,
} from "../client-workflows.js";
import { manualBillingUiFiles } from "../manual/index.js";

type Runtime = "node" | "bun";

/** Routes own the request; feature workflows and views remain inside the app. */
export function billingUiFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode, addons } = normalize(modeOrOpts, runtimeOrAddons, maybeAddons);
  const selected = selectedProviders(addons);
  const effective = selected.filter((provider) => provider !== "manual");
  const hasManual = selected.includes("manual");
  const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
  const feature = sourceRoot + "/features/billing";
  const components = feature + "/components";
  const hasPaymentLink = effective.includes("chargily");
  const files: TemplateFile[] = [
    ...(hasManual ? manualBillingUiFiles(sourceRoot) : []),
    file(
      components + "/billing-header.tsx",
      billingHeaderContent(hasManual && effective.length === 0),
    ),
    ...(hasManual && effective.length === 0
      ? []
      : [file(components + "/billing-empty.tsx", billingEmptyContent())]),
    file(sourceRoot + "/app/billing/page.tsx", mainPageContent(selected, mode)),
  ];
  if (effective.length === 0)
    return hasManual ? files : [...files, file(components + "/icons.tsx", billingIconsContent())];
  files.push(
    billingMoneyFile(sourceRoot),
    file(feature + "/status-labels.ts", billingStatusContent()),
    file(components + "/icons.tsx", billingIconsContent()),
    file(feature + "/model.ts", billingModelContent()),
    file(feature + "/types.ts", billingClientTypesContent(hasPaymentLink)),
    file(feature + "/use-billing-page.ts", billingHookContent()),
    file(feature + "/use-billing-actions.ts", billingActionsHookContent()),
    file(feature + "/mutations.ts", billingClientMutationsContent("next")),
    file(feature + "/screen.tsx", billingScreenContent(hasPaymentLink)),
    file(feature + "/provider-url.ts", billingProviderUrlContent),
    file(sourceRoot + "/app/billing/actions.ts", billingActionsContent(mode)),
    file(components + "/billing-tabs.tsx", billingTabsContent(effective)),
  );
  if (effective.some((provider) => provider !== "stripe"))
    files.push(file(components + "/billing-invoices.tsx", billingInvoicesContent()));
  if (hasPaymentLink)
    files.push(
      file(feature + "/payment-link-form.tsx", billingPaymentLinkFormContent()),
      file(feature + "/use-payment-link-form.ts", billingPaymentLinkHookContent()),
      file(feature + "/schema.ts", billingFormSchemaContent),
      file(components + "/payment-link-form.tsx", billingPaymentLinkViewContent()),
    );
  for (const provider of effective) {
    files.push(
      file(
        components + "/providers/" + provider + "-panel.tsx",
        providerPanelContent(provider, "../../types"),
      ),
    );
    if (provider === "stripe")
      files.push(
        file(
          components + "/providers/stripe-subscriptions.tsx",
          stripeSubscriptionsContent("../../types"),
        ),
        file(components + "/providers/stripe-invoices.tsx", stripeInvoicesContent("../../types")),
      );
    if (provider === "polar")
      files.push(
        file(components + "/providers/polar-benefits.tsx", polarBenefitsContent("../../types")),
        file(
          components + "/providers/polar-subscriptions.tsx",
          polarSubscriptionsContent("../../types"),
        ),
      );
  }
  return files;
}
