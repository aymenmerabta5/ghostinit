import { describe, expect, it } from "bun:test";
import { createPolarCheckout } from "../../src/templates/billing/providers/polar/checkout.js";
import { createPolarCustomer } from "../../src/templates/billing/providers/polar/customer.js";
import { createPolarLicenseKey } from "../../src/templates/billing/providers/polar/license.js";
import {
  mapPolarSubscriptionStatus,
  polarProductIdsOrIds,
} from "../../src/templates/billing/providers/polar/mappers.js";
import { requirePaddleResponseString } from "../../src/templates/billing/providers/paddle/mappers.js";
import { createPolarPortalSession } from "../../src/templates/billing/providers/polar/portal.js";
import {
  createPolarSubscription,
  listPolarSubscriptions,
} from "../../src/templates/billing/providers/polar/subscriptions.js";
import {
  PolarProviderError,
  isRecord,
  nonEmptyString,
  requirePolarCapability,
  requirePolarClient,
  requirePolarResponseString,
  wrapPolarFailure,
} from "../../src/templates/billing/providers/polar/types.js";
import {
  ingestPolarUsageEvent,
  requirePolarUsageAcknowledgement,
} from "../../src/templates/billing/providers/polar/usage.js";
import { mapSubscriptionStatus as mapPaddleSubscriptionStatus } from "../../src/templates/billing/providers/paddle/mappers.js";
import { billingFiles } from "../../src/templates/billing-generator.js";

const unconfigured = {
  accessToken: "REPLACE_WITH_POLAR_ACCESS_TOKEN",
  organizationId: "org_test",
};

function polarCheckoutContent(): string {
  return (
    billingFiles({
      mode: "monorepo",
      addons: {
        billing: { inUse: true },
        polar: { inUse: true },
      } as never,
    }).find((entry) => entry.path.endsWith("providers/polar/checkout.ts"))?.content ?? ""
  );
}

function loadPolarCheckout(checkouts: Record<string, unknown>) {
  const source = polarCheckoutContent()
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];\r?\n/g, "")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  return new Function(
    "getPolarClientAsync",
    "polarProductIdsOrIds",
    "PolarProviderError",
    "isRecord",
    "nonEmptyString",
    "requirePolarCapability",
    "requirePolarClient",
    "requirePolarResponseString",
    "wrapPolarFailure",
    `${javascript}; return createPolarCheckout;`,
  )(
    async () => ({
      client: { checkouts },
      accessToken: "polar_test_token",
      polar: {},
      orgId: "org_test",
      webhookSecret: undefined,
      environment: "sandbox",
    }),
    polarProductIdsOrIds,
    PolarProviderError,
    isRecord,
    nonEmptyString,
    requirePolarCapability,
    requirePolarClient,
    requirePolarResponseString,
    wrapPolarFailure,
  ) as (
    config: Record<string, unknown> | undefined,
    input: Parameters<typeof createPolarCheckout>[1],
  ) => ReturnType<typeof createPolarCheckout>;
}

async function expectPolarError(
  operation: () => Promise<unknown>,
  code: PolarProviderError["code"],
): Promise<void> {
  try {
    await operation();
    throw new Error(`Expected PolarProviderError(${code})`);
  } catch (error) {
    expect(error).toBeInstanceOf(PolarProviderError);
    if (!(error instanceof PolarProviderError)) throw error;
    expect(error.code).toBe(code);
  }
}

describe("Polar provider failure behavior", () => {
  it("fails every remote operation explicitly when the SDK is not configured", async () => {
    const operations: Array<() => Promise<unknown>> = [
      () =>
        createPolarCheckout(unconfigured, {
          userId: "user_1",
          priceId: "product_1",
          successUrl: "https://example.test/success",
        }),
      () => createPolarCustomer(unconfigured, { email: "customer@example.test" }),
      () =>
        createPolarPortalSession(unconfigured, {
          customerId: "customer_1",
          returnUrl: "https://example.test/account",
        }),
      () =>
        createPolarSubscription(unconfigured, {
          productId: "product_1",
          customerId: "customer_1",
          userId: "user_1",
        }),
      () => listPolarSubscriptions(unconfigured, { userId: "user_1" }),
      () =>
        ingestPolarUsageEvent(unconfigured, {
          actorId: "user_1",
          usageRecordId: "usage_record_1",
          credits: 10,
        }),
    ];

    for (const operation of operations) await expectPolarError(operation, "NOT_CONFIGURED");
  });

  it("reconciles a matching checkout from a later Polar 0.49 page without creating", async () => {
    const firstPage = {
      result: { items: [{ metadata: { userId: "user_1", requestKey: "other_request" } }] },
    };
    const secondPage = {
      result: {
        items: [
          {
            id: "checkout_existing",
            url: "https://pay.example.test/existing",
            metadata: { userId: "user_1", requestKey: "request_1" },
          },
        ],
      },
    };
    const iterator = {
      ...firstPage,
      next: async () => null,
      async *[Symbol.asyncIterator]() {
        yield firstPage;
        yield secondPage;
      },
    };
    let createCalls = 0;
    let listInput: unknown;
    const checkout = loadPolarCheckout({
      async list(input: unknown) {
        listInput = input;
        return iterator;
      },
      async create() {
        createCalls += 1;
        return { id: "checkout_new", url: "https://pay.example.test/new" };
      },
    });

    const result = await checkout(undefined, {
      userId: "user_1",
      requestKey: "request_1",
      priceId: "product_1",
      successUrl: "https://example.test/success",
    });

    expect(listInput).toEqual({ externalCustomerId: "user_1", limit: 100 });
    expect(result).toEqual({
      id: "checkout_existing",
      url: "https://pay.example.test/existing",
      providerCheckoutId: "checkout_existing",
    });
    expect(createCalls).toBe(0);
  });

  it("reports manual license issuance and absent SDK capabilities as NOT_SUPPORTED", async () => {
    await expectPolarError(
      () => createPolarLicenseKey(unconfigured, { subscriptionId: "subscription_1" }),
      "NOT_SUPPORTED",
    );

    expect(() => requirePolarCapability(undefined, "test operation", "missing.method")).toThrow(
      PolarProviderError,
    );
    try {
      requirePolarCapability(undefined, "test operation", "missing.method");
    } catch (error) {
      if (!(error instanceof PolarProviderError)) throw error;
      expect(error.code).toBe("NOT_SUPPORTED");
    }
  });

  it("never fabricates provider identifiers, URLs, license keys, or acknowledgements", () => {
    const files = billingFiles("monorepo").filter((file) =>
      file.path.includes("/providers/polar/"),
    );
    const source = files.map((file) => file.content).join("\n");
    const usage = files.find((file) => file.path.endsWith("/polar/usage.ts"))?.content ?? "";

    expect(source).not.toContain("Math.random()");
    expect(source).not.toContain("polar_portal=1");
    expect(source).not.toContain("sandbox.polar.sh/checkout/");
    expect(source).not.toMatch(/po_(?:chk|cus)_.*Date\.now/);
    expect(source).toContain('"NOT_SUPPORTED"');
    expect(source).toContain("response.inserted");
    expect(source).toContain("response.duplicates");
    expect(usage.indexOf("response.inserted")).toBeLessThan(
      usage.indexOf("return { id: externalId }"),
    );
  });

  it("accepts only a concrete Polar usage acknowledgement", () => {
    expect(() => requirePolarUsageAcknowledgement({ inserted: 1, duplicates: 0 })).not.toThrow();
    expect(() => requirePolarUsageAcknowledgement({ inserted: 0, duplicates: 1 })).not.toThrow();

    for (const response of [
      undefined,
      {},
      { inserted: 0, duplicates: 0 },
      { inserted: Number.NaN, duplicates: 1 },
      { inserted: Number.POSITIVE_INFINITY, duplicates: 0 },
      { inserted: -1, duplicates: 2 },
      { inserted: 0.5, duplicates: 0.5 },
    ]) {
      expect(() => requirePolarUsageAcknowledgement(response)).toThrow(PolarProviderError);
      try {
        requirePolarUsageAcknowledgement(response);
      } catch (error) {
        if (!(error instanceof PolarProviderError)) throw error;
        expect(error.code).toBe("INVALID_RESPONSE");
      }
    }
  });
});

describe("Paddle provider failure behavior", () => {
  it("never fabricates a provider response identifier", () => {
    expect(requirePaddleResponseString("txn_real", "create checkout", "transaction.id")).toBe(
      "txn_real",
    );
    for (const value of [undefined, null, "", "   ", 42]) {
      expect(() => requirePaddleResponseString(value, "create checkout", "transaction.id")).toThrow(
        "provider response did not include transaction.id",
      );
    }

    const files = billingFiles("monorepo").filter((file) =>
      file.path.includes("/providers/paddle/"),
    );
    const source = files.map((file) => file.content).join("\n");
    expect(source).not.toContain("Math.random()");
    expect(source).not.toContain("Date.now()");
    expect(source).not.toContain("genId(");
    expect(source).not.toContain("?? input.returnUrl");
  });
});

describe("billing subscription status mappers", () => {
  it("keeps known active status but maps unknown and missing Paddle states to non-entitled", () => {
    expect(mapPaddleSubscriptionStatus("active")).toBe("active");
    expect(mapPaddleSubscriptionStatus("future_status")).toBe("incomplete");
    expect(mapPaddleSubscriptionStatus(undefined)).toBe("incomplete");
  });

  it("keeps known active status but maps unknown and missing Polar states to non-entitled", () => {
    expect(mapPolarSubscriptionStatus("active")).toBe("active");
    expect(mapPolarSubscriptionStatus("future_status")).toBe("incomplete");
    expect(mapPolarSubscriptionStatus(undefined)).toBe("incomplete");
  });
});
