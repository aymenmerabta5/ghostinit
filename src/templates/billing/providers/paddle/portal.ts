/**
 * Paddle customer portal sessions.
 */
import type { CreatePortalSessionInput, CreatePortalSessionOutput } from "../interface.js";
import { getPaddleClient, type PaddleConfig } from "./client.js";
import { requirePaddleResponseString } from "./mappers.js";

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
      customerId: [input.customerId],
      perPage: 10,
    });
    let pages = 0;
    while (pages < 5 && subscriptionIds.length < 20) {
      const page = await collection.next();
      for (const subscription of page) {
        if (subscription.id) subscriptionIds.push(subscription.id);
        if (subscriptionIds.length >= 20) break;
      }
      if (!collection.hasMore) break;
      pages++;
    }
  } catch (e) {
    throw new Error(
      `Paddle list subscriptions for portal failed for ${input.customerId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const session = await paddle.customerPortalSessions.create(input.customerId, subscriptionIds);
  const url = requirePaddleResponseString(
    session.urls?.general?.overview,
    "create portal session",
    "urls.general.overview",
  );
  return { url };
}
