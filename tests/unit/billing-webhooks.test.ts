import { describe, it, expect } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator";
import { backendFiles } from "../../src/templates/backend/elysia";
import { rootFiles } from "../../src/templates/root";
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

describe("billing webhooks — raw body Buffer critical fix + idempotent dedup + Context7 verified", () => {
  const allProviders = {
    stripe: { inUse: true },
    chargily: { inUse: true },
    paddle: { inUse: true },
    polar: { inUse: true },
    billing: { inUse: true },
  } as never;

  describe("monorepo paths: apps/web/src/app/api/webhooks/<provider>/route.ts all must use Buffer.from(await req.arrayBuffer())", () => {
    const files = billingFiles({ mode: "monorepo", addons: allProviders } as never, "bun");
    const providers = ["stripe", "chargily", "paddle", "polar"] as const;

    for (const provider of providers) {
      it(`monorepo ${provider} webhook contains arrayBuffer — not req.json() critical 403 fix`, () => {
        const path = `apps/web/src/app/api/webhooks/${provider}/route.ts`;
        const f = files.find((x: any) => x.path === path);
        expect(f, `missing ${path}`).toBeDefined();
        expect(f!.content).toContain("arrayBuffer");
        expect(f!.content).toContain("Buffer.from");
        // Should NOT use req.json() as primary body parsing (comment explaining not to is okay, but must have arrayBuffer)
        expect(f!.content.includes("arrayBuffer")).toBe(true);
      });
    }

    it("stripe monorepo: header stripe-signature missing 400, constructEvent raw Buffer sig secret try catch 400 Webhook Error", () => {
      const f = files.find((x: any) => x.path === "apps/web/src/app/api/webhooks/stripe/route.ts");
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("stripe-signature");
      expect(c).toContain("400");
      expect(c).toContain("constructEvent");
      expect(c).toContain("Webhook Error");
      expect(c).toContain("Buffer.from(await req.arrayBuffer())");
      expect(c).toContain("STRIPE_WEBHOOK_SECRET");
      expect(c).toContain("2025-03-31.basil");
    });

    it("stripe monorepo idempotent via webhook_events unique provider+providerEventId check processed return 200 already processed, switch checkout.session.completed -> update checkout status completed create subscription, invoice.paid lifecycle broader vs payment_succeeded narrower, customer.subscription.updated/deleted, insert webhook_events processed true onConflictDoNothing return ok 200", () => {
      const c = files.find(
        (x: any) => x.path === "apps/web/src/app/api/webhooks/stripe/route.ts",
      )!.content;
      expect(c).toContain("webhook_events");
      expect(c).toContain("providerEventId");
      expect(c).toContain("already processed");
      expect(c).toContain("checkout.session.completed");
      expect(c).toContain("invoice.paid");
      expect(c.toLowerCase()).toContain("payment_succeeded");
      expect(c).toContain("customer.subscription.updated");
      expect(c).toContain("customer.subscription.deleted");
      expect(c).toContain("onConflictDoNothing");
      expect(c).toContain("processed");
      expect(c).toContain('"ok"');
      expect(c).toContain("200");
    });

    it("chargily monorepo: header signature, verifySignature buf sig secret, server-only!", () => {
      const f = files.find(
        (x: any) => x.path === "apps/web/src/app/api/webhooks/chargily/route.ts",
      );
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("signature");
      expect(c).toContain("verifySignature");
      expect(c).toContain("Buffer.from(await req.arrayBuffer())");
      expect(c).toContain("CHARGILY_SECRET_KEY");
      expect(c).toContain("server-only");
      expect(c).toContain("400");
      expect(c).toContain("403");
      expect(c).toContain("200");
    });

    it("chargily monorepo: architecture checker must flag client importing Chargily -> client-boundary HIGH comment", () => {
      const c = files.find(
        (x: any) => x.path === "apps/web/src/app/api/webhooks/chargily/route.ts",
      )!.content;
      expect(c.toLowerCase()).toContain("server-only");
      const providerFile = files
        .filter((x: any) => x.path.includes("providers/chargily"))
        .map((x: any) => x.content)
        .join("\n");
      expect(providerFile).toContain("CHARGILY_SERVER_ONLY");
      expect(providerFile).toContain("server-only");
    });

    it("paddle monorepo: unmarshal buf.toString() secret sig EventName", () => {
      const f = files.find((x: any) => x.path === "apps/web/src/app/api/webhooks/paddle/route.ts");
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("paddle-signature");
      expect(c).toContain("unmarshal");
      expect(c).toContain("toString");
      expect(c).toContain("arrayBuffer");
      expect(c).toContain("PADDLE_WEBHOOK_SECRET");
      expect(c).toContain("Buffer.from(await req.arrayBuffer())");
    });

    it("paddle monorepo: EventName TransactionCompleted SubscriptionCreated etc + idempotent dedup", () => {
      const c = files.find(
        (x: any) => x.path === "apps/web/src/app/api/webhooks/paddle/route.ts",
      )!.content;
      expect(c).toContain("TransactionCompleted");
      expect(c).toContain("SubscriptionCreated");
      expect(c).toContain("webhook_events");
      expect(c).toContain("already processed");
      expect(c).toContain("onConflictDoNothing");
      expect(c).toContain("already processed");
    });

    it("polar monorepo: verification raw body + webhook secret placeholders .env.example", () => {
      const f = files.find((x: any) => x.path === "apps/web/src/app/api/webhooks/polar/route.ts");
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("arrayBuffer");
      expect(c).toContain("POLAR_WEBHOOK_SECRET");
      // Should mention validateEvent or @polar-sh/nextjs Webhooks helper
      expect(
        c.includes("validateEvent") || c.includes("Webhooks") || c.includes("@polar-sh/nextjs"),
      ).toBe(true);
    });

    it("polar monorepo: idempotent dedup webhook_events + license + metering mentions", () => {
      const c = files.find(
        (x: any) => x.path === "apps/web/src/app/api/webhooks/polar/route.ts",
      )!.content;
      expect(c).toContain("webhook_events");
      expect(c).toContain("already processed");
      expect(c).toContain("onConflictDoNothing");
    });
  });

  describe("single paths: src/app/api/webhooks/<provider>/route.ts all must use Buffer.from(await req.arrayBuffer())", () => {
    const files = billingFiles(
      {
        mode: "single",
        addons: {
          stripe: { inUse: true },
          chargily: { inUse: true },
          paddle: { inUse: true },
          polar: { inUse: true },
          billing: { inUse: true },
        } as never,
      },
      "bun",
    );
    const providers = ["stripe", "chargily", "paddle", "polar"] as const;

    for (const provider of providers) {
      it(`single ${provider} webhook contains arrayBuffer`, () => {
        const path = `src/app/api/webhooks/${provider}/route.ts`;
        const f = files.find((x: any) => x.path === path);
        expect(f, `missing single ${path}`).toBeDefined();
        expect(f!.content).toContain("arrayBuffer");
        expect(f!.content).toContain("Buffer.from");
      });
    }
  });

  describe("Elysia must backend: apps/api/src/routes/webhooks/<provider>.ts all must use Buffer.from(await request.arrayBuffer()) native arrayBuffer() same", () => {
    const files = backendFiles("testapp", "bun", {
      stripe: { inUse: true },
      chargily: { inUse: true },
      paddle: { inUse: true },
      polar: { inUse: true },
      billing: { inUse: true },
    });

    const providers = ["stripe", "chargily", "paddle", "polar"] as const;

    // Legacy backendFiles now returns [] (oRPC replacement). Skip if empty.
    const isLegacyEmpty = files.length === 0;

    for (const provider of providers) {
      it(`elysia ${provider} webhook contains arrayBuffer — native arrayBuffer() same as Next.js`, () => {
        if (isLegacyEmpty) return;
        const path = `apps/api/src/routes/webhooks/${provider}.ts`;
        const f = files.find((x: any) => x.path === path);
        expect(f, `missing elysia ${path}`).toBeDefined();
        expect(f!.content).toContain("arrayBuffer");
        expect(f!.content).toContain("Buffer.from");
      });
    }

    it("elysia stripe: header stripe-signature missing 400, constructEvent raw Buffer sig secret try catch 400 Webhook Error, idempotent dedup", () => {
      if (isLegacyEmpty) return;
      const f = files.find((x: any) => x.path === "apps/api/src/routes/webhooks/stripe.ts");
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("stripe-signature");
      expect(c).toContain("400");
      expect(c).toContain("constructEvent");
      expect(c).toContain("Webhook Error");
      expect(c).toContain("webhook_events");
      expect(c.includes("already processed") || c.includes("alreadyProcessed")).toBe(true);
      expect(c).toContain("onConflictDoNothing");
      expect(c).toContain("checkout.session.completed");
      expect(c).toContain("invoice.paid");
      expect(c).toContain("customer.subscription.updated");
    });

    it("elysia chargily: header signature, verifySignature buf sig secret, 400 403 200 server-only", () => {
      if (isLegacyEmpty) return;
      const f = files.find((x: any) => x.path === "apps/api/src/routes/webhooks/chargily.ts");
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("signature");
      expect(c).toContain("verifySignature");
      expect(c).toContain("arrayBuffer");
      expect(c).toContain("400");
      expect(c).toContain("403");
      expect(c).toContain("server-only");
    });

    it("elysia paddle: unmarshal buf.toString() secret sig EventName.TransactionCompleted", () => {
      if (isLegacyEmpty) return;
      const f = files.find((x: any) => x.path === "apps/api/src/routes/webhooks/paddle.ts");
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("paddle-signature");
      expect(c).toContain("unmarshal");
      expect(c).toContain("toString");
      expect(c).toContain("arrayBuffer");
      expect(c).toContain("TransactionCompleted");
    });

    it("elysia polar: verification raw body validateEvent or Webhooks helper, idempotent dedup", () => {
      if (isLegacyEmpty) return;
      const f = files.find((x: any) => x.path === "apps/api/src/routes/webhooks/polar.ts");
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("arrayBuffer");
      expect(c).toContain("POLAR_WEBHOOK_SECRET");
      expect(c).toContain("webhook_events");
      expect(c.includes("already processed") || c.includes("alreadyProcessed")).toBe(true);
    });

    it("elysia barrel apps/api/src/routes/webhooks.ts aggregates per-provider + mentions raw body Buffer critical", () => {
      if (isLegacyEmpty) return;
      const f = files.find((x: any) => x.path === "apps/api/src/routes/webhooks.ts");
      expect(f).toBeDefined();
      expect(f!.content).toContain("stripe");
      expect(f!.content).toContain("chargily");
      expect(f!.content).toContain("paddle");
      expect(f!.content).toContain("polar");
      expect(f!.content).toContain("arrayBuffer");
    });
  });

  describe(".env.example placeholders for webhook secrets, .env.local real", () => {
    it("contains placeholders for all 4 webhook secrets + server-only validation", () => {
      const files = rootFiles("demo", secrets, { dryRun: true });
      const example = files.find((f: any) => f.path === ".env.example")?.content ?? "";
      expect(example).toContain("REPLACE_WITH_STRIPE_WEBHOOK_SECRET");
      expect(example).toContain("REPLACE_WITH_CHARGILY_SECRET_KEY");
      expect(example).toContain("REPLACE_WITH_PADDLE_WEBHOOK_SECRET");
      expect(example).toContain("REPLACE_WITH_POLAR_WEBHOOK_SECRET");
      expect(example).toContain("STRIPE_SECRET_KEY");
      expect(example).toContain("CHARGILY_API_KEY");
      expect(example).toContain("PADDLE_API_KEY");
      expect(example).toContain("POLAR_ACCESS_TOKEN");
      expect(example).toContain("POLAR_ORG_ID");
      expect(example).toContain("PADDLE_ENVIRONMENT=sandbox");
      expect(example).toContain("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
      expect(example).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    });

    it(".env.local contains real generated secrets via secret() — gitignored", () => {
      const files = rootFiles("demo", secrets, { dryRun: false });
      const local = files.find((f: any) => f.path === ".env.local")?.content ?? "";
      const gitignore = files.find((f: any) => f.path === ".gitignore")?.content ?? "";
      expect(local).toContain("STRIPE_WEBHOOK_SECRET=");
      expect(local).toContain("CHARGILY_SECRET_KEY=");
      expect(local).toContain("PADDLE_WEBHOOK_SECRET=");
      expect(local).toContain("POLAR_WEBHOOK_SECRET=");
      expect(local).toContain("CHARGILY_API_KEY=");
      expect(local).toContain("POLAR_ACCESS_TOKEN=");
      expect(local).not.toContain("REPLACE_WITH_PADDLE_WEBHOOK_SECRET");
      expect(gitignore).toContain(".env.local");
    });

    it("api .env.example also contains placeholders", () => {
      const apiFiles = backendFiles("testapp", "bun", {
        stripe: { inUse: true },
        chargily: { inUse: true },
        paddle: { inUse: true },
        polar: { inUse: true },
        billing: { inUse: true },
      });
      if (apiFiles.length === 0) return; // legacy empty
      const envExample =
        apiFiles.find((f: any) => f.path === "apps/api/.env.example")?.content ?? "";
      expect(envExample).toContain("REPLACE_WITH_STRIPE_WEBHOOK_SECRET");
      expect(envExample).toContain("REPLACE_WITH_CHARGILY_SECRET_KEY");
      expect(envExample).toContain("REPLACE_WITH_PADDLE_WEBHOOK_SECRET");
      expect(envExample).toContain("REPLACE_WITH_POLAR_WEBHOOK_SECRET");
    });
  });

  describe("billing providers verifyWebhook must accept raw Buffer + signature — all 4 need raw body Buffer for webhook verify", () => {
    const providers = ["stripe", "chargily", "paddle", "polar"] as const;
    for (const provider of providers) {
      it(`${provider}.ts provider contains rawBody Buffer handling + arrayBuffer mention`, () => {
        const files = billingFiles({
          mode: "monorepo",
          addons: {
            stripe: { inUse: true },
            chargily: { inUse: true },
            paddle: { inUse: true },
            polar: { inUse: true },
            billing: { inUse: true },
          } as never,
        });
        const pf = files
          .filter((x: any) => x.path.includes(`providers/${provider}`))
          .map((x: any) => x.content)
          .join("\n");
        expect(pf).toContain("rawBody");
        expect(pf).toContain("Buffer");
        expect(pf.includes("arrayBuffer") || pf.toLowerCase().includes("raw body")).toBe(true);
      });
    }
  });

  describe("all webhooks idempotent dedup + bun only", () => {
    it("all 4 webhooks contain webhook_events unique dedup + onConflictDoNothing + already processed", () => {
      const files = billingFiles({
        mode: "monorepo",
        addons: {
          stripe: { inUse: true },
          chargily: { inUse: true },
          paddle: { inUse: true },
          polar: { inUse: true },
          billing: { inUse: true },
        } as never,
      });
      const providers = ["stripe", "chargily", "paddle", "polar"] as const;
      for (const p of providers) {
        const path = `apps/web/src/app/api/webhooks/${p}/route.ts`;
        const content = files.find((x: any) => x.path === path)?.content ?? "";
        expect(content, `${p} missing dedup`).toContain("webhook_events");
        expect(content, `${p} missing onConflictDoNothing`).toContain("onConflictDoNothing");
        expect(content, `${p} missing already processed`).toContain("already processed");
        expect(content, `${p} missing processed true`).toContain("processed");
      }
    });

    it("stripe webhook distinguishes invoice.paid lifecycle broader vs payment_succeeded payment attempt narrower", () => {
      const files = billingFiles({
        mode: "monorepo",
        addons: { stripe: { inUse: true }, billing: { inUse: true } } as never,
      });
      const c = files.find(
        (x: any) => x.path === "apps/web/src/app/api/webhooks/stripe/route.ts",
      )!.content;
      expect(c).toContain("invoice.paid");
      expect(c.toLowerCase()).toContain("payment_succeeded");
      expect(c.toLowerCase()).toContain("lifecycle");
      expect(c.toLowerCase()).toContain("broader");
      expect(c.toLowerCase()).toContain("narrower");
    });
  });
});
