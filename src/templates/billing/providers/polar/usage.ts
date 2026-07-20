/**
 * Polar metering events.ingest — server-side secure.
 * Context7 polar-sh/sdk 0.48.1 — events.ingest = event-based access / metering
 * Required: name, organizationId, externalCustomerId, externalId
 * idempotency key via externalId dedupes repeated ingest calls
 */
import type { IngestUsageEventInput, IngestUsageEventOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";

export async function ingestPolarUsageEvent(
  config: Record<string, unknown> | undefined,
  input: IngestUsageEventInput,
): Promise<IngestUsageEventOutput> {
  if (!input.name || !input.organizationId || !input.externalCustomerId || !input.externalId)
    throw new Error(
      "INVALID_INPUT: name, organizationId, externalCustomerId, externalId required for Polar metering events.ingest — see Polar metering docs, idempotency via externalId",
    );

  const { client, accessToken } = await getPolarClientAsync(config);
  if (!client || !accessToken) return { id: input.externalId };

  try {
    const credits = input.credits ?? 1;
    const idempotencyKey = input.externalId;
    const metadata = { credits, idempotencyKey, ...(input.metadata as Record<string, unknown>) };
    const eventPayload: Record<string, unknown> = {
      name: input.name,
      organizationId: input.organizationId,
      externalCustomerId: input.externalCustomerId,
      externalId: input.externalId,
      metadata,
    };
    if (input.subscriptionId)
      (eventPayload.metadata as Record<string, unknown>).subscriptionId = input.subscriptionId;
    // idempotency: Polar dedupes by externalId + name combination
    await client.events.ingest({ events: [eventPayload] });
    return { id: input.externalId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POLAR_INGEST_EVENT_FAILED: ${msg} — ensure externalId idempotency key unique`);
  }
}
