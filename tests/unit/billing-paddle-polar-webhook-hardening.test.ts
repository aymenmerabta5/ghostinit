import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { webhookContent } from "../../src/templates/billing/webhooks/providers/index.js";

function generatedFunction<T>(source: string, name: string, dependencies: string[] = []): T {
  const nonEmptyString = source.match(/function nonEmptyString[^\n]+/)?.[0] ?? "";
  const target = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}`))?.[0];
  if (!target) throw new Error(`${name} was not generated`);
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    `${nonEmptyString}\n${target}`,
  );
  return new Function(...dependencies, `${javascript}; return ${name};`)(
    ...dependencies.map((dependency) => {
      if (dependency === "createHash") return createHash;
      throw new Error(`Unknown dependency ${dependency}`);
    }),
  ) as T;
}

describe("Paddle and Polar webhook ingress hardening", () => {
  for (const provider of ["paddle", "polar"] as const) {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["next", "tanstack"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          it(`${provider} ${mode}/${framework}/${database} rejects oversized bodies before verification`, () => {
            const source = webhookContent(provider, framework, mode, database).content;
            const handlerStart = source.indexOf(
              framework === "tanstack" ? "async function POST" : "export async function POST",
            );
            const handler = source.slice(handlerStart);
            const requestName = framework === "tanstack" ? "request" : "req";
            const declaredCheck = handler.indexOf(`rejectDeclaredBodySize(${requestName})`);
            const boundedRead = handler.indexOf("readBoundedWebhookBody(declaredBodyRejection)");
            const verifier = handler.indexOf(
              provider === "paddle" ? "webhooks.unmarshal" : "validateEvent(",
            );
            const claim =
              database === "convex"
                ? handler.indexOf('runBillingMutation("claimWebhookEvent"')
                : handler.lastIndexOf("claim = await claimWebhookDelivery");

            expect(handlerStart).toBeGreaterThan(-1);
            expect(source).toContain("const MAX_WEBHOOK_BODY_BYTES = 1048576");
            expect(source).toContain('request.headers.get("content-length")');
            expect(source).toContain('new Response("Webhook payload too large", { status: 413 })');
            expect(source).toContain("body.getReader()");
            expect(source).toContain("await reader.cancel(");
            expect(declaredCheck).toBeGreaterThan(-1);
            expect(boundedRead).toBeGreaterThan(declaredCheck);
            expect(verifier).toBeGreaterThan(boundedRead);
            expect(claim).toBeGreaterThan(verifier);
            expect(handler).not.toContain(".arrayBuffer(");
          });
        }
      }
    }
  }

  it("classifies only explicit Paddle event names and derives stable fallback delivery IDs", () => {
    const source = webhookContent("paddle", "next", "single", "postgres").content;
    const classify = generatedFunction<(eventType: string) => string | null>(
      source,
      "paddleEventKind",
    );
    const deliveryId = generatedFunction<(eventId: unknown, rawBody: Buffer) => string>(
      source,
      "paddleDeliveryId",
      ["createHash"],
    );
    const mapStatus = generatedFunction<(status: unknown) => string>(
      source,
      "mapPaddleSubscriptionStatus",
    );

    expect(classify("transaction.completed")).toBe("transaction_completed");
    expect(classify("subscription.canceled")).toBe("subscription_canceled");
    expect(classify("subscription.updated")).toBe("subscription_updated");
    expect(classify("subscription.paused")).toBe("subscription_updated");
    expect(classify("subscription.past_due")).toBe("subscription_updated");
    expect(classify("subscription.resumed")).toBe("subscription_updated");
    expect(classify("customer.completed")).toBeNull();
    expect(classify("transaction.completed.future")).toBeNull();
    expect(mapStatus("active")).toBe("active");
    expect(mapStatus("future_entitled")).toBe("incomplete");
    expect(mapStatus(undefined)).toBe("incomplete");
    expect(source).not.toContain('eventType.includes("completed")');
    expect(source).not.toContain('eventType.includes("canceled")');
    expect(source).toContain("providerEventAt");
    expect(source).toContain('eq(checkouts.provider, "paddle")');

    const body = Buffer.from("same verified delivery");
    expect(deliveryId(undefined, body)).toBe(deliveryId(undefined, body));
    expect(deliveryId("evt_real", body)).toBe("evt_real");
    expect(deliveryId(undefined, body)).toStartWith("body_sha256:");
  });

  it("classifies only explicit Polar event names", () => {
    const source = webhookContent("polar", "next", "single", "postgres").content;
    const classify = generatedFunction<(eventType: string) => string | null>(
      source,
      "polarEventKind",
    );

    expect(classify("subscription.updated")).toBe("subscription");
    expect(classify("checkout.expired")).toBe("checkout");
    expect(classify("subscription.future_entitled")).toBeNull();
    expect(source).not.toContain('eventType.startsWith("subscription.")');
    expect(source).not.toContain('eventType.startsWith("checkout.")');
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        it(`Polar ${mode}/${framework}/${database} route maps unknown status to incomplete`, () => {
          const source = webhookContent("polar", framework, mode, database).content;
          const mapper = source.match(/function mapPolarSubscriptionStatus[^}]+}/)?.[0] ?? "";

          expect(mapper).toContain('status === "active"');
          expect(mapper).toContain('return "incomplete"');
          expect(mapper).not.toMatch(/return "active"(?: as const)?;/);
        });
      }
    }
  }
});
