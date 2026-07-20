/**
 * Stripe client init — server-only.
 * Context7: Stripe Node v19.1.0 basil API version
 */
// @ts-ignore - optional dep, not installed in CLI
import Stripe from "stripe";

export const STRIPE_API_VERSION = "2025-03-31.basil" as const;

type StripeConfig = {
  secretKey?: string;
  webhookSecret?: string;
  publishableKey?: string;
};

export function resolveStripeConfig(config?: Record<string, unknown>): StripeConfig {
  const envSecret =
    typeof process !== "undefined"
      ? (process.env.STRIPE_SECRET_KEY as string | undefined)
      : undefined;
  const envWebhook =
    typeof process !== "undefined"
      ? (process.env.STRIPE_WEBHOOK_SECRET as string | undefined)
      : undefined;
  const envPublishable =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string | undefined)
      : undefined;

  return {
    secretKey:
      (config?.secretKey as string | undefined) ??
      (config?.STRIPE_SECRET_KEY as string | undefined) ??
      envSecret ??
      "",
    webhookSecret:
      (config?.webhookSecret as string | undefined) ??
      (config?.STRIPE_WEBHOOK_SECRET as string | undefined) ??
      envWebhook ??
      "",
    publishableKey:
      (config?.publishableKey as string | undefined) ??
      (config?.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string | undefined) ??
      envPublishable ??
      "",
  };
}

export function getStripeClient(secretKey: string): Stripe {
  if (!secretKey || secretKey.startsWith("REPLACE_WITH")) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured - set STRIPE_SECRET_KEY env var server-only",
    );
  }
  // vendor untyped: Stripe apiVersion literal requires string assert, SDK type is string union
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION as unknown as Stripe.StripeConfig["apiVersion"],
  });
}
