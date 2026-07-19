/**
 * Chargily checkout creation — product->price->checkout.
 */
import { ensureServerOnly, getChargilyClient, type ChargilyProviderConfig } from "./client.js";
import type { CreateCheckoutInput, CreateCheckoutOutput } from "../interface.js";

export async function createChargilyCheckout(
  input: CreateCheckoutInput,
  config?: ChargilyProviderConfig | Record<string, unknown>,
): Promise<CreateCheckoutOutput> {
  ensureServerOnly();
  if (!input.priceId)
    throw new Error(
      "CHARGILY_MISSING_PRICE_ID: priceId required (Chargily price id from createPrice).",
    );
  if (!input.successUrl) throw new Error("CHARGILY_MISSING_SUCCESS_URL: successUrl required.");

  const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const paymentMethodRaw = (input.paymentMethod ?? "edahabia").toString().toLowerCase();
  const paymentMethod = paymentMethodRaw === "cib" ? "cib" : "edahabia";
  const locale = (() => {
    const l = (input.locale ?? "en").toString().toLowerCase();
    if (l === "ar" || l === "fr" || l === "en") return l as "ar" | "en" | "fr";
    return "en" as const;
  })();

  const successUrl = input.successUrl;
  const failureUrl =
    input.failureUrl ??
    input.cancelUrl ??
    successUrl + (successUrl.includes("?") ? "&status=canceled" : "?status=canceled");

  const c = getChargilyClient(config);

  const checkout = await c.createCheckout({
    items: [{ price: input.priceId, quantity }],
    success_url: successUrl,
    failure_url: failureUrl,
    payment_method: paymentMethod,
    locale,
    pass_fees_to_customer: input.passFeesToCustomer,
    collect_shipping_address: input.collectShippingAddress,
    customer_id: input.customerId,
    description: input.productId ? `Checkout for ${input.productId}` : undefined,
    metadata: {
      ...(input.metadata as Record<string, unknown>),
      userId: input.userId,
      priceId: input.priceId,
      productId: input.productId ?? undefined,
      provider: "chargily",
      payment_method: paymentMethod,
      chargily_user_id: input.userId,
      customerEmail: input.customerEmail ?? undefined,
      recurring: "manual_via_cron",
    } as Record<string, unknown>,
  } as never);

  const url =
    (checkout as unknown as { checkout_url?: string }).checkout_url ??
    (checkout as unknown as { url?: string }).url;
  if (!url)
    throw new Error(
      `CHARGILY_MISSING_CHECKOUT_URL: checkout_url missing. Response: ${JSON.stringify(checkout).slice(0, 900)}`,
    );

  return { id: checkout.id, url, providerCheckoutId: checkout.id };
}
