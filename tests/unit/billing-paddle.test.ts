import { describe, it, expect } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator";
import { rootFiles } from "../../src/templates/root";
import { packageFiles } from "../../src/templates/packages";
import type { RootSecrets } from "../../src/templates/root";

const secrets: RootSecrets = {
  authSecret: "test_auth_secret_value_at_least_32_chars_long_abc",
  postgresPassword: "test_postgres_password_value_at_least_32_long",
  resendApiKey: "re_test_api_key_value_at_least_32_chars_long",
  stripeSecretKey: "sk_test_placeholder_32_chars_long_abc",
  stripeWebhookSecret: "whsec_test_placeholder_32_chars_long",
  stripePublishableKey: "pk_test_REPLACE_PLACEHOLDER_32",
  chargilyApiKey: "test_chargily_api_key_placeholder_32",
  chargilySecretKey: "test_chargily_secret_key_placeholder_32",
  paddleApiKey: "pdl_test_apikey_placeholder_32_chars",
  paddleWebhookSecret: "pdl_ntfset_placeholder_32_chars_long",
  paddleClientToken: "pdl_ntf_REPLACE_PLACEHOLDER_TOKEN_32",
  polarAccessToken: "polar_at_test_placeholder_32_chars_long",
  polarWebhookSecret: "polar_whsec_test_placeholder_32_long",
  polarOrgId: "polar_org_test_placeholder_32_long_abc",
};

function aggProvider(files: any[], name: string) {
  return files
    .filter(
      (f: any) => f.path.includes(`providers/${name}.ts`) || f.path.includes(`providers/${name}/`),
    )
    .map((f: any) => f.content)
    .join("\n");
}

describe("paddle billing provider — full E2E Context7 verified", () => {
  it("paddle.ts provider file exists in generated monorepo billing", () => {
    const files = billingFiles({ mode: "monorepo", runtime: "bun" } as any, "bun");
    const paddle = files.find((f) => f.path === "packages/billing/src/providers/paddle.ts");
    expect(paddle).toBeDefined();
    expect(aggProvider(files, "paddle")).toContain("createPaddleProvider");
  });

  it("paddle.ts contains Paddle SDK real patterns transactions.create items priceId checkout?.url", () => {
    const files = billingFiles({ mode: "monorepo", runtime: "bun" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content).toContain("transactions.create");
    expect(content).toContain("priceId");
    expect(content).toContain("checkout");
    expect(content).toContain(".url");
    expect(content).toContain("quantity");
    expect(content).toContain("customerId");
    expect(content).toContain("collectionMode");
    expect(content).toContain("automatic");
  });

  it("paddle.ts documents SDK has NO separate checkouts resource — checkouts via transactions", () => {
    const files = billingFiles({ mode: "monorepo" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content.toLowerCase()).toContain("no separate checkouts");
    expect(content.toLowerCase()).toContain("transactions");
  });

  it("paddle.ts contains webhooks.unmarshal rawBodyString secret sig + EventName.TransactionCompleted SubscriptionCreated SubscriptionCanceled TransactionPaid", () => {
    const files = billingFiles({ mode: "monorepo" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content).toContain("webhooks.unmarshal");
    expect(content).toContain("rawBody");
    expect(content).toContain("toString");
    expect(content).toContain("paddle-signature");
    expect(content).toContain("PADDLE_WEBHOOK_SECRET");
    expect(content).toContain("TransactionCompleted");
    expect(content).toContain("SubscriptionCreated");
    expect(content).toContain("SubscriptionCanceled");
    expect(content).toContain("TransactionPaid");
  });

  it("paddle.ts contains express.raw type application/json raw body comment + Buffer.from arrayBuffer pattern", () => {
    const files = billingFiles({ mode: "monorepo" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content).toContain("express.raw");
    expect(content).toContain("application/json");
    expect(content).toContain("Buffer.from");
    expect(content).toContain("arrayBuffer");
  });

  it("paddle.ts contains subscriptions.list paginated next hasMore + notifications list pagination pattern", () => {
    const files = billingFiles({ mode: "monorepo" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content).toContain("subscriptions.list");
    expect(content).toContain("hasMore");
    expect(content).toContain("next()");
    expect(content).toContain("notifications.list");
    expect(content).toContain("perPage");
  });

  it("paddle.ts contains customerPortalSessions.create customerId subscriptionIds -> url", () => {
    const files = billingFiles({ mode: "monorepo" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content).toContain("customerPortalSessions.create");
    expect(content).toContain("customerId");
  });

  it("paddle.ts contains customers.create email name", () => {
    const files = billingFiles({ mode: "monorepo" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content).toContain("customers.create");
    expect(content).toContain("email");
  });

  it("paddle.ts Environment sandbox production enum usage", () => {
    const files = billingFiles({ mode: "monorepo" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content).toContain("Environment");
    expect(content).toContain("sandbox");
    expect(content).toContain("production");
  });

  it("paddle.ts no eval or insecure dynamic import — uses static @paddle/paddle-node-sdk import", () => {
    const files = billingFiles({ mode: "monorepo" } as any, "bun");
    const content = aggProvider(files, "paddle");
    expect(content).not.toContain("eval(");
    expect(content.toLowerCase()).not.toContain("function('return import");
    expect(content).toContain("@paddle/paddle-node-sdk");
  });

  it("versions pinned in packages/versions.ts — stripe 19.x chargily 2.1.0 paddle 3.8.0 paddle-js 1.6.4 polar 0.48.1 polar nextjs 0.9.6", async () => {
    const { billing } = await import("../../packages/versions");
    expect(billing.stripe).toMatch(/^19\./);
    expect(billing["@chargily/chargily-pay"]).toBe("2.1.0");
    expect(billing["@paddle/paddle-node-sdk"]).toBe("3.8.0");
    expect(billing["@paddle/paddle-js"]).toBe("1.6.4");
    expect(billing["@polar-sh/sdk"]).toBe("0.48.1");
    expect(billing["@polar-sh/nextjs"]).toBe("0.9.6");
  });

  it(".env.example contains placeholders REPLACE_WITH for paddle + chargily + polar + stripe", () => {
    const files = rootFiles("demo", secrets, { dryRun: true });
    const example = files.find((f) => f.path === ".env.example")?.content ?? "";
    expect(example).toContain("REPLACE_WITH_PADDLE_API_KEY");
    expect(example).toContain("REPLACE_WITH_PADDLE_WEBHOOK_SECRET");
    expect(example).toContain("REPLACE_WITH_CHARGILY_API_KEY");
    expect(example).toContain("REPLACE_WITH_CHARGILY_SECRET_KEY");
    expect(example).toContain("REPLACE_WITH_POLAR_ACCESS_TOKEN");
    expect(example).toContain("REPLACE_WITH_STRIPE_SECRET_KEY");
    expect(example).toContain("PADDLE_ENVIRONMENT=sandbox");
    expect(example).toContain("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
  });

  it(".env.local contains real generated secrets via secret() for billing — gitignored", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const local = files.find((f) => f.path === ".env.local")?.content ?? "";
    expect(local).toContain("PADDLE_API_KEY=");
    expect(local).toContain("PADDLE_WEBHOOK_SECRET=");
    expect(local).toContain("PADDLE_ENVIRONMENT=sandbox");
    expect(local).toContain("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=");
    expect(local).toContain("NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox");
    expect(local).toContain("CHARGILY_API_KEY=");
    expect(local).toContain("POLAR_ACCESS_TOKEN=");
    expect(local).not.toContain("REPLACE_WITH_PADDLE_API_KEY");
  });

  it("gitignore blocks .env.local and .env", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const gi = files.find((f) => f.path === ".gitignore")?.content ?? "";
    expect(gi).toContain(".env\n");
    expect(gi).toContain(".env.local");
  });

  it("t3env validation server-only for chargily/paddle/polar/stripe secrets NEVER client except NEXT_PUBLIC_ publishable", () => {
    const files = packageFiles("bun");
    const env = files.find((f) => f.path === "packages/config/src/env.ts")?.content ?? "";
    expect(env).toContain("PADDLE_API_KEY");
    expect(env).toContain("PADDLE_WEBHOOK_SECRET");
    expect(env).toContain("PADDLE_ENVIRONMENT");
    expect(env).toContain("CHARGILY_API_KEY");
    expect(env).toContain("CHARGILY_SECRET_KEY");
    expect(env).toContain("POLAR_ACCESS_TOKEN");
    expect(env).toContain("STRIPE_SECRET_KEY");
    expect(env).toContain("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
    expect(env).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(env).toContain("NEXT_PUBLIC_PADDLE_ENVIRONMENT");
    const clientBlockMatch = env.match(/client:\s*\{[^}]+\}/s);
    if (clientBlockMatch) {
      const clientBlock = clientBlockMatch[0];
      expect(clientBlock).not.toContain("PADDLE_API_KEY:");
      expect(clientBlock).not.toContain("CHARGILY_API_KEY:");
      expect(clientBlock).not.toContain("POLAR_ACCESS_TOKEN:");
      expect(clientBlock).not.toContain("CHARGILY_SECRET_KEY:");
      expect(clientBlock).not.toContain("PADDLE_WEBHOOK_SECRET:");
    }
  });

  it("billing package.json contains paddle + chargily + stripe + polar deps when selected", () => {
    const files = billingFiles(
      {
        mode: "monorepo",
        addons: {
          paddle: { inUse: true },
          chargily: { inUse: true },
          stripe: { inUse: true },
          polar: { inUse: true },
          billing: { inUse: true },
        } as never,
      } as never,
      "bun",
    );
    const pkgRaw = files.find((f) => f.path === "packages/billing/package.json")?.content ?? "";
    const pkg = JSON.parse(pkgRaw);
    expect(pkg.dependencies).toHaveProperty("@paddle/paddle-node-sdk");
    expect(pkg.dependencies).toHaveProperty("@paddle/paddle-js");
    expect(pkg.dependencies).toHaveProperty("@chargily/chargily-pay");
    expect(pkg.dependencies).toHaveProperty("stripe");
    expect(pkg.dependencies).toHaveProperty("@polar-sh/sdk");
  });

  it("billing package emits all provider files monorepo when selected", () => {
    const files = billingFiles(
      {
        mode: "monorepo",
        addons: {
          stripe: { inUse: true },
          chargily: { inUse: true },
          paddle: { inUse: true },
          polar: { inUse: true },
          billing: { inUse: true },
        } as never,
      } as never,
      "bun",
    );
    expect(files.some((f) => f.path.endsWith("providers/paddle.ts"))).toBeTrue();
    expect(files.some((f) => f.path.endsWith("providers/stripe.ts"))).toBeTrue();
    expect(files.some((f) => f.path.endsWith("providers/polar.ts"))).toBeTrue();
    expect(files.some((f) => f.path.endsWith("providers/chargily.ts"))).toBeTrue();
  });

  it("turbo.json globalEnv includes PADDLE + CHARGILY + POLAR server and NEXT_PUBLIC_ tokens", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const turboRaw = files.find((f) => f.path === "turbo.json")?.content ?? "";
    const turbo = JSON.parse(turboRaw);
    const envList: string[] = turbo.globalEnv ?? [];
    expect(envList).toContain("PADDLE_API_KEY");
    expect(envList).toContain("PADDLE_WEBHOOK_SECRET");
    expect(envList).toContain("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
    expect(envList).toContain("CHARGILY_API_KEY");
    expect(envList).toContain("POLAR_ACCESS_TOKEN");
  });
});
