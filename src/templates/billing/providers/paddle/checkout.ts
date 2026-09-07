/**
 * Paddle checkout via transactions.create.
 */
import type { CreateCheckoutInput, CreateCheckoutOutput } from "../interface.js";
import { getPaddleClient, type PaddleConfig } from "./client.js";
import { requirePaddleResponseString } from "./mappers.js";

function checkoutPageUrl(config: PaddleConfig): URL {
  if (!config.appUrl) throw new Error("Paddle checkout requires the configured application origin");
  const origin = new URL(config.appUrl);
  const localHttp =
    origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (origin.protocol !== "https:" && !localHttp) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new Error(
      "Paddle application origin must be HTTPS or loopback HTTP without credentials or a path",
    );
  }
  return new URL("/billing/paddle-checkout", origin);
}

function clientCheckoutUrl(
  config: PaddleConfig,
  input: CreateCheckoutInput,
  id: string,
  reportedUrl: string,
): string {
  const url = checkoutPageUrl(config);
  const reported = new URL(reportedUrl);
  if (
    reported.origin !== url.origin ||
    reported.pathname !== url.pathname ||
    id.length !== 30 ||
    !/^txn_[a-z0-9]{26}$/.test(id)
  ) {
    throw new Error("Paddle checkout response does not match the configured payment page");
  }
  url.searchParams.set("_ptxn", id);
  url.searchParams.set("successUrl", input.successUrl);
  url.searchParams.set(
    "cancelUrl",
    input.cancelUrl ?? input.failureUrl ?? new URL("/billing/cancel", url).toString(),
  );
  return url.toString();
}

export async function createPaddleCheckout(
  paddleConfig: PaddleConfig,
  input: CreateCheckoutInput,
): Promise<CreateCheckoutOutput> {
  if (!input.priceId) throw new Error("Paddle createCheckout: priceId (pri_...) is required");
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const paddle = await getPaddleClient(paddleConfig);

  const basePayload: {
    items: { priceId: string; quantity: number }[];
    customerId?: string;
    collectionMode: "automatic" | "manual";
    customData?: Record<string, unknown>;
    checkout: { url: string };
  } = {
    items: [{ priceId: input.priceId, quantity }],
    collectionMode: "automatic",
    checkout: { url: checkoutPageUrl(paddleConfig).toString() },
    customData: {
      userId: input.userId,
      requestKey: input.requestKey,
      successUrl: input.successUrl,
      failureUrl: input.failureUrl ?? input.cancelUrl ?? input.successUrl,
      cancelUrl: input.cancelUrl ?? input.successUrl,
      ...input.metadata,
    },
  };

  if (input.customerId) {
    basePayload.customerId = input.customerId;
  } else if (input.customerEmail) {
    try {
      const customer = await paddle.customers.create({
        email: input.customerEmail,
        name: input.customerEmail.split("@")[0],
      });
      if (customer.id) basePayload.customerId = customer.id;
    } catch {
      try {
        const collection = paddle.customers.list({ email: [input.customerEmail] });
        for await (const customer of collection) {
          if (customer.id) {
            basePayload.customerId = customer.id;
            break;
          }
        }
      } catch {}
    }
  }

  if (input.requestKey) {
    // Paddle's SDK does not accept an idempotency key for transaction
    // creation. A retry must reconcile the provider transaction first.
    const existingTransactions = paddle.transactions.list({
      ...(basePayload.customerId ? { customerId: [basePayload.customerId] } : {}),
      perPage: 100,
    });
    for await (const candidate of existingTransactions) {
      if (
        candidate.customData?.userId !== input.userId ||
        candidate.customData?.requestKey !== input.requestKey
      ) {
        continue;
      }
      if (!candidate.checkout?.url) {
        throw new Error("PADDLE_RECONCILIATION_NO_URL: existing transaction checkout url missing");
      }
      return {
        id: candidate.id,
        url: clientCheckoutUrl(paddleConfig, input, candidate.id, candidate.checkout.url),
        providerCheckoutId: candidate.id,
      };
    }
  }

  const transaction = await paddle.transactions.create(basePayload);
  const txId = requirePaddleResponseString(transaction.id, "create checkout", "transaction.id");
  const checkoutUrl = requirePaddleResponseString(
    transaction.checkout?.url,
    "create checkout",
    "transaction.checkout.url",
  );

  return {
    id: txId,
    url: clientCheckoutUrl(paddleConfig, input, txId, checkoutUrl),
    providerCheckoutId: txId,
  };
}
