import { describe, it, expect } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator";
import { generateProjectFiles } from "../../src/templates/default";
import { billingProviders } from "../../src/lib/addons";
import { BILLING_PROVIDER_NAMES } from "../../src/templates/billing/providers/interface";
import { billingProviderSupportsClientOperation } from "../../src/domain/capabilities/billing-provider-operations.js";

function aggInterface(files: any[]) {
  return files
    .filter((f: any) => /billing\/(?:src\/)?(?:providers\/interface|domain\/)/.test(f.path))
    .map((f: any) => f.content)
    .join("\n");
}
/**
 * Aggregate the billing schema as the generated project actually sees it.
 *
 * The pgTable definitions used to be emitted twice — once under
 * packages/database/src/schema/ and again, byte-identical, under
 * packages/billing/src/schema/ (20 files, all @ts-nocheck). The database layer
 * is now the single owner and packages/billing/src/schema/ is a thin re-export,
 * so reading only billingFiles() would no longer see any column or enum.
 *
 * These assertions are about the SCHEMA, not about which package holds it, so
 * they aggregate every schema file in a fully generated project. That also means
 * they keep working if ownership moves again.
 */
function aggSchema(_files?: any[]) {
  const config = {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
  } as any;
  return generateProjectFiles(config, { dryRun: false })
    .filter((f) => f.path.includes("schema/"))
    .map((f) => f.content)
    .join("\n");
}

describe("billing interface — provider enum", () => {
  it("contains 4 providers stripe|chargily|paddle|polar", () => {
    expect(billingProviders.length).toBe(4);
    expect([...billingProviders].sort()).toEqual(["chargily", "paddle", "polar", "stripe"]);
  });

  it("BILLING_PROVIDER_NAMES type matches addons list", () => {
    expect([...BILLING_PROVIDER_NAMES].sort()).toEqual([...billingProviders].sort());
  });

  it("interface file exists via billingFiles monorepo", () => {
    const files = billingFiles("monorepo");
    const iface = files.find((f) => f.path.endsWith("providers/interface.ts"));
    expect(iface).toBeDefined();
    const content = aggInterface(files);
    expect(content).toContain("BillingProviderName");
    expect(content).toContain("interface BillingProvider");
  });

  it("interface exports required methods per spec", () => {
    const files = billingFiles("monorepo");
    const content = aggInterface(files);
    expect(content).toContain("createCheckout");
    expect(content).toContain("createCustomer");
    expect(content).toContain("createPortalSession");
    expect(content).toContain("verifyWebhook");
    expect(content).toContain("rawBody: Buffer");
    expect(content).toContain("signature: string");
    expect(content).toContain("listSubscriptions");
    expect(content).toContain("createLicenseKey");
    expect(content).toContain("ingestUsageEvent");
  });

  it("interface contains domain types CheckoutSession id url provider status amount currency", () => {
    const content = aggInterface(billingFiles("monorepo"));
    for (const token of [
      "CheckoutSession",
      "id",
      "url",
      "provider",
      "status",
      "amount",
      "currency",
    ]) {
      expect(content).toContain(token);
    }
  });

  it("interface defines Subscription provider etc + BillingEvent Invoice Customer LicenseKey UsageEvent", () => {
    const content = aggInterface(billingFiles("monorepo"));
    expect(content).toContain("Subscription");
    expect(content).toContain("BillingEvent");
    expect(content).toContain("Invoice");
    expect(content).toContain("Customer");
    expect(content).toContain("LicenseKey");
    expect(content).toContain("UsageEvent");
  });

  it("CreateCheckout input shape includes userId priceId successUrl failureUrl metadata customerId paymentMethod", () => {
    const content = aggInterface(billingFiles("monorepo"));
    expect(content).toContain("userId: string");
    expect(content).toContain("priceId: string");
    expect(content).toContain("successUrl: string");
    expect(content).toContain("failureUrl");
    expect(content).toContain("metadata");
    expect(content).toContain("customerId");
    expect(content).toContain("paymentMethod");
  });

  it("CreateCustomer input includes email name phone metadata", () => {
    const content = aggInterface(billingFiles("monorepo"));
    expect(content).toContain("CreateCustomerInput");
    expect(content).toContain("email: string");
    expect(content).toContain("name?: string");
    expect(content).toContain("phone?: string");
  });

  it("declares optional portals while the domain excludes Chargily support", () => {
    const files = billingFiles("monorepo");
    expect(aggInterface(files)).toContain("createPortalSession?");
    expect(billingProviderSupportsClientOperation("chargily", "billing.portal.v1")).toBe(false);
    expect(billingProviderSupportsClientOperation("stripe", "billing.portal.v1")).toBe(true);
  });
});

describe("billing schema — Drizzle provider enum all 4", () => {
  it("schema file exists both modes", () => {
    const mono = billingFiles("monorepo");
    const single = billingFiles("single");
    expect(mono.find((f) => f.path === "packages/billing/src/schema/billing.ts")).toBeDefined();
    expect(single.find((f) => f.path === "src/server/db/schema/billing.ts")).toBeDefined();
  });

  it("schema contains provider enum all 4 and is billing_provider", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("billing_provider");
    for (const p of ["stripe", "chargily", "paddle", "polar"]) {
      expect(schema).toContain(`"${p}"`);
    }
  });

  it("schema contains subscriptions table with required columns per spec", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema.toLowerCase()).toContain("subscriptions");
    expect(schema).toContain("userId");
    expect(schema).toContain("provider");
    expect(schema).toContain("providerSubscriptionId");
    expect(schema).toContain("status");
    expect(schema).toContain("currentPeriodEnd");
    expect(schema).toContain("trialEnd");
    expect(schema).toContain("priceId");
    expect(schema).toContain("metadata");
    expect(schema).toContain("jsonb");
    expect(schema).toContain("defaultRandom");
    expect(schema).toContain("defaultNow");
  });

  it("schema contains checkouts with url providerCheckoutId status pending|paid|completed|failed", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("checkouts");
    expect(schema).toContain("providerCheckoutId");
    expect(schema).toContain("userId");
    expect(schema).toContain("providerEventAt");
    expect(schema).toContain("url");
    expect(schema).toContain("pending");
    expect(schema).toContain("paid");
    expect(schema).toContain("completed");
    expect(schema).toContain("failed");
  });

  it("schema contains invoices, customers, products, prices, license_keys, usage_events, webhook_events", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    for (const name of [
      "invoices",
      "customers",
      "products",
      "prices",
      "license_keys",
      "usage_events",
      "webhook_events",
    ]) {
      expect(schema).toContain(name);
    }
  });

  it("invoices has paid bool tax hostedUrl status", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("paid");
    expect(schema).toContain("tax");
    expect(schema).toContain("hostedUrl");
  });

  it("customers has userId provider providerCustomerId email", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("providerCustomerId");
    expect(schema).toContain("billing_customers");
    expect(schema).toContain('userId: text("user_id").notNull()');
    expect(
      schema.match(/userId: text\("user_id"\)\.notNull\(\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(schema).not.toContain('userId: uuid("user_id").notNull()');
  });

  it("products has name provider providerProductId", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("providerProductId");
  });

  it("prices has productId FK amount currency provider providerPriceId recurring interval", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("providerPriceId");
    expect(schema).toContain("amount");
    expect(schema).toContain("currency");
    expect(schema).toContain("recurring");
    expect(schema).toContain("recurringIntervalEnum");
  });

  it("license_keys has subscriptionId FK key status active|revoked provider polar default", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("license_keys");
    expect(schema).toContain("active");
    expect(schema).toContain("revoked");
  });

  it("usage_events has subscriptionId FK name credits externalCustomerId organizationId provider polar metadata", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("usage_events");
    expect(schema).toContain("externalCustomerId");
    expect(schema).toContain("organizationId");
    expect(schema).toContain("credits");
  });

  it("webhook_events id uuid PK defaultRandom provider enum providerEventId unique type payload jsonb processed bool default false createdAt idempotent", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    expect(schema).toContain("webhook_events");
    expect(schema).toContain("providerEventId");
    expect(schema).toContain("uniqueIndex");
    expect(schema).toContain("webhook_events_provider_event_unique");
    expect(schema).toContain("processed");
    expect(schema).toContain("default(false)");
  });

  it("subscriptions status enum union active trialing past_due canceled unpaid incomplete paused etc", () => {
    const schema = aggSchema(billingFiles("monorepo"));
    for (const s of [
      "active",
      "trialing",
      "past_due",
      "canceled",
      "unpaid",
      "incomplete",
      "paused",
    ]) {
      expect(schema).toContain(`"${s}"`);
    }
  });
});

describe("billing package generator", () => {
  it("monorepo exports index with factory all providers", () => {
    const files = billingFiles("monorepo");
    expect(files.find((f) => f.path === "packages/billing/src/index.ts")).toBeDefined();
    const idx = files.find((f) => f.path === "packages/billing/src/index.ts")?.content ?? "";
    expect(idx).toContain("getBillingProvider");
    expect(idx).toContain("loadBillingRegistry");
    expect(idx).toContain("ALL_BILLING_PROVIDERS");
  });

  it("single mode emits server/db/schema/billing.ts + server/billing", () => {
    const files = billingFiles("single");
    expect(files.find((f) => f.path === "src/server/db/schema/billing.ts")).toBeDefined();
    expect(files.find((f) => f.path === "src/server/billing/providers/interface.ts")).toBeDefined();
  });

  it("respects addon filter — stripe only package deps includes stripe not chargily/paddle/polar", () => {
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
  });

  it("versions pins from packages/versions.ts should be referenced via generator deps not hardcoded unknown versions", () => {
    const files = billingFiles("monorepo");
    const pkg = files.find((f) => f.path === "packages/billing/package.json")?.content ?? "";
    expect(pkg).toContain("@repo/database");
    expect(pkg).toContain("@repo/config");
  });
});
