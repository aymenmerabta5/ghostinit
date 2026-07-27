/**
 * convex/lib/auth.ts — shared requireAuth + validators.
 *
 * Extracted verbatim from database/convex.ts, which had grown past 1100 LOC.
 */

export function convexLibAuthContent(): string {
  return [
    'import { ConvexError } from "convex/values";',
    'import type { GenericCtx } from "@convex-dev/better-auth";',
    'import type { DataModel } from "../_generated/dataModel";',
    'import { authComponent } from "../auth";',
    "",
    "// Shared auth helpers — requireAuth throws UNAUTHENTICATED, prevents silent null session",
    "export async function getAuthUser(ctx: GenericCtx<DataModel>) {",
    "  return await authComponent.getAuthUser(ctx);",
    "}",
    "",
    "export async function requireAuth(ctx: GenericCtx<DataModel>) {",
    "  const user = await authComponent.getAuthUser(ctx);",
    '  if (!user) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });',
    "  return user;",
    "}",
    "",
    "export async function requireAuthUserId(ctx: GenericCtx<DataModel>) {",
    "  const user = await requireAuth(ctx);",
    "  return user._id;",
    "}",
    "",
    "// For queries that use ctx.auth.getUserIdentity() as fallback (not Better Auth)",
    "export async function requireAuthIdentity(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {",
    "  const identity = await ctx.auth.getUserIdentity();",
    '  if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });',
    "  return identity;",
    "}",
    "",
  ].join("\n");
}
