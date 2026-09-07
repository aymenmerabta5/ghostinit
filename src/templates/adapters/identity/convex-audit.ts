export function convexIdentityAuditContent(): string {
  return `import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireIdentityActor, requirePermission } from "./shared";

function auditValue(event: {
  _id: string;
  action: string;
  actorId: string;
  organizationId?: string;
  targetId?: string;
  metadata: Record<string, string | number | boolean | null>;
  occurredAt: number;
}) {
  return {
    id: event._id,
    action: event.action,
    actorId: event.actorId,
    organizationId: event.organizationId ?? null,
    targetId: event.targetId ?? null,
    metadata: event.metadata,
    occurredAt: event.occurredAt,
  };
}

export const listForOrganization = query({
  args: {
    organizationId: v.id("identityOrganizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    await requirePermission(ctx, args.organizationId, actor.user._id, "organization:read");
    const result = await ctx.db
      .query("identityAuditEvents")
      .withIndex("by_organization_occurred", (indexQuery) =>
        indexQuery.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(auditValue) };
  },
});

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireIdentityActor(ctx);
    const result = await ctx.db
      .query("identityAuditEvents")
      .withIndex("by_actor_occurred", (indexQuery) => indexQuery.eq("actorId", actor.user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(auditValue) };
  },
});
`;
}
