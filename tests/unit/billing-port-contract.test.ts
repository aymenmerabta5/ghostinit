import { describe, expect, test } from "bun:test";
import { apiPackage } from "../../src/templates/api.js";
import { billingApplicationsFiles } from "../../src/templates/billing/applications/billing.js";
import { convexBillingContent } from "../../src/templates/database/convex/billing.js";
import { singleBillingApiFiles } from "../../src/templates/modes/single/api/billing.js";
import {
  billingCheckoutRepositoryContent,
  billingCreateCheckoutContent,
  billingServiceFiles,
} from "../../src/templates/services/billing.js";

function contentAt(
  files: ReadonlyArray<{ path: string; content: string }>,
  suffix: string,
): string {
  return files.find((file) => file.path.endsWith(suffix))?.content ?? "";
}

type CheckoutService = (
  input: Record<string, unknown>,
  deps: {
    billingProvider: {
      createCheckout(input: Record<string, unknown>): Promise<{ id: string; url: string }>;
      createCustomer(
        input: Record<string, unknown>,
      ): Promise<{ id: string; providerCustomerId?: string }>;
    };
    customerRepository: {
      findProviderCustomerId(input: Record<string, unknown>): Promise<string | null>;
      saveProviderCustomer(input: Record<string, unknown>): Promise<string>;
    };
    checkoutRepository: {
      claim(
        input: Record<string, unknown>,
      ): Promise<
        | { status: "claimed"; leaseToken: string }
        | { status: "in_flight" }
        | { status: "completed"; checkout: { id: string; url: string } }
      >;
      complete(input: Record<string, unknown>): Promise<void>;
    };
    priceCatalog: { resolvePrice(input: Record<string, unknown>): Promise<string> };
  },
) => Promise<{ ok: boolean; value?: unknown; error?: Error }>;

function loadCheckoutService(mode: "monorepo" | "single"): CheckoutService {
  const source = billingCreateCheckoutContent(mode)
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  return new Function("ok", "err", `${javascript}; return createCheckoutService;`)(
    (value: unknown) => ({ ok: true, value }),
    (error: Error) => ({ ok: false, error }),
  ) as CheckoutService;
}

describe("generated billing application-owned ports", () => {
  test.each(["monorepo", "single"] as const)(
    "%s checkout port accepts the vendor contract and maps an application record",
    (mode) => {
      const service = billingCreateCheckoutContent(mode);
      const useCase = contentAt(
        billingApplicationsFiles(mode),
        "billing/application/create-checkout.usecase.ts",
      );

      expect(service).toContain("userId: string;");
      expect(service).toContain("Promise<{ id: string; url: string }>");
      expect(service).toContain("provider: input.provider");
      expect(service).toContain('status: "pending"');
      expect(useCase).toContain("customerEmail: input.customerEmail");
      expect(useCase).toContain("planId: input.planId");
      expect(useCase).toContain("cancelUrl: cancelUrl?.value");
      expect(useCase).toContain("validateBillingRedirectUrl(input.cancelUrl");
      expect(useCase).toContain("quantity: input.quantity");
      expect(useCase).not.toContain('failureUrl: input.failureUrl ?? ""');
    },
  );

  test("checkout intent repositories reclaim only expired leases before provider reconciliation", () => {
    const postgres = billingCheckoutRepositoryContent("monorepo", "postgres");
    const convex = billingCheckoutRepositoryContent("monorepo", "convex");
    const convexMutations = convexBillingContent();

    expect(postgres).toContain("CHECKOUT_CREATION_LEASE_MS");
    expect(postgres).toContain("leaseOwnerGuard");
    expect(postgres).toContain("leaseTimeGuard");
    expect(postgres).toContain('eq(checkouts.creationState, "creating")');
    expect(convex).toContain('operation: "claimCheckoutIntent"');
    expect(convexMutations).toContain("Date.now() - CHECKOUT_CREATION_LEASE_MS");
    expect(convexMutations).toContain(
      'return { status: "claimed" as const, leaseToken: args.leaseToken }',
    );
  });

  test("oRPC delegates provider composition to the request application facade", () => {
    const files = apiPackage(true, false, true);
    const checkout = contentAt(files, "procedures/billing/create-checkout.ts");
    const portal = contentAt(files, "procedures/billing/create-portal-session.ts");
    const paymentLink = contentAt(files, "procedures/billing/create-payment-link.ts");

    expect(checkout).toContain("context.application.billing.createCheckout(input)");
    expect(portal).toContain("context.application.billing.createPortalSession(input)");
    expect(paymentLink).toContain("context.application.billing.createPaymentLink(input)");
    expect(paymentLink).toContain("Merchant administrator required");
    expect(`${checkout}\n${portal}\n${paymentLink}`).not.toMatch(
      /getBillingProvider|billingCustomerRepository|as never/,
    );
  });

  test.each(["monorepo", "single"] as const)(
    "%s checkout resolves the owned customer and persists the pending mapping before returning",
    async (mode) => {
      const service = loadCheckoutService(mode);
      const calls: Array<{ kind: string; value: unknown }> = [];
      const result = await service(
        {
          provider: "stripe",
          userId: "actor_1",
          customerEmail: "actor@example.test",
          planId: "pro",
          successUrl: "https://app.example.test/success",
          requestKey: "11111111-1111-4111-8111-111111111111",
        },
        {
          customerRepository: {
            async findProviderCustomerId(value) {
              calls.push({ kind: "customer", value });
              return "cus_owned";
            },
            async saveProviderCustomer() {
              throw new Error("existing customer must be reused");
            },
          },
          billingProvider: {
            async createCustomer() {
              throw new Error("existing customer must be reused");
            },
            async createCheckout(value) {
              calls.push({ kind: "provider", value });
              return { id: "checkout_1", url: "https://pay.example.test/checkout_1" };
            },
          },
          checkoutRepository: {
            async claim(value) {
              calls.push({ kind: "claim", value });
              return { status: "claimed" as const, leaseToken: "lease_1" };
            },
            async complete(value) {
              calls.push({ kind: "persist", value });
            },
          },
          priceCatalog: {
            async resolvePrice(value) {
              calls.push({ kind: "price", value });
              return "price_owned";
            },
          },
        },
      );

      expect(result.ok).toBe(true);
      expect(calls.map((call) => call.kind)).toEqual([
        "price",
        "claim",
        "customer",
        "provider",
        "persist",
      ]);
      expect(calls[3]?.value).toMatchObject({
        customerId: "cus_owned",
        userId: "actor_1",
        priceId: "price_owned",
      });
      expect(calls[4]?.value).toEqual({
        actorId: "actor_1",
        provider: "stripe",
        requestKey: "11111111-1111-4111-8111-111111111111",
        leaseToken: "lease_1",
        providerCheckoutId: "checkout_1",
        url: "https://pay.example.test/checkout_1",
      });
    },
  );

  test("checkout creates one owned provider customer and reuses it on the next request", async () => {
    const service = loadCheckoutService("monorepo");
    let storedCustomerId: string | null = null;
    let createCustomerCalls = 0;
    const checkoutCustomerIds: unknown[] = [];
    const deps = {
      customerRepository: {
        async findProviderCustomerId() {
          return storedCustomerId;
        },
        async saveProviderCustomer(value: Record<string, unknown>) {
          storedCustomerId = String(value.providerCustomerId);
          return storedCustomerId;
        },
      },
      billingProvider: {
        async createCustomer() {
          createCustomerCalls += 1;
          return { id: "cus_created", providerCustomerId: "cus_created" };
        },
        async createCheckout(value: Record<string, unknown>) {
          checkoutCustomerIds.push(value.customerId);
          return {
            id: `checkout_${checkoutCustomerIds.length}`,
            url: `https://pay.example.test/${checkoutCustomerIds.length}`,
          };
        },
      },
      checkoutRepository: {
        async claim() {
          return { status: "claimed" as const, leaseToken: "lease_1" };
        },
        async complete() {},
      },
      priceCatalog: {
        async resolvePrice() {
          return "price_owned";
        },
      },
    };
    const input = {
      provider: "stripe",
      userId: "actor_1",
      customerEmail: "actor@example.test",
      planId: "pro",
      successUrl: "https://app.example.test/success",
      requestKey: "22222222-2222-4222-8222-222222222222",
    };

    expect((await service(input, deps)).ok).toBe(true);
    expect((await service(input, deps)).ok).toBe(true);
    expect(createCustomerCalls).toBe(1);
    expect(checkoutCustomerIds).toEqual(["cus_created", "cus_created"]);
  });

  test("checkout uses the canonical customer mapping when concurrent provisioning loses the race", async () => {
    const service = loadCheckoutService("monorepo");
    let checkoutCustomerId: unknown;
    const result = await service(
      {
        provider: "paddle",
        userId: "actor_1",
        customerEmail: "actor@example.test",
        planId: "pro",
        successUrl: "https://app.example.test/success",
        requestKey: "77777777-7777-4777-8777-777777777777",
      },
      {
        priceCatalog: {
          async resolvePrice() {
            return "price_owned";
          },
        },
        customerRepository: {
          async findProviderCustomerId() {
            return null;
          },
          async saveProviderCustomer() {
            return "cus_concurrent_winner";
          },
        },
        checkoutRepository: {
          async claim() {
            return { status: "claimed" as const, leaseToken: "lease_1" };
          },
          async complete() {},
        },
        billingProvider: {
          async createCustomer() {
            return { id: "cus_loser", providerCustomerId: "cus_loser" };
          },
          async createCheckout(value) {
            checkoutCustomerId = value.customerId;
            return { id: "checkout_1", url: "https://pay.example.test/checkout_1" };
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(checkoutCustomerId).toBe("cus_concurrent_winner");
  });

  test("replaying a completed request key returns the stored checkout without remote side effects", async () => {
    const service = loadCheckoutService("monorepo");
    let completed: { id: string; url: string } | null = null;
    let providerCalls = 0;
    const deps = {
      priceCatalog: {
        async resolvePrice() {
          return "price_owned";
        },
      },
      customerRepository: {
        async findProviderCustomerId() {
          return "cus_owned";
        },
        async saveProviderCustomer() {
          return "cus_owned";
        },
      },
      checkoutRepository: {
        async claim() {
          return completed
            ? { status: "completed" as const, checkout: completed }
            : { status: "claimed" as const, leaseToken: "lease_1" };
        },
        async complete(value: Record<string, unknown>) {
          completed = { id: String(value.providerCheckoutId), url: String(value.url) };
        },
      },
      billingProvider: {
        async createCustomer() {
          throw new Error("customer already exists");
        },
        async createCheckout() {
          providerCalls += 1;
          return { id: "checkout_1", url: "https://pay.example.test/checkout_1" };
        },
      },
    };
    const input = {
      provider: "stripe",
      userId: "actor_1",
      customerEmail: "actor@example.test",
      planId: "pro",
      successUrl: "https://app.example.test/success",
      requestKey: "33333333-3333-4333-8333-333333333333",
    };

    expect((await service(input, deps)).ok).toBe(true);
    expect((await service(input, deps)).ok).toBe(true);
    expect(providerCalls).toBe(1);
  });

  test.each(["stripe", "chargily", "paddle", "polar"] as const)(
    "%s crash-window intent fails closed without creating another remote checkout",
    async (provider) => {
      const service = loadCheckoutService("monorepo");
      let remoteCalls = 0;
      const result = await service(
        {
          provider,
          userId: "actor_1",
          customerEmail: "actor@example.test",
          planId: "pro",
          successUrl: "https://app.example.test/success",
          requestKey: "44444444-4444-4444-8444-444444444444",
        },
        {
          priceCatalog: {
            async resolvePrice() {
              return "price_owned";
            },
          },
          customerRepository: {
            async findProviderCustomerId() {
              return "cus_owned";
            },
            async saveProviderCustomer() {
              return "cus_owned";
            },
          },
          checkoutRepository: {
            async claim() {
              return { status: "in_flight" as const };
            },
            async complete() {
              throw new Error("must not complete");
            },
          },
          billingProvider: {
            async createCustomer() {
              throw new Error("must not create customer");
            },
            async createCheckout() {
              remoteCalls += 1;
              return { id: "duplicate", url: "https://pay.example.test/duplicate" };
            },
          },
        },
      );
      expect(result.ok).toBe(false);
      expect(remoteCalls).toBe(0);
      if (!result.ok) expect(result.error?.message).toContain("CHECKOUT_IN_PROGRESS");
    },
  );

  test("uses typed portal errors and resolves the provider customer from the authenticated actor", () => {
    const portal = contentAt(
      billingServiceFiles("monorepo"),
      "billing/create-portal-session.service.ts",
    );

    expect(portal).toContain('new ServiceError("NOT_SUPPORTED"');
    expect(portal).toContain('new ServiceError("CUSTOMER_NOT_FOUND"');
    expect(portal).toContain("findProviderCustomerId");
    expect(portal).toContain("actorId: input.actorId");
    expect(portal).toContain("customerId,");
    expect(portal).not.toContain("input.customerId");
    expect(portal).toContain("does not support a customer portal");
  });

  test.each(["monorepo", "single"] as const)(
    "%s portal transport never accepts a customer id and delegates ownership to the facade",
    (mode) => {
      const portal =
        mode === "monorepo"
          ? contentAt(apiPackage(true, false, true), "procedures/billing/create-portal-session.ts")
          : contentAt(singleBillingApiFiles(), "procedures/billing/create-portal-session.ts");

      expect(portal).toContain("context.application.billing.createPortalSession(input)");
      expect(portal).not.toContain("customerId: z.string");
      expect(portal).not.toContain("input.customerId");
      expect(portal).not.toContain("billingCustomerRepository");
    },
  );
});
