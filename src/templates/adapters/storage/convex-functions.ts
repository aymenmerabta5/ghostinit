export function convexStorageFunctionsContent(): string {
  return `// @allow-long 230: actor-owned server upload, download, and deletion boundary
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { requireActor } from "./lib/auth";
import { DEFAULT_STORAGE_QUOTA } from "./storagePolicy";

const allowedMime = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv", "text/markdown"]);

function managedToken(): string {
  return crypto.randomUUID().replaceAll("-", "").toLowerCase();
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export const upload = action({
  args: {
    bytes: v.bytes(),
    mimeType: v.string(),
    originalName: v.string(),
  },
  handler: async (ctx, args): Promise<{
    id: Id<"storedObjects">;
    mimeType: string;
    byteSize: number;
    originalName: string;
    createdAt: number;
  }> => {
    const mimeType = args.mimeType.trim().toLowerCase();
    if (
      args.bytes.byteLength < 1 ||
      args.bytes.byteLength > DEFAULT_STORAGE_QUOTA.maxObjectBytes ||
      !allowedMime.has(mimeType) ||
      args.originalName.length > 1024
    ) {
      throw new ConvexError({ code: "INVALID_FILE", message: "Uploaded file is not allowed" });
    }
    const token = managedToken();
    const expectedSha256 = await sha256Hex(args.bytes);
    const reservation: {
      uploadId: Id<"storedObjects">;
      ownerId: Id<"users">;
    } = await ctx.runMutation(internal.storageInternal.reserveUpload, {
      expectedByteSize: args.bytes.byteLength,
      expectedMimeType: mimeType,
    });
    let storageId: Id<"_storage"> | undefined;
    let managedReserved = false;
    try {
      const { managedContentType } = await ctx.runMutation(
        internal.storageInternal.reserveManagedBlob,
        {
          token,
          lifecycleKind: "storage",
          lifecycleId: String(reservation.uploadId),
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
      await ctx.runMutation(internal.storageInternal.bindUploadStorage, {
        uploadId: reservation.uploadId,
        ownerId: reservation.ownerId,
        storageId,
      });
      return await ctx.runMutation(internal.storageInternal.finalizeUpload, {
        uploadId: reservation.uploadId,
        ownerId: reservation.ownerId,
        expectedMimeType: mimeType,
        expectedByteSize: args.bytes.byteLength,
        originalName: args.originalName,
        managedToken: token,
      });
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
      await ctx
        .runMutation(internal.storageInternal.abortUpload, {
          uploadId: reservation.uploadId,
          ownerId: reservation.ownerId,
        })
        .catch(() => undefined);
      throw error;
    }
  },
});

export const download = query({
  args: { id: v.id("storedObjects") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const object = await ctx.db.get(args.id);
    if (!object || object.ownerId !== actor._id || object.status !== "ready" || !object.storageId) return null;
    const url = await ctx.storage.getUrl(object.storageId);
    return url ? {
      url,
      mimeType: object.mimeType,
      byteSize: object.byteSize,
      originalName: object.originalName,
      createdAt: object.createdAt,
    } : null;
  },
});

export const remove = mutation({
  args: { id: v.id("storedObjects") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const object = await ctx.db.get(args.id);
    if (!object || object.ownerId !== actor._id || object.status !== "ready") return false;
    if (object.storageId) {
      const managed = await ctx.db
        .query("managedStorageBlobs")
        .withIndex("by_storage", (indexQuery) => indexQuery.eq("storageId", object.storageId))
        .unique();
      await ctx.storage.delete(object.storageId);
      if (managed) await ctx.db.delete(managed._id);
    }
    await ctx.db.delete(object._id);
    return true;
  },
});
`;
}
