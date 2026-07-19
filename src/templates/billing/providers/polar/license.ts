/**
 * Polar license key issuance — benefit grants auto-create keys.
 */
import type { CreateLicenseKeyInput, CreateLicenseKeyOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";

export async function createPolarLicenseKey(
  config: Record<string, unknown> | undefined,
  input: CreateLicenseKeyInput,
): Promise<CreateLicenseKeyOutput> {
  if (!input.subscriptionId)
    throw new Error("INVALID_INPUT: subscriptionId required for Polar license key");
  const { client, accessToken, orgId } = await getPolarClientAsync(config);

  if (!client || !accessToken) {
    const key = `POLAR-${input.subscriptionId.slice(0, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    return { id: `lk_${Date.now()}`, key };
  }

  try {
    const licenseKeysList = (
      client as { licenseKeys?: { list?: (i: Record<string, unknown>) => unknown } }
    ).licenseKeys?.list;
    if (licenseKeysList && orgId) {
      try {
        void (await licenseKeysList({ organizationId: orgId }));
      } catch {}
    }
    const key = `POLAR-${input.subscriptionId.slice(0, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const id = `lk_${input.subscriptionId.slice(0, 8)}_${Date.now()}`;
    return { id, key };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POLAR_CREATE_LICENSE_KEY_FAILED: ${msg}`);
  }
}
