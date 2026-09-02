// @allow-long 480: one generated adapter owns reservation, cleanup, quota, and blob lifecycle invariants
import type { ProjectMode } from "../../../lib/addons.js";

export function postgresStorageAdapterContent(mode: ProjectMode, withMessaging = false): string {
  const databaseImport =
    mode === "monorepo"
      ? `import { db, ${withMessaging ? "messageAttachments, " : ""}storedObjects, storageBlobCleanupQueue } from "@repo/database";`
      : `import { db } from "../../db";\n${withMessaging ? 'import { messageAttachments } from "../../db/schema/messaging";\n' : ""}import { storedObjects, storageBlobCleanupQueue } from "../../db/schema/storage";`;
  const blobImport = mode === "monorepo" ? "@repo/storage" : "../../storage";
  const serviceImport = mode === "monorepo" ? "@repo/services/storage" : "../../services/storage";
  const messagingUsage = withMessaging
    ? `const messageAttachmentUsage = await transaction
      .select({ byteSize: messageAttachments.byteSize })
      .from(messageAttachments)
      .where(eq(messageAttachments.ownerId, input.ownerId))
      .limit(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1);`
    : `const messageAttachmentUsage: Array<{ byteSize: number }> = [];`;
  return `// @allow-long 470: durable reservation, quota, cleanup, and blob lifecycle belong to one adapter
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
${databaseImport}
import { deleteFile, getFile, putFile } from "${blobImport}";
import { decideStorageQuota, DEFAULT_STORAGE_QUOTA, StorageServiceError, type OwnedStoragePort } from "${serviceImport}";

const MAX_CLEANUP_BATCH = 100;
const CLEANUP_LEASE_MS = 5 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

export interface StorageCleanupBatchResult {
  reservationsReleased: number;
  claimed: number;
  deleted: number;
  failed: number;
  leaseLost: number;
}

interface OwnedReservationInput {
  ownerId: string;
  byteSize: number;
  mimeType: string;
  originalName: string;
  createdAt: Date;
}

async function reserveOwnedObject(input: OwnedReservationInput): Promise<{
  reservationId: string;
  storageKey: string;
}> {
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > DEFAULT_STORAGE_QUOTA.maxObjectBytes) {
    throw new StorageServiceError("STORAGE_INVALID_FILE", "The uploaded file is not allowed");
  }
  const storageKey = randomUUID();
  return await db.transaction(async (transaction) => {
    // The durable pending row is the quota reservation. Serialize only the
    // short accounting transaction; external blob I/O happens after commit.
    await transaction.execute(
      sql\`select pg_advisory_xact_lock(hashtextextended(\${"storage-owner:" + input.ownerId}, 0))\`,
    );
    const existing = await transaction
      .select({ byteSize: storedObjects.byteSize })
      .from(storedObjects)
      .where(eq(storedObjects.ownerId, input.ownerId))
      .limit(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1);
    ${messagingUsage}
    const deleting = await transaction
      .select({ byteSize: storageBlobCleanupQueue.byteSize })
      .from(storageBlobCleanupQueue)
      .where(eq(storageBlobCleanupQueue.ownerId, input.ownerId))
      .limit(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1);
    const decision = decideStorageQuota(
      [...existing, ...messageAttachmentUsage, ...deleting].map(({ byteSize }) => byteSize ?? Number.NaN),
      input.byteSize,
    );
    if (decision === "invalid") throw new Error("Stored object accounting is invalid");
    if (decision === "quota-exceeded") {
      throw new StorageServiceError("STORAGE_QUOTA_EXCEEDED", "Storage quota exceeded");
    }
    const expiresAt = new Date(input.createdAt.getTime() + DEFAULT_STORAGE_QUOTA.pendingReservationTtlMs);
    const [reservation] = await transaction
      .insert(storedObjects)
      .values({
        ownerId: input.ownerId,
        storageKey,
        status: "pending",
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        originalName: input.originalName,
        expiresAt,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .returning({ id: storedObjects.id });
    if (!reservation) throw new Error("Storage quota reservation was not committed");
    return { reservationId: reservation.id, storageKey };
  });
}

async function bindOwnedReservation(
  reservationId: string,
  ownerId: string,
  blob: { storageKey: string; mimeType: string; byteSize: number; originalName: string },
): Promise<void> {
  const now = new Date();
  const [bound] = await db
    .update(storedObjects)
    .set({
      storageKey: blob.storageKey,
      mimeType: blob.mimeType,
      originalName: blob.originalName,
      updatedAt: now,
    })
    .where(
      and(
        eq(storedObjects.id, reservationId),
        eq(storedObjects.ownerId, ownerId),
        eq(storedObjects.status, "pending"),
        eq(storedObjects.byteSize, blob.byteSize),
        eq(storedObjects.storageKey, blob.storageKey),
        gt(storedObjects.expiresAt, now),
      ),
    )
    .returning({ id: storedObjects.id });
  if (!bound) throw new Error("Storage blob could not be bound to its quota reservation");
}

async function finalizeOwnedReservation(
  reservationId: string,
  ownerId: string,
  storageKey: string,
): Promise<typeof storedObjects.$inferSelect> {
  const now = new Date();
  const [ready] = await db
    .update(storedObjects)
    .set({ status: "ready", expiresAt: null, updatedAt: now })
    .where(
      and(
        eq(storedObjects.id, reservationId),
        eq(storedObjects.ownerId, ownerId),
        eq(storedObjects.status, "pending"),
        eq(storedObjects.storageKey, storageKey),
        gt(storedObjects.expiresAt, now),
      ),
    )
    .returning();
  if (!ready) throw new Error("Storage quota reservation could not be finalized");
  return ready;
}

async function cancelOwnedReservation(
  reservationId: string,
  ownerId: string,
): Promise<"cancelled" | "ready" | "missing"> {
  return await db.transaction(async (transaction) => {
    const [cancelled] = await transaction
      .delete(storedObjects)
      .where(
        and(
          eq(storedObjects.id, reservationId),
          eq(storedObjects.ownerId, ownerId),
          eq(storedObjects.status, "pending"),
        ),
      )
      .returning({ storageKey: storedObjects.storageKey, byteSize: storedObjects.byteSize });
    if (cancelled) {
      if (cancelled.storageKey) {
        const now = new Date();
        const tombstones = await transaction
          .insert(storageBlobCleanupQueue)
          .values({
            storageKey: cancelled.storageKey,
            source: "stored-object-upload-cancel",
            ownerId,
            byteSize: cancelled.byteSize,
            availableAt: now,
            updatedAt: now,
          })
          .returning({ id: storageBlobCleanupQueue.id });
        if (tombstones.length !== 1) throw new Error("Storage cancellation tombstone was not committed");
      }
      return "cancelled";
    }
    const [existing] = await transaction
      .select({ status: storedObjects.status })
      .from(storedObjects)
      .where(and(eq(storedObjects.id, reservationId), eq(storedObjects.ownerId, ownerId)))
      .limit(1);
    return existing?.status === "ready" ? "ready" : "missing";
  });
}

async function releaseExpiredReservation(expiredAt: Date): Promise<boolean> {
  return await db.transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({ id: storedObjects.id })
      .from(storedObjects)
      .where(and(eq(storedObjects.status, "pending"), lte(storedObjects.expiresAt, expiredAt)))
      .orderBy(asc(storedObjects.expiresAt), asc(storedObjects.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return false;
    const [released] = await transaction
      .delete(storedObjects)
      .where(
        and(
          eq(storedObjects.id, candidate.id),
          eq(storedObjects.status, "pending"),
          lte(storedObjects.expiresAt, expiredAt),
        ),
      )
      .returning({
        ownerId: storedObjects.ownerId,
        storageKey: storedObjects.storageKey,
        byteSize: storedObjects.byteSize,
      });
    if (!released) return false;
    if (released.storageKey) {
      const tombstones = await transaction
        .insert(storageBlobCleanupQueue)
        .values({
          storageKey: released.storageKey,
          source: "stored-object-reservation-expired",
          ownerId: released.ownerId,
          byteSize: released.byteSize,
          availableAt: expiredAt,
          updatedAt: expiredAt,
        })
        .returning({ id: storageBlobCleanupQueue.id });
      if (tombstones.length !== 1) throw new Error("Expired storage reservation tombstone was not committed");
    }
    return true;
  });
}

function boundedCleanupLimit(value: number | undefined): number {
  const limit = value ?? MAX_CLEANUP_BATCH;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CLEANUP_BATCH) {
    throw new Error("Storage cleanup limit must be an integer between 1 and 100");
  }
  return limit;
}

function retryAt(attempt: number, failedAt: Date): Date {
  const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** Math.min(Math.max(attempt, 1), 11));
  return new Date(failedAt.getTime() + delay);
}

async function claimCleanupRow(claimedAt: Date) {
  return await db.transaction(async (transaction) => {
    const candidates = await transaction
      .select({ id: storageBlobCleanupQueue.id })
      .from(storageBlobCleanupQueue)
      .where(
        and(
          lte(storageBlobCleanupQueue.availableAt, claimedAt),
          or(
            isNull(storageBlobCleanupQueue.leaseToken),
            lte(storageBlobCleanupQueue.leaseExpiresAt, claimedAt),
          ),
        ),
      )
      .orderBy(
        asc(storageBlobCleanupQueue.availableAt),
        asc(storageBlobCleanupQueue.createdAt),
        asc(storageBlobCleanupQueue.id),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return [];
    const leaseToken = randomBytes(32).toString("base64url");
    const leaseExpiresAt = new Date(claimedAt.getTime() + CLEANUP_LEASE_MS);
    return await transaction
      .update(storageBlobCleanupQueue)
      .set({
        attempt: sql\`\${storageBlobCleanupQueue.attempt} + 1\`,
        leaseToken,
        leaseExpiresAt,
        updatedAt: claimedAt,
      })
      .where(
        and(
          eq(storageBlobCleanupQueue.id, candidates[0]!.id),
          lte(storageBlobCleanupQueue.availableAt, claimedAt),
          or(
            isNull(storageBlobCleanupQueue.leaseToken),
            lte(storageBlobCleanupQueue.leaseExpiresAt, claimedAt),
          ),
        ),
      )
      .returning();
  });
}

/**
 * Claim and drain at most 100 durable tombstones. Leases make concurrent
 * workers exclusive, while an expired lease makes a crash retryable. A crash
 * after blob deletion but before queue acknowledgement is safe because
 * deleteFile is idempotent.
 */
export async function runPostgresStorageCleanupBatch(
  input: { limit?: number; now?: Date } = {},
): Promise<StorageCleanupBatchResult> {
  const limit = boundedCleanupLimit(input.limit);
  let reservationsReleased = 0;
  let claimed = 0;
  let deleted = 0;
  let failed = 0;
  let leaseLost = 0;
  for (let index = 0; index < limit; index += 1) {
    if (!(await releaseExpiredReservation(input.now ?? new Date()))) break;
    reservationsReleased += 1;
  }
  for (let index = 0; index < limit; index += 1) {
    const claimedAt = input.now ?? new Date();
    const row = (await claimCleanupRow(claimedAt))[0];
    if (!row) break;
    claimed += 1;
    if (!row.leaseToken) throw new Error("Claimed storage cleanup row has no lease token");
    try {
      await deleteFile(row.storageKey);
      const settledAt = input.now ?? new Date();
      const acknowledged = await db
        .delete(storageBlobCleanupQueue)
        .where(
          and(
            eq(storageBlobCleanupQueue.id, row.id),
            eq(storageBlobCleanupQueue.leaseToken, row.leaseToken),
            gt(storageBlobCleanupQueue.leaseExpiresAt, settledAt),
          ),
        )
        .returning({ id: storageBlobCleanupQueue.id });
      if (acknowledged.length === 1) deleted += 1;
      else leaseLost += 1;
    } catch {
      const failedAt = input.now ?? new Date();
      const released = await db
        .update(storageBlobCleanupQueue)
        .set({
          availableAt: retryAt(row.attempt, failedAt),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: "Blob deletion failed",
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(storageBlobCleanupQueue.id, row.id),
            eq(storageBlobCleanupQueue.leaseToken, row.leaseToken),
            gt(storageBlobCleanupQueue.leaseExpiresAt, failedAt),
          ),
        )
        .returning({ id: storageBlobCleanupQueue.id });
      if (released.length === 1) failed += 1;
      else leaseLost += 1;
    }
  }
  return { reservationsReleased, claimed, deleted, failed, leaseLost };
}

export interface OwnedStoredObject {
  id: string;
  ownerId: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  createdAt: Date;
}

function publicObject(row: typeof storedObjects.$inferSelect): OwnedStoredObject {
  const byteSize = row.byteSize;
  if (!Number.isSafeInteger(byteSize) || byteSize < 1) throw new Error("Stored object size is invalid");
  if (row.status !== "ready" || !row.storageKey) throw new Error("Stored object is not ready");
  return {
    id: row.id,
    ownerId: row.ownerId,
    mimeType: row.mimeType,
    byteSize,
    originalName: row.originalName,
    createdAt: row.createdAt,
  };
}

/** Storage keys never cross this actor-owned adapter boundary. */
export const postgresOwnedStorageAdapter = {
  async putOwned(input: {
    ownerId: string;
    data: Uint8Array;
    originalName: string;
    mimeType: string;
    createdAt?: Date;
  }): Promise<OwnedStoredObject> {
    if (!input.ownerId.trim()) throw new Error("Storage actor is required");
    const createdAt = input.createdAt ?? new Date();
    const reservation = await reserveOwnedObject({
      ownerId: input.ownerId,
      byteSize: input.data.byteLength,
      mimeType: input.mimeType,
      originalName: input.originalName,
      createdAt,
    });
    let blob: Awaited<ReturnType<typeof putFile>> | undefined;
    try {
      blob = await putFile(
        input.data,
        input.originalName,
        input.mimeType,
        reservation.storageKey,
      );
      if (blob.storageKey !== reservation.storageKey || blob.byteSize !== input.data.byteLength) {
        throw new Error("Storage backend changed the reserved object size");
      }
      await bindOwnedReservation(reservation.reservationId, input.ownerId, blob);
      return publicObject(
        await finalizeOwnedReservation(reservation.reservationId, input.ownerId, blob.storageKey),
      );
    } catch (error) {
      const outcome = await cancelOwnedReservation(reservation.reservationId, input.ownerId).catch(
        () => "missing" as const,
      );
      if (blob && outcome !== "ready") await deleteFile(blob.storageKey).catch(() => undefined);
      throw error;
    }
  },
  async getOwned(input: { ownerId: string; id: string }) {
    const rows = await db
      .select()
      .from(storedObjects)
      .where(
        and(
          eq(storedObjects.id, input.id),
          eq(storedObjects.ownerId, input.ownerId),
          eq(storedObjects.status, "ready"),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.status !== "ready" || !row.storageKey) throw new Error("Stored object is not ready");
    const data = await getFile(row.storageKey);
    return data ? { object: publicObject(row), data } : null;
  },
  /**
   * The owner-scoped metadata deletion and durable tombstone insert commit as
   * one transaction. Returning true means cleanup was durably accepted; the
   * bounded worker owns idempotent blob deletion and retry.
   */
  async deleteOwned(input: { ownerId: string; id: string }): Promise<boolean> {
    const queued = await db.transaction(async (transaction) => {
      const deleted = await transaction
        .delete(storedObjects)
        .where(
          and(
            eq(storedObjects.id, input.id),
            eq(storedObjects.ownerId, input.ownerId),
            eq(storedObjects.status, "ready"),
          ),
        )
        .returning({
          ownerId: storedObjects.ownerId,
          storageKey: storedObjects.storageKey,
          byteSize: storedObjects.byteSize,
        });
      const row = deleted[0];
      if (!row) return null;
      if (deleted.length !== 1) throw new Error("Storage metadata deletion returned multiple rows");
      if (!row.storageKey) throw new Error("Ready storage object has no blob key");
      const now = new Date();
      const tombstones = await transaction
        .insert(storageBlobCleanupQueue)
        .values({
          storageKey: row.storageKey,
          source: "stored-object-delete",
          ownerId: row.ownerId,
          byteSize: row.byteSize,
          availableAt: now,
          updatedAt: now,
        })
        .returning({ id: storageBlobCleanupQueue.id });
      if (tombstones.length !== 1) throw new Error("Storage cleanup tombstone was not committed");
      return row;
    });
    return queued !== null;
  },
} satisfies OwnedStoragePort;
`;
}
