import type { ProjectMode } from "../../lib/addons.js";

export function typesContent(_mode: ProjectMode): string {
  return `/**
 * Analytics domain types — production-ready, extensible.
 */

export type AnalyticsEventName =
  | "$pageview"
  | "$pageleave"
  | "$identify"
  | "$groupidentify"
  | "signed_up"
  | "signed_in"
  | "signed_out"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_step"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_failed"
  | "subscription_created"
  | "subscription_updated"
  | "subscription_canceled"
  | "subscription_reactivated"
  | "payment_succeeded"
  | "payment_failed"
  | "feature_flag_called"
  | "experiment_viewed"
  | "experiment_enrolled"
  | "cta_clicked"
  | "search_performed"
  | "invite_sent"
  | "project_created"
  | (string & {});

export type EventProperties = Record<string, unknown> & {
  $current_url?: string;
  $pathname?: string;
  $host?: string;
  $referrer?: string;
  $referring_domain?: string;
  $screen_width?: number;
  $screen_height?: number;
  $viewport_width?: number;
  $viewport_height?: number;
  $lib?: string;
  $lib_version?: string;
  $os?: string;
  $browser?: string;
  $device_type?: string;
  $active_feature_flags?: string[];
};

export interface UserTraits {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  plan?: string;
  role?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface GroupTraits {
  name?: string;
  plan?: string;
  industry?: string;
  memberCount?: number;
  createdAt?: string;
  [key: string]: unknown;
}

export type GroupType = "organization" | "team" | "project" | "company" | string;

export interface Group {
  type: GroupType;
  key: string;
  traits?: GroupTraits;
}

export type FeatureFlagKey =
  | "new-checkout"
  | "onboarding-v2"
  | "ai-assistant"
  | "billing-v2"
  | "dark-mode-default"
  | (string & {});

export type ExperimentKey =
  | "pricing-page-v2"
  | "onboarding-flow"
  | "checkout-cta"
  | (string & {});

export interface FeatureFlagValue {
  key: FeatureFlagKey;
  enabled: boolean;
  variant?: string;
  payload?: unknown;
}

export interface ExperimentVariant {
  key: string;
  name?: string;
  payload?: unknown;
}

export interface Experiment {
  key: ExperimentKey;
  variant: string;
  payload?: unknown;
  isEnrolled: boolean;
}

export interface CaptureOptions {
  groups?: Record<string, string | number>;
  sendFeatureFlags?: boolean;
  timestamp?: Date;
  disableGeoip?: boolean;
}

export interface IdentifyOptions extends CaptureOptions {
  anonId?: string;
}

export interface AnalyticsContext {
  distinctId?: string;
  anonymousId?: string;
  sessionId?: string;
  userAgent?: string;
  ip?: string;
  locale?: string;
  url?: string;
  pathname?: string;
  referrer?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
}
`;
}
