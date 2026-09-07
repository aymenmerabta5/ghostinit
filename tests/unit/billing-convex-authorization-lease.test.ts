import { describe, expect, it } from "bun:test";
import { postgresWebhookClaimHelpers } from "../../src/templates/billing/webhooks/providers/shared.js";
import { billingFiles } from "../../src/templates/billing-generator.js";
import { convexBillingContent } from "../../src/templates/database/convex/billing.js";
import { convexBillingServerContent } from "../../src/templates/database/convex/billing-server.js";
import { convexLibAuthContent } from "../../src/templates/database/convex/lib.js";
import { convexSchemaContent } from "../../src/templates/database/convex/schema.js";
import { billingCustomerRepositoryContent } from "../../src/templates/services/billing.js";

interface LeaseRow {
  provider: string;
  providerEventId: string;
  type: string;
  payload: unknown;
  processed: boolean;
  attemptCount: number;
  processingStartedAt: Date | null;
  processedAt?: Date | null;
  leaseToken: string | null;
  lastError?: string | null;
}

function loadPostgresLeaseProtocol(tokens: string[]) {
  const fields = {
    id: "id",
    provider: "provider",
    providerEventId: "providerEventId",
    processed: "processed",
    attemptCount: "attemptCount",
    processingStartedAt: "processingStartedAt",
    leaseToken: "leaseToken",
  } as const;
  let row: LeaseRow | null = null;
  const eq = (field: string, value: unknown) => ({ kind: "eq", field, value });
  const isNull = (field: string) => ({ kind: "null", field });
  const and = (...conditions: unknown[]) => conditions;
  const matches = (conditions: Array<{ kind: string; field: keyof LeaseRow; value?: unknown }>) =>
    row !== null &&
    conditions.every((condition) => {
      const actual = row?.[condition.field];
      if (condition.kind === "null") return actual === null || actual === undefined;
      if (actual instanceof Date && condition.value instanceof Date) {
        return actual.getTime() === condition.value.getTime();
      }
      return actual === condition.value;
    });
  const db = {
    query: { webhook_events: { findFirst: async () => row } },
    insert() {
      return {
        values(value: LeaseRow) {
          return {
            onConflictDoNothing() {
              return {
                async returning() {
                  if (row) return [];
                  row = { ...value };
                  return [{ leaseToken: value.leaseToken }];
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: Partial<LeaseRow> & { attemptCount?: unknown }) {
          return {
            where(conditions: Array<{ kind: string; field: keyof LeaseRow; value?: unknown }>) {
              const matched = matches(conditions);
              if (matched && row) {
                const nextAttempt =
                  typeof value.attemptCount === "object"
                    ? row.attemptCount + 1
                    : value.attemptCount;
                row = {
                  ...row,
                  ...value,
                  attemptCount: nextAttempt ?? row.attemptCount,
                } as LeaseRow;
              }
              return {
                async returning() {
                  return matched && row ? [{ id: "delivery_1", leaseToken: row.leaseToken }] : [];
                },
              };
            },
          };
        },
      };
    },
  };
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    postgresWebhookClaimHelpers("stripe").join("\n"),
  );
  const protocol = new Function(
    "randomUUID",
    "db",
    "webhook_events",
    "and",
    "eq",
    "isNull",
    "sql",
    `${javascript}; return { claimWebhookDelivery, failWebhookDelivery, completeWebhookDelivery };`,
  )(
    () => tokens.shift(),
    db,
    fields,
    and,
    eq,
    isNull,
    () => ({ increment: true }),
  ) as {
    claimWebhookDelivery: (
      eventId: string,
      type: string,
      payload: Record<string, unknown>,
    ) => Promise<{ status: string; leaseToken?: string }>;
    failWebhookDelivery: (eventId: string, leaseToken: string, error: string) => Promise<void>;
    completeWebhookDelivery: (eventId: string, leaseToken: string) => Promise<void>;
  };
  return { protocol, getRow: () => row };
}

function loadConvexLeaseProtocol() {
  const source = convexBillingContent()
    .replace(/^import .*\r?\n/gm, "")
    .replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const builder = <T>(definition: T) => definition;
  const validator = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) => ({}),
    },
  );
  return new Function(
    "v",
    "internalMutation",
    "internalQuery",
    "query",
    "paginationOptsValidator",
    "ConvexError",
    "requireActor",
    "requireAdminActor",
    `${javascript}; return { claimWebhookEvent, completeWebhookEvent, failWebhookEvent };`,
  )(
    validator,
    builder,
    builder,
    builder,
    {},
    class ConvexError extends Error {},
    async () => ({ _id: "user_1" }),
    async () => ({ _id: "admin_1" }),
  ) as {
    claimWebhookEvent: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    completeWebhookEvent: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    failWebhookEvent: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
  };
}

describe("billing Convex authorization and webhook lease CAS", () => {
  it("prevents a stale PostgreSQL worker from releasing or completing a reclaimed delivery", async () => {
    const { protocol, getRow } = loadPostgresLeaseProtocol(["lease_a", "lease_b"]);
    const first = await protocol.claimWebhookDelivery("evt_1", "checkout.paid", { n: 1 });
    expect(first).toEqual({ status: "claimed", leaseToken: "lease_a" });

    const current = getRow();
    if (!current) throw new Error("claim was not persisted");
    current.processingStartedAt = new Date(0);
    const second = await protocol.claimWebhookDelivery("evt_1", "checkout.paid", { n: 2 });
    expect(second).toEqual({ status: "claimed", leaseToken: "lease_b" });

    await protocol.failWebhookDelivery("evt_1", "lease_a", "stale failure");
    expect(getRow()?.leaseToken).toBe("lease_b");
    expect(getRow()?.processingStartedAt).toBeInstanceOf(Date);
    await expect(protocol.completeWebhookDelivery("evt_1", "lease_a")).rejects.toThrow(
      "completion was not stored",
    );
    expect(getRow()?.processed).toBe(false);

    await protocol.completeWebhookDelivery("evt_1", "lease_b");
    expect(getRow()?.processed).toBe(true);
    expect(getRow()?.leaseToken).toBeNull();
  });

  it("allows only one concurrent PostgreSQL reclaimer to acquire a stale delivery", async () => {
    const { protocol, getRow } = loadPostgresLeaseProtocol([
      "lease_initial",
      "lease_reclaimer_a",
      "lease_reclaimer_b",
    ]);
    await protocol.claimWebhookDelivery("evt_race", "checkout.paid", { n: 0 });
    const current = getRow();
    if (!current) throw new Error("initial claim was not persisted");
    current.processingStartedAt = new Date(0);

    const results = await Promise.all([
      protocol.claimWebhookDelivery("evt_race", "checkout.paid", { n: 1 }),
      protocol.claimWebhookDelivery("evt_race", "checkout.paid", { n: 2 }),
    ]);

    expect(results.filter((result) => result.status === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result.status === "in_flight")).toHaveLength(1);
    expect(["lease_reclaimer_a", "lease_reclaimer_b"]).toContain(getRow()?.leaseToken);
  });

  it("prevents stale Convex workers from completing or releasing a reclaimed delivery", async () => {
    const protocol = loadConvexLeaseProtocol();
    let row: Record<string, unknown> | null = null;
    const db = {
      query() {
        return {
          withIndex(
            _name: string,
            build: (query: { eq: (field: string, value: unknown) => unknown }) => void,
          ) {
            const conditions: Record<string, unknown> = {};
            const query = {
              eq(field: string, value: unknown) {
                conditions[field] = value;
                return query;
              },
            };
            build(query);
            const match = () =>
              row && Object.entries(conditions).every(([field, value]) => row?.[field] === value)
                ? row
                : null;
            return { unique: async () => match(), first: async () => match() };
          },
        };
      },
      async insert(_table: string, value: Record<string, unknown>) {
        row = { _id: "delivery_1", ...value };
        return "delivery_1";
      },
      async patch(_id: string, value: Record<string, unknown>) {
        row = { ...row, ...value };
      },
    };
    const ctx = { db };
    const base = {
      provider: "stripe",
      providerEventId: "evt_1",
      type: "checkout.session.completed",
      payload: { id: "evt_1" },
      leaseMs: 1_000,
    };
    const first = (await protocol.claimWebhookEvent.handler(ctx, {
      ...base,
      leaseToken: "lease_a",
    })) as { status: string; leaseToken: string };
    expect(first.leaseToken).toBe("lease_a");
    if (!row) throw new Error("claim was not persisted");
    row.processingStartedAt = 0;
    const second = (await protocol.claimWebhookEvent.handler(ctx, {
      ...base,
      leaseToken: "lease_b",
    })) as { status: string; leaseToken: string };
    expect(second.leaseToken).toBe("lease_b");

    await expect(
      protocol.failWebhookEvent.handler(ctx, {
        provider: "stripe",
        providerEventId: "evt_1",
        leaseToken: "lease_a",
        error: "stale",
      }),
    ).rejects.toThrow();
    await expect(
      protocol.completeWebhookEvent.handler(ctx, {
        provider: "stripe",
        providerEventId: "evt_1",
        leaseToken: "lease_a",
      }),
    ).rejects.toThrow();
    expect(row.leaseToken).toBe("lease_b");
    expect(row.processed).toBe(false);

    await protocol.completeWebhookEvent.handler(ctx, {
      provider: "stripe",
      providerEventId: "evt_1",
      leaseToken: "lease_b",
    });
    expect(row.processed).toBe(true);
  });

  it("rejects non-serializable and encoded-oversize Convex claim payloads before persistence", async () => {
    const protocol = loadConvexLeaseProtocol();
    let inserts = 0;
    const db = {
      query() {
        return {
          withIndex() {
            return { unique: async () => null, first: async () => null };
          },
        };
      },
      async insert() {
        inserts += 1;
        return "delivery_1";
      },
      async patch() {},
    };
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const base = {
      provider: "stripe",
      providerEventId: "evt_payload",
      type: "checkout.session.completed",
      leaseToken: "lease_payload",
    };

    await expect(
      protocol.claimWebhookEvent.handler({ db }, { ...base, payload: circular }),
    ).rejects.toThrow();
    await expect(
      protocol.claimWebhookEvent.handler(
        { db },
        { ...base, payload: { value: "😀".repeat(230_000) } },
      ),
    ).rejects.toThrow();
    expect(inserts).toBe(0);
  });

  it("keeps privileged Convex billing operations internal behind a token-authenticated action", () => {
    const billing = convexBillingContent();
    const server = convexBillingServerContent();

    for (const operation of [
      "claimWebhookEvent",
      "completeWebhookEvent",
      "failWebhookEvent",
      "upsertCustomer",
      "upsertSubscription",
      "updateSubscriptionStatus",
      "upsertCheckout",
      "upsertInvoice",
      "recordUsageEvent",
      "upsertProduct",
      "upsertPrice",
    ]) {
      expect(billing).toContain(`export const ${operation} = internalMutation`);
      expect(server).toContain(`internal.billing.${operation}`);
    }
    expect(billing).not.toContain(" = mutation({");
    expect(server).toContain("requireTrustedServerToken(args.serverToken)");
    expect(server).toContain("crypto.randomUUID()");
    expect(server).toContain("internal.billing.claimWebhookEvent");
    expect(billing).toContain("existing.leaseToken !== args.leaseToken");
    expect(billing).toContain('withIndex("by_leaseToken"');
    expect(postgresWebhookClaimHelpers("stripe").join("\n")).toContain(
      "eq(webhook_events.leaseToken, existing.leaseToken)",
    );
  });

  it("persists indexed lease ownership in both generated database schemas", () => {
    const convexSchema = convexSchemaContent({ auth: true, billing: true, posts: false });
    const postgresSchema =
      billingFiles({
        mode: "single",
        addons: { billing: { inUse: true }, stripe: { inUse: true } } as never,
      }).find((entry) => entry.path.endsWith("schema/tables/webhook_events.ts"))?.content ?? "";

    expect(convexSchema).toContain("leaseToken: v.optional(v.string())");
    expect(convexSchema).toContain('.index("by_leaseToken", ["leaseToken"])');
    expect(postgresSchema).toContain('leaseToken: text("lease_token")');
    expect(postgresSchema).toContain('uniqueIndex("webhook_events_lease_token_unique")');
  });

  it("derives public reads from current actor/admin and retains suspended-account denial", () => {
    const billing = convexBillingContent();
    const auth = convexLibAuthContent();
    const customerRepository = billingCustomerRepositoryContent("monorepo", "convex");

    expect(billing).toContain("export const listCustomers = query");
    expect(billing).toContain("await requireAdminActor(ctx)");
    expect(billing).toContain("export const listSubscriptions = query");
    expect(billing).toContain("const actor = await requireActor(ctx)");
    expect(billing).not.toContain("userId: v.optional(v.string())");
    expect(billing).toContain("args: { provider: billingProvider }");
    expect(billing).not.toContain("args.actorId");
    expect(customerRepository).toContain(
      "fetchAuthQuery(api.billing.getCustomerForActor, { provider })",
    );
    expect(customerRepository).not.toContain("{ actorId, provider }");
    expect(billing).toContain("existing.userId !== args.userId");
    expect(billing).toContain("CUSTOMER_OWNER_CONFLICT");
    expect(auth).toContain("if (isUserBanned(actor))");
    expect(auth).toContain('code: "USER_BANNED"');
  });
});
