export function convexStorageInternalContent(withMessaging = false): string {
  const messagingUsage = withMessaging
    ? `const [messageAttachmentUsage, messageUploadReservations] = await Promise.all([
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
    ]);`
    : `const messageAttachmentUsage: Array<{ byteSize: number }> = [];
    const messageUploadReservations: Array<{ expectedByteSize: number }> = [];`;
  const messagingReferenceLookup = withMessaging
    ? `const [attachmentReference, intentReference] = await Promise.all([
        ctx.db
          .query("attachmentStorage")
          .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", object._id))
          .unique(),
        ctx.db
          .query("attachmentUploadIntents")
          .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", object._id))
          .unique(),
      ]);`
    : `const attachmentReference = null;
      const intentReference = null;`;
  const managedCleanupReferenceLookup = withMessaging
    ? `const [attachmentReference, intentReference] = await Promise.all([
          ctx.db
            .query("attachmentStorage")
            .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", storageId))
            .unique(),
          ctx.db
            .query("attachmentUploadIntents")
            .withIndex("by_storageId", (indexQuery) => indexQuery.eq("storageId", storageId))
            .unique(),
        ]);`
    : `const attachmentReference = null;
        const intentReference = null;`;
  const managedLifecycleValidation = withMessaging
    ? `if (args.lifecycleKind === "storage") {
      const id = ctx.db.normalizeId("storedObjects", args.lifecycleId);
      if (!id || !(await ctx.db.get(id))) throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Managed upload lifecycle not found" });
    } else {
      const id = ctx.db.normalizeId("attachmentUploadIntents", args.lifecycleId);
      if (!id || !(await ctx.db.get(id))) throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Managed upload lifecycle not found" });
    }`
    : `if (args.lifecycleKind !== "storage") {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Managed upload lifecycle not found" });
    }
    const id = ctx.db.normalizeId("storedObjects", args.lifecycleId);
    if (!id || !(await ctx.db.get(id))) throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Managed upload lifecycle not found" });`;
  const messagingRowOnlyRetirement = withMessaging
    ? `if (managed.lifecycleKind === "messaging") {
    const id = ctx.db.normalizeId("attachmentUploadIntents", managed.lifecycleId);
    if (!id) return false;
    const intent = await ctx.db.get(id);
    return !intent || (intent.status === "pending" && intent.expiresAt <= now);
  }`
    : `if (managed.lifecycleKind === "messaging") return false;`;
  return `// @allow-long 300: capability-owned upload registry and starvation-safe cleanup lifecycle
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { requireActor } from "./lib/auth";
import { decideStorageQuota, DEFAULT_STORAGE_QUOTA, isManagedStorageContentType, managedStorageBaseMimeType, managedStorageContentType, managedStorageToken } from "./storagePolicy";

const MAX_PENDING_UPLOADS_PER_ACTOR = 4;
const CLEANUP_RETRY_BASE_MS = 60_000;
const CLEANUP_RETRY_MAX_MS = 60 * 60_000;
const MANAGED_ORPHAN_GRACE_MS = 30 * 60 * 1000;
const MANAGED_SWEEP_LEASE_MS = 4 * 60 * 1000;
const MAX_ORPHAN_PAGE = 100;
const MANAGED_TOKEN = /^[0-9a-f]{32}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const allowedMime = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

function safeName(input: string): string {
  let leafStart = 0;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code === 0x2f || code === 0x5c) leafStart = index + 1;
  }
  const leaf = Array.from(input.slice(leafStart), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f ? "_" : character;
  }).join("").trim();
  return Array.from(leaf || "attachment").slice(0, 255).join("");
}

function cleanupBackoff(attempts: number): number {
  return Math.min(CLEANUP_RETRY_BASE_MS * 2 ** Math.min(attempts, 10), CLEANUP_RETRY_MAX_MS);
}

async function canRetireUnboundManagedBlob(
  ctx: MutationCtx,
  managed: Doc<"managedStorageBlobs">,
  now: number,
): Promise<boolean> {
  if (managed.status !== "reserved" || managed.storageId !== undefined) return false;
  if (managed.lifecycleKind === "storage") {
    const id = ctx.db.normalizeId("storedObjects", managed.lifecycleId);
    if (!id) return false;
    const object = await ctx.db.get(id);
    return !object || object.status === "cleanup" || (object.status === "pending" && (object.expiresAt ?? Infinity) <= now);
  }
  ${messagingRowOnlyRetirement}
  return false;
}

export const reserveManagedBlob = internalMutation({
  args: {
    token: v.string(),
    lifecycleKind: v.union(v.literal("storage"), v.literal("messaging")),
    lifecycleId: v.string(),
    expectedByteSize: v.number(),
    expectedMimeType: v.string(),
    expectedSha256: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedMimeType = args.expectedMimeType.trim().toLowerCase();
    if (
      !MANAGED_TOKEN.test(args.token) ||
      !SHA256_HEX.test(args.expectedSha256) ||
      !Number.isSafeInteger(args.expectedByteSize) ||
      args.expectedByteSize < 1 ||
      args.expectedByteSize > DEFAULT_STORAGE_QUOTA.maxObjectBytes ||
      !allowedMime.has(expectedMimeType)
    ) {
      throw new ConvexError({ code: "INVALID_FILE", message: "Managed upload metadata is invalid" });
    }
    ${managedLifecycleValidation}
    const existing = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_token", (indexQuery) => indexQuery.eq("token", args.token))
      .unique();
    if (existing) {
      throw new ConvexError({ code: "STORAGE_CONFLICT", message: "Managed upload token already exists" });
    }
    const now = Date.now();
    const managedContentType = managedStorageContentType(expectedMimeType, args.token);
    await ctx.db.insert("managedStorageBlobs", {
      token: args.token,
      lifecycleKind: args.lifecycleKind,
      lifecycleId: args.lifecycleId,
      expectedByteSize: args.expectedByteSize,
      expectedMimeType,
      expectedSha256: args.expectedSha256,
      managedContentType,
      status: "reserved",
      createdAt: now,
      updatedAt: now,
    });
    return { managedContentType };
  },
});

export const bindManagedBlob = internalMutation({
  args: { token: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const managed = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_token", (indexQuery) => indexQuery.eq("token", args.token))
      .unique();
    if (
      !managed ||
      managed.status === "cleanup" ||
      (managed.storageId !== undefined && managed.storageId !== args.storageId)
    ) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Managed upload not found" });
    }
    const claimed = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_storage", (indexQuery) => indexQuery.eq("storageId", args.storageId))
      .unique();
    if (claimed && claimed._id !== managed._id) {
      throw new ConvexError({ code: "STORAGE_CONFLICT", message: "Storage object is already registered" });
    }
    const metadata = await ctx.db.system.get(args.storageId);
    if (
      !metadata ||
      metadata.size !== managed.expectedByteSize ||
      metadata.sha256 !== managed.expectedSha256 ||
      metadata.contentType !== managed.managedContentType
    ) {
      throw new ConvexError({ code: "INVALID_FILE", message: "Managed storage metadata is invalid" });
    }
    await ctx.db.patch(managed._id, {
      storageId: args.storageId,
      status: "bound",
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const requestManagedBlobCleanup = internalMutation({
  args: { token: v.string(), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const managed = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_token", (indexQuery) => indexQuery.eq("token", args.token))
      .unique();
    if (!managed) return { ok: true as const };
    if (managed.storageId !== undefined && args.storageId !== undefined && managed.storageId !== args.storageId) {
      throw new ConvexError({ code: "STORAGE_CONFLICT", message: "Managed storage mismatch" });
    }
    const storageId = args.storageId ?? managed.storageId;
    // A failed action may not know whether ctx.storage.store committed before
    // the process died. Without an opaque storage ID, retain the namespaced
    // token/digest record for the bounded _storage sweep instead of deleting
    // the only proof that a later-discovered blob belongs to this application.
    if (!storageId) {
      await ctx.db.patch(managed._id, {
        status: "reserved",
        cleanupAfter: undefined,
        lastError: "Awaiting managed orphan sweep",
        updatedAt: Date.now(),
      });
      return { ok: true as const, deferred: true as const };
    }
    await ctx.db.patch(managed._id, {
      storageId,
      status: "cleanup",
      cleanupAfter: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const completeManagedBlobCleanup = internalMutation({
  args: { token: v.string(), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const managed = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_token", (indexQuery) => indexQuery.eq("token", args.token))
      .unique();
    if (!managed) return { ok: true as const };
    if (
      managed.status !== "cleanup" ||
      (managed.storageId !== undefined && managed.storageId !== args.storageId)
    ) {
      return { ok: false as const };
    }
    await ctx.db.delete(managed._id);
    return { ok: true as const };
  },
});

async function deleteRegisteredObject(
  ctx: MutationCtx,
  object: Doc<"storedObjects">,
  now: number,
): Promise<"deleted" | "deferred"> {
  if (!object.storageId) {
    const managed = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_lifecycle", (indexQuery) =>
        indexQuery.eq("lifecycleKind", "storage").eq("lifecycleId", String(object._id)),
      )
      .unique();
    if (managed) {
      // Keep the quota reservation until a complete namespaced storage sweep
      // either discovers and deletes the crash-orphan or an operator resolves
      // the retained proof. Freeing quota first would hide retained bytes.
      if (managed.status === "cleanup") {
        await ctx.db.patch(managed._id, {
          status: "reserved",
          cleanupAfter: undefined,
          lastError: "Awaiting managed orphan sweep",
          updatedAt: now,
        });
      }
      return "deferred";
    }
    await ctx.db.delete(object._id);
    return "deleted";
  }
  try {
    const managed = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_storage", (indexQuery) => indexQuery.eq("storageId", object.storageId))
      .unique();
    await ctx.storage.delete(object.storageId);
    if (managed) await ctx.db.delete(managed._id);
    await ctx.db.delete(object._id);
    return "deleted";
  } catch {
    const attempts = (object.cleanupAttempts ?? 0) + 1;
    await ctx.db.patch(object._id, {
      status: "cleanup",
      expiresAt: undefined,
      cleanupAttempts: attempts,
      cleanupAfter: now + cleanupBackoff(attempts),
    });
    return "deferred";
  }
}

export const reserveUpload = internalMutation({
  args: { expectedByteSize: v.number(), expectedMimeType: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const now = Date.now();
    const expectedMimeType = args.expectedMimeType.trim().toLowerCase();
    if (
      !Number.isSafeInteger(args.expectedByteSize) ||
      args.expectedByteSize < 1 ||
      args.expectedByteSize > DEFAULT_STORAGE_QUOTA.maxObjectBytes ||
      !allowedMime.has(expectedMimeType)
    ) {
      throw new ConvexError({ code: "INVALID_FILE", message: "Uploaded file is not allowed" });
    }
    // This owner-index range read participates in Convex OCC. Concurrent
    // reservations conflict and retry, so count and byte limits cannot race.
    const owned = await ctx.db
      .query("storedObjects")
      .withIndex("by_owner", (indexQuery) => indexQuery.eq("ownerId", actor._id))
      .take(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1);
    ${messagingUsage}
    const decision = decideStorageQuota(
      [
        ...owned.map(({ byteSize }) => byteSize ?? Number.NaN),
        ...messageAttachmentUsage.map(({ byteSize }) => byteSize),
        ...messageUploadReservations.map(({ expectedByteSize }) => expectedByteSize),
      ],
      args.expectedByteSize,
    );
    if (decision === "invalid") {
      throw new ConvexError({ code: "STORAGE_ACCOUNTING_INVALID", message: "Stored object accounting is invalid" });
    }
    if (decision === "quota-exceeded") {
      throw new ConvexError({ code: "STORAGE_QUOTA_EXCEEDED", message: "Storage quota exceeded" });
    }
    const active = await ctx.db
      .query("storedObjects")
      .withIndex("by_owner_status_expiry", (indexQuery) =>
        indexQuery.eq("ownerId", actor._id).eq("status", "pending").gt("expiresAt", now),
      )
      .take(MAX_PENDING_UPLOADS_PER_ACTOR);
    if (active.length >= MAX_PENDING_UPLOADS_PER_ACTOR) {
      throw new ConvexError({ code: "UPLOAD_QUOTA_EXCEEDED", message: "Too many uploads are in progress" });
    }
    const uploadId = await ctx.db.insert("storedObjects", {
      ownerId: actor._id,
      status: "pending",
      byteSize: args.expectedByteSize,
      createdAt: now,
      expiresAt: now + DEFAULT_STORAGE_QUOTA.pendingReservationTtlMs,
      cleanupAfter: now + DEFAULT_STORAGE_QUOTA.pendingReservationTtlMs,
    });
    return { uploadId, ownerId: actor._id };
  },
});

/** Bind only the fresh ID returned by ctx.storage.store inside storage.upload. */
export const bindUploadStorage = internalMutation({
  args: {
    uploadId: v.id("storedObjects"),
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (
      !upload ||
      upload.ownerId !== args.ownerId ||
      upload.status !== "pending" ||
      !upload.expiresAt ||
      upload.expiresAt <= Date.now() ||
      (upload.storageId !== undefined && upload.storageId !== args.storageId)
    ) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Pending upload not found" });
    }
    const claimed = await ctx.db
      .query("storedObjects")
      .withIndex("by_storage", (indexQuery) => indexQuery.eq("storageId", args.storageId))
      .unique();
    if (claimed && claimed._id !== upload._id) {
      throw new ConvexError({ code: "STORAGE_CONFLICT", message: "Storage object is already registered" });
    }
    if (!(await ctx.db.system.get(args.storageId))) {
      throw new ConvexError({ code: "INVALID_FILE", message: "Stored upload not found" });
    }
    await ctx.db.patch(upload._id, { storageId: args.storageId });
    return { ok: true as const };
  },
});

export const finalizeUpload = internalMutation({
  args: {
    uploadId: v.id("storedObjects"),
    ownerId: v.id("users"),
    expectedMimeType: v.string(),
    expectedByteSize: v.number(),
    originalName: v.string(),
    managedToken: v.string(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (
      !upload ||
      upload.ownerId !== args.ownerId ||
      upload.status !== "pending" ||
      !upload.storageId ||
      upload.byteSize !== args.expectedByteSize ||
      !upload.expiresAt ||
      upload.expiresAt <= Date.now()
    ) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Pending upload not found" });
    }
    const managed = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_token", (indexQuery) => indexQuery.eq("token", args.managedToken))
      .unique();
    if (
      !managed ||
      managed.lifecycleKind !== "storage" ||
      managed.lifecycleId !== String(upload._id) ||
      managed.status !== "bound" ||
      managed.storageId !== upload.storageId
    ) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Managed upload not found" });
    }
    const metadata = await ctx.db.system.get(upload.storageId);
    const mimeType = managedStorageBaseMimeType(metadata?.contentType, args.managedToken);
    const expectedMimeType = args.expectedMimeType.toLowerCase();
    const byteSize = metadata?.size;
    if (
      !metadata ||
      !Number.isSafeInteger(byteSize) ||
      !byteSize ||
      byteSize > DEFAULT_STORAGE_QUOTA.maxObjectBytes ||
      byteSize !== args.expectedByteSize ||
      metadata.contentType !== managed.managedContentType ||
      metadata.sha256 !== managed.expectedSha256 ||
      !mimeType ||
      mimeType !== expectedMimeType ||
      !allowedMime.has(mimeType)
    ) {
      throw new ConvexError({ code: "INVALID_FILE", message: "Uploaded file metadata is invalid" });
    }
    const originalName = safeName(args.originalName);
    await ctx.db.patch(upload._id, {
      status: "ready",
      mimeType,
      byteSize,
      originalName,
      expiresAt: undefined,
      cleanupAfter: undefined,
      cleanupAttempts: undefined,
    });
    return {
      id: upload._id,
      mimeType,
      byteSize,
      originalName,
      createdAt: upload.createdAt,
    };
  },
});

export const abortUpload = internalMutation({
  args: { uploadId: v.id("storedObjects"), ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) return { ok: true as const };
    if (upload.ownerId !== args.ownerId) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Pending upload not found" });
    }
    if (upload.status === "ready") {
      return { ok: false as const, reason: "already-committed" as const };
    }
    const now = Date.now();
    await ctx.db.patch(upload._id, {
      status: "cleanup",
      expiresAt: undefined,
      cleanupAfter: now,
    });
    const outcome = await deleteRegisteredObject(ctx, { ...upload, status: "cleanup" }, now);
    return outcome === "deleted"
      ? { ok: true as const }
      : { ok: false as const, reason: "cleanup-deferred" as const };
  },
});

export const cleanupExpiredUploads = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 500) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Cleanup limit must be 1-500" });
    }
    const now = Date.now();
    const expired = await ctx.db
      .query("storedObjects")
      .withIndex("by_status_expiry", (indexQuery) => indexQuery.eq("status", "pending").lte("expiresAt", now))
      .take(args.limit);
    const retries = await ctx.db
      .query("storedObjects")
      .withIndex("by_status_cleanup", (indexQuery) =>
        indexQuery.eq("status", "cleanup").lte("cleanupAfter", now),
      )
      .take(args.limit);
    const candidates: Doc<"storedObjects">[] = [];
    for (let index = 0; candidates.length < args.limit; index += 1) {
      const expiredUpload = expired[index];
      const retry = retries[index];
      if (!expiredUpload && !retry) break;
      if (expiredUpload) candidates.push(expiredUpload);
      if (retry && candidates.length < args.limit) candidates.push(retry);
    }
    let deleted = 0;
    let deferred = 0;
    for (const object of candidates) {
      if (object.status === "pending") {
        await ctx.db.patch(object._id, {
          status: "cleanup",
          expiresAt: undefined,
          cleanupAfter: now,
        });
      }
      const outcome = await deleteRegisteredObject(ctx, object, now);
      if (outcome === "deleted") deleted += 1;
      else deferred += 1;
    }
    return { deleted, deferred };
  },
});

/** One durable page per cron tick; no recursive or overlapping full-table walk. */
export const stageManagedOrphanPage = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > MAX_ORPHAN_PAGE) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Orphan page limit must be 1-100" });
    }
    const sweepState = await ctx.db
      .query("managedStorageSweepState")
      .withIndex("by_key", (indexQuery) => indexQuery.eq("key", "managed-orphan-sweep"))
      .unique();
    const now = Date.now();
    if (sweepState?.leaseUntil && sweepState.leaseUntil > now) {
      return { staged: 0, preserved: 0, continueCursor: sweepState.cursor ?? null, leased: true as const };
    }
    const sweepStartedAt = sweepState?.cursor
      ? (sweepState.startedAt ?? sweepState.updatedAt)
      : now;
    const page = await ctx.db.system
      .query("_storage")
      .order("asc")
      .paginate({ cursor: sweepState?.cursor ?? null, numItems: args.limit });
    const cutoff = now - MANAGED_ORPHAN_GRACE_MS;
    let staged = 0;
    let preserved = 0;
    for (const object of page.page) {
      const token = managedStorageToken(object.contentType);
      if (!token || !isManagedStorageContentType(object.contentType)) {
        preserved += 1;
        continue;
      }
      const managed = await ctx.db
        .query("managedStorageBlobs")
        .withIndex("by_token", (indexQuery) => indexQuery.eq("token", token))
        .unique();
      if (object._creationTime > cutoff || !managed || managed.createdAt > cutoff) {
        if (managed?.status === "reserved") {
          await ctx.db.patch(managed._id, {
            lastError: "Managed blob is awaiting orphan-sweep grace",
            updatedAt: now,
          });
        }
        preserved += 1;
        continue;
      }
      if (
        managed.expectedByteSize !== object.size ||
        managed.expectedSha256 !== object.sha256 ||
        managed.managedContentType !== object.contentType ||
        (managed.storageId !== undefined && managed.storageId !== object._id)
      ) {
        // Seeing the token during this sweep prevents the row-only proof from
        // being retired. Mismatched metadata needs operator review rather than
        // losing the only ownership evidence for the physical blob.
        await ctx.db.patch(managed._id, {
          lastError: "Managed blob metadata mismatch during orphan sweep",
          updatedAt: now,
        });
        preserved += 1;
        continue;
      }
      const storedObjectReference = await ctx.db
        .query("storedObjects")
        .withIndex("by_storage", (indexQuery) => indexQuery.eq("storageId", object._id))
        .unique();
      ${messagingReferenceLookup}
      if (storedObjectReference || attachmentReference || intentReference) {
        if (managed.status === "reserved") {
          await ctx.db.patch(managed._id, {
            lastError: "Managed blob is referenced but not bound",
            updatedAt: now,
          });
        }
        preserved += 1;
        continue;
      }
      await ctx.db.patch(managed._id, {
        storageId: object._id,
        status: "cleanup",
        cleanupAfter: now,
        updatedAt: now,
      });
      staged += 1;
    }
    const nextCursor = page.isDone ? undefined : page.continueCursor;
    let retired = 0;
    if (page.isDone) {
      // A complete ascending _storage pass is the proof that an old unbound
      // reservation has no physical blob. Retire only rows untouched since the
      // pass began and whose application lifecycle is already expired/cleanup.
      const unobserved = await ctx.db
        .query("managedStorageBlobs")
        .withIndex("by_status_updated", (indexQuery) =>
          indexQuery.eq("status", "reserved").lt("updatedAt", sweepStartedAt),
        )
        .take(args.limit);
      for (const managed of unobserved) {
        if (
          managed.createdAt <= cutoff &&
          (await canRetireUnboundManagedBlob(ctx, managed, now))
        ) {
          await ctx.db.delete(managed._id);
          retired += 1;
        }
      }
    }
    if (sweepState) {
      await ctx.db.patch(sweepState._id, {
        cursor: nextCursor,
        startedAt: nextCursor ? sweepStartedAt : undefined,
        leaseUntil: now + MANAGED_SWEEP_LEASE_MS,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("managedStorageSweepState", {
        key: "managed-orphan-sweep",
        cursor: nextCursor,
        startedAt: nextCursor ? sweepStartedAt : undefined,
        leaseUntil: now + MANAGED_SWEEP_LEASE_MS,
        updatedAt: now,
      });
    }
    return { staged, preserved, retired, continueCursor: nextCursor ?? null, leased: false as const };
  },
});

export const cleanupManagedBlobBatch = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > MAX_ORPHAN_PAGE) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Managed cleanup limit must be 1-100" });
    }
    const now = Date.now();
    const candidates = await ctx.db
      .query("managedStorageBlobs")
      .withIndex("by_status_cleanup", (indexQuery) =>
        indexQuery.eq("status", "cleanup").lte("cleanupAfter", now),
      )
      .take(args.limit);
    let deleted = 0;
    let deferred = 0;
    for (const managed of candidates) {
      if (!managed.storageId) {
        // Never erase row-only ownership evidence. A later sweep can attach the
        // exact token+digest+MIME match if store committed before an action crash.
        await ctx.db.patch(managed._id, {
          status: "reserved",
          cleanupAfter: undefined,
          lastError: "Awaiting managed orphan sweep",
          updatedAt: now,
        });
        deferred += 1;
        continue;
      }
      const storageId = managed.storageId;
      const storedObjectReference = await ctx.db
        .query("storedObjects")
        .withIndex("by_storage", (indexQuery) => indexQuery.eq("storageId", storageId))
        .unique();
      ${managedCleanupReferenceLookup}
      if (storedObjectReference || attachmentReference || intentReference) {
        await ctx.db.patch(managed._id, {
          status: "bound",
          cleanupAfter: undefined,
          lastError: "Cleanup cancelled because the blob is referenced",
          updatedAt: now,
        });
        deferred += 1;
        continue;
      }
      try {
        await ctx.storage.delete(storageId);
        await ctx.db.delete(managed._id);
        deleted += 1;
      } catch {
        const attempts = (managed.cleanupAttempts ?? 0) + 1;
        await ctx.db.patch(managed._id, {
          cleanupAttempts: attempts,
          cleanupAfter: now + cleanupBackoff(attempts),
          lastError: "Managed blob deletion failed",
          updatedAt: now,
        });
        deferred += 1;
      }
    }
    return { deleted, deferred };
  },
});
`;
}
