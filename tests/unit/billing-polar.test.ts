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

describe("billing provider — polar (MoR 4% metering license keys) — Context7 verified full E2E", () => {
  it("polar.ts exists when polar selected", () => {
    const addonMap = {
      stripe: { inUse: false },
      chargily: { inUse: false },
      paddle: { inUse: false },
      polar: { inUse: true },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const polar = files.find((f) => f.path.endsWith("providers/polar.ts"));
    expect(polar).toBeDefined();
    const content = aggProvider(files, "polar");
    expect(content).toContain("checkouts.create");
    expect(content.length).toBeGreaterThan(500);
  });

  it("file contains checkout url + full SDK patterns — Context7 polar checkout subscription", () => {
    const files = billingFiles("monorepo");
    const content = aggProvider(files, "polar");
    expect(content).toContain("Polar");
    expect(content).toContain("accessToken");
    expect(content).toContain("POLAR_ACCESS_TOKEN");
    expect(content).toContain("checkouts.create");
    expect(content).toContain("products");
    expect(content).toContain("customerName");
    expect(content).toContain("customerBillingAddress");
    expect(content).toContain("country");
    expect(content).toContain("locale");
    expect(content.toLowerCase()).toContain("checkout");
    expect(content).toContain("url");
    expect(content).toContain("Buffer");
    expect(content.includes("arrayBuffer") || content.includes("rawBody")).toBe(true);
  });

  it("subscriptions.create productId customerId free + scope subscriptions:write", () => {
    const content = aggProvider(billingFiles("monorepo"), "polar");
    expect(content).toContain("subscriptions.create");
    expect(content).toContain("productId");
    expect(content).toContain("customerId");
    expect(content.toLowerCase()).toContain("free");
    expect(content).toContain("subscriptions:write");
  });

  it("webhooks.createWebhookEndpoint url format slack? events subscription.uncanceled organizationId", () => {
    const content = aggProvider(billingFiles("monorepo"), "polar");
    expect(content).toContain("createWebhookEndpoint");
    expect(content).toContain("url");
    expect(content).toContain("format");
    expect(content).toContain("events");
    expect(content).toContain("subscription.uncanceled");
    expect(content).toContain("organizationId");
  });

  it("eventsIngest meter events name organizationId externalCustomerId externalId metadata credits idempotency", () => {
    const content = aggProvider(billingFiles("monorepo"), "polar");
    expect(content).toContain("ingest");
    expect(content).toContain("externalCustomerId");
    expect(content).toContain("externalId");
    expect(content).toContain("credits");
    expect(content.toLowerCase()).toContain("idempotency");
  });

  it("uses the framework-neutral Polar SDK for webhooks, license keys, and seats", () => {
    const files = billingFiles("monorepo");
    const all = files.map((f: any) => f.content).join("\n") + aggProvider(files, "polar");
    expect(all).toContain("@polar-sh/sdk");
    expect(all).not.toContain("@polar-sh/nextjs");
    expect(all).toContain("license");
    expect(all.toLowerCase()).toContain("seats");
  });

  it("uses the audited age-eligible billing provider versions", async () => {
    const { billing } = await import("../../packages/versions");
    expect(billing["@polar-sh/sdk"]).toBe("0.49.0");
    expect(billing["@polar-sh/nextjs"]).toBe("0.9.6");
    expect(billing.stripe).toBe("22.5.0");
    expect(billing["@chargily/chargily-pay"]).toBe("2.1.0");
    expect(billing["@paddle/paddle-node-sdk"]).toBe("3.10.0");
    expect(billing["@paddle/paddle-js"]).toBe("1.6.5");
  });

  it("env: .env.example REPLACE_WITH_POLAR placeholders + .env.local secret() gitignored + t3env server-only", async () => {
    const { rootFiles } = await import("../../src/templates/root");
    const { secret } = await import("../../src/templates/shared");
    const secrets = {
      authSecret: secret(),
      postgresPassword: secret(),
      resendApiKey: secret(),
      stripeSecretKey: secret(),
      stripeWebhookSecret: secret(),
      stripePublishableKey: secret(),
      chargilyApiKey: secret(),
      chargilySecretKey: secret(),
      paddleApiKey: secret(),
      paddleWebhookSecret: secret(),
      paddleClientToken: secret(),
      polarAccessToken: secret(),
      polarWebhookSecret: secret(),
      polarOrgId: secret(),
    };
    const files = rootFiles("demo", secrets as never, { dryRun: true });
    const example = files.find((f) => f.path === ".env.example")?.content ?? "";
    expect(example).toContain("REPLACE_WITH_POLAR_ACCESS_TOKEN");
    expect(example).toContain("REPLACE_WITH_POLAR_WEBHOOK_SECRET");
    expect(example).toContain("REPLACE_WITH_POLAR_ORG_ID");
    expect(example).toContain("NEXT_PUBLIC_");
    const local =
      rootFiles("demo", secrets as never, { dryRun: false }).find((f) => f.path === ".env.local")
        ?.content ?? "";
    expect(local).toContain(secrets.polarAccessToken);
    expect(local).toContain(secrets.polarWebhookSecret);
    const gitignore =
      rootFiles("demo", secrets as never, { dryRun: false }).find((f) => f.path === ".gitignore")
        ?.content ?? "";
    expect(gitignore).toContain(".env\n");
    expect(gitignore).toContain(".env.*\n");
    expect(gitignore).toContain("!.env.example\n");
    expect(gitignore).toContain("!.env.*.example\n");
  });

  it("t3env validation server-only for polar + paddle + chargily + stripe NEVER client except NEXT_PUBLIC_", async () => {
    const { packageFiles } = await import("../../src/templates/packages");
    const files = packageFiles("bun");
    const server =
      files.find((f) => f.path === "packages/config/src/server-schema.ts")?.content ?? "";
    const next = files.find((f) => f.path === "packages/config/src/next.ts")?.content ?? "";
    expect(server).toContain("POLAR_ACCESS_TOKEN");
    expect(server).toContain("POLAR_WEBHOOK_SECRET");
    expect(server).toContain("POLAR_ORG_ID");
    expect(next).not.toContain("POLAR_ACCESS_TOKEN");
    expect(next).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(next).toContain("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
  });
});
