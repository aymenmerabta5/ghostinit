/**
 * Polar license key issuance — benefit grants auto-create keys.
 */
import type { CreateLicenseKeyInput, CreateLicenseKeyOutput } from "../interface.js";
import { PolarProviderError } from "./types.js";

export async function createPolarLicenseKey(
  config: Record<string, unknown> | undefined,
  input: CreateLicenseKeyInput,
): Promise<CreateLicenseKeyOutput> {
  if (!input.subscriptionId)
    throw new Error("INVALID_INPUT: subscriptionId required for Polar license key");
  void config;
  throw new PolarProviderError(
    "NOT_SUPPORTED",
    "create license key",
    "Polar creates license keys through configured benefit grants and exposes no manual issuance API",
  );
}
