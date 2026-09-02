import { describe, expect, it } from "bun:test";
import { webhookContent } from "../../src/templates/billing/webhooks/providers";

describe("Stripe webhook generated type contracts", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      it(`${mode} ${framework} uses Stripe 22 Dahlia and typed Drizzle values`, () => {
        const content = webhookContent("stripe", framework, mode, "postgres").content;
        const billingTypes = mode === "monorepo" ? "@repo/billing" : "@/server/billing";

        expect(content).toContain('apiVersion: "2026-07-29.dahlia"');
        expect(content).toContain(`import type { SubscriptionStatus } from "${billingTypes}";`);
        expect(content).toContain(
          "function stripeProviderSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus",
        );
        expect(content).toContain(
          "subscriptionStatus: Stripe.Subscription.Status,\n): SubscriptionStatus",
        );
        expect(content).not.toContain("): Stripe.Subscription.Status {");
        expect(content).not.toContain("return status;");
        expect(content).toContain(
          "await stripe.webhooks.constructEventAsync(buf, sig, stripeWebhookSecret)",
        );
        expect(content).not.toContain("stripe.webhooks.constructEvent(");
        expect(content).toContain(
          "function stripeInvoiceValues(invoice: Stripe.Invoice, providerEventAt: Date, userId: string): typeof invoices.$inferInsert",
        );
        expect(content).toContain(
          "expandableId(invoice.parent?.subscription_details?.subscription)",
        );
        expect(content).toContain("subscription.items.data.map");
        expect(content).toContain("item.current_period_end");
        expect(content).toContain(
          "status: stripeProviderSubscriptionStatus(authoritativeSubscription.status)",
        );
        expect(content).toContain("await stripe.subscriptions.retrieve(subscription.id)");
        expect(content).not.toContain("status: subscription.status");
        expect(content).toContain("claimWebhookDelivery(event.id, event.type, { ...event })");
        expect(content).toContain("...invoice.metadata,");
        expect(content).not.toContain("...(invoice.metadata ?? {})");
        expect(content).not.toContain("as unknown as");
        expect(content).not.toContain("invoice.metadata as Record<string, unknown>");
        expect(content).not.toContain("event.data.object as Record<string, unknown>");
        expect(content).toContain("metadata?: Record<string, unknown> | null");
      });
    }
  }

  it("narrows the Stripe event union instead of merging incompatible payment objects", () => {
    const content = webhookContent("stripe", "next", "single", "postgres").content;

    expect(content).toContain('case "invoice.payment_succeeded": {');
    expect(content).toContain('case "payment_intent.succeeded": {');
    expect(content).toContain('case "charge.succeeded": {');
    expect(content).toContain("const invoice = event.data.object;");
    expect(content).toContain("const intent = event.data.object;");
    expect(content).toContain("const charge = event.data.object;");
    expect(content).not.toContain("obj.invoice");
  });

  it("does not acknowledge or mark failed handler/store work as processed", () => {
    const content = webhookContent("stripe", "next", "single", "postgres").content;
    const handlerFailure = content.indexOf('return new Response("Webhook handler failed"');
    const completeCall = content.lastIndexOf(
      "await completeWebhookDelivery(event.id, claim.leaseToken)",
    );

    expect(handlerFailure).toBeGreaterThan(-1);
    expect(completeCall).toBeGreaterThan(handlerFailure);
    expect(content).toContain('return new Response("Webhook event store unavailable"');
    expect(content).toContain('eq(webhook_events.provider, "stripe")');
    expect(content).toContain("failWebhookDelivery(event.id, claim.leaseToken, message)");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      it(`${mode} ${framework} Convex route keeps the pinned API literal and unknown-error guard`, () => {
        const content = webhookContent("stripe", framework, mode, "convex").content;
        const billingTypes = mode === "monorepo" ? "@repo/billing" : "@/server/billing";

        expect(content).toContain("2026-07-29.dahlia");
        expect(content).toContain(`import type { SubscriptionStatus } from "${billingTypes}";`);
        expect(content).toContain(
          "function stripeProviderSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus",
        );
        expect(content).not.toContain("status: authoritativeSubscription.status");
        expect(content).not.toContain("status: subscription.status");
        expect(content).not.toContain("2025-09-30.clover");
        expect(content).toContain(
          "await stripe.webhooks.constructEventAsync(buf, sig, stripeWebhookSecret)",
        );
        expect(content).toContain("err instanceof Error ? err.message : String(err)");
        expect(content).toContain("api.billingServer.mutate");
        expect(content).toContain('runBillingMutation("claimWebhookEvent"');
        expect(content).toContain('runBillingMutation("completeWebhookEvent"');
        expect(content).toContain('runBillingMutation("failWebhookEvent"');
        expect(content.indexOf('runBillingMutation("claimWebhookEvent"')).toBeLessThan(
          content.indexOf('case "checkout.session.completed"'),
        );
        expect(content.indexOf('runBillingMutation("completeWebhookEvent"')).toBeGreaterThan(
          content.indexOf('return new Response("Webhook handler failed"'),
        );
      });
    }
  }
});
