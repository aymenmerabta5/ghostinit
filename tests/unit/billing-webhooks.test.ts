import { describe, it, expect } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator";
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

describe("billing webhooks preserve raw bytes and deduplicate deliveries", () => {
  const allProviders = {
    stripe: { inUse: true },
    chargily: { inUse: true },
    paddle: { inUse: true },
    polar: { inUse: true },
    billing: { inUse: true },
  } as never;

  describe("monorepo paths preserve raw request bytes and bound payload size before verification", () => {
    const files = billingFiles({ mode: "monorepo", addons: allProviders } as never, "bun");
    const providers = ["stripe", "chargily", "paddle", "polar"] as const;

    for (const provider of providers) {
      it(`monorepo ${provider} webhook streams one bounded raw body before verification`, () => {
        const path = `apps/web/src/app/api/webhooks/${provider}/route.ts`;
        const f = files.find((x: any) => x.path === path);
        expect(f, `missing ${path}`).toBeDefined();
        expect(f!.content).toContain("body.getReader()");
        expect(f!.content).toContain("readBoundedWebhookBody(declaredBodyRejection)");
        expect(f!.content).toContain("await reader.cancel(");
        expect(f!.content).not.toContain(".arrayBuffer(");
        expect(f!.content).not.toContain("req.json()");
      });
    }

    it("stripe monorepo: header stripe-signature missing 400, constructEventAsync raw Buffer sig secret try catch 400 Webhook Error", () => {
      const f = files.find((x: any) => x.path === "apps/web/src/app/api/webhooks/stripe/route.ts");
      expect(f).toBeDefined();
      const c = f!.content;
      expect(c).toContain("stripe-signature");
      expect(c).toContain("400");
      expect(c).toContain("await stripe.webhooks.constructEventAsync");
      expect(c).not.toContain("stripe.webhooks.constructEvent(");
      expect(c).toContain("Webhook Error");
      expect(c).toContain("readBoundedWebhookBody(declaredBodyRejection)");
      expect(c).toContain("body.getReader()");
      expect(c).not.toContain(".arrayBuffer(");
      expect(c).toContain("STRIPE_WEBHOOK_SECRET");
      expect(c).toContain("2026-07-29.dahlia");
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
      expect(c).toContain("readBoundedWebhookBody(declaredBodyRejection)");
      expect(c).toContain("body.getReader()");
      expect(c).not.toContain(".arrayBuffer(");
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
      expect(c).toContain("body.getReader()");
      expect(c).toContain("PADDLE_WEBHOOK_SECRET");
      expect(c).not.toContain(".arrayBuffer(");
      expect(c.indexOf("readBoundedWebhookBody")).toBeLessThan(c.indexOf("webhooks.unmarshal"));
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
      expect(c).toContain("body.getReader()");
      expect(c).not.toContain(".arrayBuffer(");
      expect(c).toContain("POLAR_WEBHOOK_SECRET");
      expect(c).toContain("validateEvent");
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

  describe("single paths: src/app/api/webhooks/<provider>/route.ts use one bounded raw-body stream", () => {
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
      it(`single ${provider} webhook bounds the stream without arrayBuffer`, () => {
        const path = `src/app/api/webhooks/${provider}/route.ts`;
        const f = files.find((x: any) => x.path === path);
        expect(f, `missing single ${path}`).toBeDefined();
        expect(f!.content).toContain("body.getReader()");
        expect(f!.content).toContain("readBoundedWebhookBody(declaredBodyRejection)");
        expect(f!.content).not.toContain(".arrayBuffer(");
      });
    }
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
      expect(gitignore).toContain(".env\n");
      expect(gitignore).toContain(".env.*\n");
      expect(gitignore).toContain("!.env.example\n");
      expect(gitignore).toContain("!.env.*.example\n");
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
