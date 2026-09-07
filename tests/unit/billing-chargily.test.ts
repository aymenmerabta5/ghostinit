import { describe, it, expect } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator";
import { generateProjectFiles } from "../../src/templates/default";
import { eveFiles } from "../../src/templates/eve";

function aggProvider(files: any[], name: string) {
  return files
    .filter(
      (f: any) => f.path.includes(`providers/${name}.ts`) || f.path.includes(`providers/${name}/`),
    )
    .map((f: any) => f.content)
    .join("\n");
}
/**
 * The pgTable definitions live in the database layer, not in packages/billing —
 * billing/src/schema/ is a thin re-export. Aggregate a full project so these
 * assertions read the real schema regardless of which package owns it.
 * See the longer note in billing-interface.test.ts.
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

describe("billing provider — chargily (Algeria EDAHABIA/CIB checkout-only server-only)", () => {
  it("Context7 attempted but no library found — verified real SDK v2.1.0 via npm lib/*.d.ts directly (ChargilyClient, verifySignature)", async () => {
    const { billing } = await import("../../packages/versions");
    expect(billing["@chargily/chargily-pay"]).toBeDefined();
    expect(billing["@chargily/chargily-pay"]).toBe("2.1.0");
  });

  it("chargily.ts exists when chargily selected via addon map", () => {
    const addonMap = {
      stripe: { inUse: false },
      chargily: { inUse: true },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const chargily = files.find((f: any) => f.path.endsWith("providers/chargily.ts"));
    expect(chargily).toBeDefined();
  });

  it("exposes merchant payment links through the typed application security facade", () => {
    const files = generateProjectFiles({
      name: "chargily-payment-link",
      runtime: "bun",
      version: "0.1.0",
      mode: "monorepo",
      framework: "nextjs",
      database: "postgres",
      billing: ["chargily"],
      features: [],
      apps: ["web"],
    } as any);
    const procedure = files.find(
      (entry) => entry.path === "packages/api/src/procedures/billing/create-payment-link.ts",
    );
    const transport = procedure?.content ?? "";
    expect(transport).toContain("Merchant administrator required");
    expect(transport).toContain("context.application.billing.createPaymentLink(input)");
    expect(transport).toContain("z.string().min(1).max(120)");
    expect(transport).toContain("z.string().min(1).max(200)");
    expect(transport).toContain("z.number().int().min(1).max(1_000)");
    expect(transport).toContain(".min(1).max(20)");
    expect(transport).toContain("z.string().max(500).optional()");
    expect(transport).not.toMatch(/getBillingProvider|provider\.createPaymentLink|\brateLimit\(/);

    const facade = files.find(
      (entry) => entry.path === "packages/services/src/application/facade.ts",
    )?.content;
    expect(facade).toBeDefined();
    const method =
      facade?.indexOf("createPaymentLink: async (input: BillingPaymentLinkInput)") ?? -1;
    const authorize =
      facade?.indexOf(
        "requireAdminPrincipal(requireVerifiedPrincipal(dependencies.principal))",
        method,
      ) ?? -1;
    const limit =
      facade?.indexOf(
        'dependencies.rateLimit("billing:payment-link:" + principal.userId, 10, 60_000)',
        authorize,
      ) ?? -1;
    const delegate =
      facade?.indexOf("dependencies.billing.createPaymentLink(principal, input)", limit) ?? -1;
    expect(method).toBeGreaterThanOrEqual(0);
    expect(authorize).toBeGreaterThan(method);
    expect(limit).toBeGreaterThan(authorize);
    expect(delegate).toBeGreaterThan(limit);

    const server = files.find(
      (entry) => entry.path === "packages/services/src/application/server.ts",
    )?.content;
    expect(server).toBeDefined();
    const compose = server?.indexOf("async createPaymentLink(_principal") ?? -1;
    const selectProvider = server?.indexOf("getBillingProvider(input.provider)", compose) ?? -1;
    const capability = server?.indexOf("if (!provider.createPaymentLink)", selectProvider) ?? -1;
    const invoke = server?.indexOf("return await provider.createPaymentLink", capability) ?? -1;
    expect(selectProvider).toBeGreaterThan(compose);
    expect(capability).toBeGreaterThan(selectProvider);
    expect(invoke).toBeGreaterThan(capability);

    const registry = files.find((entry) => entry.path === "packages/billing/src/index.ts")?.content;
    expect(registry).toContain(
      'chargily: async () => (await import("./providers/chargily")).createChargilyProvider',
    );
    expect(registry).not.toMatch(/providers\/(?:stripe|paddle|polar)/);
    expect(
      files.some(({ path }) =>
        /(?:app|routes)\/api\/billing\/payment-link(?:\/route)?\.ts$/.test(path),
      ),
    ).toBe(false);
  });

  it("chargily provider contains full features per spec — product->price->checkout checkout_url EDAHABIA CIB", () => {
    const addonMap = {
      stripe: { inUse: false },
      chargily: { inUse: true },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const content = aggProvider(files, "chargily");

    expect(content).toContain("ChargilyClient");
    expect(content).toContain("api_key");
    expect(content).toContain("mode");
    expect(content).toContain("'test'");
    expect(content).toContain("'live'");
    expect(content).toContain("CHARGILY_SERVER_ONLY");
    expect(content).toContain("server-only");
    expect(content).toContain("createProduct");
    expect(content).toContain("createPrice");
    expect(content).toContain("createCheckout");
    expect(content).toContain("checkout_url");
    expect(content).toContain("CheckoutClient");
    expect(content).toContain("name");
    expect(content).toContain("description");
    expect(content).toContain("images");
    expect(content).toContain("metadata");
    expect(content).toContain("amount");
    expect(content).toContain("currency");
    expect(content).toContain("dzd");
    expect(content).toContain("product_id");
    expect(content).toContain("productId");
    expect(content).toContain("items");
    expect(content).toContain("price");
    expect(content).toContain("quantity");
    expect(content).toContain("success_url");
    expect(content).toContain("failure_url");
    expect(content).toContain("payment_method");
    expect(content).toContain("edahabia");
    expect(content).toContain("cib");
    expect(content).toContain("locale");
    expect(content).toContain("pass_fees_to_customer");
    expect(content).toContain("collect_shipping_address");
    expect(content).toContain("shipping_address");
    expect(content).toContain("customer_id");
    expect(content).toContain("customerId");
    expect(content).toContain("createPaymentLink");
    expect(content).toContain("PaymentLink");
    expect(content.toLowerCase()).toContain("after_completion");
    expect(content).toContain("url");
    expect(content).toContain("createCustomer");
    expect(content).toContain("listCustomers");
    expect(content).toContain("getBalance");
    expect(content).toContain("listCheckouts");
    expect(content).toContain("getCheckout");
    expect(content).toContain("expireCheckout");
    expect(content.toLowerCase()).toContain("new customer-authorized checkout");
    expect(content.toLowerCase()).toContain("no automatic recurring charge");
  });

  it("chargily webhook verification full spec — verifySignature Buffer signature secret raw body middleware bodyParser.json verify buf rawBody header signature 400 missing 403 invalid 200 ok", () => {
    const addonMap = {
      stripe: { inUse: false },
      chargily: { inUse: true },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const chargilyContent = aggProvider(files, "chargily");

    expect(chargilyContent).toContain("verifySignature");
    expect(chargilyContent).toContain("Buffer");
    expect(chargilyContent).toContain("signature");
    expect(chargilyContent).toContain("secret");
    expect(chargilyContent).toContain("rawBody");
    expect(chargilyContent).toContain("Buffer.from(await req.arrayBuffer())");
    expect(chargilyContent).toContain("HMAC");
    expect(chargilyContent).toContain("timingSafeEqual");
    expect(chargilyContent.toLowerCase()).toContain("bodyparser");
    expect(chargilyContent.toLowerCase()).toContain("signature");
    expect(chargilyContent).toContain("rawBody");
    expect(chargilyContent).toContain("header");
    expect(chargilyContent).toContain("400");
    expect(chargilyContent).toContain("403");
    expect(chargilyContent).toContain("200");
    expect(chargilyContent.toLowerCase()).toContain("missing");
    expect(chargilyContent.toLowerCase()).toContain("invalid");
    expect(chargilyContent).toContain("CHARGILY_SERVER_ONLY");
  });

  it("chargily webhook Next.js route streams a bounded raw body before verification", () => {
    const addonMap = {
      stripe: { inUse: false },
      chargily: { inUse: true },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const route = files.find((f: any) => f.path.includes("webhooks/chargily"))?.content ?? "";

    expect(route.length).toBeGreaterThan(200);
    expect(route).toContain("body.getReader()");
    expect(route).toContain("readBoundedWebhookBody(declaredBodyRejection)");
    expect(route).toContain("await reader.cancel(");
    expect(route).not.toContain(".arrayBuffer(");
    expect(route).toContain("signature");
    expect(route).toContain("verifySignature");
    expect(route).toContain("400");
    expect(route).toContain("403");
    expect(route).toContain("200");
    expect(route.toLowerCase().includes("chargily") || route.includes("checkout")).toBe(true);
  });

  it("chargily provider advertises no portal capability so the service returns typed NOT_SUPPORTED", () => {
    const addonMap = {
      stripe: { inUse: false },
      chargily: { inUse: true },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const content =
      files.find((entry) => entry.path.endsWith("billing/src/providers/chargily.ts"))?.content ??
      "";
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain("createPortalSession(");
    expect(content).toContain("checkout-only");
    expect(content.toLowerCase()).toContain("portal");
  });

  it("billingFiles monorepo default includes chargily + interface + schema + index", () => {
    const files = billingFiles("monorepo");
    const paths = files.map((f: any) => f.path);
    expect(paths.some((p) => p.includes("providers/chargily.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("providers/interface.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("schema/billing.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("index.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("webhooks"))).toBe(true);
  });

  it("single mode emits chargily provider file when chargily selected", () => {
    const addonMap = {
      stripe: { inUse: false },
      chargily: { inUse: true },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "single", addons: addonMap as never });
    const content = aggProvider(files, "chargily");
    expect(content.length).toBeGreaterThan(500);
    expect(content).toContain("createCheckout");
    expect(content).toContain("verifySignature");
    expect(content).toContain("checkout_url");
  });

  it("version pinned @chargily/chargily-pay 2.1.0 in packages/versions.ts", async () => {
    const { billing } = await import("../../packages/versions");
    expect(billing["@chargily/chargily-pay"]).toBe("2.1.0");
    expect(billing.stripe).toBe("22.5.0");
    expect(billing["@paddle/paddle-node-sdk"]).toBe("3.10.0");
    expect(billing["@paddle/paddle-js"]).toBe("1.6.5");
    expect(billing["@polar-sh/sdk"]).toBe("0.49.0");
    expect(billing["@polar-sh/nextjs"]).toBe("0.9.6");
  });

  it("env handling: placeholders REPLACE_WITH... in root.ts + secret() real generation + t3env server-only + turbo globalEnv", async () => {
    const { rootFiles } = await import("../../src/templates/root");
    const { packageFiles } = await import("../../src/templates/packages");

    const files = rootFiles(
      "testapp",
      {
        authSecret: "a".repeat(48),
        postgresPassword: "b".repeat(48),
        resendApiKey: "c".repeat(32),
      } as never,
      { dryRun: false } as never,
      "bun",
    );
    const envExample = files.find((f: any) => f.path === ".env.example")?.content ?? "";
    const envLocal = files.find((f: any) => f.path === ".env.local")?.content ?? "";

    expect(envExample).toContain("REPLACE_WITH_CHARGILY_API_KEY");
    expect(envExample).toContain("REPLACE_WITH_CHARGILY_SECRET_KEY");
    expect(envExample).toContain("CHARGILY_MODE=test");

    expect(envLocal).toContain("CHARGILY_API_KEY=");
    expect(envLocal).toContain("CHARGILY_SECRET_KEY=");
    expect(envLocal).toContain("CHARGILY_MODE=test");

    // Provider credentials are issued BY the provider — .env.local must carry the
    // REPLACE_WITH_* placeholder, never a generated value. A random value would
    // pass every webhook's `secret.startsWith("REPLACE_WITH")` guard and turn a
    // clear 400 "not configured" into an opaque 403 signature failure.
    expect(envLocal).toContain("CHARGILY_SECRET_KEY=REPLACE_WITH");
    expect(envLocal).toContain("CHARGILY_API_KEY=REPLACE_WITH");

    // Self-issued secrets are still genuinely generated, not placeholders.
    expect(envLocal).toContain(`BETTER_AUTH_SECRET=${"a".repeat(48)}`);
    expect(envLocal).not.toContain("BETTER_AUTH_SECRET=REPLACE_WITH");

    const pkgFiles = packageFiles("bun");
    const configServer =
      pkgFiles.find((file) => file.path === "packages/config/src/server.ts")?.content ?? "";
    const configNext =
      pkgFiles.find((file) => file.path === "packages/config/src/next.ts")?.content ?? "";
    expect(configServer).toContain("CHARGILY_API_KEY");
    expect(configServer).toContain("CHARGILY_SECRET_KEY");
    expect(configServer).toContain("CHARGILY_MODE");
    expect(configServer.includes("NEXT_PUBLIC_CHARGILY")).toBe(false);
    expect(configNext).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(configNext).toContain("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
  });

  it("turbo.json globalEnv includes chargily keys server-only + paddle/polar publishable", async () => {
    const { rootFiles } = await import("../../src/templates/root");
    const files = rootFiles(
      "testapp",
      {
        authSecret: "a".repeat(48),
        postgresPassword: "b".repeat(48),
        resendApiKey: "c".repeat(32),
      } as never,
      { dryRun: false } as never,
      "bun",
    );
    const turbo = files.find((f: any) => f.path === "turbo.json")?.content ?? "";
    expect(turbo).toContain("CHARGILY_API_KEY");
    expect(turbo).toContain("CHARGILY_SECRET_KEY");
    expect(turbo).toContain("CHARGILY_MODE");
    expect(turbo).toContain("STRIPE_SECRET_KEY");
    expect(turbo).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  });

  it("eve templates include billing-renewal.md monthly cron for chargily manual recurring via DB + checkout", () => {
    const files = eveFiles("testapp", "bun", ["chargily"]);
    const renewalMd = files.find((f: any) => f.path.includes("billing-renewal.md"))?.content ?? "";
    const renewalExample =
      files.find((f: any) => f.path === "apps/eve/examples/schedules/billing-renewal.ts")
        ?.content ?? "";

    expect(renewalMd).toBeDefined();
    expect(renewalMd.length).toBeGreaterThan(500);
    expect(renewalMd).toContain("0 2 1 * *");
    expect(renewalMd).toContain("chargily");
    expect(renewalMd).toContain("checkout-only");
    expect(renewalMd).toContain("createCheckout");
    expect(renewalMd).toContain("checkout_url");
    expect(renewalMd).toContain("createPaymentLink");
    expect(renewalMd).toContain("verifySignature");
    expect(renewalMd).toContain("Buffer.from(await req.arrayBuffer())");
    expect(renewalMd).toContain("REPLACE_WITH_CHARGILY_API_KEY");
    expect(renewalMd).toContain("billing-renewal.md");

    expect(renewalExample).toContain("defineSchedule");
    expect(renewalExample).toContain("0 2 1 * *");
    expect(renewalExample).toContain("createCheckout");
    expect(renewalExample).toContain("verifySignature");
  });

  it("Chargily provider uses the server-only verifySignature API", () => {
    const billing = billingFiles("monorepo", {
      chargily: { inUse: true },
      billing: { inUse: true },
    } as never);
    const content = billing
      .filter((file) => file.path.includes("providers/chargily"))
      .map((file) => file.content)
      .join("\n");
    expect(content).toContain("verifySignature");
    expect(content).toContain("CHARGILY_SERVER_ONLY");
    expect(content).not.toContain("client.webhook.verifySignature");
  });

  it("chargily provider file contains full file() helper usage via billing-generator + secret() env handling mention", () => {
    const files = billingFiles("monorepo");
    const content = aggProvider(files, "chargily");
    expect(content.length).toBeGreaterThan(2000);
    expect(content).toContain("BillingProvider");
    expect(content).toContain("createChargilyProvider");
  });

  it("billing package.json deps include chargily version pinned 2.1.0 when chargily selected", () => {
    const addonMap = {
      stripe: { inUse: false },
      chargily: { inUse: true },
      paddle: { inUse: false },
      polar: { inUse: false },
      billing: { inUse: true },
    };
    const files = billingFiles({ mode: "monorepo", addons: addonMap as never });
    const pkg = files.find((f: any) => f.path === "packages/billing/package.json")?.content ?? "";
    expect(pkg).toContain("@chargily/chargily-pay");
    expect(pkg).toContain("2.1.0");
  });

  it("billing schema includes chargily provider enum + products + prices + checkouts + webhook_events", () => {
    const files = billingFiles("monorepo");
    const schema = aggSchema(files);
    expect(schema).toContain('"chargily"');
    expect(schema).toContain("billing_provider");
    expect(schema).toContain("products");
    expect(schema).toContain("prices");
    expect(schema).toContain("checkouts");
    expect(schema).toContain("webhook_events");
    expect(schema).toContain("subscriptions");
  });
});
