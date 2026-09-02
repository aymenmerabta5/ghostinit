import type { ProjectMode } from "../../../../lib/addons.js";

export function billingActionsContent(mode: ProjectMode): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "${applicationModule}";

const provider = z.enum(["stripe", "chargily", "paddle", "polar"]);
const origin = z.string().url().transform((value) => new URL(value).origin);
const checkoutInput = z.object({ provider, origin, requestKey: z.string().uuid() });
const portalInput = z.object({ provider, origin });

async function application() {
  return createRequestApplicationForRequest(new Headers(await headers()));
}

export async function createBillingCheckoutAction(input: unknown) {
  const parsed = checkoutInput.safeParse(input);
  if (!parsed.success) throw new Error("Invalid checkout input");
  const result = await (await application()).billing.createCheckout({
    provider: parsed.data.provider,
    planId: "pro",
    successUrl: parsed.data.origin + "/billing/success",
    failureUrl: parsed.data.origin + "/billing/cancel",
    requestKey: parsed.data.requestKey,
  });
  revalidatePath("/billing");
  return result;
}

export async function createBillingPortalAction(input: unknown) {
  const parsed = portalInput.safeParse(input);
  if (!parsed.success) throw new Error("Invalid portal input");
  const result = await (await application()).billing.createPortalSession({
    provider: parsed.data.provider,
    returnUrl: parsed.data.origin + "/billing",
  });
  revalidatePath("/billing");
  return result;
}
`;
}
