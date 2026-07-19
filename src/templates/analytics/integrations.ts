import type { ProjectMode } from "../../lib/addons.js";

export function integrationsAuthContent(mode: ProjectMode): string {
  const serverImport = mode === "monorepo" ? "../server/posthog-server.js" : "../posthog-server.js";
  const typesImport = mode === "monorepo" ? "../types.js" : "../types.js";
  return `import { capture, identify, alias } from "${serverImport}";
import type { UserTraits } from "${typesImport}";

export interface TrackAuthEvent {
  userId: string;
  email?: string;
  name?: string;
  method?: string;
  traits?: UserTraits;
}

export function trackSignedUp(input: TrackAuthEvent): void {
  const distinctId = input.userId;
  const props = {
    email: input.email,
    method: input.method ?? "email",
    $set: {
      email: input.email,
      name: input.name,
      ...input.traits,
    } as Record<string, unknown>,
  };
  capture({ distinctId, event: "signed_up", properties: props });
  identify({ distinctId, properties: { email: input.email, name: input.name, ...input.traits } });
}

export function trackSignedIn(input: TrackAuthEvent): void {
  capture({
    distinctId: input.userId,
    event: "signed_in",
    properties: { method: input.method ?? "email", email: input.email },
  });
  if (input.email || input.name) {
    identify({
      distinctId: input.userId,
      properties: { email: input.email, name: input.name, ...input.traits },
    });
  }
}

export function trackSignedOut(input: { userId: string }): void {
  capture({ distinctId: input.userId, event: "signed_out" });
}

export function trackOnboardingStarted(input: { userId: string; step?: string }): void {
  capture({
    distinctId: input.userId,
    event: "onboarding_started",
    properties: { step: input.step ?? "start" },
  });
}

export function trackOnboardingCompleted(input: { userId: string; durationMs?: number }): void {
  capture({
    distinctId: input.userId,
    event: "onboarding_completed",
    properties: { durationMs: input.durationMs },
  });
}

export function linkAnonymousToUser(opts: { anonymousId: string; userId: string }): void {
  try {
    alias({ distinctId: opts.userId, alias: opts.anonymousId });
  } catch {}
}

export const authAnalytics = {
  signedUp: trackSignedUp,
  signedIn: trackSignedIn,
  signedOut: trackSignedOut,
  onboardingStarted: trackOnboardingStarted,
  onboardingCompleted: trackOnboardingCompleted,
  linkAnonymous: linkAnonymousToUser,
};
`;
}

export function integrationsBillingContent(mode: ProjectMode): string {
  const serverImport = mode === "monorepo" ? "../server/posthog-server.js" : "../posthog-server.js";
  return `import { capture, groupIdentify } from "${serverImport}";

export interface BillingTrackInput {
  userId: string;
  organizationId?: string;
  provider: string;
  plan?: string;
  amount?: number;
  currency?: string;
  interval?: "month" | "year" | string;
  metadata?: Record<string, unknown>;
}

export function trackCheckoutStarted(input: BillingTrackInput): void {
  capture({
    distinctId: input.userId,
    event: "checkout_started",
    properties: {
      provider: input.provider,
      plan: input.plan,
      amount: input.amount,
      currency: input.currency,
      interval: input.interval,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackCheckoutCompleted(input: BillingTrackInput & { checkoutId?: string; subscriptionId?: string }): void {
  capture({
    distinctId: input.userId,
    event: "checkout_completed",
    properties: {
      provider: input.provider,
      plan: input.plan,
      amount: input.amount,
      currency: input.currency,
      interval: input.interval,
      checkout_id: input.checkoutId,
      subscription_id: input.subscriptionId,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });

  if (input.organizationId) {
    groupIdentify({
      groupType: "organization",
      groupKey: input.organizationId,
      properties: { plan: input.plan, billing_provider: input.provider },
    });
  }
}

export function trackCheckoutFailed(input: BillingTrackInput & { reason?: string; code?: string }): void {
  capture({
    distinctId: input.userId,
    event: "checkout_failed",
    properties: {
      provider: input.provider,
      plan: input.plan,
      reason: input.reason,
      code: input.code,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackSubscriptionCreated(input: BillingTrackInput & { subscriptionId: string }): void {
  capture({
    distinctId: input.userId,
    event: "subscription_created",
    properties: {
      provider: input.provider,
      plan: input.plan,
      subscription_id: input.subscriptionId,
      amount: input.amount,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackSubscriptionUpdated(input: BillingTrackInput & { subscriptionId: string; previousPlan?: string }): void {
  capture({
    distinctId: input.userId,
    event: "subscription_updated",
    properties: {
      provider: input.provider,
      plan: input.plan,
      previous_plan: input.previousPlan,
      subscription_id: input.subscriptionId,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackSubscriptionCanceled(input: BillingTrackInput & { subscriptionId: string; reason?: string }): void {
  capture({
    distinctId: input.userId,
    event: "subscription_canceled",
    properties: {
      provider: input.provider,
      plan: input.plan,
      subscription_id: input.subscriptionId,
      reason: input.reason,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackPaymentSucceeded(input: BillingTrackInput & { invoiceId?: string }): void {
  capture({
    distinctId: input.userId,
    event: "payment_succeeded",
    properties: {
      provider: input.provider,
      amount: input.amount,
      currency: input.currency,
      invoice_id: input.invoiceId,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackPaymentFailed(input: BillingTrackInput & { invoiceId?: string; reason?: string }): void {
  capture({
    distinctId: input.userId,
    event: "payment_failed",
    properties: {
      provider: input.provider,
      amount: input.amount,
      currency: input.currency,
      invoice_id: input.invoiceId,
      reason: input.reason,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export const billingAnalytics = {
  checkoutStarted: trackCheckoutStarted,
  checkoutCompleted: trackCheckoutCompleted,
  checkoutFailed: trackCheckoutFailed,
  subscriptionCreated: trackSubscriptionCreated,
  subscriptionUpdated: trackSubscriptionUpdated,
  subscriptionCanceled: trackSubscriptionCanceled,
  paymentSucceeded: trackPaymentSucceeded,
  paymentFailed: trackPaymentFailed,
};
`;
}
