/**
 * Polar metering events.ingest — server-side secure.
 */
import type { IngestUsageEventInput, IngestUsageEventOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";

export async function ingestPolarUsageEvent(
  config: Record<string, unknown> | undefined,
  input: IngestUsageEventInput,
): Promise<IngestUsageEventOutput> {
  if (!input.name || !input.organizationId || !input.externalCustomerId || !input.externalId)
    throw new Error(
      "INVALID_INPUT: name, organizationId, externalCustomerId, externalId required for Polar metering events.ingest",
    );

  const { client, accessToken } = await getPolarClientAsync(config);
  if (!client || !accessToken) return { id: input.externalId };

  try {
    const credits = input.credits ?? 1;
    const metadata = { credits, ...(input.metadata as Record<string, unknown>) };
    const eventPayload: Record<string, unknown> = {
      name: input.name,
      organizationId: input.organizationId,
      externalCustomerId: input.externalCustomerId,
      externalId: input.externalId,
      metadata,
    };
    if (input.subscriptionId)
      (eventPayload.metadata as Record<string, unknown>).subscriptionId = input.subscriptionId;
    await client.events.ingest({ events: [eventPayload] });
    return { id: input.externalId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POLAR_INGEST_EVENT_FAILED: ${msg}`);
  }
}
