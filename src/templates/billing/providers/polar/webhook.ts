/**
 * Polar webhook verification — Buffer + headers validation.
 */
import type { VerifyWebhookInput, VerifyWebhookOutput, BillingEvent } from "../interface.js";
import { getPolarClientAsync } from "./client.js";

export async function verifyPolarWebhook(
  config: Record<string, unknown> | undefined,
  input: VerifyWebhookInput,
): Promise<VerifyWebhookOutput> {
  if (!input.rawBody || !Buffer.isBuffer(input.rawBody)) {
    return {
      valid: false,
      error:
        "INVALID_INPUT: rawBody Buffer required. Use Buffer.from(await req.arrayBuffer()) NOT req.json()",
    };
  }

  const { polar, webhookSecret } = await getPolarClientAsync(config);
  const signature = input.signature ?? "";

  if (!webhookSecret || !signature) {
    if (!webhookSecret)
      return {
        valid: false,
        error: "POLAR_WEBHOOK_SECRET not configured — set env var server-only",
      };
    return { valid: false, error: "Missing webhook signature header" };
  }

  const rawBody = input.rawBody;

  if (!polar) {
    try {
      const parsed = JSON.parse(rawBody.toString("utf-8")) as Record<string, unknown>;
      const eventId =
        (parsed.id as string) ??
        (parsed.data as { id?: string } | undefined)?.id ??
        `evt_${Date.now()}`;
      const type = (parsed.type as string) ?? "unknown";
      const event: BillingEvent = {
        id: `wh_${eventId}`,
        provider: "polar",
        providerEventId: eventId,
        type,
        payload: parsed,
        processed: false,
        createdAt: new Date(),
      };
      return { valid: true, event };
    } catch {
      return { valid: false, error: "Invalid webhook payload — not valid JSON" };
    }
  }

  try {
    let headers: Record<string, string>;
    try {
      const parsedSig = JSON.parse(signature) as Record<string, string>;
      headers =
        parsedSig && typeof parsedSig === "object" ? parsedSig : { "webhook-signature": signature };
    } catch {
      headers = { "webhook-signature": signature };
    }

    const parsed = polar.validateEvent(
      rawBody as Buffer,
      headers,
      webhookSecret,
    ) as unknown as Record<string, unknown>;
    const type = (parsed.type as string) ?? "unknown";
    const innerData = (parsed.data as Record<string, unknown>) ?? parsed;
    const providerEventId =
      (parsed.id as string) ?? (innerData.id as string) ?? `evt_${Date.now()}`;

    const event: BillingEvent = {
      id: `wh_${providerEventId}`,
      provider: "polar",
      providerEventId,
      type,
      payload: parsed,
      processed: false,
      createdAt: new Date(),
    };
    return { valid: true, event };
  } catch (error) {
    if ((error as Error)?.name === "WebhookVerificationError") {
      return {
        valid: false,
        error: `POLAR_WEBHOOK_SIGNATURE_INVALID: ${(error as Error).message} — use Buffer.from(await req.arrayBuffer())`,
      };
    }
    const msg = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `POLAR_WEBHOOK_VERIFY_FAILED: ${msg}` };
  }
}
