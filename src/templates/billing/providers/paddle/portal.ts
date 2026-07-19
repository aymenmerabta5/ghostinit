/**
 * Paddle customer portal sessions.
 */
import type { CreatePortalSessionInput, CreatePortalSessionOutput } from "../interface.js";
import { getPaddleClient, type PaddleConfig } from "./client.js";

export async function createPaddlePortalSession(
  paddleConfig: PaddleConfig,
  input: CreatePortalSessionInput,
): Promise<CreatePortalSessionOutput> {
  if (!input.customerId)
    throw new Error("Paddle createPortalSession: customerId (ctm_...) required");
  const paddle = await getPaddleClient(paddleConfig);

  let subscriptionIds: string[] = [];
  try {
    const collection = paddle.subscriptions.list({
      customerId: input.customerId,
      perPage: 10,
    } as never);
    const hasAsyncIterator =
      typeof (collection as unknown as { [Symbol.asyncIterator]?: unknown })[
        Symbol.asyncIterator
      ] === "function";
    if (hasAsyncIterator) {
      for await (const sub of collection as AsyncIterable<{ id: string }>) {
        const sid = (sub as { id: string }).id;
        if (sid) subscriptionIds.push(sid);
        if (subscriptionIds.length >= 20) break;
      }
    } else {
      const col = collection as unknown as {
        next: () => Promise<{ id: string }[]>;
        hasMore: boolean;
      };
      let pages = 0;
      while (pages < 5) {
        const page = await col.next();
        for (const s of page) if (s.id) subscriptionIds.push(s.id);
        if (!col.hasMore) break;
        pages++;
      }
    }
  } catch (e) {
    throw new Error(
      `Paddle list subscriptions for portal failed for ${input.customerId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const session = await paddle.customerPortalSessions.create(input.customerId, subscriptionIds);
  const url =
    (session as { url?: string }).url ??
    (session as { urls?: { overview?: string } }).urls?.overview ??
    input.returnUrl;
  if (!url)
    throw new Error(
      `Paddle portal session for ${input.customerId} returned no url. Subs: ${subscriptionIds.length}`,
    );
  return { url };
}
