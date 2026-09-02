/**
 * Polar client resolution — sync + async.
 */
import { isConfiguredAccessToken, type PolarClient } from "./types.js";
import { loadPolarSdk, getPolarCtor } from "./sdk-loader.js";

function configString(
  config: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = config?.[key];
  return typeof value === "string" ? value : undefined;
}

export interface PolarClientResolution {
  client: PolarClient | null;
  accessToken: string;
  orgId: string | undefined;
  webhookSecret: string | undefined;
  environment: "production" | "sandbox";
}

export function getPolarClient(config?: Record<string, unknown>): PolarClientResolution {
  const accessToken =
    configString(config, "accessToken") ??
    configString(config, "POLAR_ACCESS_TOKEN") ??
    process.env.POLAR_ACCESS_TOKEN ??
    process.env.POLAR_ORG_ACCESS_TOKEN ??
    "";
  const orgId =
    configString(config, "organizationId") ??
    configString(config, "POLAR_ORG_ID") ??
    process.env.POLAR_ORG_ID ??
    process.env.POLAR_ORGANIZATION_ID;
  const webhookSecret =
    configString(config, "webhookSecret") ??
    configString(config, "POLAR_WEBHOOK_SECRET") ??
    process.env.POLAR_WEBHOOK_SECRET;
  const environmentValue =
    configString(config, "environment") ??
    configString(config, "POLAR_ENVIRONMENT") ??
    process.env.POLAR_ENVIRONMENT ??
    "sandbox";
  const environment = environmentValue === "production" ? "production" : "sandbox";

  if (!isConfiguredAccessToken(accessToken)) {
    return { client: null, accessToken, orgId, webhookSecret, environment };
  }

  const ctor = getPolarCtor();
  if (ctor) {
    try {
      const client = new ctor({
        accessToken,
        server: environment === "production" ? "production" : "sandbox",
      });
      return {
        client,
        accessToken,
        orgId,
        webhookSecret,
        environment,
      };
    } catch {
      return { client: null, accessToken, orgId, webhookSecret, environment };
    }
  }
  return { client: null, accessToken, orgId, webhookSecret, environment };
}

export async function getPolarClientAsync(config?: Record<string, unknown>) {
  const sdk = await loadPolarSdk();
  const base = getPolarClient(config);
  return {
    client: sdk ? base.client : null,
    polar: sdk,
    accessToken: base.accessToken,
    orgId: base.orgId,
    webhookSecret: base.webhookSecret,
    environment: base.environment,
  };
}
