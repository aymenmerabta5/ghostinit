/**
 * Paddle webhook verification — raw body string + paddle-signature.
 */
import type { VerifyWebhookInput, VerifyWebhookOutput, BillingEvent } from "../interface.js";
import { getPaddleClient, getEnv, type PaddleConfig } from "./client.js";
import { genId } from "./mappers.js";

export async function verifyPaddleWebhook(
  paddleConfig: PaddleConfig,
  input: VerifyWebhookInput,
): Promise<VerifyWebhookOutput> {
  const rawBodyString = input.rawBody.toString("utf-8");
  const signature = input.signature;
  const secret = paddleConfig.webhookSecret ?? getEnv("PADDLE_WEBHOOK_SECRET") ?? "";

  if (!secret || secret.startsWith("REPLACE_WITH"))
    return { valid: false, error: "PADDLE_WEBHOOK_SECRET not configured or placeholder" };
  if (!signature) return { valid: false, error: "Missing paddle-signature header" };

  try {
    const paddle = await getPaddleClient(paddleConfig);
    const event = await paddle.webhooks.unmarshal(rawBodyString, secret, signature);
    const ev = event as unknown as {
      eventType?: string;
      eventId?: string;
      id?: string;
      data?: unknown;
    };
    const eventType = ev.eventType ?? "unknown";
    const eventId = ev.eventId ?? ev.id ?? genId("evt");
    const payload = ev.data ?? event;

    const billingEvent: BillingEvent = {
      id: genId("we"),
      provider: "paddle",
      providerEventId: eventId,
      type: eventType,
      payload: payload as Record<string, unknown>,
      processed: false,
      createdAt: new Date(),
    };

    return { valid: true, event: billingEvent };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.toLowerCase().includes("signature") ||
      msg.toLowerCase().includes("verification failed")
    ) {
      return { valid: false, error: `Paddle webhook signature verification failed: ${msg}` };
    }
    return { valid: false, error: `Paddle webhook unmarshal failed: ${msg}` };
  }
}
