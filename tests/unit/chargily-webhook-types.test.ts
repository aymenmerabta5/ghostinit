import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { webhookContent } from "../../src/templates/billing/webhooks/providers";
import { convexHttpContent } from "../../src/templates/database/convex/http";

type Framework = "next" | "tanstack";
type Mode = "monorepo" | "single";
type Database = "postgres" | "convex";

function executableSource(content: string): string {
  return content
    .replace(/\nexport const Route = createFileRoute[\s\S]*$/, "")
    .replace(/^import .*\r?\n/gm, "")
    .replace(/^export /gm, "");
}

function loadDeliveryId(content: string) {
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(executableSource(content));
  return new Function("createHash", `${javascript}; return chargilyDeliveryId;`)(createHash) as (
    payload: Record<string, unknown>,
    rawBody: Buffer,
  ) => string;
}

function loadEventClassifier(content: string) {
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(executableSource(content));
  return new Function(
    "createHash",
    `${javascript}; return { isChargilyCompletedEvent, isChargilyFailedEvent };`,
  )(createHash) as {
    isChargilyCompletedEvent: (eventType: string, status: string | null) => boolean;
    isChargilyFailedEvent: (eventType: string, status: string | null) => boolean;
  };
}

async function runFailingHandler(
  framework: Framework,
  mode: Mode,
  database: Database,
  failure: "handler" | "missing-owner" = "handler",
): Promise<{ response: Response; operations: Array<{ kind: string; value?: unknown }> }> {
  const content = webhookContent("chargily", framework, mode, database).content;
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(executableSource(content));
  const operations: Array<{ kind: string; value?: unknown }> = [];
  const logger = { info() {}, warn() {}, error() {} };
  const request = new Request("https://app.example.test/api/webhooks/chargily", {
    method: "POST",
    headers: { signature: "valid" },
    body: JSON.stringify({
      id: "event_1",
      type: "checkout.paid",
      created_at: "2026-08-30T00:00:00.000Z",
      data: {
        id: "checkout_1",
        status: "paid",
        ...(failure === "missing-owner" ? {} : { metadata: { userId: "user_1" } }),
      },
    }),
  });

  const oldSecret = process.env.CHARGILY_SECRET_KEY;
  const oldAuthSecret = process.env.BETTER_AUTH_SECRET;
  process.env.CHARGILY_SECRET_KEY = "test_secret_at_least_32_characters_long";
  process.env.BETTER_AUTH_SECRET = "test_auth_secret_at_least_32_characters_long";
  try {
    if (database === "postgres") {
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
        status: "subscriptions.status",
      };
      const db = {
        query: {
          webhook_events: { findFirst: async () => null },
          checkouts: {
            findFirst: async () => (failure === "missing-owner" ? null : { userId: "user_1" }),
          },
        },
        insert(table: unknown) {
          return {
            values(value: unknown) {
              operations.push({ kind: table === webhook_events ? "claim" : "insert", value });
              return {
                onConflictDoNothing() {
                  return { returning: async () => [{ leaseToken: "lease_1" }] };
                },
                onConflictDoUpdate() {
                  return {
                    async returning() {
                      operations.push({ kind: table === checkouts ? "handler" : "insert", value });
                      if (table === checkouts && failure === "handler") {
                        throw new Error("injected handler failure");
                      }
                      return [{ id: "stored_1" }];
                    },
                  };
                },
              };
            },
          };
        },
        update(table: unknown) {
          return {
            set(value: unknown) {
              return {
                async where() {
                  operations.push({
                    kind:
                      table === checkouts
                        ? "handler"
                        : table === webhook_events
                          ? "webhook-update"
                          : "subscription-update",
                    value,
                  });
                  if (table === checkouts && failure === "handler") {
                    throw new Error("injected handler failure");
                  }
                  return [];
                },
              };
            },
          };
        },
      };
      const handler = new Function(
        "createHash",
        "randomUUID",
        "verifySignature",
        "and",
        "eq",
        "isNull",
        "sql",
        "db",
        "webhook_events",
        "checkouts",
        "subscriptions",
        "logger",
        `${javascript}; return POST;`,
      )(
        createHash,
        () => "lease_1",
        () => true,
        (...args: unknown[]) => args,
        (...args: unknown[]) => args,
        (value: unknown) => value,
        () => 1,
        db,
        webhook_events,
        checkouts,
        subscriptions,
        logger,
      ) as (input: Request | { request: Request }) => Promise<Response>;
      const response = await handler(framework === "tanstack" ? { request } : request);
      return { response, operations };
    }

    const api = { billingServer: { mutate: Symbol("mutate") } };
    const convexClient = {
      async action(_token: symbol, value: { operation: string; input: unknown }) {
        operations.push({ kind: value.operation, value: value.input });
        if (value.operation === "claimWebhookEvent") {
          return { status: "claimed", leaseToken: "lease_1" };
        }
        if (value.operation === "upsertCheckout" && failure === "handler") {
          throw new Error("injected handler failure");
        }
        return null;
      },
    };
    const handler = new Function(
      "createHash",
      "verifySignature",
      "convexClient",
      "api",
      "logger",
      `${javascript}; return POST;`,
    )(createHash, () => true, convexClient, api, logger) as (
      input: Request | { request: Request },
    ) => Promise<Response>;
    const response = await handler(framework === "tanstack" ? { request } : request);
    return { response, operations };
  } finally {
    if (oldSecret === undefined) delete process.env.CHARGILY_SECRET_KEY;
    else process.env.CHARGILY_SECRET_KEY = oldSecret;
    if (oldAuthSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = oldAuthSecret;
  }
}

describe("Chargily webhook generated type contracts", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      it(`${mode} ${framework} maps provider statuses to Drizzle enum literals`, () => {
        const content = webhookContent("chargily", framework, mode, "postgres").content;

        expect(content).toContain("type CheckoutStatus = typeof checkouts.$inferSelect.status");
        expect(content).toContain(
          "function mapChargilyCheckoutStatus(status: string): CheckoutStatus",
        );
        expect(content).toContain(
          "function mapChargilyFailureEvent(eventType: string): CheckoutStatus",
        );
        expect(content).toContain('mapChargilyCheckoutStatus(status ?? "pending")');
        expect(content).toContain("failed ? mapChargilyFailureEvent(eventType)");
        expect(content).toContain('"canceled" as const');
        expect(content).not.toMatch(/status:\s*[^,})]+\s+as unknown as string/);
      });
    }
  }

  it("keeps the complete failure and fallback status mapping", () => {
    const content = webhookContent("chargily", "next", "monorepo", "postgres").content;

    expect(content).toContain(
      'if (status === "paid" || status === "completed") return "completed";',
    );
    expect(content).toContain(
      'if (status === "failed" || status === "canceled" || status === "cancelled") return "failed";',
    );
    expect(content).toContain('if (status === "expired") return "expired";');
    expect(content).toContain('return eventType === "checkout.expired" ? "expired" : "failed";');
    expect(content).toContain('return "pending";');
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        it(`${mode} ${framework} ${database} grants only exact completed events`, () => {
          const content = webhookContent("chargily", framework, mode, database).content;
          const classifier = loadEventClassifier(content);

          expect(classifier.isChargilyCompletedEvent("checkout.paid", "paid")).toBe(true);
          expect(classifier.isChargilyCompletedEvent("checkout.completed", "completed")).toBe(true);
          expect(classifier.isChargilyCompletedEvent("checkout.not_paid", "paid")).toBe(false);
          expect(classifier.isChargilyCompletedEvent("checkout.partially_paid", "paid")).toBe(
            false,
          );
          expect(classifier.isChargilyCompletedEvent("checkout.paid", "failed")).toBe(false);
          expect(classifier.isChargilyFailedEvent("checkout.failed", "failed")).toBe(true);
          expect(classifier.isChargilyFailedEvent("checkout.not_failed", "failed")).toBe(false);
          expect(classifier.isChargilyFailedEvent("checkout.failed", "paid")).toBe(false);
          expect(content).not.toContain("eventType.includes(");
        });
      }
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        it(`${mode} ${framework} ${database} uses documented delivery ids and deterministic body hashes`, () => {
          const content = webhookContent("chargily", framework, mode, database).content;
          const deliveryId = loadDeliveryId(content);
          const rawBody = Buffer.from('{"type":"checkout.paid","data":{"id":"checkout_1"}}');

          expect(
            deliveryId(
              { id: "event_1", type: "checkout.paid", data: { id: "checkout_1" } },
              rawBody,
            ),
          ).toBe("event_1");
          expect(deliveryId({ event_id: "legacy_event" }, rawBody)).toBe("legacy_event");
          expect(deliveryId({ data: { id: "checkout_1" } }, rawBody)).toBe(
            `body_sha256:${createHash("sha256").update(rawBody).digest("hex")}`,
          );
          expect(content).not.toContain("Math.random()");
          expect(content).not.toContain("`evt_${Date.now()");
        });

        it(`${mode} ${framework} ${database} releases a failed claim and never completes it`, async () => {
          const { response, operations } = await runFailingHandler(framework, mode, database);
          expect(response.status).toBe(500);
          if (database === "convex") {
            expect(operations[0]?.kind).toBe("claimWebhookEvent");
            expect(operations.some((operation) => operation.kind === "upsertCheckout")).toBe(true);
            expect(operations.some((operation) => operation.kind === "failWebhookEvent")).toBe(
              true,
            );
            expect(operations.some((operation) => operation.kind === "completeWebhookEvent")).toBe(
              false,
            );
          } else {
            expect(operations[0]?.kind).toBe("claim");
            expect(operations.some((operation) => operation.kind === "handler")).toBe(true);
            const webhookUpdates = operations.filter(
              (operation) => operation.kind === "webhook-update",
            );
            expect(webhookUpdates).toHaveLength(1);
            expect(webhookUpdates[0]?.value).not.toMatchObject({ processed: true });
          }
        });

        it(`${mode} ${framework} ${database} retries an app checkout that has no resolvable owner`, async () => {
          const { response, operations } = await runFailingHandler(
            framework,
            mode,
            database,
            "missing-owner",
          );
          expect(response.status).toBe(500);
          expect(response.headers.get("retry-after")).toBe("60");
          expect(operations.some((operation) => operation.kind === "completeWebhookEvent")).toBe(
            false,
          );
          if (database === "convex") {
            expect(operations.some((operation) => operation.kind === "failWebhookEvent")).toBe(
              true,
            );
          } else {
            const webhookUpdates = operations.filter(
              (operation) => operation.kind === "webhook-update",
            );
            expect(webhookUpdates).toHaveLength(1);
            expect(webhookUpdates[0]?.value).toMatchObject({
              processingStartedAt: null,
              leaseToken: null,
            });
            expect(webhookUpdates[0]?.value).not.toMatchObject({ processed: true });
          }
        });
      }
    }
  }

  it("does not emit unsigned Convex-native billing webhook endpoints", () => {
    const content = convexHttpContent();
    expect(content).not.toContain("/api/webhooks/");
    expect(content).not.toContain("request.json()");
    expect(content).toContain("raw-body signature verification");
  });
});
