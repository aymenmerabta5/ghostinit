/**
 * Polar client resolution — sync + async.
 */
import type { PolarSdkConstructor } from "./types.js";
import { loadPolarSdk, getPolarCtor } from "./sdk-loader.js";

export function getPolarClient(config?: Record<string, unknown>) {
  const accessToken =
    (config?.accessToken as string | undefined) ??
    (config?.POLAR_ACCESS_TOKEN as string | undefined) ??
    process.env.POLAR_ACCESS_TOKEN ??
    process.env.POLAR_ORG_ACCESS_TOKEN ??
    "";
  const orgId =
    (config?.organizationId as string | undefined) ??
    (config?.POLAR_ORG_ID as string | undefined) ??
    process.env.POLAR_ORG_ID ??
    process.env.POLAR_ORGANIZATION_ID;
  const webhookSecret =
    (config?.webhookSecret as string | undefined) ??
    (config?.POLAR_WEBHOOK_SECRET as string | undefined) ??
    process.env.POLAR_WEBHOOK_SECRET;
  const environment =
    (config?.environment as string | undefined) ??
    (config?.POLAR_ENVIRONMENT as string | undefined) ??
    process.env.POLAR_ENVIRONMENT ??
    "sandbox";

  if (!accessToken) return { client: null, accessToken, orgId, webhookSecret, environment };

  const ctor = getPolarCtor();
  if (ctor) {
    try {
      const client = new ctor({
        accessToken,
        server: environment === "production" ? "production" : "sandbox",
      });
      return {
        client: client as InstanceType<PolarSdkConstructor>,
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
  if (!sdk) {
    return {
      client: null,
      polar: null,
      accessToken: base.accessToken,
      orgId: base.orgId,
      webhookSecret: base.webhookSecret,
      environment: base.environment,
    };
  }
  const ctor = getPolarCtor();
  if (ctor && base.accessToken) {
    try {
      const client = new ctor({
        accessToken: base.accessToken,
        server: base.environment === "production" ? "production" : "sandbox",
      });
      return {
        client: client as InstanceType<PolarSdkConstructor>,
        polar: sdk,
        accessToken: base.accessToken,
        orgId: base.orgId,
        webhookSecret: base.webhookSecret,
        environment: base.environment,
      };
    } catch {
      return {
        client: null,
        polar: sdk,
        accessToken: base.accessToken,
        orgId: base.orgId,
        webhookSecret: base.webhookSecret,
        environment: base.environment,
      };
    }
  }
  return {
    client: null,
    polar: sdk,
    accessToken: base.accessToken,
    orgId: base.orgId,
    webhookSecret: base.webhookSecret,
    environment: base.environment,
  };
}
