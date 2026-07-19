/**
 * Paddle checkout via transactions.create.
 */
import type { CreateCheckoutInput, CreateCheckoutOutput } from "../interface.js";
import { getPaddleClient, type PaddleConfig } from "./client.js";
import { genId } from "./mappers.js";

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
  } = {
    items: [{ priceId: input.priceId, quantity }],
    collectionMode: "automatic",
    customData: {
      userId: input.userId,
      successUrl: input.successUrl,
      failureUrl: input.failureUrl ?? input.cancelUrl ?? input.successUrl,
      cancelUrl: input.cancelUrl ?? input.successUrl,
      ...(input.metadata as Record<string, unknown>),
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
      const createdId = (customer as { id?: string }).id;
      if (createdId) basePayload.customerId = createdId;
    } catch {
      try {
        const collection = paddle.customers.list({ email: input.customerEmail } as never);
        const hasAsyncIterator =
          typeof (collection as unknown as { [Symbol.asyncIterator]?: unknown })[
            Symbol.asyncIterator
          ] === "function";
        if (hasAsyncIterator) {
          for await (const c of collection as AsyncIterable<{ id: string }>) {
            if ((c as { id: string }).id) {
              basePayload.customerId = (c as { id: string }).id;
              break;
            }
          }
        } else {
          const col = collection as unknown as {
            next: () => Promise<{ id: string }[]>;
            hasMore: boolean;
          };
          const page = await col.next();
          if (page[0]?.id) basePayload.customerId = page[0].id;
        }
      } catch {}
    }
  }

  const transaction = await paddle.transactions.create(basePayload as never);
  const t = transaction as { id: string; checkout?: { url?: string | null } };
  const checkoutUrl = t.checkout?.url;
  const txId = t.id ?? genId("txn");

  if (!checkoutUrl) {
    throw new Error(
      `Paddle transaction ${txId} created but checkout?.url missing. Tx: ${JSON.stringify(transaction).slice(0, 600)}`,
    );
  }

  return { id: txId, url: checkoutUrl, providerCheckoutId: txId };
}
