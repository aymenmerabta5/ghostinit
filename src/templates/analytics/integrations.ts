import type { ProjectMode } from "../../lib/addons.js";

export function integrationsAuthContent(mode: ProjectMode, worker = false): string {
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

export ${worker ? "async " : ""}function trackSignedUp(input: TrackAuthEvent): ${worker ? "Promise<void>" : "void"} {
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
  ${worker ? "await " : ""}capture({ distinctId, event: "signed_up", properties: props });
  ${worker ? "await " : ""}identify({ distinctId, properties: { email: input.email, name: input.name, ...input.traits } });
}

export ${worker ? "async " : ""}function trackSignedIn(input: TrackAuthEvent): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
    distinctId: input.userId,
    event: "signed_in",
    properties: { method: input.method ?? "email", email: input.email },
  });
  if (input.email || input.name) {
    ${worker ? "await " : ""}identify({
      distinctId: input.userId,
      properties: { email: input.email, name: input.name, ...input.traits },
    });
  }
}

export ${worker ? "async " : ""}function trackSignedOut(input: { userId: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({ distinctId: input.userId, event: "signed_out" });
}

export ${worker ? "async " : ""}function trackOnboardingStarted(input: { userId: string; step?: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
    distinctId: input.userId,
    event: "onboarding_started",
    properties: { step: input.step ?? "start" },
  });
}

export ${worker ? "async " : ""}function trackOnboardingCompleted(input: { userId: string; durationMs?: number }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
    distinctId: input.userId,
    event: "onboarding_completed",
    properties: { durationMs: input.durationMs },
  });
}

export ${worker ? "async " : ""}function linkAnonymousToUser(opts: { anonymousId: string; userId: string }): ${worker ? "Promise<void>" : "void"} {
  try {
    ${worker ? "await " : ""}alias({ distinctId: opts.userId, alias: opts.anonymousId });
  } catch {${worker ? ' throw new Error("Analytics operation failed"); ' : ""}}
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

export function integrationsBillingContent(mode: ProjectMode, worker = false): string {
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

export ${worker ? "async " : ""}function trackCheckoutStarted(input: BillingTrackInput): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
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

export ${worker ? "async " : ""}function trackCheckoutCompleted(input: BillingTrackInput & { checkoutId?: string; subscriptionId?: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
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
    ${worker ? "await " : ""}groupIdentify({
      groupType: "organization",
      groupKey: input.organizationId,
      properties: { plan: input.plan, billing_provider: input.provider },
    });
  }
}

export ${worker ? "async " : ""}function trackCheckoutFailed(input: BillingTrackInput & { reason?: string; code?: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
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

export ${worker ? "async " : ""}function trackSubscriptionCreated(input: BillingTrackInput & { subscriptionId: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
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

export ${worker ? "async " : ""}function trackSubscriptionUpdated(input: BillingTrackInput & { subscriptionId: string; previousPlan?: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
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

export ${worker ? "async " : ""}function trackSubscriptionCanceled(input: BillingTrackInput & { subscriptionId: string; reason?: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
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

export ${worker ? "async " : ""}function trackPaymentSucceeded(input: BillingTrackInput & { invoiceId?: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
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

export ${worker ? "async " : ""}function trackPaymentFailed(input: BillingTrackInput & { invoiceId?: string; reason?: string }): ${worker ? "Promise<void>" : "void"} {
  ${worker ? "await " : ""}capture({
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
