import { describe, expect, test } from "bun:test";
import { webhookContent } from "../../src/templates/billing/webhooks/providers";

type StripeStatus =
  | "active"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "paused"
  | "trialing"
  | "unpaid";
// Stripe 22.5.0 declares Subscription.Status as its known literals plus this
// forward-compatible sentinel. This is the declaration shape that exposed the
// generated route's formerly too-wide return type.
type Stripe22OtherString = string & Record<never, never>;
type Stripe22SubscriptionStatus = StripeStatus | Stripe22OtherString;
type PaymentStatus = "no_payment_required" | "paid" | "unpaid";

function loadCheckoutStatusMapper(): (
  paymentStatus: PaymentStatus,
  subscriptionStatus: Stripe22SubscriptionStatus,
) => StripeStatus {
  const content = webhookContent("stripe", "next", "single", "postgres").content;
  const providerMapper = content.match(
    /function stripeProviderSubscriptionStatus\([\s\S]*?\n}\n/,
  )?.[0];
  const checkoutMapper = content.match(
    /function stripeCheckoutSubscriptionStatus\([\s\S]*?\n}\n/,
  )?.[0];
  if (!providerMapper || !checkoutMapper)
    throw new Error("Stripe status mappers were not generated");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    `${providerMapper}\n${checkoutMapper}`,
  );
  return new Function(`${javascript}; return stripeCheckoutSubscriptionStatus;`)() as (
    paymentStatus: PaymentStatus,
    subscriptionStatus: Stripe22SubscriptionStatus,
  ) => StripeStatus;
}

interface StripeEventObject {
  id: string;
  created: number;
  type: string;
  data: { object: Record<string, unknown> };
}

interface AuthoritativeSubscription {
  id: string;
  status: StripeStatus;
  items: { data: Array<{ current_period_end: number }> };
  trial_end: number | null;
  metadata: Record<string, string>;
}

interface HandlerObservation {
  checkoutStatuses: string[];
  retrievedSubscriptions: string[];
  subscriptionStatuses: string[];
  steps: string[];
}

async function runPostgresStripeHandler(
  event: StripeEventObject,
  authoritativeSubscription: AuthoritativeSubscription,
): Promise<{ response: Response; observation: HandlerObservation }> {
  const content = webhookContent("stripe", "next", "single", "postgres")
    .content.replace(/^import .*\r?\n/gm, "")
    .replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(content);
  const observation: HandlerObservation = {
    checkoutStatuses: [],
    retrievedSubscriptions: [],
    subscriptionStatuses: [],
    steps: [],
  };

  class StripeMock {
    readonly webhooks = {
      constructEventAsync: async () => {
        observation.steps.push("signature-verified");
        return event;
      },
    };
    readonly subscriptions = {
      retrieve: async (id: string) => {
        observation.steps.push("provider-state-retrieved");
        observation.retrievedSubscriptions.push(id);
        return authoritativeSubscription;
      },
    };
  }

  const webhook_events = {
    id: "webhook_events.id",
    provider: "webhook_events.provider",
    providerEventId: "webhook_events.providerEventId",
    processed: "webhook_events.processed",
    processingStartedAt: "webhook_events.processingStartedAt",
    attemptCount: "webhook_events.attemptCount",
    leaseToken: "webhook_events.leaseToken",
  };
  const checkouts = {
    id: "checkouts.id",
    userId: "checkouts.userId",
    provider: "checkouts.provider",
    providerCheckoutId: "checkouts.providerCheckoutId",
    providerEventAt: "checkouts.providerEventAt",
  };
  const subscriptions = {
    id: "subscriptions.id",
    userId: "subscriptions.userId",
    provider: "subscriptions.provider",
    providerSubscriptionId: "subscriptions.providerSubscriptionId",
    providerEventAt: "subscriptions.providerEventAt",
    providerStateVersion: "subscriptions.providerStateVersion",
  };
  const invoices = {
    $inferInsert: {},
    provider: "invoices.provider",
    providerInvoiceId: "invoices.providerInvoiceId",
    providerEventAt: "invoices.providerEventAt",
  };
  const customers = { userId: "customers.userId", provider: "customers.provider" };
  const subscriptionRow = {
    id: "subscription_1",
    userId: "user_1",
    provider: "stripe",
    providerSubscriptionId: "sub_1",
    providerStateVersion: 0,
    status: "active",
  };

  const db = {
    query: {
      webhook_events: { findFirst: async () => null },
      checkouts: { findFirst: async () => ({ userId: "user_1" }) },
    },
    insert(table: unknown) {
      return {
        values(value: Record<string, unknown>) {
          if (table === checkouts && typeof value.status === "string") {
            observation.checkoutStatuses.push(value.status);
          }
          if (table === subscriptions && typeof value.status === "string") {
            observation.steps.push("subscription-persisted");
            observation.subscriptionStatuses.push(value.status);
          }
          return {
            onConflictDoNothing() {
              if (table === webhook_events) {
                return { returning: async () => [{ leaseToken: "lease_1" }] };
              }
              return Promise.resolve();
            },
            onConflictDoUpdate() {
              return { returning: async () => [{ id: "stored_1" }] };
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(value: Record<string, unknown>) {
          if (table === checkouts && typeof value.status === "string") {
            observation.checkoutStatuses.push(value.status);
          }
          if (table === subscriptions && typeof value.status === "string") {
            observation.steps.push("subscription-persisted");
            observation.subscriptionStatuses.push(value.status);
          }
          return {
            where() {
              if (table === subscriptions) {
                if (Object.hasOwn(value, "providerStateVersion")) {
                  subscriptionRow.providerStateVersion += 1;
                } else {
                  Object.assign(subscriptionRow, value);
                }
                return {
                  returning: async () => [
                    {
                      id: subscriptionRow.id,
                      providerStateVersion: subscriptionRow.providerStateVersion,
                      userId: subscriptionRow.userId,
                    },
                  ],
                };
              }
              if (table === webhook_events) {
                return { returning: async () => [{ id: "completed_1" }] };
              }
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  const logger = { info() {}, warn() {}, error() {} };
  const eq = (...values: unknown[]) => values;
  const and = (...values: unknown[]) => values;
  const isNull = (value: unknown) => value;
  const sql = (parts: TemplateStringsArray) => parts.join("");
  const POST = new Function(
    "Stripe",
    "randomUUID",
    "and",
    "eq",
    "isNull",
    "sql",
    "db",
    "webhook_events",
    "checkouts",
    "subscriptions",
    "invoices",
    "customers",
    "logger",
    `${javascript}; return POST;`,
  )(
    StripeMock,
    () => "lease_1",
    and,
    eq,
    isNull,
    sql,
    db,
    webhook_events,
    checkouts,
    subscriptions,
    invoices,
    customers,
    logger,
  ) as (request: Request) => Promise<Response>;

  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_realistic_secret";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_realistic_secret";
  try {
    const response = await POST(
      new Request("https://app.example.test/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "valid" },
        body: "{}",
      }),
    );
    return { response, observation };
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousSecret;
    if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
  }
}

function checkoutEvent(type: string, paymentStatus: PaymentStatus): StripeEventObject {
  return {
    id: `evt_${type}`,
    created: 1_700_000_000,
    type,
    data: {
      object: {
        id: "cs_1",
        payment_status: paymentStatus,
        subscription: "sub_1",
        customer: "cus_1",
        customer_details: { email: "user@example.test" },
        customer_email: "user@example.test",
        client_reference_id: "user_1",
        metadata: { userId: "user_1" },
        url: "https://checkout.example.test",
        amount_total: 1000,
        currency: "usd",
      },
    },
  };
}

const activeSubscription: AuthoritativeSubscription = {
  id: "sub_1",
  status: "active",
  items: { data: [{ current_period_end: 1_800_000_000 }] },
  trial_end: null,
  metadata: { userId: "user_1" },
};

describe("Stripe webhook entitlement and ordering", () => {
  test("unpaid or no-payment active checkouts never become entitled", () => {
    const map = loadCheckoutStatusMapper();
    expect(map("unpaid", "active")).toBe("unpaid");
    expect(map("no_payment_required", "active")).toBe("incomplete");
    expect(map("paid", "active")).toBe("active");
    expect(map("no_payment_required", "trialing")).toBe("trialing");
    const futureStripe22Status: Stripe22OtherString = "future_provider_status";
    expect(map("paid", futureStripe22Status)).toBe("incomplete");
  });

  test("completed unpaid checkout persists a non-entitled subscription", async () => {
    const { response, observation } = await runPostgresStripeHandler(
      checkoutEvent("checkout.session.completed", "unpaid"),
      activeSubscription,
    );
    expect(response.status).toBe(200);
    expect(observation.checkoutStatuses).toContain("pending");
    expect(observation.subscriptionStatuses).toContain("unpaid");
    expect(observation.subscriptionStatuses).not.toContain("active");
    expect(observation.steps.indexOf("signature-verified")).toBeLessThan(
      observation.steps.indexOf("subscription-persisted"),
    );
  });

  test("async payment success and failure update checkout and entitlement state", async () => {
    const succeeded = await runPostgresStripeHandler(
      checkoutEvent("checkout.session.async_payment_succeeded", "paid"),
      activeSubscription,
    );
    expect(succeeded.observation.checkoutStatuses).toContain("completed");
    expect(succeeded.observation.subscriptionStatuses).toContain("active");

    const failed = await runPostgresStripeHandler(
      checkoutEvent("checkout.session.async_payment_failed", "unpaid"),
      activeSubscription,
    );
    expect(failed.observation.checkoutStatuses).toContain("failed");
    expect(failed.observation.subscriptionStatuses).toContain("unpaid");
    expect(failed.observation.subscriptionStatuses).not.toContain("active");
  });

  test("delayed invoice.paid refreshes provider state and cannot resurrect cancellation", async () => {
    const canceledSubscription = { ...activeSubscription, status: "canceled" as const };
    const event: StripeEventObject = {
      id: "evt_old_invoice_paid",
      created: 1_600_000_000,
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          amount_paid: 1000,
          currency: "usd",
          customer: "cus_1",
          hosted_invoice_url: null,
          metadata: {},
          parent: { subscription_details: { subscription: "sub_1" } },
        },
      },
    };
    const { response, observation } = await runPostgresStripeHandler(event, canceledSubscription);
    expect(response.status).toBe(200);
    expect(observation.retrievedSubscriptions).toEqual(["sub_1"]);
    expect(observation.subscriptionStatuses).toContain("canceled");
    expect(observation.subscriptionStatuses).not.toContain("active");
  });

  test("delayed subscription.updated refreshes provider state and cannot resurrect cancellation", async () => {
    const canceledSubscription = { ...activeSubscription, status: "canceled" as const };
    const event: StripeEventObject = {
      id: "evt_old_subscription_updated",
      created: 1_600_000_000,
      type: "customer.subscription.updated",
      data: {
        object: {
          ...activeSubscription,
          // This signed event snapshot is stale; the provider now reports canceled.
          status: "active",
        },
      },
    };
    const { response, observation } = await runPostgresStripeHandler(event, canceledSubscription);
    expect(response.status).toBe(200);
    expect(observation.retrievedSubscriptions).toEqual(["sub_1"]);
    expect(observation.subscriptionStatuses).toContain("canceled");
    expect(observation.subscriptionStatuses).not.toContain("active");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} covers async payments and authoritative invoice refresh`, () => {
          const content = webhookContent("stripe", framework, mode, database).content;
          expect(content).toContain('case "checkout.session.async_payment_succeeded"');
          expect(content).toContain('case "checkout.session.async_payment_failed"');
          expect(content).toContain(
            "stripeCheckoutSubscriptionStatus(paymentStatus, authoritativeSubscription.status)",
          );
          expect(content).toContain(
            "const authoritativeSubscription = await stripe.subscriptions.retrieve(subscriptionId)",
          );
          const invoiceCase = content.slice(
            content.indexOf('case "invoice.paid"'),
            content.indexOf('case "invoice.payment_succeeded"'),
          );
          expect(invoiceCase).toContain(
            "status: stripeProviderSubscriptionStatus(authoritativeSubscription.status)",
          );
          expect(invoiceCase).not.toContain('status: "active"');
          expect(invoiceCase.indexOf("claimStripeSubscriptionState(subscriptionId)")).toBeLessThan(
            invoiceCase.indexOf("stripe.subscriptions.retrieve(subscriptionId)"),
          );
          expect(invoiceCase.indexOf("stripe.subscriptions.retrieve(subscriptionId)")).toBeLessThan(
            invoiceCase.indexOf("commitStripeSubscriptionState(subscriptionId"),
          );
          const subscriptionUpdatedCase = content.slice(
            content.indexOf('case "customer.subscription.updated"'),
            content.indexOf('case "customer.subscription.deleted"'),
          );
          expect(subscriptionUpdatedCase).toContain(
            "await stripe.subscriptions.retrieve(subscription.id)",
          );
          expect(subscriptionUpdatedCase).toContain(
            "stripeProviderSubscriptionStatus(authoritativeSubscription.status)",
          );
          expect(subscriptionUpdatedCase).not.toContain("status: subscription.status");
          expect(
            subscriptionUpdatedCase.indexOf("claimStripeSubscriptionState(subscription.id)"),
          ).toBeLessThan(
            subscriptionUpdatedCase.indexOf("stripe.subscriptions.retrieve(subscription.id)"),
          );
          expect(
            subscriptionUpdatedCase.indexOf("stripe.subscriptions.retrieve(subscription.id)"),
          ).toBeLessThan(
            subscriptionUpdatedCase.indexOf("commitStripeSubscriptionState(subscription.id"),
          );
          const subscriptionDeletedCase = content.slice(
            content.indexOf('case "customer.subscription.deleted"'),
            content.indexOf(
              "default: break",
              content.indexOf('case "customer.subscription.deleted"'),
            ),
          );
          expect(subscriptionDeletedCase).toContain(
            "claimStripeSubscriptionState(subscription.id)",
          );
          expect(subscriptionDeletedCase).toContain(
            database === "convex"
              ? "cancelStripeSubscriptionState(subscription.id"
              : "commitStripeSubscriptionState(subscription.id",
          );
          expect(`${invoiceCase}\n${subscriptionUpdatedCase}`).not.toContain("authoritative: true");
        });
      }
    }
  }
});
