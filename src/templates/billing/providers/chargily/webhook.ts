/**
 * Chargily webhook verification.
 */
import { verifySignature } from "@chargily/chargily-pay";
import { createHash } from "node:crypto";
import { ensureServerOnly, resolveChargilyConfig, type ChargilyProviderConfig } from "./client.js";
import type { VerifyWebhookInput, VerifyWebhookOutput, BillingEvent } from "../interface.js";

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chargilyDeliveryId(payload: Record<string, unknown>, rawBody: Buffer): string {
  // Chargily's documented event envelope uses the top-level id. data.id is the
  // checkout resource and must not be used to deduplicate separate deliveries.
  return (
    nonEmptyString(payload.id) ??
    nonEmptyString(payload.event_id) ??
    `body_sha256:${createHash("sha256").update(rawBody).digest("hex")}`
  );
}

export async function verifyChargilyWebhook(
  input: VerifyWebhookInput,
  config?: ChargilyProviderConfig | Record<string, unknown>,
): Promise<VerifyWebhookOutput> {
  ensureServerOnly();
  const rawBody = input.rawBody;
  const signature = input.signature;

  if (!signature)
    return { valid: false, error: "Missing signature header 'signature' — return 400" };
  if (!rawBody || !(rawBody instanceof Buffer)) {
    return {
      valid: false,
      error: "Missing rawBody Buffer — use Buffer.from(await req.arrayBuffer()) NOT req.json()",
    };
  }

  const { secretKey } = resolveChargilyConfig(config);
  if (!secretKey || secretKey.startsWith("REPLACE_WITH")) {
    return { valid: false, error: "CHARGILY_SECRET_KEY missing — set in .env.local server-only" };
  }

  let isValid = false;
  try {
    isValid = verifySignature(rawBody, signature, secretKey);
  } catch {
    // Deliberately generic: this result is surfaced at an unauthenticated webhook
    // boundary, so the underlying verifier message must not travel back to the caller.
    return { valid: false, error: "Invalid signature" };
  }

  if (!isValid) return { valid: false, error: "Invalid signature 403" };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    return { valid: false, error: "Invalid JSON payload — return 400" };
  }

  if (!isRecord(payload)) return { valid: false, error: "Invalid webhook payload — return 400" };

  const p = payload;
  const data = isRecord(p.data) ? p.data : isRecord(p.checkout) ? p.checkout : p;
  const eventId = chargilyDeliveryId(p, rawBody);
  const eventType =
    nonEmptyString(p.type) ??
    nonEmptyString(p.event) ??
    `checkout.${nonEmptyString(data.status) ?? nonEmptyString(p.status) ?? "updated"}`;

  const billingEvent: BillingEvent = {
    id: eventId,
    provider: "chargily",
    providerEventId: eventId,
    type: eventType,
    payload,
    processed: false,
    createdAt: new Date(),
  };

  return { valid: true, event: billingEvent };
}
