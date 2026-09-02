/**
 * Polar metering events.ingest — server-side secure.
 * Polar SDK 0.49.0 — events.ingest = event-based access / metering
 * Trusted application workers supply an authenticated actor plus a durable local
 * usage record id. Merchant organization, customer identity, meter name, and
 * provider event id are resolved here; this API is never exposed to browsers.
 */
import { createHash } from "node:crypto";
import type { IngestUsageEventInput, IngestUsageEventOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";
import {
  PolarProviderError,
  isRecord,
  requirePolarCapability,
  requirePolarClient,
  wrapPolarFailure,
} from "./types.js";

export function requirePolarUsageAcknowledgement(response: unknown): void {
  if (
    !isRecord(response) ||
    !Number.isSafeInteger(response.inserted) ||
    (response.inserted as number) < 0 ||
    !Number.isSafeInteger(response.duplicates) ||
    (response.duplicates as number) < 0
  ) {
    throw new PolarProviderError(
      "INVALID_RESPONSE",
      "ingest usage event",
      "SDK response did not include non-negative integer inserted and duplicates counts",
    );
  }
  if ((response.inserted as number) + (response.duplicates as number) < 1) {
    throw new PolarProviderError(
      "INVALID_RESPONSE",
      "ingest usage event",
      "Polar acknowledged neither an inserted nor duplicate event",
    );
  }
}

export async function ingestPolarUsageEvent(
  config: Record<string, unknown> | undefined,
  input: IngestUsageEventInput,
): Promise<IngestUsageEventOutput> {
  if (!input.actorId)
    throw new Error("INVALID_INPUT: authenticated actorId required for Polar usage");
  if (!input.usageRecordId || input.usageRecordId.length > 200) {
    throw new Error("INVALID_INPUT: durable usageRecordId required for Polar usage");
  }
  if (!Number.isSafeInteger(input.credits) || input.credits < 1 || input.credits > 1_000_000) {
    throw new Error("INVALID_INPUT: server-derived credits must be an integer from 1 to 1000000");
  }

  const resolved = await getPolarClientAsync(config);
  const client = requirePolarClient(resolved.client, resolved.accessToken, "ingest usage event");
  const events = requirePolarCapability(client.events, "ingest usage event", "events");
  const ingest = requirePolarCapability(events.ingest, "ingest usage event", "events.ingest");

  try {
    const organizationId = resolved.orgId;
    if (!organizationId || organizationId.startsWith("REPLACE_WITH")) {
      throw new PolarProviderError(
        "NOT_CONFIGURED",
        "ingest usage event",
        "POLAR_ORG_ID is required for actor-bound usage metering",
      );
    }
    const credits = input.credits;
    const externalId = `usage_${createHash("sha256").update(`${input.actorId}\0${input.usageRecordId}`).digest("hex")}`;
    const metadata: Record<string, unknown> = {
      ...input.metadata,
      credits,
      actorId: input.actorId,
      userId: input.actorId,
      idempotencyKey: externalId,
    };
    const eventPayload: Record<string, unknown> = {
      name: "tokens_used",
      organizationId,
      externalCustomerId: input.actorId,
      externalId,
      metadata,
    };
    // Polar dedupes by externalId + name; the server owns both values.
    const response = await ingest.call(events, { events: [eventPayload] });
    requirePolarUsageAcknowledgement(response);
    return { id: externalId };
  } catch (error) {
    wrapPolarFailure("ingest usage event", error);
  }
}
