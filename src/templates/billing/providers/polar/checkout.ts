/**
 * Polar checkout creation.
 */
import type { CreateCheckoutInput, CreateCheckoutOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";
import { polarProductIdsOrIds } from "./mappers.js";

export async function createPolarCheckout(
  config: Record<string, unknown> | undefined,
  input: CreateCheckoutInput,
): Promise<CreateCheckoutOutput> {
  if (!input.userId || !input.priceId || !input.successUrl)
    throw new Error("INVALID_INPUT: userId, priceId, successUrl required for Polar checkout");

  const { client, accessToken, environment } = await getPolarClientAsync(config);
  const products = polarProductIdsOrIds(input);

  if (!client || !accessToken) {
    const id = `po_chk_${input.userId.slice(0, 8)}_${Date.now()}`;
    const url = `https://${environment === "production" ? "polar.sh" : "sandbox.polar.sh"}/checkout/${id}`;
    return { id, url, providerCheckoutId: id };
  }

  const locale = input.locale ?? "en";
  const customerName = (input.metadata?.customerName as string | undefined) ?? undefined;
  const customerEmail =
    input.customerEmail ?? (input.metadata?.customerEmail as string | undefined);
  const billingCountry =
    (input.metadata?.billingCountry as string | undefined) ??
    (input.metadata?.country as string | undefined) ??
    "US";
  const metadata = input.metadata
    ? Object.fromEntries(Object.entries(input.metadata).map(([k, v]) => [k, String(v)]))
    : undefined;

  try {
    const payload: Record<string, unknown> = {
      products,
      locale,
      successUrl: input.successUrl,
      returnUrl: input.failureUrl ?? input.cancelUrl,
      customerEmail,
      metadata,
    };
    if (customerName) payload.customerName = customerName;
    payload.customerBillingAddress = { country: billingCountry || "US" };
    if (input.customerId) payload.customerId = input.customerId;
    if (input.quantity && input.quantity > 1) payload.seats = input.quantity;

    const result = (await client.checkouts.create(payload)) as {
      id: string;
      url: string;
      checkout_id?: string;
    };
    const id = (result.id as string) ?? (result.checkout_id as string) ?? `po_${Date.now()}`;
    const url =
      (result.url as string) ??
      `https://${environment === "production" ? "polar.sh" : "sandbox.polar.sh"}/checkout/${id}`;
    return { id, url, providerCheckoutId: id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POLAR_CHECKOUT_FAILED: ${msg}`);
  }
}
