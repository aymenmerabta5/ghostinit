export interface RootSecrets {
  authSecret: string;
  postgresPassword: string;
  resendApiKey: string;
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
