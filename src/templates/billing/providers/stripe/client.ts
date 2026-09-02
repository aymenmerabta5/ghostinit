/**
 * Stripe client init — server-only.
 * Stripe Node v22.5.0 Dahlia API version.
 */
import Stripe from "stripe";
import { STRIPE_API_VERSION } from "./api-version.js";

export { STRIPE_API_VERSION };

type StripeConfig = {
  secretKey?: string;
  webhookSecret?: string;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function resolveStripeConfig(config?: Record<string, unknown>): StripeConfig {
  const envSecret = typeof process !== "undefined" ? process.env.STRIPE_SECRET_KEY : undefined;
  const envWebhook = typeof process !== "undefined" ? process.env.STRIPE_WEBHOOK_SECRET : undefined;

  return {
    secretKey:
      optionalString(config?.secretKey) ??
      optionalString(config?.STRIPE_SECRET_KEY) ??
      envSecret ??
      "",
    webhookSecret:
      optionalString(config?.webhookSecret) ??
      optionalString(config?.STRIPE_WEBHOOK_SECRET) ??
      envWebhook ??
      "",
  };
}

export function getStripeClient(secretKey: string): Stripe {
  if (!secretKey || secretKey.startsWith("REPLACE_WITH")) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured - set STRIPE_SECRET_KEY env var server-only",
    );
  }
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}
