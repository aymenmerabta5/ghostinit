// @allow-long 600: privileged Convex messaging writes, durable quota, and retention remain together for auditability
export function convexMessagingInternalContent(): string {
  return `// @allow-long 580: internal-only messaging writes; public clients call convex/messaging.ts
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { isUserBanned } from "./lib/auth";
import { decideStorageQuota, DEFAULT_STORAGE_QUOTA, managedStorageBaseMimeType } from "./storagePolicy";

type DatabaseCtx = QueryCtx | MutationCtx;

const MAX_ATTACHMENT_BYTES = DEFAULT_STORAGE_QUOTA.maxObjectBytes;
const UPLOAD_INTENT_TTL_MS = DEFAULT_STORAGE_QUOTA.pendingReservationTtlMs;
const ALLOWED_ATTACHMENT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

function safeAttachmentName(value: string): string {
  let leafStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x2f || code === 0x5c) leafStart = index + 1;
  }
  const leaf = Array.from(value.slice(leafStart), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f ? "_" : character;
  }).join("").trim();
  return Array.from(leaf || "attachment").slice(0, 255).join("");
}

async function requireExistingActor(
  ctx: DatabaseCtx,
  actorId: string,
): Promise<Doc<"users">> {
  const normalizedId = ctx.db.normalizeId("users", actorId);
  if (!normalizedId) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Messaging actor is not mapped" });
  }
  const actor = await ctx.db.get(normalizedId);
  if (!actor) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Messaging actor is not mapped" });
  }
  return actor;
}

async function requireActiveUser(
  ctx: DatabaseCtx,
  userId: Id<"users">,
): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user || isUserBanned(user)) {
    throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });
  }
  return user;
}

async function requireActiveActor(
  ctx: DatabaseCtx,
  actorId: string,
): Promise<Doc<"users">> {
  const actor = await requireExistingActor(ctx, actorId);
  if (isUserBanned(actor)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Messaging access denied" });
  }
  return actor;
}

async function requireConversationId(
  ctx: DatabaseCtx,
  value: string,
): Promise<Id<"conversations">> {
  const conversationId = ctx.db.normalizeId("conversations", value);
  if (!conversationId || !(await ctx.db.get(conversationId))) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });
  }
  return conversationId;
}

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

async function requireDirectParticipantSet(
  ctx: MutationCtx,
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

export const authorizeAttachmentUpload = internalQuery({
  args: { actorId: v.string(), conversationId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActiveActor(ctx, args.actorId);
    const conversationId = await requireConversationId(ctx, args.conversationId);
    await requireParticipant(ctx, conversationId, actor._id);
    return { ok: true as const };
  },
});

export const createDirectConversation = internalMutation({
  args: {
    firstUserId: v.id("users"),
    secondUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (args.firstUserId === args.secondUserId) {
      throw new ConvexError({ code: "INVALID_RECIPIENT", message: "Choose another user" });
    }
    await Promise.all([
      requireActiveUser(ctx, args.firstUserId),
      requireActiveUser(ctx, args.secondUserId),
    ]);
    const directKey = [String(args.firstUserId), String(args.secondUserId)].sort().join(":");
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_directKey", (indexQuery) => indexQuery.eq("directKey", directKey))
      .unique();
    if (existing) {
      await requireDirectParticipantSet(
        ctx,
        existing._id,
        args.firstUserId,
        args.secondUserId,
      );
      return existing._id;
    }
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      createdBy: args.firstUserId,
      directKey,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("conversationParticipants", {
      conversationId,
      userId: args.firstUserId,
      joinedAt: now,
    });
    await ctx.db.insert("conversationParticipants", {
      conversationId,
      userId: args.secondUserId,
      joinedAt: now,
    });
    return conversationId;
  },
});

export const insertMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    body: v.optional(v.string()),
    replyToId: v.optional(v.id("messages")),
    attachmentIds: v.array(v.id("messageAttachments")),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx, args.senderId);
    await requireParticipant(ctx, args.conversationId, args.senderId);
    const body = args.body?.trim();
    const attachmentIds = [...new Set(args.attachmentIds)];
    if (!body && attachmentIds.length === 0) {
      throw new ConvexError({
        code: "INVALID_MESSAGE",
        message: "A body or attachment is required",
      });
    }
    if (body && body.length > 4000) {
      throw new ConvexError({ code: "INVALID_MESSAGE", message: "Message body is too long" });
    }
    if (attachmentIds.length > 5) {
      throw new ConvexError({ code: "INVALID_MESSAGE", message: "Too many attachments" });
    }
    if (args.replyToId) {
      await requireMessage(ctx, args.conversationId, args.replyToId);
    }
    const attachments = await Promise.all(
      attachmentIds.map(async (id) => await ctx.db.get(id)),
    );
    const now = Date.now();
    if (
      attachments.some(
        (attachment) =>
          !attachment ||
          attachment.ownerId !== args.senderId ||
          attachment.conversationId !== args.conversationId ||
          attachment.messageId !== undefined ||
          attachment.expiresAt <= now,
      )
    ) {
      throw new ConvexError({
        code: "ATTACHMENT_FORBIDDEN",
        message: "Attachment cannot be claimed",
      });
    }
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: args.senderId,
      body,
      replyToId: args.replyToId,
      attachmentIds,
      createdAt: now,
    });
    await Promise.all(attachmentIds.map(async (id) => await ctx.db.patch(id, { messageId })));
    await ctx.db.patch(args.conversationId, { updatedAt: now });
    return messageId;
  },
});

export const markRead = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx, args.userId);
    const participant = await requireParticipant(ctx, args.conversationId, args.userId);
    const message = await requireMessage(ctx, args.conversationId, args.messageId);
    const lastReadAt = Math.max(participant.lastReadAt ?? 0, message.createdAt);
    if (lastReadAt !== participant.lastReadAt) {
      await ctx.db.patch(participant._id, { lastReadAt });
    }
  },
});

export const beginAttachmentUpload = internalMutation({
  args: {
    actorId: v.string(),
    conversationId: v.string(),
    expectedByteSize: v.number(),
    expectedMimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActiveActor(ctx, args.actorId);
    const conversationId = await requireConversationId(ctx, args.conversationId);
    await requireParticipant(ctx, conversationId, actor._id);
    const expectedMimeType = args.expectedMimeType.trim().toLowerCase();
    if (!ALLOWED_ATTACHMENT_MIME.has(expectedMimeType)) {
      throw new ConvexError({ code: "INVALID_ATTACHMENT", message: "Attachment is not allowed" });
    }
    const [attachments, reservations, storedObjects] = await Promise.all([
      ctx.db
        .query("messageAttachments")
        .withIndex("by_owner", (indexQuery) => indexQuery.eq("ownerId", actor._id))
        .take(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1),
      ctx.db
        .query("attachmentUploadIntents")
        .withIndex("by_owner_status", (indexQuery) =>
          indexQuery.eq("ownerId", actor._id).eq("status", "pending"),
        )
        .take(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1),
      ctx.db
        .query("storedObjects")
        .withIndex("by_owner", (indexQuery) => indexQuery.eq("ownerId", actor._id))
        .take(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1),
    ]);
    const decision = decideStorageQuota(
      [
        ...attachments.map(({ byteSize }) => byteSize),
        ...reservations.map(({ expectedByteSize }) => expectedByteSize),
        ...storedObjects.map(({ byteSize }) => byteSize ?? Number.NaN),
      ],
      args.expectedByteSize,
    );
    if (decision === "invalid") {
      throw new ConvexError({
        code: "STORAGE_ACCOUNTING_INVALID",
        message: "Storage accounting is invalid",
      });
    }
    if (decision === "quota-exceeded") {
      throw new ConvexError({ code: "STORAGE_QUOTA_EXCEEDED", message: "Storage quota exceeded" });
    }
    const now = Date.now();
    const uploadIntentId = await ctx.db.insert("attachmentUploadIntents", {
      conversationId,
      ownerId: actor._id,
      expectedByteSize: args.expectedByteSize,
      status: "pending",
      expiresAt: now + UPLOAD_INTENT_TTL_MS,
    });
    return { uploadIntentId };
  },
});

export const bindAttachmentUpload = internalMutation({
  args: {
    actorId: v.string(),
    conversationId: v.string(),
    uploadIntentId: v.id("attachmentUploadIntents"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const actor = await requireActiveActor(ctx, args.actorId);
    const conversationId = await requireConversationId(ctx, args.conversationId);
    await requireParticipant(ctx, conversationId, actor._id);
    const intent = await ctx.db.get(args.uploadIntentId);
    if (
      !intent ||
      intent.ownerId !== actor._id ||
      intent.conversationId !== conversationId ||
      intent.status !== "pending" ||
      intent.expiresAt <= Date.now() ||
      (intent.storageId !== undefined && intent.storageId !== args.storageId)
    ) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Pending upload not found" });
    }
    const existingStorage = await ctx.db
      .query("attachmentStorage")
      .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", args.storageId))
      .unique();
    const existingIntent = await ctx.db
      .query("attachmentUploadIntents")
      .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", args.storageId))
      .unique();
    if (existingStorage || (existingIntent && existingIntent._id !== intent._id)) {
      throw new ConvexError({ code: "STORAGE_CONFLICT", message: "Storage object is already claimed" });
    }
    if (!(await ctx.db.system.get(args.storageId))) {
      throw new ConvexError({ code: "INVALID_ATTACHMENT", message: "Stored upload not found" });
    }
    await ctx.db.patch(intent._id, { storageId: args.storageId });
    return { ok: true as const };
  },
});

export const commitAttachmentUpload = internalMutation({
  args: {
    actorId: v.string(),
    conversationId: v.string(),
    uploadIntentId: v.id("attachmentUploadIntents"),
    storageId: v.id("_storage"),
    originalName: v.string(),
    expectedMimeType: v.string(),
    expectedByteSize: v.number(),
    managedToken: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActiveActor(ctx, args.actorId);
    const conversationId = await requireConversationId(ctx, args.conversationId);
    await requireParticipant(ctx, conversationId, actor._id);
    const now = Date.now();
    const intent = await ctx.db.get(args.uploadIntentId);
    if (
      !intent ||
      intent.ownerId !== actor._id ||
      intent.conversationId !== conversationId ||
      intent.status !== "pending" ||
      intent.expiresAt <= now ||
      intent.storageId !== args.storageId
    ) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Pending upload not found" });
    }
    const managed = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_token", (indexQuery) => indexQuery.eq("token", args.managedToken))
      .unique();
    if (
      !managed ||
      managed.lifecycleKind !== "messaging" ||
      managed.lifecycleId !== String(intent._id) ||
      managed.status !== "bound" ||
      managed.storageId !== args.storageId
    ) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Managed upload not found" });
    }
    const existingStorage = await ctx.db
      .query("attachmentStorage")
      .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", args.storageId))
      .unique();
    const existingIntent = await ctx.db
      .query("attachmentUploadIntents")
      .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", args.storageId))
      .unique();
    if (existingStorage || (existingIntent && existingIntent._id !== intent._id)) {
      throw new ConvexError({
        code: "STORAGE_CONFLICT",
        message: "Storage object is already claimed",
      });
    }
    const metadata = await ctx.db.system.get(args.storageId);
    const mimeType = managedStorageBaseMimeType(metadata?.contentType, args.managedToken);
    const expectedMimeType = args.expectedMimeType.toLowerCase();
    const byteSize = metadata?.size;
    if (
      !metadata ||
      !Number.isSafeInteger(byteSize) ||
      !byteSize ||
      byteSize > MAX_ATTACHMENT_BYTES ||
      byteSize !== args.expectedByteSize ||
      byteSize !== intent.expectedByteSize ||
      metadata.contentType !== managed.managedContentType ||
      metadata.sha256 !== managed.expectedSha256 ||
      !mimeType ||
      mimeType !== expectedMimeType ||
      !ALLOWED_ATTACHMENT_MIME.has(mimeType)
    ) {
      throw new ConvexError({
        code: "INVALID_ATTACHMENT",
        message: "Uploaded file metadata does not match the stored object",
      });
    }
    const attachmentId = await ctx.db.insert("messageAttachments", {
      conversationId: intent.conversationId,
      ownerId: actor._id,
      mimeType,
      byteSize,
      originalName: safeAttachmentName(args.originalName),
      createdAt: now,
      expiresAt: now + UPLOAD_INTENT_TTL_MS,
    });
    await ctx.db.insert("attachmentStorage", { attachmentId, storageId: args.storageId });
    await ctx.db.patch(intent._id, { status: "committed", storageId: args.storageId });
    return attachmentId;
  },
});

export const abortAttachmentUpload = internalMutation({
  args: {
    actorId: v.string(),
    conversationId: v.string(),
    uploadIntentId: v.id("attachmentUploadIntents"),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    // Recovery authenticates the durable intent identity, not live principal
    // rows: actor or conversation deletion must not strand a just-stored blob.
    const actorId = ctx.db.normalizeId("users", args.actorId);
    const conversationId = ctx.db.normalizeId("conversations", args.conversationId);
    if (!actorId || !conversationId) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Pending upload not found" });
    }
    const committedStorage = args.storageId
      ? await ctx.db
          .query("attachmentStorage")
          .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", args.storageId))
          .unique()
      : null;
    if (committedStorage) {
      return { ok: false as const, reason: "already-committed" as const };
    }
    const intent = await ctx.db.get(args.uploadIntentId);
    if (
      !intent ||
      intent.ownerId !== actorId ||
      intent.conversationId !== conversationId
    ) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Pending upload not found" });
    }
    if (intent.status === "committed") {
      return { ok: false as const, reason: "already-committed" as const };
    }
    if (intent.status !== "pending") {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Pending upload not found" });
    }
    const storageId = args.storageId ?? intent.storageId;
    if (!storageId) {
      const managed = await ctx.db
        .query("managedStorageBlobs")
        .withIndex("by_lifecycle", (indexQuery) =>
          indexQuery
            .eq("lifecycleKind", "messaging")
            .eq("lifecycleId", String(intent._id)),
        )
        .unique();
      if (managed) {
        if (managed.status === "cleanup") {
          await ctx.db.patch(managed._id, {
            status: "reserved",
            cleanupAfter: undefined,
            lastError: "Awaiting managed orphan sweep",
            updatedAt: Date.now(),
          });
        }
        return { ok: false as const, reason: "cleanup-deferred" as const };
      }
      await ctx.db.delete(intent._id);
      return { ok: true as const };
    }
    if (intent.storageId !== undefined && intent.storageId !== storageId) {
      throw new ConvexError({ code: "STORAGE_CONFLICT", message: "Upload storage mismatch" });
    }
    const existingStorage = await ctx.db
      .query("attachmentStorage")
      .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", storageId))
      .unique();
    if (existingStorage) {
      return { ok: false as const, reason: "already-committed" as const };
    }
    await ctx.db.patch(intent._id, { storageId, expiresAt: Date.now() });
    if (!(await ctx.db.system.get(storageId))) {
      await ctx.db.delete(intent._id);
      return { ok: true as const };
    }
    try {
      const managed = await ctx.db
        .query("managedStorageBlobs")
        .withIndex("by_storage", (indexQuery) => indexQuery.eq("storageId", storageId))
        .unique();
      await ctx.storage.delete(storageId);
      if (managed) await ctx.db.delete(managed._id);
    } catch {
      return { ok: false as const, reason: "cleanup-deferred" as const };
    }
    await ctx.db.delete(intent._id);
    return { ok: true as const };
  },
});

export const cleanupExpiredUploads = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Cleanup limit must be 1-100" });
    }
    const now = Date.now();
    const intents = await ctx.db
      .query("attachmentUploadIntents")
      .withIndex("by_expiry", (indexQuery) => indexQuery.lt("expiresAt", now))
      .take(args.limit);
    let deletedIntents = 0;
    let deletedAttachments = 0;
    let deletedBlobs = 0;
    let deferred = 0;
    for (const intent of intents) {
      let canDeleteIntent = true;
      if (intent.storageId) {
        const storageId = intent.storageId;
        const storage = await ctx.db
          .query("attachmentStorage")
          .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", storageId))
          .unique();
        const attachment = storage ? await ctx.db.get(storage.attachmentId) : null;
        const claimed = attachment !== null && attachment.messageId !== undefined;
        const pendingNotExpired =
          attachment !== null && attachment.messageId === undefined && attachment.expiresAt > now;
        if (pendingNotExpired) {
          canDeleteIntent = false;
          deferred += 1;
        } else if (!claimed) {
          try {
            const managed = await ctx.db
              .query("managedStorageBlobs")
              .withIndex("by_storage", (indexQuery) => indexQuery.eq("storageId", storageId))
              .unique();
            await ctx.storage.delete(storageId);
            if (managed) await ctx.db.delete(managed._id);
            deletedBlobs += 1;
            if (storage) await ctx.db.delete(storage._id);
            if (attachment) {
              await ctx.db.delete(attachment._id);
              deletedAttachments += 1;
            }
          } catch {
            canDeleteIntent = false;
            deferred += 1;
          }
        }
      } else {
        const managed = await ctx.db
          .query("managedStorageBlobs")
          .withIndex("by_lifecycle", (indexQuery) =>
            indexQuery
              .eq("lifecycleKind", "messaging")
              .eq("lifecycleId", String(intent._id)),
          )
          .unique();
        if (managed) {
          // A process can die after ctx.storage.store but before binding its ID.
          // Retain both quota and registry evidence until the central tagged-blob
          // sweep finds the exact token+digest+MIME match.
          if (managed.status === "cleanup") {
            await ctx.db.patch(managed._id, {
              status: "reserved",
              cleanupAfter: undefined,
              lastError: "Awaiting managed orphan sweep",
              updatedAt: now,
            });
          }
          canDeleteIntent = false;
          deferred += 1;
        }
      }
      if (canDeleteIntent) {
        await ctx.db.delete(intent._id);
        deletedIntents += 1;
      }
    }
    return { deletedIntents, deletedAttachments, deletedBlobs, deferred };
  },
});

export const upsertTyping = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx, args.userId);
    await requireParticipant(ctx, args.conversationId, args.userId);
    const now = Date.now();
    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_conversation_user", (indexQuery) =>
        indexQuery.eq("conversationId", args.conversationId).eq("userId", args.userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { isTyping: args.isTyping, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("typingIndicators", {
      conversationId: args.conversationId,
      userId: args.userId,
      isTyping: args.isTyping,
      updatedAt: now,
    });
  },
});
`;
}
