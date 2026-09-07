import { describe, expect, it } from "bun:test";
import { webhookContent } from "../../src/templates/billing/webhooks/providers";
import { billingFiles } from "../../src/templates/billing-generator";
import { convexBillingContent } from "../../src/templates/database/convex/billing";

describe("billing webhook failure-safe delivery protocol", () => {
  it("provider-scopes every PostgreSQL resource mutation and persists ordered checkout ownership", () => {
    for (const provider of ["stripe", "chargily", "paddle", "polar"] as const) {
      const content = webhookContent(provider, "next", "monorepo", "postgres").content;
      expect(content).not.toMatch(
        /\.where\(eq\((?:checkouts\.providerCheckoutId|subscriptions\.providerSubscriptionId)/,
      );
      expect(content).toContain("providerEventAt");
      if (provider !== "polar") expect(content).toContain("checkouts.userId");
    }
  });

  for (const provider of ["stripe", "chargily", "paddle", "polar"] as const) {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["next", "tanstack"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          it(`${provider} ${mode}/${framework}/${database} claims before effects and completes only after success`, () => {
            const content = webhookContent(provider, framework, mode, database).content;
            const claim =
              database === "convex"
                ? content.indexOf('runBillingMutation("claimWebhookEvent"')
                : content.lastIndexOf("claim = await claimWebhookDelivery");
            const failedResponse = content.indexOf('"Webhook handler failed"');
            const complete =
              database === "convex"
                ? content.lastIndexOf('runBillingMutation("completeWebhookEvent"')
                : content.lastIndexOf("completeWebhookDelivery");

            expect(claim).toBeGreaterThan(-1);
            expect(failedResponse).toBeGreaterThan(claim);
            expect(complete).toBeGreaterThan(failedResponse);
            expect(content).toContain("already processed");
            expect(content).toContain("delivery in progress");
            expect(content).toContain("Retry-After");
            expect(content).not.toContain("Math.random()");
            expect(content).not.toContain("`evt_${Date.now()");
            expect(content).not.toContain('status: "completed" | "in_flight"');
            expect(content).toContain('{ status: "completed" }');
            expect(content).toContain('{ status: "in_flight" }');
            expect(content).not.toContain("api.billing.upsertWebhookEvent");
            if (database === "convex") {
              expect(content).toContain("api.billingServer.mutate");
              expect(content).toContain('runBillingMutation("failWebhookEvent"');
            } else expect(content).toContain("failWebhookDelivery");
          });
        }
      }
    }
  }

  it("Convex exposes atomic composite claim, failure release, and durable completion mutations", () => {
    const billing = convexBillingContent();

    expect(billing).toContain("export const claimWebhookEvent = internalMutation");
    expect(billing).toContain('withIndex("by_provider_event"');
    expect(billing).toContain('status: "in_flight"');
    expect(billing).toContain("export const failWebhookEvent = internalMutation");
    expect(billing).toContain("export const completeWebhookEvent = internalMutation");
    expect(billing).toContain("processingStartedAt: undefined");
    expect(billing).toContain("existing.leaseToken !== args.leaseToken");
  });

  it("Convex rejects unserializable and oversized webhook payloads outside the stringify catch", () => {
    const billing = convexBillingContent();
    const stringifyCatch = billing.indexOf("try { serialized = JSON.stringify(payload); } catch {");
    const invalidPayload = billing.indexOf('code: "INVALID_PAYLOAD"', stringifyCatch);
    const sizeGuard = billing.indexOf(
      "new TextEncoder().encode(serialized).byteLength > 900_000",
      invalidPayload,
    );

    expect(stringifyCatch).toBeGreaterThan(-1);
    expect(invalidPayload).toBeGreaterThan(stringifyCatch);
    expect(sizeGuard).toBeGreaterThan(invalidPayload);
    expect(billing.match(/assertWebhookPayload\(args\.payload\)/g)).toHaveLength(2);
    expect(billing).not.toContain("If JSON.stringify fails, still allow");
  });

  it("provider verification APIs use deterministic IDs and Polar fails closed without its verifier", () => {
    const files = billingFiles({
      mode: "monorepo",
      addons: {
        billing: { inUse: true },
        paddle: { inUse: true },
        polar: { inUse: true },
      } as never,
    });
    const paddle = files.find((entry) =>
      entry.path.endsWith("providers/paddle/webhook.ts"),
    )?.content;
    const polar = files.find((entry) => entry.path.endsWith("providers/polar/webhook.ts"))?.content;

    expect(paddle).toContain('createHash("sha256")');
    expect(paddle).not.toContain('genId("evt")');
    expect(polar).toContain("POLAR_WEBHOOK_VERIFIER_UNAVAILABLE");
    expect(polar).toContain('createHash("sha256")');
    expect(polar).not.toContain("if (!polar) {\n    try");
    expect(polar).toContain("input.headers");
    expect(polar).toContain("key.toLowerCase()");
  });
});
