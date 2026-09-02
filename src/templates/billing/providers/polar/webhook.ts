/**
 * Polar webhook verification — Buffer + headers validation.
 */
import type { VerifyWebhookInput, VerifyWebhookOutput, BillingEvent } from "../interface.js";
import { getPolarClientAsync } from "./client.js";
import { createHash } from "node:crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") return null;
    result[key] = entry;
  }
  return result;
}

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
    return {
      valid: false,
      error: "POLAR_WEBHOOK_VERIFIER_UNAVAILABLE: signature validation could not be loaded",
    };
  }

  try {
    let headers: Record<string, string>;
    const suppliedHeaders = toStringRecord(input.headers);
    if (suppliedHeaders) {
      headers = Object.fromEntries(
        Object.entries(suppliedHeaders).map(([key, value]) => [key.toLowerCase(), value]),
      );
    } else {
      try {
        const parsedSignature: unknown = JSON.parse(signature);
        headers = toStringRecord(parsedSignature) ?? { "webhook-signature": signature };
      } catch {
        headers = { "webhook-signature": signature };
      }
    }

    const parsed = polar.validateEvent(rawBody, headers, webhookSecret);
    if (!isRecord(parsed)) {
      return { valid: false, error: "POLAR_WEBHOOK_VERIFY_FAILED: invalid event payload" };
    }
    const type = typeof parsed.type === "string" ? parsed.type : "unknown";
    const providerEventId =
      typeof parsed.id === "string" && parsed.id.trim()
        ? parsed.id
        : `body_sha256:${createHash("sha256").update(rawBody).digest("hex")}`;

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
    if (error instanceof polar.WebhookVerificationError) {
      return {
        valid: false,
        error: "POLAR_WEBHOOK_SIGNATURE_INVALID",
      };
    }
    return { valid: false, error: "POLAR_WEBHOOK_VERIFY_FAILED" };
  }
}
