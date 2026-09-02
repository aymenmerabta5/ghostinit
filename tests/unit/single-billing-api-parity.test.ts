import { describe, expect, it } from "bun:test";
import { billingApiFiles } from "../../src/templates/api/billing.js";
import { apiPackage } from "../../src/templates/api.js";
import { singleBillingApiFiles } from "../../src/templates/modes/single/api/billing.js";
import {
  singleApiContractContent,
  singleApiRouterContent,
} from "../../src/templates/modes/single/api/routes.js";

describe("single-mode typed billing oRPC parity", () => {
  function byName(files: ReturnType<typeof billingApiFiles>): Map<string, string> {
    return new Map(
      files.map(({ path, content }) => [path.split("/").at(-1) ?? path, content] as const),
    );
  }

  it("emits subscriptions, checkout, portal, and merchant payment-link procedures", () => {
    const paths = singleBillingApiFiles().map((entry) => entry.path);
    expect(paths).toEqual([
      "src/server/api/procedures/billing/subscriptions.ts",
      "src/server/api/procedures/billing/create-checkout.ts",
      "src/server/api/procedures/billing/create-portal-session.ts",
      "src/server/api/procedures/billing/create-payment-link.ts",
    ]);
  });

  it("wires all billing contracts and implementations into the single router", () => {
    const contract = singleApiContractContent(false, true);
    const router = singleApiRouterContent(false, true);

    for (const name of [
      "subscriptions",
      "createCheckout",
      "createPortalSession",
      "createPaymentLink",
    ]) {
      expect(contract).toContain(`${name}: billing`);
      expect(router).toContain(`${name}: billing`);
    }
    expect(contract).toContain("billing: {");
    expect(router).toContain("billing: {");
  });

  it("does not leak billing imports into no-billing projects", () => {
    expect(singleApiContractContent(false, false)).not.toContain("procedures/billing");
    expect(singleApiRouterContent(false, false)).not.toContain("procedures/billing");
  });

  it("renders one canonical contract and handler policy in both packaging modes", () => {
    const monorepo = byName(billingApiFiles("monorepo"));
    const single = byName(singleBillingApiFiles());

    expect([...single.keys()]).toEqual([...monorepo.keys()]);
    for (const [name, monorepoContent] of monorepo) {
      const singleContent = single.get(name) ?? "";
      expect(singleContent.slice(singleContent.indexOf("const contract = {")), name).toBe(
        monorepoContent.slice(monorepoContent.indexOf("const contract = {")),
      );
    }

    const checkout = monorepo.get("create-checkout.ts") ?? "";
    expect(checkout).toContain('BAD_REQUEST: { message: "Invalid checkout input" }');
    expect(checkout).toContain('INTERNAL_SERVER_ERROR: { message: "Failed to create checkout" }');
    expect(checkout).toContain('provider: z.enum(["stripe", "chargily", "paddle", "polar"])');
    expect(checkout).toContain("status: z.string()");
    expect(checkout).not.toContain("VALIDATION_ERROR");
    expect(checkout).not.toMatch(/\bINTERNAL_ERROR:\s/);

    for (const content of monorepo.values()) {
      expect(content).toContain("context.application.billing.");
      expect(content).not.toContain("context.user.emailVerified");
    }
  });

  it("uses the canonical billing renderer from the monorepo API package", () => {
    const canonical = byName(billingApiFiles("monorepo"));
    const rendered = byName(
      apiPackage(true).filter(({ path }) => path.includes("/procedures/billing/")),
    );
    expect(rendered).toEqual(canonical);
  });
});
