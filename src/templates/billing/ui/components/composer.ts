import { file, type TemplateFile } from "../../../shared.js";
import type { ProjectMode } from "../../../../lib/addons.js";
import type { AddonInstallerMap } from "../../../../lib/addons.js";
import { normalize, selectedProviders } from "./shared.js";
import { billingIconsContent } from "./icons.js";
import { billingHeaderContent } from "./header.js";
import { billingEmptyContent } from "./empty.js";
import { billingHookContent } from "./hook.js";
import { billingActionsContent } from "./actions.js";
import { providerPanelContent } from "./providers.js";
import { polarBenefitsContent, polarSubscriptionsContent } from "./providers/polar.js";
import { stripeInvoicesContent } from "./providers/stripe-invoices.js";
import { stripeSubscriptionsContent } from "./providers/stripe-subscriptions.js";
import { billingTabsContent } from "./tabs.js";
import { mainPageContent } from "./main.js";
import { billingInvoicesContent } from "../invoices.js";
import { billingMoneyFile } from "../money.js";
import { billingPaymentLinkFormContent, billingProviderUrlContent } from "../payment-link-form.js";

type Runtime = "node" | "bun";

/**
 * Billing UI files.
 *
 * The billing UI is Layer 1 (UI) and is emitted ONLY alongside the app, where the
 * `@/*` path alias and the app's jsx config actually resolve.
 *
 * It is deliberately NOT mirrored into `packages/billing/src/ui` (monorepo) or
 * `src/server/billing/ui` (single). Those are Capability-layer (4) locations: they
 * have no `@/*` mapping and no `jsx` compiler option, so the mirrored copy could
 * never compile, nothing ever imported it, and it produced ~40 spurious
 * `dependency-declaration` findings in `ghostinit check`.
 */
export function billingUiFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode, addons } = normalize(modeOrOpts, runtimeOrAddons, maybeAddons);
  const effective = selectedProviders(addons);
  const base = mode === "monorepo" ? "apps/web/src/app/billing" : "src/app/billing";

  const files: TemplateFile[] = [
    ...(effective.length > 0
      ? [billingMoneyFile(mode === "monorepo" ? "apps/web/src" : "src")]
      : []),
    file(`${base}/components/icons.tsx`, billingIconsContent()),
    file(`${base}/components/billing-header.tsx`, billingHeaderContent()),
    file(`${base}/components/billing-empty.tsx`, billingEmptyContent()),
    file(`${base}/hooks/use-billing-page.ts`, billingHookContent()),
    file(`${base}/actions.ts`, billingActionsContent(mode)),
    ...(effective.some((provider) => provider !== "stripe")
      ? [file(`${base}/components/billing-invoices.tsx`, billingInvoicesContent())]
      : []),
    file(
      `${mode === "monorepo" ? "apps/web/" : ""}src/features/billing/provider-url.ts`,
      billingProviderUrlContent,
    ),
    ...(effective.includes("chargily")
      ? [
          file(
            `${base}/components/payment-link-form.tsx`,
            billingPaymentLinkFormContent("../hooks/use-billing-page"),
          ),
        ]
      : []),
  ];

  for (const p of effective) {
    if (p === "stripe") {
      files.push(
        file(
          `${base}/components/providers/stripe-subscriptions.tsx`,
          stripeSubscriptionsContent("../../hooks/use-billing-page"),
        ),
        file(
          `${base}/components/providers/stripe-invoices.tsx`,
          stripeInvoicesContent("../../hooks/use-billing-page"),
        ),
      );
    }
    files.push(
      file(
        `${base}/components/providers/${p}-panel.tsx`,
        providerPanelContent(p, "../../hooks/use-billing-page"),
      ),
    );
    if (p === "polar") {
      files.push(
        file(
          `${base}/components/providers/polar-benefits.tsx`,
          polarBenefitsContent("../../hooks/use-billing-page"),
        ),
        file(
          `${base}/components/providers/polar-subscriptions.tsx`,
          polarSubscriptionsContent("../../hooks/use-billing-page"),
        ),
      );
    }
  }

  files.push(file(`${base}/components/billing-tabs.tsx`, billingTabsContent(effective)));
  files.push(file(`${base}/page.tsx`, mainPageContent(effective, mode)));
  return files;
}
