import { describe, expect, it } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator.js";
import { webhookContent } from "../../src/templates/billing/webhooks/providers/index.js";
import { convexBillingContent } from "../../src/templates/database/convex/billing.js";

const variants = [
  ["monorepo", "nextjs", "postgres"],
  ["monorepo", "nextjs", "convex"],
  ["monorepo", "tanstack-start", "postgres"],
  ["monorepo", "tanstack-start", "convex"],
  ["single", "nextjs", "postgres"],
  ["single", "nextjs", "convex"],
  ["single", "tanstack-start", "postgres"],
  ["single", "tanstack-start", "convex"],
] as const;

function variantFiles(
  mode: (typeof variants)[number][0],
  framework: (typeof variants)[number][1],
  database: (typeof variants)[number][2],
) {
  const addons = {
    billing: { inUse: true },
    paddle: { inUse: true },
    polar: { inUse: true },
    [framework]: { inUse: true },
    [database]: { inUse: true },
  };
  return billingFiles(mode, "bun", addons as never);
}

function contentContaining(files: ReturnType<typeof billingFiles>, needle: string): string {
  const match = files.find((entry) => entry.path.includes(needle));
  if (!match) throw new Error(`Generated file containing ${needle} was not emitted`);
  return match.content;
}

function loadConvexOrderedMutations() {
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
    `${javascript}; return { claimCheckoutIntent, completeCheckoutIntent, upsertSubscription, updateSubscriptionStatus, claimProviderSubscriptionState, commitProviderSubscriptionState, cancelProviderSubscriptionState, createProviderSubscriptionState, upsertInvoice, upsertCheckout, upsertCustomer };`,
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
    claimCheckoutIntent: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    completeCheckoutIntent: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    upsertSubscription: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    updateSubscriptionStatus: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    claimProviderSubscriptionState: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    commitProviderSubscriptionState: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    cancelProviderSubscriptionState: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    createProviderSubscriptionState: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    upsertInvoice: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    upsertCheckout: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
    upsertCustomer: {
      handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
  };
}

function existingRowContext(
  table: "subscriptions" | "invoices" | "checkouts",
  row: Record<string, unknown>,
) {
  return {
    db: {
      query: (requested: string) => {
        if (requested !== table) throw new Error(`Unexpected table ${requested}`);
        return { withIndex: () => ({ unique: async () => row }) };
      },
      patch: async (id: unknown, values: Record<string, unknown>) => {
        if (id !== row._id) throw new Error("Unexpected row id");
        Object.assign(row, values);
      },
    },
  };
}

type PostgresSubscriptionClaim = { providerStateVersion: number; userId: string };

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function loadPostgresSubscriptionFencing(row: Record<string, unknown>) {
  const content = webhookContent("stripe", "next", "single", "postgres").content;
  const start = content.indexOf("async function claimStripeSubscriptionState");
  const end = content.indexOf("async function createStripeSubscriptionState");
  if (start < 0 || end <= start)
    throw new Error("Stripe subscription fencing helpers were not generated");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(content.slice(start, end));

  type Condition = { field: string; value: unknown } | Condition[];
  const matches = (condition: Condition): boolean =>
    Array.isArray(condition) ? condition.every(matches) : row[condition.field] === condition.value;
  const eq = (field: string, value: unknown): Condition => ({ field, value });
  const and = (...conditions: Condition[]): Condition => conditions;
  const sql = (parts: TemplateStringsArray, ...values: unknown[]) => ({
    kind: "sql" as const,
    source: parts.join("?"),
    values,
  });
  const db = {
    update() {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(condition: Condition) {
              return {
                async returning(selection: Record<string, string>) {
                  if (!matches(condition)) return [];
                  for (const [key, value] of Object.entries(values)) {
                    if (
                      key === "providerStateVersion" &&
                      typeof value === "object" &&
                      value !== null &&
                      Reflect.get(value, "kind") === "sql"
                    ) {
                      row[key] = Number(row[key] ?? 0) + 1;
                    } else {
                      row[key] = value;
                    }
                  }
                  return [
                    Object.fromEntries(
                      Object.entries(selection).map(([key, field]) => [key, row[field]]),
                    ),
                  ];
                },
              };
            },
          };
        },
      };
    },
  };
  const subscriptions = {
    id: "id",
    provider: "provider",
    providerSubscriptionId: "providerSubscriptionId",
    userId: "userId",
    providerStateVersion: "providerStateVersion",
  };
  return new Function(
    "db",
    "subscriptions",
    "and",
    "eq",
    "sql",
    `${javascript}; return { claimStripeSubscriptionState, commitStripeSubscriptionState };`,
  )(db, subscriptions, and, eq, sql) as {
    claimStripeSubscriptionState(id: string): Promise<PostgresSubscriptionClaim | null>;
    commitStripeSubscriptionState(
      id: string,
      claim: PostgresSubscriptionClaim,
      state: Record<string, unknown>,
    ): Promise<void>;
  };
}

describe("billing ownership and ordered financial effects", () => {
  for (const [mode, framework, database] of variants) {
    it(`${mode}/${framework}/${database} actor-binds usage and completes only durable provider effects`, () => {
      const files = variantFiles(mode, framework, database);
      const polarCheckout = contentContaining(files, "providers/polar/checkout.ts");
      const polarUsage = contentContaining(files, "providers/polar/usage.ts");
      const webhookNeedle = (provider: "paddle" | "polar") =>
        framework === "tanstack-start"
          ? `/server/http/webhooks/${provider}.server.ts`
          : `/api/webhooks/${provider}`;
      const paddleWebhook = contentContaining(files, webhookNeedle("paddle"));
      const polarWebhook = contentContaining(files, webhookNeedle("polar"));

      if (framework === "tanstack-start") {
        for (const provider of ["paddle", "polar"] as const) {
          const route = contentContaining(files, `/routes/api/webhooks/${provider}.ts`);
          expect(route).toStartWith(
            'import { createServerOnlyFn } from "@tanstack/react-start";\n' +
              'import { createFileRoute } from "@tanstack/react-router";',
          );
          expect(route).toContain(
            `const dispatchWebhook = createServerOnlyFn(
  async (context: { request: Request }): Promise<Response> => {
    const { POST } = await import("@/server/http/webhooks/${provider}.server");
    return await POST(context);
  },
);`,
          );
          expect(route).toContain("POST: (context) => dispatchWebhook(context),");
          expect(route).not.toContain(
            `(await import("@/server/http/webhooks/${provider}.server")).POST(context)`,
          );
          expect(route).not.toContain("completeWebhookDelivery");
        }
        expect(paddleWebhook).toContain('import "server-only"');
        expect(polarWebhook).toContain('import "server-only"');
      }

      expect(files.some((entry) => entry.path.includes("/api/billing/usage"))).toBe(false);
      expect(files.some((entry) => entry.path.includes("/api/billing/license-key"))).toBe(false);
      expect(polarCheckout).toContain("userId: input.userId");
      expect(polarCheckout).toContain("payload.externalCustomerId = input.userId");
      expect(polarUsage).toContain("const organizationId = resolved.orgId");
      expect(polarUsage).toContain("externalCustomerId: input.actorId");
      expect(polarUsage).toContain('name: "tokens_used"');
      expect(polarUsage).toContain("input.usageRecordId");
      expect(polarUsage).toContain('createHash("sha256")');
      expect(polarUsage).not.toContain("randomUUID");
      expect(polarUsage).not.toContain("input.externalCustomerId");
      expect(polarUsage).not.toContain("input.organizationId");

      const completion = (source: string) =>
        database === "convex"
          ? source.lastIndexOf('runBillingMutation("completeWebhookEvent"')
          : source.lastIndexOf("completeWebhookDelivery(");
      const invoiceEffect = (source: string) =>
        database === "convex"
          ? source.lastIndexOf('runBillingMutation("upsertInvoice"')
          : source.lastIndexOf("db.insert(invoices)");

      expect(paddleWebhook).not.toContain('case "transaction_paid": break');
      expect(invoiceEffect(paddleWebhook)).toBeGreaterThan(-1);
      expect(completion(paddleWebhook)).toBeGreaterThan(invoiceEffect(paddleWebhook));
      expect(invoiceEffect(polarWebhook)).toBeGreaterThan(-1);
      expect(completion(polarWebhook)).toBeGreaterThan(invoiceEffect(polarWebhook));
      expect(`${paddleWebhook}\n${polarWebhook}`).toContain("providerEventAt");
      expect(polarWebhook).toContain("did not include actor ownership");

      if (database === "postgres") {
        expect(paddleWebhook).toContain("setWhere:");
        expect(polarWebhook).toContain("onConflictDoUpdate");
        expect(polarWebhook).toContain("invoices.paid");
        expect(paddleWebhook).toContain("returning({ id: invoices.id })");
        expect(polarWebhook).toContain("returning({ id: invoices.id })");
        expect(paddleWebhook).toContain("invoice ${transactionId} belongs to another actor");
        expect(polarWebhook).toContain("invoice ${resourceId} belongs to another actor");
        expect(polarWebhook).toContain("subscription ${resourceId} belongs to another actor");
      } else {
        expect(paddleWebhook).toContain('runBillingMutation("upsertInvoice"');
        expect(polarWebhook).toContain('runBillingMutation("upsertInvoice"');
      }
    });
  }

  it("uses stable provider reconciliation before non-idempotent checkout creation", () => {
    const files = billingFiles("monorepo", "bun", {
      billing: { inUse: true },
      stripe: { inUse: true },
      chargily: { inUse: true },
      paddle: { inUse: true },
      polar: { inUse: true },
      nextjs: { inUse: true },
      postgres: { inUse: true },
    } as never);
    const stripe = contentContaining(files, "providers/stripe/checkout.ts");
    const chargily = contentContaining(files, "providers/chargily/checkout.ts");
    const paddle = contentContaining(files, "providers/paddle/checkout.ts");
    const polar = contentContaining(files, "providers/polar/checkout.ts");

    expect(stripe).toContain("idempotencyKey: `ghostinit_checkout_");
    expect(chargily).toContain("c.listCheckouts(100)");
    expect(chargily).toContain("candidate.metadata?.requestKey === input.requestKey");
    expect(paddle).toContain("paddle.transactions.list");
    expect(paddle).toContain("candidate.customData?.requestKey !== input.requestKey");
    expect(polar).toContain("checkouts.list");
    expect(polar).toContain("candidateMetadata.requestKey !== input.requestKey");
  });

  it("Convex ignores a delayed active snapshot after a newer cancellation", async () => {
    const { upsertSubscription } = loadConvexOrderedMutations();
    const row: Record<string, unknown> = {
      _id: "subscription_1",
      userId: "user_1",
      status: "canceled",
      providerEventAt: 2_000,
    };
    const ctx = existingRowContext("subscriptions", row);

    await upsertSubscription.handler(ctx, {
      userId: "user_1",
      provider: "polar",
      providerSubscriptionId: "sub_1",
      status: "active",
      providerEventAt: 1_000,
    });
    expect(row.status).toBe("canceled");
    expect(row.providerEventAt).toBe(2_000);

    await upsertSubscription.handler(ctx, {
      userId: "user_1",
      provider: "polar",
      providerSubscriptionId: "sub_1",
      status: "active",
      providerEventAt: 3_000,
    });
    expect(row.status).toBe("active");
    expect(row.providerEventAt).toBe(3_000);
  });

  for (const staleReader of ["customer.subscription.updated", "invoice.paid"] as const) {
    it(`Postgres fences a delayed ${staleReader} provider read behind cancellation`, async () => {
      const row: Record<string, unknown> = {
        id: "subscription_1",
        userId: "user_1",
        provider: "stripe",
        providerSubscriptionId: "sub_1",
        providerStateVersion: 0,
        status: "active",
      };
      const fencing = loadPostgresSubscriptionFencing(row);
      const staleReadStarted = deferred();
      const allowStaleCommit = deferred();
      const staleReaderTask = (async () => {
        const claim = await fencing.claimStripeSubscriptionState("sub_1");
        if (!claim) throw new Error("Subscription claim was not created");
        staleReadStarted.resolve();
        await allowStaleCommit.promise;
        await fencing.commitStripeSubscriptionState("sub_1", claim, { status: "active" });
      })();
      const cancellationTask = (async () => {
        await staleReadStarted.promise;
        try {
          const claim = await fencing.claimStripeSubscriptionState("sub_1");
          if (!claim) throw new Error("Cancellation claim was not created");
          await fencing.commitStripeSubscriptionState("sub_1", claim, { status: "canceled" });
        } finally {
          allowStaleCommit.resolve();
        }
      })();
      const [staleResult, cancellationResult] = await Promise.allSettled([
        staleReaderTask,
        cancellationTask,
      ]);
      expect(cancellationResult.status).toBe("fulfilled");
      expect(staleResult.status).toBe("rejected");
      if (staleResult.status === "rejected") {
        expect(String(staleResult.reason)).toContain("reconciliation was superseded");
      }
      expect(row.status).toBe("canceled");
      expect(row.providerStateVersion).toBe(2);
    });

    it(`Convex fences a delayed ${staleReader} provider read behind cancellation`, async () => {
      const {
        claimProviderSubscriptionState,
        commitProviderSubscriptionState,
        cancelProviderSubscriptionState,
      } = loadConvexOrderedMutations();
      const row: Record<string, unknown> = {
        _id: "subscription_1",
        userId: "user_1",
        status: "active",
        providerStateVersion: 0,
      };
      const ctx = existingRowContext("subscriptions", row);
      const claimInput = { provider: "stripe", providerSubscriptionId: "sub_1" };
      const staleReadStarted = deferred();
      const allowStaleCommit = deferred();
      const staleReaderTask = (async () => {
        const claim = (await claimProviderSubscriptionState.handler(
          ctx,
          claimInput,
        )) as PostgresSubscriptionClaim;
        staleReadStarted.resolve();
        await allowStaleCommit.promise;
        await commitProviderSubscriptionState.handler(ctx, {
          ...claimInput,
          userId: "user_1",
          providerStateVersion: claim.providerStateVersion,
          status: "active",
        });
      })();
      const cancellationTask = (async () => {
        await staleReadStarted.promise;
        try {
          const claim = (await claimProviderSubscriptionState.handler(
            ctx,
            claimInput,
          )) as PostgresSubscriptionClaim;
          await cancelProviderSubscriptionState.handler(ctx, {
            ...claimInput,
            userId: "user_1",
            providerStateVersion: claim.providerStateVersion,
            providerEventAt: 2_000,
          });
        } finally {
          allowStaleCommit.resolve();
        }
      })();
      const [staleResult, cancellationResult] = await Promise.allSettled([
        staleReaderTask,
        cancellationTask,
      ]);
      expect(cancellationResult.status).toBe("fulfilled");
      expect(staleResult.status).toBe("rejected");
      expect(row.status).toBe("canceled");
      expect(row.providerStateVersion).toBe(2);
    });
  }

  it("Convex rejects cancel-before-create without an actor-owned subscription tombstone", async () => {
    const { updateSubscriptionStatus } = loadConvexOrderedMutations();
    const ctx = {
      db: {
        query: () => ({ withIndex: () => ({ unique: async () => null }) }),
      },
    };
    await expect(
      updateSubscriptionStatus.handler(ctx, {
        provider: "paddle",
        providerSubscriptionId: "sub_missing",
        status: "canceled",
        providerEventAt: 2_000,
      }),
    ).rejects.toThrow();
  });

  it("Convex upgrades created invoices to paid and never downgrades paid invoices", async () => {
    const { upsertInvoice } = loadConvexOrderedMutations();
    const row: Record<string, unknown> = {
      _id: "invoice_1",
      status: "open",
      providerEventAt: 1_000,
    };
    const ctx = existingRowContext("invoices", row);

    await upsertInvoice.handler(ctx, {
      provider: "polar",
      providerInvoiceId: "order_1",
      status: "paid",
      amount: 500,
      providerEventAt: 2_000,
    });
    expect(row.status).toBe("paid");
    expect(row.providerEventAt).toBe(2_000);

    await upsertInvoice.handler(ctx, {
      provider: "polar",
      providerInvoiceId: "order_1",
      status: "open",
      amount: 500,
      providerEventAt: 3_000,
    });
    expect(row.status).toBe("paid");
    expect(row.providerEventAt).toBe(2_000);
  });

  it("Convex checkouts reject cross-actor collisions and ignore stale status events", async () => {
    const { upsertCheckout } = loadConvexOrderedMutations();
    const row: Record<string, unknown> = {
      _id: "checkout_1",
      userId: "user_1",
      status: "completed",
      providerEventAt: 2_000,
    };
    const ctx = existingRowContext("checkouts", row);

    await upsertCheckout.handler(ctx, {
      userId: "user_1",
      provider: "polar",
      providerCheckoutId: "checkout_1",
      status: "failed",
      providerEventAt: 1_000,
    });
    expect(row.status).toBe("completed");
    expect(row.providerEventAt).toBe(2_000);

    await expect(
      upsertCheckout.handler(ctx, {
        userId: "user_2",
        provider: "polar",
        providerCheckoutId: "checkout_1",
        status: "completed",
        providerEventAt: 3_000,
      }),
    ).rejects.toThrow();
    expect(row.userId).toBe("user_1");
  });

  it("Convex keeps one customer mapping per actor/provider when provider ids rotate", async () => {
    const { upsertCustomer } = loadConvexOrderedMutations();
    const rows: Array<Record<string, unknown>> = [];
    const ctx = {
      db: {
        query(table: string) {
          if (table !== "customers") throw new Error(`Unexpected table ${table}`);
          return {
            withIndex(
              index: string,
              build: (query: { eq(field: string, value: unknown): unknown }) => void,
            ) {
              const conditions: Record<string, unknown> = {};
              const query = {
                eq(field: string, value: unknown) {
                  conditions[field] = value;
                  return query;
                },
              };
              build(query);
              const find = () =>
                rows.find((row) =>
                  Object.entries(conditions).every(([field, value]) => row[field] === value),
                ) ?? null;
              return {
                unique: async () => find(),
                first: async () => find(),
                index,
              };
            },
          };
        },
        async insert(_table: string, value: Record<string, unknown>) {
          rows.push({ _id: `customer_${rows.length + 1}`, ...value });
          return rows.at(-1)?._id;
        },
        async patch(id: unknown, value: Record<string, unknown>) {
          const row = rows.find((candidate) => candidate._id === id);
          if (!row) throw new Error("Missing row");
          Object.assign(row, value);
        },
      },
    };

    const first = await upsertCustomer.handler(ctx, {
      userId: "user_1",
      provider: "stripe",
      providerCustomerId: "cus_first",
    });
    const second = await upsertCustomer.handler(ctx, {
      userId: "user_1",
      provider: "stripe",
      providerCustomerId: "cus_second",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "user_1",
      provider: "stripe",
      providerCustomerId: "cus_first",
    });
    expect(first).toBe("cus_first");
    expect(second).toBe("cus_first");
  });

  it("Convex checkout intents admit one creator and recover a crash from signed webhook metadata", async () => {
    const { claimCheckoutIntent, completeCheckoutIntent, upsertCheckout } =
      loadConvexOrderedMutations();
    const rows: Array<Record<string, unknown>> = [];
    const ctx = {
      db: {
        query(table: string) {
          if (table !== "checkouts") throw new Error(`Unexpected table ${table}`);
          return {
            withIndex(
              _index: string,
              build: (query: { eq(field: string, value: unknown): unknown }) => void,
            ) {
              const conditions: Record<string, unknown> = {};
              const query = {
                eq(field: string, value: unknown) {
                  conditions[field] = value;
                  return query;
                },
              };
              build(query);
              const find = () =>
                rows.find((row) =>
                  Object.entries(conditions).every(([field, value]) => row[field] === value),
                ) ?? null;
              return { first: async () => find(), unique: async () => find() };
            },
          };
        },
        async insert(_table: string, value: Record<string, unknown>) {
          const id = `checkout_${rows.length + 1}`;
          rows.push({ _id: id, ...value });
          return id;
        },
        async patch(id: unknown, value: Record<string, unknown>) {
          const row = rows.find((candidate) => candidate._id === id);
          if (!row) throw new Error("Missing checkout");
          for (const [key, item] of Object.entries(value)) {
            if (item === undefined) delete row[key];
            else row[key] = item;
          }
        },
      },
    };
    const claimInput = {
      userId: "user_1",
      provider: "paddle",
      requestKey: "request_1",
    };
    expect(
      await claimCheckoutIntent.handler(ctx, { ...claimInput, leaseToken: "lease_1" }),
    ).toMatchObject({ status: "claimed", leaseToken: "lease_1" });
    expect(
      await claimCheckoutIntent.handler(ctx, { ...claimInput, leaseToken: "lease_2" }),
    ).toEqual({ status: "in_flight" });
    if (!rows[0]) throw new Error("Checkout intent was not persisted");
    rows[0].creationStartedAt = 0;
    expect(
      await claimCheckoutIntent.handler(ctx, { ...claimInput, leaseToken: "lease_3" }),
    ).toEqual({ status: "claimed", leaseToken: "lease_3" });

    await upsertCheckout.handler(ctx, {
      ...claimInput,
      providerCheckoutId: "txn_1",
      status: "completed",
      url: undefined,
      providerEventAt: 2_000,
    });
    await completeCheckoutIntent.handler(ctx, {
      ...claimInput,
      leaseToken: "lease_3",
      providerCheckoutId: "txn_1",
      url: "https://pay.example.test/txn_1",
    });
    expect(
      await claimCheckoutIntent.handler(ctx, { ...claimInput, leaseToken: "lease_4" }),
    ).toEqual({
      status: "completed",
      checkout: { id: "txn_1", url: "https://pay.example.test/txn_1" },
    });
    expect(rows).toHaveLength(1);
  });
});
