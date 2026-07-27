/**
 * convex/users.ts — user queries.
 *
 * Extracted verbatim from database/convex.ts, which had grown past 1100 LOC.
 */

export function convexUsersContent(): string {
  return [
    'import { v } from "convex/values";',
    'import { query } from "./_generated/server";',
    'import { paginationOptsValidator } from "convex/server";',
    'import { ConvexError } from "convex/values";',
    'import { authComponent } from "./auth";',
    "",
    "// me query via getAuthUser — returns null if not authenticated, no throw for public routes",
    "export const me = query({",
    "  args: {},",
    "  handler: async (ctx) => {",
    "    const user = await authComponent.getAuthUser(ctx);",
    "    return user ?? null;",
    "  },",
    "});",
    "",
    "export const getCurrentUser = query({",
    "  args: {},",
    "  handler: async (ctx) => {",
    "    return await authComponent.getAuthUser(ctx);",
    "  },",
    "});",
    "",
    "// Admin list guarded — requires admin role, demonstrates pagination",
    "export const list = query({",
    "  args: { paginationOpts: paginationOptsValidator },",
    "  handler: async (ctx, args) => {",
    "    const user = await authComponent.getAuthUser(ctx);",
    '    if (!user || (user as any).role !== "admin") throw new ConvexError({ code: "FORBIDDEN", message: "Admin only" });',
    '    return await ctx.db.query("users").order("desc").paginate(args.paginationOpts);',
    "  },",
    "});",
    "",
    "export const getById = query({",
    '  args: { id: v.id("users") },',
    "  handler: async (ctx, args) => {",
    "    const current = await authComponent.getAuthUser(ctx);",
    '    if (!current) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });',
    '    if (current._id !== args.id && (current as any).role !== "admin") throw new ConvexError({ code: "FORBIDDEN", message: "Forbidden" });',
    "    return await ctx.db.get(args.id);",
    "  },",
    "});",
    "",
  ].join("\n");
}
