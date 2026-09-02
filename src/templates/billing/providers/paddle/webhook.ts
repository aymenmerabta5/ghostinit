/**
 * Paddle webhook verification — raw body string + paddle-signature.
 */
import type { VerifyWebhookInput, VerifyWebhookOutput, BillingEvent } from "../interface.js";
import { getPaddleClient, getEnv, type PaddleConfig } from "./client.js";
import { createHash } from "node:crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
    if (!isRecord(event)) {
      return { valid: false, error: "Paddle webhook unmarshal returned an invalid event" };
    }
    const eventType = typeof event.eventType === "string" ? event.eventType : "unknown";
    const eventId =
      typeof event.eventId === "string" && event.eventId.trim()
        ? event.eventId
        : `body_sha256:${createHash("sha256").update(input.rawBody).digest("hex")}`;
    const payload = event.data ?? event;

    const billingEvent: BillingEvent = {
      id: eventId,
      provider: "paddle",
      providerEventId: eventId,
      type: eventType,
      payload,
      processed: false,
      createdAt: new Date(),
    };

    return { valid: true, event: billingEvent };
  } catch {
    return { valid: false, error: "Paddle webhook verification failed" };
  }
}
