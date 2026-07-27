import type { RootSecrets } from "../../root.js";
import type { BillingProviderName } from "../../../lib/addons.js";
import { ENV_PLACEHOLDERS } from "../../../lib/constants.js";
import { type EnvAudience, publicVarLines } from "./core.js";

const DEFAULT_AUDIENCE: EnvAudience = { framework: "nextjs", hasMobile: false };

function billingPublicVarLines(audience: EnvAudience, name: string, value: string): string[] {
  return publicVarLines(audience, name, value);
}

export function billingEnvLines(
  selected: BillingProviderName[],
  audience: EnvAudience = DEFAULT_AUDIENCE,
): string[] {
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
    out.push(
      ...billingPublicVarLines(
        audience,
        "STRIPE_PUBLISHABLE_KEY",
        ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE,
      ),
    );
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
    out.push(
      ...billingPublicVarLines(
        audience,
        "PADDLE_CLIENT_TOKEN",
        ENV_PLACEHOLDERS.PADDLE_CLIENT_TOKEN,
      ),
    );
    out.push(...billingPublicVarLines(audience, "PADDLE_ENVIRONMENT", "sandbox"));
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

/**
 * Local-dev lines for a single billing provider.
 *
 * Billing credentials are issued BY the provider — they cannot be invented.
 * Emitting `genSecret()` here produced a value that looks configured but is
 * not: it defeats the `secret.startsWith("REPLACE_WITH")` guard every webhook
 * route uses to detect an unconfigured provider, turning a clear
 * 400 "not configured" into an opaque 403 signature failure (and the Stripe SDK
 * throws outright on a key without an `sk_` prefix). So .env.local carries the
 * same REPLACE_WITH_* placeholders as .env.example unless a real value was
 * supplied. Self-issued secrets (auth secret, postgres password) still use
 * genSecret() — those we legitimately mint.
 */
function providerLocalLines(
  secrets: RootSecrets,
  provider: BillingProviderName,
  audience: EnvAudience = DEFAULT_AUDIENCE,
): string[] {
  switch (provider) {
    case "stripe": {
      const pk = secrets.stripePublishableKey ?? ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE;
      return [
        `STRIPE_SECRET_KEY=${secrets.stripeSecretKey ?? ENV_PLACEHOLDERS.STRIPE_SECRET_KEY}`,
        `STRIPE_WEBHOOK_SECRET=${secrets.stripeWebhookSecret ?? ENV_PLACEHOLDERS.STRIPE_WEBHOOK_SECRET}`,
        ...billingPublicVarLines(audience, "STRIPE_PUBLISHABLE_KEY", pk),
        "",
      ];
    }
    case "chargily":
      return [
        `CHARGILY_API_KEY=${secrets.chargilyApiKey ?? ENV_PLACEHOLDERS.CHARGILY_API_KEY}`,
        `CHARGILY_SECRET_KEY=${secrets.chargilySecretKey ?? ENV_PLACEHOLDERS.CHARGILY_SECRET}`,
        "CHARGILY_MODE=test",
        "",
      ];
    case "paddle": {
      const ct = secrets.paddleClientToken ?? ENV_PLACEHOLDERS.PADDLE_CLIENT_TOKEN;
      return [
        `PADDLE_API_KEY=${secrets.paddleApiKey ?? ENV_PLACEHOLDERS.PADDLE_API_KEY}`,
        `PADDLE_WEBHOOK_SECRET=${secrets.paddleWebhookSecret ?? ENV_PLACEHOLDERS.PADDLE_WEBHOOK_SECRET}`,
        "PADDLE_ENVIRONMENT=sandbox",
        ...billingPublicVarLines(audience, "PADDLE_CLIENT_TOKEN", ct),
        ...billingPublicVarLines(audience, "PADDLE_ENVIRONMENT", "sandbox"),
        "",
      ];
    }
    case "polar":
      return [
        `POLAR_ACCESS_TOKEN=${secrets.polarAccessToken ?? ENV_PLACEHOLDERS.POLAR_ACCESS_TOKEN}`,
        `POLAR_WEBHOOK_SECRET=${secrets.polarWebhookSecret ?? ENV_PLACEHOLDERS.POLAR_WEBHOOK_SECRET}`,
        `POLAR_ORG_ID=${secrets.polarOrgId ?? ENV_PLACEHOLDERS.POLAR_ORG_ID}`,
        "POLAR_ENVIRONMENT=sandbox",
        "",
      ];
    default:
      return [];
  }
}

const LOCAL_PROVIDER_ORDER: BillingProviderName[] = ["stripe", "chargily", "paddle", "polar"];

/**
 * .env.local billing lines. With no provider selected this emits every provider
 * (commented guidance lives in .env.example) — kept for backwards compatibility;
 * prefer billingEnvLocalLinesFiltered which emits only what was selected.
 */
export function billingEnvLocalLines(
  secrets: RootSecrets,
  selected: BillingProviderName[],
  audience: EnvAudience = DEFAULT_AUDIENCE,
): string[] {
  const emitAll = selected.length === 0;
  const out: string[] = [];
  for (const provider of LOCAL_PROVIDER_ORDER) {
    if (emitAll || selected.includes(provider))
      out.push(...providerLocalLines(secrets, provider, audience));
  }
  return out;
}

export function billingEnvLocalLinesFiltered(
  secrets: RootSecrets,
  selected: BillingProviderName[],
  audience: EnvAudience = DEFAULT_AUDIENCE,
): string[] {
  if (selected.length === 0) return ["# Billing: none selected — no billing env vars"];
  const out: string[] = [];
  for (const provider of LOCAL_PROVIDER_ORDER) {
    if (selected.includes(provider)) out.push(...providerLocalLines(secrets, provider, audience));
  }
  return out;
}
