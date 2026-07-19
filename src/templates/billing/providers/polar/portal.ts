/**
 * Polar portal session.
 */
import type { CreatePortalSessionInput, CreatePortalSessionOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";

export async function createPolarPortalSession(
  config: Record<string, unknown> | undefined,
  input: CreatePortalSessionInput,
): Promise<CreatePortalSessionOutput> {
  if (!input.customerId || !input.returnUrl)
    throw new Error("INVALID_INPUT: customerId, returnUrl required for Polar portal");

  const { client, accessToken, environment } = await getPolarClientAsync(config);

  if (!client || !accessToken) {
    const url = `${input.returnUrl}?polar_portal=1&customer=${encodeURIComponent(input.customerId)}`;
    return { url };
  }

  try {
    const session = (await client.customerSessions.create({ customerId: input.customerId })) as {
      token?: string;
      customerSession?: string;
      id?: string;
    };
    const token =
      (session.token as string) ??
      (session.customerSession as string) ??
      session.id ??
      input.customerId;
    const portalBase =
      environment === "production" ? "https://polar.sh/portal" : "https://sandbox.polar.sh/portal";
    const url = `${portalBase}?customer_session=${encodeURIComponent(token)}&return_url=${encodeURIComponent(input.returnUrl)}`;
    return { url };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POLAR_CREATE_PORTAL_FAILED: ${msg}`);
  }
}
