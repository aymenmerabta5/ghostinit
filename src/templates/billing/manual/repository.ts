import type { ProjectMode } from "../../../lib/addons.js";

export function postgresManualPaymentRepositoryContent(mode: ProjectMode): string {
  const databaseImport =
    mode === "monorepo"
      ? 'import { db, users, manualPayments, manualCreditLedger } from "@repo/database";'
      : 'import { db } from "@/server/db";\nimport { users } from "@/server/db/schema/auth";\nimport { manualPayments, manualCreditLedger } from "@/server/db/schema/manual-payments";';
  const storageImport = mode === "monorepo" ? "@repo/storage" : "@/server/storage";
  return `import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
${databaseImport}
import { deleteFile, getFile, putFile } from "${storageImport}";
import { ManualPaymentError, MAX_MANUAL_PENDING, MAX_MANUAL_RECEIPTS_PER_OWNER,
  type ManualPayment, type ManualPaymentRepository, type ValidatedManualPaymentSubmitInput,
} from "../../domain/manual-payment";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryConnection = Pick<Transaction, "select">;
type PaymentRow = typeof manualPayments.$inferSelect;

async function requireActor(connection: QueryConnection, id: string, admin = false) {
  const [actor] = await connection.select({ id: users.id, role: users.role, banned: users.banned, emailVerified: users.emailVerified })
    .from(users).where(eq(users.id, id)).limit(1).for("share");
  if (!actor) throw new ManualPaymentError("UNAUTHENTICATED", "Sign in to access manual payments");
  if (actor.banned || !actor.emailVerified) throw new ManualPaymentError("FORBIDDEN", "An active verified account is required");
  if (admin && actor.role !== "admin" && actor.role !== "superAdmin") throw new ManualPaymentError("FORBIDDEN", "Administrator access is required");
  return { id: actor.id, role: actor.role };
}

function paymentDto(row: PaymentRow): ManualPayment {
  if (row.currency !== "DZD" || !["pending", "approved", "rejected"].includes(row.status) || !Number.isSafeInteger(row.amountMinor)) {
    throw new Error("Manual payment record is invalid or upload is incomplete");
  }
  return { id: row.id, ownerId: row.ownerId, amountMinor: row.amountMinor, currency: "DZD",
    status: row.status as ManualPayment["status"], method: row.method, reference: row.reference,
    createdAt: row.createdAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewerId: row.reviewerId, reason: row.reason };
}

function hash(data: Uint8Array | string): string { return createHash("sha256").update(data).digest("hex"); }

async function balance(connection: QueryConnection, id: string): Promise<number> {
  // Sum in PostgreSQL numeric first: never let JavaScript round an oversized total.
  const [total] = await connection.select({ amount: sql<string>\`coalesce(sum(\${manualCreditLedger.amountMinor}), 0)::text\` })
    .from(manualCreditLedger).where(eq(manualCreditLedger.ownerId, id));
  const value = BigInt(total?.amount ?? "0");
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ManualPaymentError("LIMIT_EXCEEDED", "Balance exceeds the supported limit");
  return Number(value);
}

async function reserve(id: string, input: ValidatedManualPaymentSubmitInput): Promise<PaymentRow> {
  const receiptHash = hash(input.receipt.data);
  const fingerprint = hash(JSON.stringify([input.amountMinor, input.method, input.reference, receiptHash, input.receipt.mimeType, input.receipt.originalName]));
  return await db.transaction(async (transaction) => {
    await requireActor(transaction, id);
    await transaction.execute(sql\`select pg_advisory_xact_lock(hashtextextended(\${"manual-owner:" + id}, 0))\`);
    const [existing] = await transaction.select().from(manualPayments)
      .where(and(eq(manualPayments.ownerId, id), eq(manualPayments.requestKey, input.requestKey))).limit(1);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw new ManualPaymentError("CONFLICT", "Submission key was already used for a different payment");
      return existing;
    }
    await transaction.execute(sql\`select pg_advisory_xact_lock(hashtextextended(\${"manual-receipt:" + receiptHash}, 0))\`);
    const [duplicateReceipt] = await transaction.select().from(manualPayments)
      .where(eq(manualPayments.receiptHash, receiptHash)).limit(1);
    if (duplicateReceipt) {
      // A browser refresh can lose the submission key after reserving the blob.
      // Only the same owner and unchanged payment can resume an unfinished upload;
      // the original payment id/key are retained and completed receipts stay unique.
      if (duplicateReceipt.ownerId === id && duplicateReceipt.status === "uploading" && duplicateReceipt.requestFingerprint === fingerprint) return duplicateReceipt;
      throw new ManualPaymentError("CONFLICT", "This receipt has already been submitted");
    }
    const owned = await transaction.select({ status: manualPayments.status }).from(manualPayments)
      .where(eq(manualPayments.ownerId, id)).limit(MAX_MANUAL_RECEIPTS_PER_OWNER + 1);
    if (owned.length >= MAX_MANUAL_RECEIPTS_PER_OWNER || owned.filter((row) => row.status === "pending" || row.status === "uploading").length >= MAX_MANUAL_PENDING) {
      throw new ManualPaymentError("LIMIT_EXCEEDED", "Manual payment submission limit reached");
    }
    const [row] = await transaction.insert(manualPayments).values({
      ownerId: id, amountMinor: input.amountMinor, currency: "DZD", method: input.method,
      reference: input.reference || null, requestKey: input.requestKey, requestFingerprint: fingerprint,
      receiptKey: randomUUID(), receiptHash, receiptMimeType: input.receipt.mimeType,
      receiptOriginalName: input.receipt.originalName, receiptByteSize: input.receipt.data.byteLength,
    }).returning();
    if (!row) throw new Error("Manual payment reservation was not committed");
    return row;
  });
}

/** Durable reservations retain the blob key before I/O. Retrying the same payload resumes a crashed upload. */
async function storeReceipt(row: PaymentRow, input: ValidatedManualPaymentSubmitInput, signal: AbortSignal): Promise<void> {
  const existing = await getFile(row.receiptKey, signal);
  if (existing) {
    if (existing.byteLength === 0) {
      // A failed exclusive local write deliberately leaves a truncated file.
      // The caller locks this still-uploading row, so only its writer can repair it.
      await deleteFile(row.receiptKey, signal);
    } else {
      if (hash(existing) !== row.receiptHash) throw new Error("Reserved receipt contents changed");
      return;
    }
  }
  try {
    const stored = await putFile(input.receipt.data, row.receiptOriginalName, row.receiptMimeType, row.receiptKey, signal);
    if (stored.storageKey !== row.receiptKey || stored.byteSize !== row.receiptByteSize) throw new Error("Storage changed reserved receipt metadata");
  } catch (error) {
    // A network error after object creation is ambiguous. Keep a complete receipt,
    // and never accept different bytes under the reserved key.
    const recovered = await getFile(row.receiptKey, signal);
    if (!recovered || hash(recovered) !== row.receiptHash) throw error;
  }
}

export const postgresManualPaymentRepository: ManualPaymentRepository = {
  async requireActor(id) { return await requireActor(db, id); },
  async balance(id) {
    return await db.transaction(async (transaction) => { await requireActor(transaction, id); return await balance(transaction, id); });
  },
  async list(id) {
    return await db.transaction(async (transaction) => {
      await requireActor(transaction, id);
      const rows = await transaction.select().from(manualPayments)
        .where(and(eq(manualPayments.ownerId, id), ne(manualPayments.status, "uploading")))
        .orderBy(desc(manualPayments.createdAt), desc(manualPayments.id)).limit(100);
      return rows.map(paymentDto);
    });
  },
  async reviewQueue(id) {
    return await db.transaction(async (transaction) => {
      await requireActor(transaction, id, true);
      const rows = await transaction.select().from(manualPayments)
        .where(eq(manualPayments.status, "pending")).orderBy(asc(manualPayments.createdAt), asc(manualPayments.id)).limit(100);
      return rows.map(paymentDto);
    });
  },
  async submit(id, input) {
    const reserved = await reserve(id, input);
    if (reserved.status !== "uploading") return paymentDto(reserved);
    return await db.transaction(async (transaction) => {
      await requireActor(transaction, id);
      const [locked] = await transaction.select().from(manualPayments)
        .where(and(eq(manualPayments.id, reserved.id), eq(manualPayments.ownerId, id))).limit(1).for("update");
      if (!locked) throw new Error("Manual payment reservation disappeared");
      if (locked.status !== "uploading") return paymentDto(locked);
      const signal = AbortSignal.timeout(30_000);
      await storeReceipt(locked, input, signal);
      signal.throwIfAborted();
      const [ready] = await transaction.update(manualPayments).set({ status: "pending" })
        .where(and(eq(manualPayments.id, reserved.id), eq(manualPayments.ownerId, id), eq(manualPayments.status, "uploading"))).returning();
      if (ready) return paymentDto(ready);
      const [existing] = await transaction.select().from(manualPayments)
        .where(and(eq(manualPayments.id, reserved.id), eq(manualPayments.ownerId, id))).limit(1);
      if (!existing) throw new Error("Manual payment reservation disappeared");
      return paymentDto(existing);
    });
  },
  async receipt(id, paymentId) {
    const row = await db.transaction(async (transaction) => {
      const actor = await requireActor(transaction, id);
      const [payment] = await transaction.select().from(manualPayments)
        .where(and(eq(manualPayments.id, paymentId), inArray(manualPayments.status, ["pending", "approved", "rejected"]),
          ...(actor.role === "admin" || actor.role === "superAdmin" ? [] : [eq(manualPayments.ownerId, id)]))).limit(1);
      if (!payment) throw new ManualPaymentError("NOT_FOUND", "Payment receipt was not found");
      return payment;
    });
    const data = await getFile(row.receiptKey, AbortSignal.timeout(30_000));
    if (!data || data.byteLength !== row.receiptByteSize || hash(data) !== row.receiptHash) throw new Error("Payment receipt is unavailable or changed");
    // Recheck after external I/O so suspension/revocation during retrieval fails closed.
    const current = await requireActor(db, id);
    if (current.id !== row.ownerId && current.role !== "admin" && current.role !== "superAdmin") throw new ManualPaymentError("NOT_FOUND", "Payment receipt was not found");
    return { data, mimeType: row.receiptMimeType, originalName: row.receiptOriginalName };
  },
  async review(id, input) {
    return await db.transaction(async (transaction) => {
      await requireActor(transaction, id, true);
      const [payment] = await transaction.select().from(manualPayments).where(eq(manualPayments.id, input.id)).limit(1).for("update");
      if (!payment || payment.status === "uploading") throw new ManualPaymentError("NOT_FOUND", "Payment was not found");
      if (payment.ownerId === id) throw new ManualPaymentError("FORBIDDEN", "You cannot review your own payment");
      if (payment.status !== "pending") {
        if (payment.status === input.decision) return paymentDto(payment);
        throw new ManualPaymentError("CONFLICT", "Payment has already been reviewed");
      }
      if (input.decision === "approved") {
        await transaction.execute(sql\`select pg_advisory_xact_lock(hashtextextended(\${"manual-owner:" + payment.ownerId}, 0))\`);
        const currentBalance = await balance(transaction, payment.ownerId);
        if (!Number.isSafeInteger(currentBalance + payment.amountMinor)) throw new ManualPaymentError("LIMIT_EXCEEDED", "Balance exceeds the supported limit");
        // Unique paymentId plus the locked payment row makes concurrent approvals credit once.
        await transaction.insert(manualCreditLedger).values({
          paymentId: payment.id,
          ownerId: payment.ownerId,
          amountMinor: payment.amountMinor,
          currency: "DZD",
        });
      }
      const [reviewed] = await transaction.update(manualPayments).set({ status: input.decision, reviewerId: id,
        reviewedAt: new Date(), reason: input.reason?.trim() || null }).where(and(eq(manualPayments.id, payment.id), eq(manualPayments.status, "pending"))).returning();
      if (!reviewed) throw new Error("Manual payment review was not committed");
      return paymentDto(reviewed);
    });
  },
};
`;
}
