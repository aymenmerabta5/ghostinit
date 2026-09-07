export function settingsActionsContent(
  mode: "monorepo" | "single",
  hasIdentityTransport: boolean,
  useBetterAuthServerActions = true,
): string {
  const authImport = useBetterAuthServerActions
    ? `import { auth, authErrorCode } from "${mode === "monorepo" ? "@repo/auth" : "@/server/auth"}";`
    : "";
  const identityImport = hasIdentityTransport
    ? `import { createRequestApplicationForRequest } from "${mode === "monorepo" ? "@repo/services/application" : "@/server/services/application"}";`
    : "";
  const identityHelpers = hasIdentityTransport
    ? `
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
`
    : "";
  const betterAuthActions = useBetterAuthServerActions
    ? `
export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ name: z.string().trim().min(1).max(50) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid profile input" };
  try {
    await auth.api.updateUser({ headers: await headers(), body: parsed.data });
    revalidatePath("/settings");
    return { ok: true };
  } catch { return { ok: false, error: "Profile could not be updated" }; }
}

export async function deleteAccountAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ password: z.string().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid account deletion input" };
  try {
    await auth.api.deleteUser({ headers: await headers(), body: parsed.data });
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "ACCOUNT_DELETION_RESTRICTED" || code === "SESSION_EXPIRED" || code === "SESSION_NOT_FRESH") {
      return { ok: false, error: "Account could not be deleted", code };
    }
    return { ok: false, error: "Account could not be deleted" };
  }
}
`
    : "";
  return `"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
${authImport}
${identityImport}

type ActionResult = { ok: true } | {
  ok: false;
  error: string;
  code?: "ACCOUNT_DELETION_RESTRICTED" | "SESSION_EXPIRED" | "SESSION_NOT_FRESH";
};
${betterAuthActions}${identityHelpers}`;
}
