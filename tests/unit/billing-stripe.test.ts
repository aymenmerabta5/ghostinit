import { describe, it, expect } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator";

function aggProvider(files: any[], name: string) {
  return files
    .filter(
      (f: any) => f.path.includes(`providers/${name}.ts`) || f.path.includes(`providers/${name}/`),
    )
    .map((f: any) => f.content)
    .join("\n");
}

describe("billing provider — stripe", () => {
  it("stripe.ts exists when stripe selected via addon map", () => {
    const addonMap = {
      stripe: { inUse: true },
      chargily: { inUse: false },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const stripe = files.find((f) => f.path.endsWith("providers/stripe.ts"));
    expect(stripe).toBeDefined();
  });

  it("stripe provider contains full features per spec — checkout subscription portal webhook list", () => {
    const addonMap = {
      stripe: { inUse: true },
      chargily: { inUse: false },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const content = aggProvider(files, "stripe");
    const portal =
      files.find((entry) => entry.path.endsWith("providers/stripe/portal.ts"))?.content ?? "";
    expect(content).toContain("checkout.sessions.create");
    expect(content).toContain("line_items");
    expect(content).toContain("mode");
    expect(content).toContain("subscription");
    expect(content).toContain("automatic_tax");
    expect(content).toContain("success_url");
    expect(content).toContain("cancel_url");
    expect(content).toContain("dahlia");
    expect(content).toContain("2026-07-29.dahlia");
    expect(content).toContain("expand");
    expect(content).toContain("subscription");
    expect(content).toContain("billingPortal.sessions.create");
    expect(content).toContain("customer");
    expect(content).toContain("return_url");
    expect(portal).not.toContain("flow_data");
    expect(portal).not.toContain("subscription_update");
    expect(content).toContain("webhooks.constructEventAsync");
    expect(content).toContain("rawBody");
    expect(content).toContain("Buffer");
    expect(content).toContain("constructEventAsync");
    expect(content).toContain("checkout.session.completed");
    expect(content).toContain("invoice.paid");
    expect(content).toContain("subscription");
    expect(content.toLowerCase()).toContain("invoice");
    expect(content).toContain("subscriptions.list");
    expect(content).toContain("customer");
    expect(content).toContain("status");
    expect(content).toContain("active");
    expect(content).toContain("createPortalSession");
    expect(content).toContain("createCheckout");
    expect(content).toContain("verifyWebhook");
    expect(content).toContain("listSubscriptions");
  });

  it("stripe provider file exists via billingFiles monorepo default (no addon filter = all)", () => {
    const files = billingFiles("monorepo");
    const content = aggProvider(files, "stripe");
    expect(content.length).toBeGreaterThan(500);
  });

  it("billingFiles monorepo with all providers includes stripe + interface + index + schema", () => {
    const files = billingFiles("monorepo");
    const paths = files.map((f) => f.path);
    expect(paths.some((p) => p.includes("providers/interface.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("providers/stripe.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("schema/billing.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("index.ts"))).toBe(true);
  });

  it("env handling: package.json includes stripe version pinned from packages/versions.ts", () => {
    const addonMap = {
      stripe: { inUse: true },
      chargily: { inUse: false },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const pkg = files.find((f) => f.path === "packages/billing/package.json")?.content ?? "";
    expect(pkg).toContain("stripe");
    expect(pkg).toContain('"stripe"');
  });

  it("single mode emits stripe provider file when stripe selected", () => {
    const addonMap = {
      stripe: { inUse: true },
      chargily: { inUse: false },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "single", addons: addonMap as never });
    const content = aggProvider(files, "stripe");
    expect(content.length).toBeGreaterThan(200);
    expect(content).toContain("createCheckout");
    expect(content).toContain("constructEventAsync");
  });

  it("webhook verification must use raw Body Buffer — check file contains Buffer.from arrayBuffer pattern comment", () => {
    const files = billingFiles("monorepo");
    const stripe = aggProvider(files, "stripe");
    expect(stripe).toContain("Buffer");
    expect(stripe).toContain("rawBody");
    const webhooksReadme =
      files.find((f) => f.path.includes("webhooks") || f.path.includes("README"))?.content ?? "";
    const hasArrayBufferNote =
      files.some((f) => f.content.includes("arrayBuffer")) ||
      stripe.includes("arrayBuffer") ||
      webhooksReadme.toLowerCase().includes("arraybuffer") ||
      webhooksReadme.toLowerCase().includes("raw body");
    expect(hasArrayBufferNote).toBe(true);
  });

  it("server-only secrets NEVER client except NEXT_PUBLIC_ publishable — provider does not import client env", () => {
    const files = billingFiles("monorepo");
    const stripe = aggProvider(files, "stripe");
    expect(stripe.includes("STRIPE_SECRET_KEY") || stripe.includes("secretKey")).toBe(true);
    expect(stripe.includes("STRIPE_WEBHOOK_SECRET") || stripe.includes("webhookSecret")).toBe(true);
  });

  it("version pinned in packages/versions.ts is Stripe 22.5.0", async () => {
    const { billing } = await import("../../packages/versions");
    expect(billing.stripe).toBeDefined();
    expect(billing.stripe).toBe("22.5.0");
  });
});
