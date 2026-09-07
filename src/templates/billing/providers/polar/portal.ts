/**
 * Polar portal session.
 */
import type { CreatePortalSessionInput, CreatePortalSessionOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";
import {
  PolarProviderError,
  isRecord,
  requirePolarCapability,
  requirePolarClient,
  requirePolarResponseString,
  wrapPolarFailure,
} from "./types.js";

export async function createPolarPortalSession(
  config: Record<string, unknown> | undefined,
  input: CreatePortalSessionInput,
): Promise<CreatePortalSessionOutput> {
  if (!input.customerId || !input.returnUrl)
    throw new Error("INVALID_INPUT: customerId, returnUrl required for Polar portal");

  const resolved = await getPolarClientAsync(config);
  const client = requirePolarClient(resolved.client, resolved.accessToken, "create portal session");
  const customerSessions = requirePolarCapability(
    client.customerSessions,
    "create portal session",
    "customerSessions",
  );
  const createSession = requirePolarCapability(
    customerSessions.create,
    "create portal session",
    "customerSessions.create",
  );

  try {
    const session = await createSession.call(customerSessions, {
      customerId: input.customerId,
      returnUrl: input.returnUrl,
    });
    if (!isRecord(session)) {
      throw new PolarProviderError(
        "INVALID_RESPONSE",
        "create portal session",
        "SDK returned a non-object response",
      );
    }
    const url = requirePolarResponseString(
      session.customerPortalUrl,
      "create portal session",
      "customerPortalUrl",
    );
    return { url };
  } catch (error) {
    wrapPolarFailure("create portal session", error);
  }
}
