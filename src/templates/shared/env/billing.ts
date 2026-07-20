import type { RootSecrets } from "../../root.js";
import type { BillingProviderName } from "../../../lib/addons.js";
import { ENV_PLACEHOLDERS } from "../../../lib/constants.js";
import { secret as genSecret } from "../../shared.js";

export function billingEnvLines(selected: BillingProviderName[]): string[] {
  const out: string[] = [];
  const has = (n: BillingProviderName) => selected.includes(n);
  if (selected.length === 0) {
    out.push(
      "# Billing: none selected — add via ghostinit add billing --provider stripe|chargily|paddle|polar|all",
    );
    out.push("# Example when enabled:");
    out.push(`# STRIPE_SECRET_KEY=${ENV_PLACEHOLDERS.STRIPE_SECRET_KEY}`);
    out.push(`# STRIPE_WEBHOOK_SECRET=${ENV_PLACEHOLDERS.STRIPE_WEBHOOK_SECRET}`);
    out.push(`# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE}`);
    out.push(`# CHARGILY_API_KEY=${ENV_PLACEHOLDERS.CHARGILY_API_KEY}`);
    out.push(`# CHARGILY_SECRET_KEY=${ENV_PLACEHOLDERS.CHARGILY_SECRET}`);
    out.push(`# PADDLE_API_KEY=${ENV_PLACEHOLDERS.PADDLE_API_KEY}`);
    out.push(`# POLAR_ACCESS_TOKEN=${ENV_PLACEHOLDERS.POLAR_ACCESS_TOKEN}`);
    return out;
  }
  out.push("# Billing (flexible any combo none/both/one/all) — selected providers only");
  if (has("stripe")) {
    out.push("# Stripe global cards");
    out.push(`STRIPE_SECRET_KEY=${ENV_PLACEHOLDERS.STRIPE_SECRET_KEY}`);
    out.push(`STRIPE_WEBHOOK_SECRET=${ENV_PLACEHOLDERS.STRIPE_WEBHOOK_SECRET}`);
    out.push(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE}`);
    out.push(`VITE_STRIPE_PUBLISHABLE_KEY=${ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE}`);
    out.push(`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=${ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE}`);
    out.push("");
  }
  if (has("chargily")) {
    out.push("# Chargily Algeria EDAHABIA/CIB");
    out.push(`CHARGILY_API_KEY=${ENV_PLACEHOLDERS.CHARGILY_API_KEY}`);
    out.push(`CHARGILY_SECRET_KEY=${ENV_PLACEHOLDERS.CHARGILY_SECRET}`);
    out.push("CHARGILY_MODE=test");
    out.push("");
  }
  if (has("paddle")) {
    out.push("# Paddle MoR");
    out.push(`PADDLE_API_KEY=${ENV_PLACEHOLDERS.PADDLE_API_KEY}`);
    out.push(`PADDLE_WEBHOOK_SECRET=${ENV_PLACEHOLDERS.PADDLE_WEBHOOK_SECRET}`);
    out.push("PADDLE_ENVIRONMENT=sandbox");
    out.push(`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=${ENV_PLACEHOLDERS.PADDLE_CLIENT_TOKEN}`);
    out.push("NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox");
    out.push(`VITE_PADDLE_CLIENT_TOKEN=${ENV_PLACEHOLDERS.PADDLE_CLIENT_TOKEN}`);
    out.push("VITE_PADDLE_ENVIRONMENT=sandbox");
    out.push(`EXPO_PUBLIC_PADDLE_CLIENT_TOKEN=${ENV_PLACEHOLDERS.PADDLE_CLIENT_TOKEN}`);
    out.push("EXPO_PUBLIC_PADDLE_ENVIRONMENT=sandbox");
    out.push("");
  }
  if (has("polar")) {
    out.push("# Polar MoR");
    out.push(`POLAR_ACCESS_TOKEN=${ENV_PLACEHOLDERS.POLAR_ACCESS_TOKEN}`);
    out.push(`POLAR_WEBHOOK_SECRET=${ENV_PLACEHOLDERS.POLAR_WEBHOOK_SECRET}`);
    out.push(`POLAR_ORG_ID=${ENV_PLACEHOLDERS.POLAR_ORG_ID}`);
    out.push("POLAR_ENVIRONMENT=sandbox");
    out.push("");
  }
  return out;
}

export function billingEnvLocalLines(
  secrets: RootSecrets,
  selected: BillingProviderName[],
): string[] {
  const out: string[] = [];
  const has = (n: BillingProviderName) => selected.includes(n) || selected.length === 0;
  const emitAllWhenEmpty = selected.length === 0;
  const shouldEmit = (provider: BillingProviderName) => emitAllWhenEmpty || has(provider);
  if (shouldEmit("stripe")) {
    const pk = secrets.stripePublishableKey ?? "pk_test_" + genSecret().slice(0, 32);
    out.push(`STRIPE_SECRET_KEY=${secrets.stripeSecretKey ?? genSecret()}`);
    out.push(`STRIPE_WEBHOOK_SECRET=${secrets.stripeWebhookSecret ?? genSecret()}`);
    out.push(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${pk}`);
    out.push(`VITE_STRIPE_PUBLISHABLE_KEY=${pk}`);
    out.push(`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=${pk}`);
    out.push("");
  }
  if (shouldEmit("chargily")) {
    out.push(`CHARGILY_API_KEY=${secrets.chargilyApiKey ?? genSecret()}`);
    out.push(`CHARGILY_SECRET_KEY=${secrets.chargilySecretKey ?? genSecret()}`);
    out.push("CHARGILY_MODE=test");
    out.push("");
  }
  if (shouldEmit("paddle")) {
    const clientToken = secrets.paddleClientToken ?? "pdl_ntf_" + genSecret().slice(0, 24);
    out.push(`PADDLE_API_KEY=${secrets.paddleApiKey ?? genSecret()}`);
    out.push(`PADDLE_WEBHOOK_SECRET=${secrets.paddleWebhookSecret ?? genSecret()}`);
    out.push("PADDLE_ENVIRONMENT=sandbox");
    out.push(`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=${clientToken}`);
    out.push("NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox");
    out.push(`VITE_PADDLE_CLIENT_TOKEN=${clientToken}`);
    out.push("VITE_PADDLE_ENVIRONMENT=sandbox");
    out.push(`EXPO_PUBLIC_PADDLE_CLIENT_TOKEN=${clientToken}`);
    out.push("EXPO_PUBLIC_PADDLE_ENVIRONMENT=sandbox");
    out.push("");
  }
  if (shouldEmit("polar")) {
    out.push(`POLAR_ACCESS_TOKEN=${secrets.polarAccessToken ?? genSecret()}`);
    out.push(`POLAR_WEBHOOK_SECRET=${secrets.polarWebhookSecret ?? genSecret()}`);
    out.push(`POLAR_ORG_ID=${secrets.polarOrgId ?? genSecret()}`);
    out.push("POLAR_ENVIRONMENT=sandbox");
    out.push("");
  }
  return out;
}

export function billingEnvLocalLinesFiltered(
  secrets: RootSecrets,
  selected: BillingProviderName[],
): string[] {
  if (selected.length === 0) return ["# Billing: none selected — no billing env vars"];
  const out: string[] = [];
  const has = (n: BillingProviderName) => selected.includes(n);
  if (has("stripe")) {
    const pk2 = secrets.stripePublishableKey ?? "pk_test_" + genSecret().slice(0, 32);
    out.push(`STRIPE_SECRET_KEY=${secrets.stripeSecretKey ?? genSecret()}`);
    out.push(`STRIPE_WEBHOOK_SECRET=${secrets.stripeWebhookSecret ?? genSecret()}`);
    out.push(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${pk2}`);
    out.push(`VITE_STRIPE_PUBLISHABLE_KEY=${pk2}`);
    out.push(`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=${pk2}`);
    out.push("");
  }
  if (has("chargily")) {
    out.push(`CHARGILY_API_KEY=${secrets.chargilyApiKey ?? genSecret()}`);
    out.push(`CHARGILY_SECRET_KEY=${secrets.chargilySecretKey ?? genSecret()}`);
    out.push("CHARGILY_MODE=test");
    out.push("");
  }
  if (has("paddle")) {
    const ct = secrets.paddleClientToken ?? "pdl_ntf_" + genSecret().slice(0, 24);
    out.push(`PADDLE_API_KEY=${secrets.paddleApiKey ?? genSecret()}`);
    out.push(`PADDLE_WEBHOOK_SECRET=${secrets.paddleWebhookSecret ?? genSecret()}`);
    out.push("PADDLE_ENVIRONMENT=sandbox");
    out.push(`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=${ct}`);
    out.push("NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox");
    out.push(`VITE_PADDLE_CLIENT_TOKEN=${ct}`);
    out.push("VITE_PADDLE_ENVIRONMENT=sandbox");
    out.push(`EXPO_PUBLIC_PADDLE_CLIENT_TOKEN=${ct}`);
    out.push("EXPO_PUBLIC_PADDLE_ENVIRONMENT=sandbox");
    out.push("");
  }
  if (has("polar")) {
    out.push(`POLAR_ACCESS_TOKEN=${secrets.polarAccessToken ?? genSecret()}`);
    out.push(`POLAR_WEBHOOK_SECRET=${secrets.polarWebhookSecret ?? genSecret()}`);
    out.push(`POLAR_ORG_ID=${secrets.polarOrgId ?? genSecret()}`);
    out.push("POLAR_ENVIRONMENT=sandbox");
    out.push("");
  }
  return out;
}
