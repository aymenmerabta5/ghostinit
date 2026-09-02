// @allow-long 320: complete authenticated Convex messaging boundary is kept cohesive for auditability
export function convexMessagingPublicContent(): string {
  return `// @allow-long 310: authenticated DM messaging boundary with app-owned actors and native reactivity
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isUserBanned, requireActor } from "./lib/auth";

type DatabaseCtx = QueryCtx | MutationCtx;

async function requireParticipant(
  ctx: DatabaseCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<Doc<"conversationParticipants">> {
  const participant = await ctx.db
    .query("conversationParticipants")
    .withIndex("by_conversation_user", (indexQuery) =>
      indexQuery.eq("conversationId", conversationId).eq("userId", userId),
    )
    .unique();
  if (!participant) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Conversation access denied" });
  }
  return participant;
}

async function requireMessage(
  ctx: DatabaseCtx,
  conversationId: Id<"conversations">,
  messageId: Id<"messages">,
): Promise<Doc<"messages">> {
  const message = await ctx.db.get(messageId);
  if (!message || message.conversationId !== conversationId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Message not found in this conversation" });
  }
  return message;
}

async function requireDirectParticipantSet(
  ctx: DatabaseCtx,
  conversationId: Id<"conversations">,
  firstUserId: Id<"users">,
  secondUserId: Id<"users">,
): Promise<void> {
  const participants = await ctx.db
    .query("conversationParticipants")
    .withIndex("by_conversationId", (indexQuery) =>
      indexQuery.eq("conversationId", conversationId),
    )
    .collect();
  if (
    participants.length !== 2 ||
    !participants.some((participant) => participant.userId === firstUserId) ||
    !participants.some((participant) => participant.userId === secondUserId)
  ) {
    throw new ConvexError({
      code: "CONVERSATION_INTEGRITY",
      message: "Direct conversation participants do not match its key",
    });
  }
}

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireActor(ctx);
    const participants = await ctx.db
      .query("conversationParticipants")
      .withIndex("by_userId", (indexQuery) => indexQuery.eq("userId", actor._id))
      .collect();
    const conversations = await Promise.all(
      participants.map(async (participant) => await ctx.db.get(participant.conversationId)),
    );
    return conversations.filter((conversation): conversation is Doc<"conversations"> => conversation !== null);
  },
});

export const getOrCreateConversation = mutation({
  args: { peerUserId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const peerUserId = ctx.db.normalizeId("users", args.peerUserId);
    if (!peerUserId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });
    }
    if (actor._id === peerUserId) {
      throw new ConvexError({ code: "INVALID_RECIPIENT", message: "Choose another user" });
    }
    const peer = await ctx.db.get(peerUserId);
    if (!peer || isUserBanned(peer)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });
    }
    const ids = [String(actor._id), String(peer._id)].sort();
    const directKey = ids.join(":");
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_directKey", (indexQuery) => indexQuery.eq("directKey", directKey))
      .unique();
    if (existing) {
      await requireDirectParticipantSet(ctx, existing._id, actor._id, peer._id);
      return existing;
    }
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      createdBy: actor._id,
      directKey,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("conversationParticipants", {
      conversationId,
      userId: actor._id,
      joinedAt: now,
    });
    await ctx.db.insert("conversationParticipants", {
      conversationId,
      userId: peer._id,
      joinedAt: now,
    });
    return await ctx.db.get(conversationId);
  },
});

export const listMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    await requireParticipant(ctx, args.conversationId, actor._id);
    const requestedLimit = args.limit ?? 20;
    if (!Number.isSafeInteger(requestedLimit)) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Message limit must be an integer" });
    }
    const limit = Math.min(Math.max(requestedLimit, 1), 50);
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (indexQuery) =>
        indexQuery.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    const withAttachments = await Promise.all(
      page.page.map(async (message) => {
        const attachments = await Promise.all(
          (message.attachmentIds ?? []).map(async (attachmentId) => {
            const attachment = await ctx.db.get(attachmentId);
            if (!attachment || attachment.messageId !== message._id) return null;
            const storage = await ctx.db
              .query("attachmentStorage")
              .withIndex("by_attachmentId", (indexQuery) =>
                indexQuery.eq("attachmentId", attachment._id),
              )
              .unique();
            if (!storage) return null;
            const url = await ctx.storage.getUrl(storage.storageId);
            if (!url) return null;
            return {
              id: attachment._id,
              mimeType: attachment.mimeType,
              byteSize: attachment.byteSize,
              originalName: attachment.originalName,
              url,
            };
          }),
        );
        return { ...message, attachments: attachments.filter((item) => item !== null) };
      }),
    );
    return {
      messages: withAttachments.reverse(),
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.optional(v.string()),
    replyToId: v.optional(v.id("messages")),
    attachmentIds: v.optional(v.array(v.id("messageAttachments"))),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    await requireParticipant(ctx, args.conversationId, actor._id);
    const body = args.body?.trim();
    const attachmentIds = [...new Set(args.attachmentIds ?? [])];
    if (!body && attachmentIds.length === 0) {
      throw new ConvexError({ code: "INVALID_MESSAGE", message: "A body or attachment is required" });
    }
    if (body && body.length > 4000) {
      throw new ConvexError({ code: "INVALID_MESSAGE", message: "Message body is too long" });
    }
    if (attachmentIds.length > 5) {
      throw new ConvexError({ code: "INVALID_MESSAGE", message: "Too many attachments" });
    }
    if (args.replyToId) await requireMessage(ctx, args.conversationId, args.replyToId);
    const attachments = await Promise.all(
      attachmentIds.map(async (attachmentId) => await ctx.db.get(attachmentId)),
    );
    const now = Date.now();
    if (
      attachments.some(
        (attachment) =>
          !attachment ||
          attachment.ownerId !== actor._id ||
          attachment.conversationId !== args.conversationId ||
          attachment.messageId !== undefined ||
          attachment.expiresAt <= now,
      )
    ) {
      throw new ConvexError({ code: "ATTACHMENT_FORBIDDEN", message: "Attachment cannot be claimed" });
    }
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: actor._id,
      body,
      replyToId: args.replyToId,
      attachmentIds,
      createdAt: now,
    });
    await Promise.all(attachmentIds.map(async (id) => await ctx.db.patch(id, { messageId })));
    await ctx.db.patch(args.conversationId, { updatedAt: now });
    return await ctx.db.get(messageId);
  },
});

export const markRead = mutation({
  args: { conversationId: v.id("conversations"), messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const participant = await requireParticipant(ctx, args.conversationId, actor._id);
    const message = await requireMessage(ctx, args.conversationId, args.messageId);
    const lastReadAt = Math.max(participant.lastReadAt ?? 0, message.createdAt);
    if (lastReadAt !== participant.lastReadAt) {
      await ctx.db.patch(participant._id, { lastReadAt });
    }
    return { ok: true };
  },
});

export const getAttachmentUrl = query({
  args: { attachmentId: v.id("messageAttachments") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) throw new ConvexError({ code: "NOT_FOUND", message: "Attachment not found" });
    await requireParticipant(ctx, attachment.conversationId, actor._id);
    if (
      attachment.messageId === undefined &&
      (attachment.ownerId !== actor._id || attachment.expiresAt <= Date.now())
    ) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Attachment not found" });
    }
    const storage = await ctx.db
      .query("attachmentStorage")
      .withIndex("by_attachmentId", (indexQuery) =>
        indexQuery.eq("attachmentId", attachment._id),
    )
      .unique();
    if (!storage) throw new ConvexError({ code: "NOT_FOUND", message: "Attachment not found" });
    const url = await ctx.storage.getUrl(storage.storageId);
    if (!url) throw new ConvexError({ code: "NOT_FOUND", message: "Attachment not found" });
    return url;
  },
});

export const sendTyping = mutation({
  args: { conversationId: v.id("conversations"), isTyping: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    await requireParticipant(ctx, args.conversationId, actor._id);
    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_conversation_user", (indexQuery) =>
        indexQuery.eq("conversationId", args.conversationId).eq("userId", actor._id),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { isTyping: args.isTyping, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("typingIndicators", {
        conversationId: args.conversationId,
        userId: actor._id,
        isTyping: args.isTyping,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const listTyping = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    await requireParticipant(ctx, args.conversationId, actor._id);
    const cutoff = Date.now() - 5000;
    const indicators = await ctx.db
      .query("typingIndicators")
      .withIndex("by_conversation", (indexQuery) =>
        indexQuery.eq("conversationId", args.conversationId),
      )
      .collect();
    return indicators.filter(
      (indicator) => indicator.userId !== actor._id && indicator.isTyping && indicator.updatedAt > cutoff,
    );
  },
});
`;
}
