// @allow-long 340: public actor-scoped queries and atomic mutations stay together for security review
export function convexNotificationFunctionsContent(): string {
  return `// @allow-long 320: actor-derived notification inbox and device registration functions
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireActor } from "./lib/auth";
import {
  fingerprintNotificationDeviceToken,
  protectNotificationDeviceToken,
  requireNotificationDeviceToken,
} from "./lib/notification-token-protection";

const platform = v.union(v.literal("web"), v.literal("ios"), v.literal("android"));
const dataValue = v.union(v.string(), v.number(), v.boolean(), v.null());

export const createSelf = mutation({
  args: {
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    href: v.optional(v.string()),
    data: v.record(v.string(), dataValue),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const kind = args.kind.trim();
    const title = args.title.trim();
    const body = args.body.trim();
    const href = args.href?.trim();
    if (!/^[a-z][a-z0-9._-]{0,127}$/.test(kind) || !title || title.length > 160 || body.length > 2_000) {
      throw new ConvexError({ code: "INVALID_NOTIFICATION_CONTENT", message: "Notification content is invalid" });
    }
    if (href && (!href.startsWith("/") || href.startsWith("//") || href.length > 512)) {
      throw new ConvexError({ code: "INVALID_NOTIFICATION_CONTENT", message: "Notification destination is invalid" });
    }
    if (Object.keys(args.data).length > 50) {
      throw new ConvexError({ code: "INVALID_NOTIFICATION_CONTENT", message: "Notification data is invalid" });
    }
    const createdAt = Date.now();
    const id = await ctx.db.insert("notifications", {
      userId: actor._id,
      kind,
      title,
      body,
      ...(href ? { href } : {}),
      data: args.data,
      createdAt,
    });
    return { id, userId: actor._id, kind, title, body, href: href ?? null, data: args.data, createdAt, readAt: null };
  },
});

export const listInbox = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.string()),
    unreadOnly: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const numItems = Math.min(Math.max(Math.trunc(args.limit), 1), 100);
    const result = args.unreadOnly
      ? await ctx.db
          .query("notifications")
          .withIndex("by_user_read_created", (indexQuery) =>
            indexQuery.eq("userId", actor._id).eq("readAt", undefined),
          )
          .order("desc")
          .paginate({ cursor: args.cursor ?? null, numItems })
      : await ctx.db
          .query("notifications")
          .withIndex("by_user_created", (indexQuery) => indexQuery.eq("userId", actor._id))
          .order("desc")
          .paginate({ cursor: args.cursor ?? null, numItems });
    return {
      items: result.page.map((entry) => ({
        id: entry._id,
        userId: entry.userId,
        kind: entry.kind,
        title: entry.title,
        body: entry.body,
        href: entry.href ?? null,
        data: entry.data,
        createdAt: entry.createdAt,
        readAt: entry.readAt ?? null,
      })),
      nextCursor: result.isDone ? null : result.continueCursor,
    };
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== actor._id) return null;
    const changed = notification.readAt === undefined;
    const readAt = notification.readAt ?? Date.now();
    if (changed) await ctx.db.patch(notification._id, { readAt });
    return {
      value: {
        id: notification._id,
        userId: notification.userId,
        kind: notification.kind,
        title: notification.title,
        body: notification.body,
        href: notification.href ?? null,
        data: notification.data,
        createdAt: notification.createdAt,
        readAt,
      },
      changed,
    };
  },
});

export const registerDevice = mutation({
  args: { platform, pushToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    let pushToken: string;
    try {
      pushToken = requireNotificationDeviceToken(args.pushToken);
    } catch {
      throw new ConvexError({ code: "INVALID_DEVICE_TOKEN", message: "The device token is invalid" });
    }
    let tokenFingerprint: string;
    let encryptedToken: string;
    try {
      [tokenFingerprint, encryptedToken] = await Promise.all([
        fingerprintNotificationDeviceToken(pushToken),
        protectNotificationDeviceToken(pushToken),
      ]);
    } catch {
      throw new ConvexError({
        code: "DEVICE_TOKEN_PROCESSING_FAILED",
        message: "The device token could not be protected",
      });
    }
    if (!tokenFingerprint || tokenFingerprint === pushToken || !encryptedToken.startsWith("v1.")) {
      throw new ConvexError({
        code: "DEVICE_TOKEN_PROCESSING_FAILED",
        message: "The device token could not be protected",
      });
    }
    const registeredAt = Date.now();
    const existing = await ctx.db
      .query("notificationDeviceTokens")
      .withIndex("by_fingerprint", (indexQuery) => indexQuery.eq("tokenFingerprint", tokenFingerprint))
      .unique();
    if (existing && existing.userId !== actor._id) {
      throw new ConvexError({ code: "DEVICE_OWNED_BY_OTHER_ACTOR", message: "Device is already registered" });
    }
    if (existing) {
      const changed = existing.platform !== args.platform || existing.disabledAt !== undefined;
      await ctx.db.patch(existing._id, {
        platform: args.platform,
        encryptedToken,
        lastSeenAt: registeredAt,
        disabledAt: undefined,
      });
      return {
        kind: "refreshed" as const,
        changed,
        value: {
          id: existing._id,
          userId: existing.userId,
          platform: args.platform,
          tokenFingerprint: existing.tokenFingerprint,
          createdAt: existing.createdAt,
          lastSeenAt: registeredAt,
          disabledAt: null,
        },
      };
    }
    const id = await ctx.db.insert("notificationDeviceTokens", {
      userId: actor._id,
      platform: args.platform,
      encryptedToken,
      tokenFingerprint,
      createdAt: registeredAt,
      lastSeenAt: registeredAt,
    });
    return {
      kind: "registered" as const,
      changed: true,
      value: {
        id,
        userId: actor._id,
        platform: args.platform,
        tokenFingerprint,
        createdAt: registeredAt,
        lastSeenAt: registeredAt,
        disabledAt: null,
      },
    };
  },
});

/** Notification creation is internal-only; browsers cannot target arbitrary users. */
export const create = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    href: v.optional(v.string()),
    data: v.record(v.string(), dataValue),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => await ctx.db.insert("notifications", args),
});
`;
}
