import type { ProjectMode } from "../../../lib/addons.js";

export function postgresMessagingAttachmentAdapterContent(mode: ProjectMode): string {
  const databaseImports =
    mode === "monorepo"
      ? 'import { conversationParticipants, db, messageAttachments, storedObjects, storageBlobCleanupQueue } from "@repo/database";'
      : `import { db } from "../db";
import { conversationParticipants, messageAttachments } from "../db/schema/messaging";
import { storedObjects, storageBlobCleanupQueue } from "../db/schema/storage";`;
  const storageImport = mode === "monorepo" ? "@repo/storage" : "../storage";
  const serviceImport = mode === "monorepo" ? "@repo/services/storage" : "../services/storage";
  return `import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
${databaseImports}
import { putFile } from "${storageImport}";
import { decideStorageQuota, DEFAULT_STORAGE_QUOTA, StorageServiceError } from "${serviceImport}";

interface AttachmentReservationInput {
  ownerId: string;
  conversationId: string;
  data: Uint8Array;
  mimeType: string;
  originalName: string;
}

interface AttachmentReservation {
  attachmentId: string;
  storageKey: string;
  byteSize: number;
}

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

export function messageAttachmentStorageErrorCode(error: unknown): string | undefined {
  return error instanceof StorageServiceError ? error.code : undefined;
}

export async function authorizeMessageAttachmentUpload(
  conversationId: string,
  ownerId: string,
): Promise<boolean> {
  const rows = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, ownerId),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

async function reserveMessageAttachment(
  input: AttachmentReservationInput,
): Promise<AttachmentReservation> {
  const initialDecision = decideStorageQuota([], input.data.byteLength);
  if (initialDecision === "invalid") {
    throw new StorageServiceError("STORAGE_INVALID_FILE", "The uploaded file is not allowed");
  }
  const attachmentId = randomUUID();
  const storageKey = randomUUID();
  const createdAt = new Date();
  return await db.transaction(async (transaction) => {
    // This is the same per-owner lock used by standalone storage. It makes the
    // combined object/byte snapshot and reservation atomic across both paths.
    await transaction.execute(
      sql\`select pg_advisory_xact_lock(hashtextextended(\${"storage-owner:" + input.ownerId}, 0))\`,
    );
    const participant = await transaction
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, input.conversationId),
          eq(conversationParticipants.userId, input.ownerId),
        ),
      )
      .limit(1);
    if (participant.length !== 1) {
      throw new StorageServiceError("STORAGE_FORBIDDEN", "Conversation access denied");
    }
    const attachments = await transaction
      .select({ byteSize: messageAttachments.byteSize })
      .from(messageAttachments)
      .where(eq(messageAttachments.ownerId, input.ownerId))
      .limit(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1);
    const objects = await transaction
      .select({ byteSize: storedObjects.byteSize })
      .from(storedObjects)
      .where(eq(storedObjects.ownerId, input.ownerId))
      .limit(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1);
    const deleting = await transaction
      .select({ byteSize: storageBlobCleanupQueue.byteSize })
      .from(storageBlobCleanupQueue)
      .where(eq(storageBlobCleanupQueue.ownerId, input.ownerId))
      .limit(DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1);
    const decision = decideStorageQuota(
      [...attachments, ...objects, ...deleting].map(({ byteSize }) => byteSize ?? Number.NaN),
      input.data.byteLength,
    );
    if (decision === "invalid") {
      throw new StorageServiceError("STORAGE_WRITE_FAILED", "Storage accounting is invalid");
    }
    if (decision === "quota-exceeded") {
      throw new StorageServiceError("STORAGE_QUOTA_EXCEEDED", "Storage quota exceeded");
    }
    const expiresAt = new Date(
      createdAt.getTime() + DEFAULT_STORAGE_QUOTA.pendingReservationTtlMs,
    );
    const inserted = await transaction
      .insert(messageAttachments)
      .values({
        id: attachmentId,
        conversationId: input.conversationId,
        ownerId: input.ownerId,
        storageKey,
        mimeType: input.mimeType,
        byteSize: input.data.byteLength,
        originalName: safeAttachmentName(input.originalName),
        createdAt,
        expiresAt,
        uploadedAt: null,
      })
      .returning({ id: messageAttachments.id });
    if (inserted.length !== 1) {
      throw new StorageServiceError("STORAGE_WRITE_FAILED", "Attachment reservation failed");
    }
    return { attachmentId, storageKey, byteSize: input.data.byteLength };
  });
}

async function activateMessageAttachment(
  reservation: AttachmentReservation,
  ownerId: string,
  conversationId: string,
): Promise<void> {
  const activated = await db.transaction(async (transaction) => {
    const participant = await transaction
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, ownerId),
        ),
      )
      .limit(1);
    if (participant.length !== 1) return [];
    const now = new Date();
    return await transaction
      .update(messageAttachments)
      .set({ uploadedAt: now })
      .where(
        and(
          eq(messageAttachments.id, reservation.attachmentId),
          eq(messageAttachments.ownerId, ownerId),
          eq(messageAttachments.conversationId, conversationId),
          eq(messageAttachments.storageKey, reservation.storageKey),
          eq(messageAttachments.byteSize, reservation.byteSize),
          isNull(messageAttachments.messageId),
          isNull(messageAttachments.uploadedAt),
          gt(messageAttachments.expiresAt, now),
        ),
      )
      .returning({ id: messageAttachments.id });
  });
  if (activated.length !== 1) {
    throw new StorageServiceError("STORAGE_FORBIDDEN", "Conversation access was revoked during upload");
  }
}

async function cancelMessageAttachment(
  reservation: AttachmentReservation,
  ownerId: string,
): Promise<void> {
  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql\`select pg_advisory_xact_lock(hashtextextended(\${"storage-owner:" + ownerId}, 0))\`,
    );
    const removed = await transaction
      .delete(messageAttachments)
      .where(
        and(
          eq(messageAttachments.id, reservation.attachmentId),
          eq(messageAttachments.ownerId, ownerId),
          eq(messageAttachments.storageKey, reservation.storageKey),
          isNull(messageAttachments.messageId),
          isNull(messageAttachments.uploadedAt),
        ),
      )
      .returning({
        storageKey: messageAttachments.storageKey,
        byteSize: messageAttachments.byteSize,
      });
    if (removed.length === 0) return;
    if (removed.length !== 1) throw new Error("Attachment cancellation returned multiple rows");
    const now = new Date();
    const tombstones = await transaction
      .insert(storageBlobCleanupQueue)
      .values({
        storageKey: removed[0]!.storageKey,
        source: "messaging-attachment-upload-cancel",
        ownerId,
        byteSize: removed[0]!.byteSize,
        availableAt: now,
        updatedAt: now,
      })
      .returning({ id: storageBlobCleanupQueue.id });
    if (tombstones.length !== 1) throw new Error("Attachment cleanup tombstone was not committed");
  });
}

export async function storeMessageAttachment(input: AttachmentReservationInput): Promise<{
  attachmentId: string;
}> {
  const reservation = await reserveMessageAttachment(input);
  try {
    const stored = await putFile(
      input.data,
      safeAttachmentName(input.originalName),
      input.mimeType,
      reservation.storageKey,
    );
    if (
      stored.storageKey !== reservation.storageKey ||
      stored.byteSize !== reservation.byteSize
    ) {
      throw new StorageServiceError("STORAGE_WRITE_FAILED", "Storage backend changed the reservation");
    }
    await activateMessageAttachment(reservation, input.ownerId, input.conversationId);
    return { attachmentId: reservation.attachmentId };
  } catch (error) {
    await cancelMessageAttachment(reservation, input.ownerId).catch(() => undefined);
    throw error;
  }
}
`;
}
