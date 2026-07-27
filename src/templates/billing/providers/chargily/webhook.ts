/**
 * Chargily webhook verification.
 */
// @ts-ignore - optional dep
import { verifySignature } from "@chargily/chargily-pay";
import { ensureServerOnly, resolveChargilyConfig, type ChargilyProviderConfig } from "./client.js";
import type { VerifyWebhookInput, VerifyWebhookOutput, BillingEvent } from "../interface.js";

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

  const p = payload as Record<string, unknown>;
  const data =
    (p.data as Record<string, unknown> | undefined) ??
    (p.checkout as Record<string, unknown> | undefined) ??
    p;
  const eventId =
    (p.id as string | undefined) ??
    (data.id as string | undefined) ??
    (p.event_id as string | undefined) ??
    "evt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const eventType =
    (p.type as string | undefined) ??
    (p.event as string | undefined) ??
    "checkout." +
      ((data.status as string | undefined) ?? (p.status as string | undefined) ?? "updated");

  const billingEvent: BillingEvent = {
    id: eventId,
    provider: "chargily",
    providerEventId: eventId,
    type: eventType,
    payload: payload as Record<string, unknown>,
    processed: false,
    createdAt: new Date(),
  };

  return { valid: true, event: billingEvent };
}
