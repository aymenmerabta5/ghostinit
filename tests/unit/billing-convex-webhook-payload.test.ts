import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { webhookContent } from "../../src/templates/billing/webhooks/providers/index.js";

type Provider = "paddle" | "polar";
type Mode = "monorepo" | "single";
type Framework = "next" | "tanstack";
type WebhookHandler = (input: Request | { request: Request }) => Promise<Response>;

const VARIANTS: ReadonlyArray<readonly [Mode, Framework]> = [
  ["monorepo", "next"],
  ["monorepo", "tanstack"],
  ["single", "next"],
  ["single", "tanstack"],
];

interface ActionCall {
  operation: string;
  input: Record<string, unknown>;
}

const ENVIRONMENT_KEYS = [
  "BETTER_AUTH_SECRET",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "POLAR_WEBHOOK_SECRET",
] as const;
const originalEnvironment = Object.fromEntries(
  ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENVIRONMENT_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENVIRONMENT_KEYS) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertPlainJson(value: unknown, path = "$webhook"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPlainJson(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${path} is not a plain JSON value`);
  }
  for (const [key, entry] of Object.entries(value)) assertPlainJson(entry, `${path}.${key}`);
}

function handlerSource(provider: Provider, mode: Mode, framework: Framework): string {
  const dynamicImport =
    provider === "paddle"
      ? 'await import("@paddle/paddle-node-sdk")'
      : 'await import("@polar-sh/sdk/webhooks")';
  const replacement = provider === "paddle" ? "paddleSdk" : "polarWebhooks";
  return webhookContent(provider, framework, mode, "convex")
    .content.split(/\r?\n/)
    .filter((line) => !line.startsWith("import "))
    .join("\n")
    .replace("export async function POST", "async function POST")
    .replace(/^export const Route = createFileRoute\([^\n]+$/gm, "")
    .replace(dynamicImport, replacement);
}

function loadHandler(
  provider: Provider,
  mode: Mode,
  framework: Framework,
  verifiedEvent: unknown,
  calls: ActionCall[],
): WebhookHandler {
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    handlerSource(provider, mode, framework),
  );
  const action = async (_reference: unknown, value: unknown): Promise<unknown> => {
    const args = record(value, "Convex action arguments");
    const operation = args.operation;
    if (typeof operation !== "string") throw new Error("Convex operation is required");
    const input = record(args.input, "Convex action input");
    if (operation === "claimWebhookEvent") assertPlainJson(input.payload);
    calls.push({ operation, input });
    return operation === "claimWebhookEvent" ? { status: "claimed", leaseToken: "lease_1" } : null;
  };
  const Paddle = class {
    readonly webhooks = { unmarshal: async () => verifiedEvent };
  };
  const logger = {
    error: (_message: unknown) => undefined,
    info: (_message: unknown) => undefined,
  };
  return new Function(
    "createHash",
    "convexClient",
    "api",
    "logger",
    "paddleSdk",
    "polarWebhooks",
    `${javascript}; return POST;`,
  )(
    createHash,
    { action },
    { billingServer: { mutate: {} } },
    logger,
    { Paddle, Environment: { production: "production", sandbox: "sandbox" } },
    { validateEvent: () => verifiedEvent },
  ) as WebhookHandler;
}

async function invoke(
  provider: Provider,
  verifiedEvent: unknown,
  mode: Mode = "single",
  framework: Framework = "next",
) {
  process.env.BETTER_AUTH_SECRET = "a".repeat(32);
  process.env.PADDLE_API_KEY = "pdl_api_key";
  process.env.PADDLE_WEBHOOK_SECRET = "pdl_webhook_secret";
  process.env.POLAR_WEBHOOK_SECRET = "polar_webhook_secret";
  const calls: ActionCall[] = [];
  const request = new Request(`https://app.example.test/api/webhooks/${provider}`, {
    method: "POST",
    headers: {
      "paddle-signature": "ts=1;h1=test",
      "webhook-id": `evt_${provider}_1`,
      "webhook-signature": "v1,test",
    },
    body: "{}",
  });
  const response = await loadHandler(
    provider,
    mode,
    framework,
    verifiedEvent,
    calls,
  )(framework === "next" ? request : { request });
  return { calls, response };
}

class PaddleTransactionNotification {
  readonly id = "txn_1";
  readonly status = "completed";
  readonly customerId = "ctm_1";
  readonly customData = { userId: "user_1", requestKey: "request_1" };
  readonly createdAt = "2026-09-01T00:00:00.000Z";
  readonly updatedAt = "2026-09-01T00:00:01.000Z";
}

describe("Convex webhook payload normalization", () => {
  it("normalizes a Paddle 3.10 SDK class before claim, effects, and completion", async () => {
    const eventData = new PaddleTransactionNotification();
    for (const [mode, framework] of VARIANTS) {
      const label = `${mode}/${framework}`;
      const { calls, response } = await invoke(
        "paddle",
        {
          eventType: "transaction.completed",
          eventId: "evt_paddle_1",
          occurredAt: "2026-09-01T00:00:01.000Z",
          data: eventData,
        },
        mode,
        framework,
      );

      expect(response.status, label).toBe(200);
      expect(await response.text(), label).toBe("ok");
      expect(
        calls.map(({ operation }) => operation),
        label,
      ).toEqual(["claimWebhookEvent", "upsertCheckout", "upsertCustomer", "completeWebhookEvent"]);
      const payload = calls[0]?.input.payload;
      expect(payload, label).not.toBeInstanceOf(PaddleTransactionNotification);
      expect(payload, label).toEqual({
        createdAt: "2026-09-01T00:00:00.000Z",
        customData: { requestKey: "request_1", userId: "user_1" },
        customerId: "ctm_1",
        id: "txn_1",
        status: "completed",
        updatedAt: "2026-09-01T00:00:01.000Z",
      });
      expect(calls.at(-1)?.input, label).toMatchObject({
        provider: "paddle",
        providerEventId: "evt_paddle_1",
        leaseToken: "lease_1",
      });
    }
  });

  it("normalizes Polar 0.49 Date fields before claim, effects, and completion", async () => {
    const verifiedEvent = {
      type: "checkout.updated",
      timestamp: new Date("2026-09-01T00:00:00.000Z"),
      data: {
        id: "checkout_1",
        status: "succeeded",
        externalCustomerId: "user_1",
        customerId: "cus_1",
        metadata: { requestKey: "request_1" },
        modifiedAt: new Date("2026-09-01T00:00:01.000Z"),
        url: "https://polar.sh/checkout/checkout_1",
      },
    };
    for (const [mode, framework] of VARIANTS) {
      const label = `${mode}/${framework}`;
      const { calls, response } = await invoke("polar", verifiedEvent, mode, framework);

      expect(response.status, label).toBe(200);
      expect(
        calls.map(({ operation }) => operation),
        label,
      ).toEqual(["claimWebhookEvent", "upsertCheckout", "completeWebhookEvent"]);
      expect(calls[0]?.input.payload, label).toMatchObject({
        timestamp: "2026-09-01T00:00:00.000Z",
        data: { modifiedAt: "2026-09-01T00:00:01.000Z" },
      });
      expect(calls.at(-1)?.input, label).toMatchObject({
        provider: "polar",
        providerEventId: "evt_polar_1",
        leaseToken: "lease_1",
      });
    }
  });

  it("rejects cyclic, unsupported, and oversized verified payloads before a claim", async () => {
    const cyclic: Record<string, unknown> = { id: "checkout_cycle" };
    cyclic.self = cyclic;
    for (const data of [
      cyclic,
      { id: "checkout_bigint", unsupported: 1n },
      { id: "checkout_large", value: "x".repeat(900_001) },
    ]) {
      const { calls, response } = await invoke("polar", {
        type: "checkout.updated",
        timestamp: new Date("2026-09-01T00:00:00.000Z"),
        data,
      });
      expect(response.status).toBe(500);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(calls).toEqual([]);
    }
  });
});
