import { describe, expect, it } from "bun:test";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { billingHeaderContent } from "../../src/templates/billing/ui/components/header.js";
import { billingEmptyContent } from "../../src/templates/billing/ui/components/empty.js";
import { providerPanelContent } from "../../src/templates/billing/ui/components/providers.js";
import { billingPresentationContent } from "../../src/templates/apps/fragments/billing/page.js";
import { singleTanstackBillingFeatureFiles } from "../../src/templates/modes/single/tanstack/pages/dashboard.js";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [path] : leafKeys(child, path);
  });
}

describe("billing EN/FR/AR coverage", () => {
  it("keeps billing catalog keys in exact parity", () => {
    const english = leafKeys(EN_MESSAGES.billing).sort();
    expect(leafKeys(FR_MESSAGES.billing).sort()).toEqual(english);
    expect(leafKeys(AR_MESSAGES.billing).sort()).toEqual(english);
    expect(FR_MESSAGES.billing.title).toBe("Facturation");
    expect(AR_MESSAGES.billing.title).toBe("الفوترة");
  });

  it("uses the shared billing namespace in both frameworks and package modes", () => {
    const singleTanstackBilling = singleTanstackBillingFeatureFiles();
    const singleRoute =
      singleTanstackBilling.find(({ path }) => path === "src/routes/billing.tsx")?.content ?? "";
    const singlePresentation =
      singleTanstackBilling.find(({ path }) => path === "src/features/billing/billing-page.tsx")
        ?.content ?? "";
    expect(singleRoute).toContain('import { BillingPage } from "@/features/billing/billing-page"');
    const consumers = [
      billingHeaderContent(),
      billingEmptyContent(),
      providerPanelContent("stripe", "../../hooks/use-billing-page"),
      providerPanelContent("chargily", "../../hooks/use-billing-page"),
      providerPanelContent("paddle", "../../hooks/use-billing-page"),
      providerPanelContent("polar", "../../hooks/use-billing-page"),
      billingPresentationContent("next"),
      billingPresentationContent("tanstack"),
      singlePresentation,
    ];

    for (const content of consumers) {
      expect(content).toContain("useSurfaceTranslations");
      expect(content).toMatch(/useSurfaceTranslations\(["']billing["']\)/);
    }
  });
});
