import type { ProjectMode } from "../../lib/addons.js";

export function sharedEventsContent(_mode: ProjectMode): string {
  return `import type { AnalyticsEventName, EventProperties, CaptureOptions } from "../types.js";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  properties?: EventProperties;
  options?: CaptureOptions;
}

export function createEvent(
  name: AnalyticsEventName,
  properties?: EventProperties,
  options?: CaptureOptions,
): AnalyticsEvent {
  return { name, properties, options };
}

export const AuthEvents = {
  signedUp: (props?: EventProperties) => createEvent("signed_up", props),
  signedIn: (props?: EventProperties & { method?: string }) => createEvent("signed_in", props),
  signedOut: (props?: EventProperties) => createEvent("signed_out", props),
  onboardingStarted: (props?: EventProperties) => createEvent("onboarding_started", props),
  onboardingCompleted: (props?: EventProperties) => createEvent("onboarding_completed", props),
  onboardingStep: (step: string, props?: EventProperties) =>
    createEvent("onboarding_step", { step, ...props }),
} as const;

export const BillingEvents = {
  checkoutStarted: (props?: EventProperties & { provider?: string; plan?: string; amount?: number }) =>
    createEvent("checkout_started", props),
  checkoutCompleted: (props?: EventProperties & { provider?: string; plan?: string; amount?: number }) =>
    createEvent("checkout_completed", props),
  checkoutFailed: (props?: EventProperties & { provider?: string; reason?: string }) =>
    createEvent("checkout_failed", props),
  subscriptionCreated: (props?: EventProperties & { plan?: string; provider?: string }) =>
    createEvent("subscription_created", props),
  subscriptionUpdated: (props?: EventProperties & { plan?: string; provider?: string }) =>
    createEvent("subscription_updated", props),
  subscriptionCanceled: (props?: EventProperties & { plan?: string; reason?: string }) =>
    createEvent("subscription_canceled", props),
  subscriptionReactivated: (props?: EventProperties & { plan?: string }) =>
    createEvent("subscription_reactivated", props),
  paymentSucceeded: (props?: EventProperties & { amount?: number; provider?: string }) =>
    createEvent("payment_succeeded", props),
  paymentFailed: (props?: EventProperties & { amount?: number; reason?: string }) =>
    createEvent("payment_failed", props),
} as const;

export const ProductEvents = {
  ctaClicked: (cta: string, props?: EventProperties) => createEvent("cta_clicked", { cta, ...props }),
  searchPerformed: (query: string, props?: EventProperties) =>
    createEvent("search_performed", { query, ...props }),
  inviteSent: (props?: EventProperties & { count?: number }) => createEvent("invite_sent", props),
  projectCreated: (props?: EventProperties & { name?: string }) => createEvent("project_created", props),
} as const;

export const ExperimentEvents = {
  viewed: (experiment: string, variant: string, props?: EventProperties) =>
    createEvent("experiment_viewed", { experiment, variant, ...props }),
  enrolled: (experiment: string, variant: string, props?: EventProperties) =>
    createEvent("experiment_enrolled", { experiment, variant, ...props }),
  flagCalled: (flag: string, variant?: string, props?: EventProperties) =>
    createEvent("feature_flag_called", { flag, variant, ...props }),
} as const;
`;
}
