/**
 * Secrets used when writing .env.local.
 *
 * `authSecret`, `postgresPassword`, and Eve's internal facade secret are
 * self-issued — GhostInit mints them.
 * Everything else is issued by a third party (Resend, Stripe, Chargily, Paddle,
 * Polar) and is therefore optional: when absent the env writer emits the
 * REPLACE_WITH_* placeholder so an unconfigured integration fails loudly at the
 * vendor boundary instead of looking configured.
 */
export interface RootSecrets {
  authSecret: string;
  postgresPassword: string;
  /** Self-issued 32-byte base64url key; production generators always materialize it. */
  notificationTokenEncryptionKey?: string;
  /** Self-issued 32-byte base64url secret for the private Next-to-Eve facade. */
  eveInternalAuthSecret?: string;
  resendApiKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePublishableKey?: string;
  chargilyApiKey?: string;
  chargilySecretKey?: string;
  paddleApiKey?: string;
  paddleWebhookSecret?: string;
  paddleClientToken?: string;
  polarAccessToken?: string;
  polarWebhookSecret?: string;
  polarOrgId?: string;
}
export function billingEnvPlaceholders(): Record<string, string> {
  return {
    STRIPE_SECRET_KEY: "REPLACE_WITH_STRIPE_SECRET_KEY",
    STRIPE_WEBHOOK_SECRET: "REPLACE_WITH_STRIPE_WEBHOOK_SECRET",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_REPLACE",
    CHARGILY_API_KEY: "REPLACE_WITH_CHARGILY_API_KEY",
    CHARGILY_SECRET_KEY: "REPLACE_WITH_CHARGILY_SECRET_KEY",
    PADDLE_API_KEY: "REPLACE_WITH_PADDLE_API_KEY",
    PADDLE_WEBHOOK_SECRET: "REPLACE_WITH_PADDLE_WEBHOOK_SECRET",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "pdl_ntf_REPLACE",
    POLAR_ACCESS_TOKEN: "REPLACE_WITH_POLAR_ACCESS_TOKEN",
    POLAR_WEBHOOK_SECRET: "REPLACE_WITH_POLAR_WEBHOOK_SECRET",
    POLAR_ORG_ID: "REPLACE_WITH_POLAR_ORG_ID",
  };
}
