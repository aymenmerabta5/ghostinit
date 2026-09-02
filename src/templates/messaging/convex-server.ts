/** Trusted server action that owns the complete Convex attachment upload lifecycle. */
export function convexMessagingServerContent(): string {
  return `import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { DEFAULT_STORAGE_QUOTA } from "./storagePolicy";

const MAX_ATTACHMENT_BYTES = DEFAULT_STORAGE_QUOTA.maxObjectBytes;
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

function managedToken(): string {
  return crypto.randomUUID().replaceAll("-", "").toLowerCase();
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

function requireTrustedServerToken(candidate: string): void {
  const expected = process.env.BETTER_AUTH_SECRET;
  if (!expected || expected.length < 32 || expected.startsWith("REPLACE_WITH")) {
    throw new ConvexError({
      code: "SERVER_AUTH_NOT_CONFIGURED",
      message: "Trusted messaging upload authentication is not configured",
    });
  }
  if (candidate.length !== expected.length) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Invalid trusted server token" });
  }
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (mismatch !== 0) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Invalid trusted server token" });
  }
}

export const upload = action({
  args: {
    serverToken: v.string(),
    actorId: v.string(),
    conversationId: v.string(),
    bytes: v.bytes(),
    mimeType: v.string(),
    originalName: v.string(),
  },
  handler: async (ctx, args): Promise<{ attachmentId: Id<"messageAttachments"> }> => {
    requireTrustedServerToken(args.serverToken);
    const mimeType = args.mimeType.trim().toLowerCase();
    if (
      args.bytes.byteLength < 1 ||
      args.bytes.byteLength > MAX_ATTACHMENT_BYTES ||
      !ALLOWED_ATTACHMENT_MIME.has(mimeType) ||
      args.originalName.length > 1024
    ) {
      throw new ConvexError({ code: "INVALID_ATTACHMENT", message: "Attachment is not allowed" });
    }
    const token = managedToken();
    const expectedSha256 = await sha256Hex(args.bytes);
    const { uploadIntentId } = await ctx.runMutation(
      internal.messagingInternal.beginAttachmentUpload,
      {
        actorId: args.actorId,
        conversationId: args.conversationId,
        expectedByteSize: args.bytes.byteLength,
        expectedMimeType: mimeType,
      },
    );
    let storageId: Id<"_storage"> | undefined;
    let managedReserved = false;
    try {
      const { managedContentType } = await ctx.runMutation(
        internal.storageInternal.reserveManagedBlob,
        {
          token,
          lifecycleKind: "messaging",
          lifecycleId: String(uploadIntentId),
          expectedByteSize: args.bytes.byteLength,
          expectedMimeType: mimeType,
          expectedSha256,
        },
      );
      managedReserved = true;
      storageId = await ctx.storage.store(
        new Blob([args.bytes], { type: managedContentType }),
        { sha256: expectedSha256 },
      );
      await ctx.runMutation(internal.storageInternal.bindManagedBlob, { token, storageId });
      await ctx.runMutation(internal.messagingInternal.bindAttachmentUpload, {
        actorId: args.actorId,
        conversationId: args.conversationId,
        uploadIntentId,
        storageId,
      });
      const attachmentId = await ctx.runMutation(
        internal.messagingInternal.commitAttachmentUpload,
        {
          actorId: args.actorId,
          conversationId: args.conversationId,
          uploadIntentId,
          storageId,
          originalName: args.originalName,
          expectedMimeType: mimeType,
          expectedByteSize: args.bytes.byteLength,
          managedToken: token,
        },
      );
      return { attachmentId };
    } catch (error) {
      if (managedReserved) {
        await ctx
          .runMutation(internal.storageInternal.requestManagedBlobCleanup, {
            token,
            ...(storageId ? { storageId } : {}),
          })
          .catch(() => undefined);
      }
      if (storageId) {
        const deleted = await ctx.storage.delete(storageId).then(() => true, () => false);
        if (deleted) {
          await ctx
            .runMutation(internal.storageInternal.completeManagedBlobCleanup, {
              token,
              storageId,
            })
            .catch(() => undefined);
        }
      }
      try {
        await ctx.runMutation(internal.messagingInternal.abortAttachmentUpload, {
          actorId: args.actorId,
          conversationId: args.conversationId,
          uploadIntentId,
          storageId,
        });
      } catch {
        // The central managed-blob registry retains cleanup ownership.
      }
      throw error;
    }
  },
});

export const authorizeUpload = action({
  args: {
    serverToken: v.string(),
    actorId: v.string(),
    conversationId: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    requireTrustedServerToken(args.serverToken);
    return await ctx.runQuery(internal.messagingInternal.authorizeAttachmentUpload, {
      actorId: args.actorId,
      conversationId: args.conversationId,
    });
  },
});
`;
}
