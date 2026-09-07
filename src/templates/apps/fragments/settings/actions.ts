export function settingsActionsContent(mode: "monorepo" | "single"): string {
  return `"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "${mode === "monorepo" ? "@repo/services/application" : "@/server/services/application"}";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requestApplication() { return createRequestApplicationForRequest(new Headers(await headers())); }

export async function revokeIdentitySessionAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid session" };
  try { await (await requestApplication()).identity.sessions.revoke(parsed.data); revalidatePath("/settings"); return { ok: true }; }
  catch { return { ok: false, error: "Session could not be revoked" }; }
}

export async function revokeOtherIdentitySessionsAction(): Promise<ActionResult> {
  try { await (await requestApplication()).identity.sessions.revokeOthers(); revalidatePath("/settings"); return { ok: true }; }
  catch { return { ok: false, error: "Sessions could not be revoked" }; }
}
`;
}
