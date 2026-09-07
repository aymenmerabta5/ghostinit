// @allow-long 330: executable generated Postgres quota harness validates both layouts and rollback
import { describe, expect, test } from "bun:test";
import { postgresMessagingAttachmentAdapterContent } from "../../src/templates/adapters/messaging/postgres-attachments.js";
import {
  DEFAULT_STORAGE_QUOTA,
  storageQuotaPolicyContent,
} from "../../src/templates/services/storage.js";

type Mode = "monorepo" | "single";
type Row = Record<string, unknown> & { id: string; ownerId: string; byteSize: number };

class TestStorageServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const policyJavascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
  storageQuotaPolicyContent().replaceAll("export ", ""),
);
const decideStorageQuota = Function(`${policyJavascript}; return decideStorageQuota;`)() as (
  byteSizes: readonly number[],
  expectedByteSize: number,
) => string;

function serializedTransactions() {
  let tail: Promise<void> = Promise.resolve();
  return async function run<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return await result;
  };
}

function rows(count: number, byteSize: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `attachment-${index}`,
    ownerId: "owner-a",
    conversationId: "conversation-a",
    byteSize,
    messageId: index % 2 === 0 ? `message-${index}` : null,
    uploadedAt: new Date(0),
  }));
}

function loadPostgresMessagingQuota(
  mode: Mode,
  initial: { attachments?: Row[]; objects?: Row[]; cleanup?: Row[] } = {},
) {
  const source = postgresMessagingAttachmentAdapterContent(mode)
    .replace(/^import .*;$/gm, "")
    .replaceAll("export ", "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const attachments = (initial.attachments ?? []).map((row) => ({ ...row }));
  const objects = (initial.objects ?? []).map((row) => ({ ...row }));
  const cleanup = (initial.cleanup ?? []).map((row) => ({ ...row }));
  const participants = [
    {
      id: "participant-a",
      ownerId: "owner-a",
      userId: "owner-a",
      conversationId: "conversation-a",
      byteSize: 1,
    },
  ];
  const table = (kind: string, columns: readonly string[]) =>
    Object.fromEntries([["__kind", kind], ...columns.map((column) => [column, column])]);
  const messageAttachments = table("attachments", [
    "id",
    "ownerId",
    "conversationId",
    "messageId",
    "storageKey",
    "byteSize",
    "uploadedAt",
    "expiresAt",
  ]);
  const storedObjects = table("objects", ["ownerId", "byteSize"]);
  const storageBlobCleanupQueue = table("cleanup", ["id", "ownerId", "byteSize"]);
  const conversationParticipants = table("participants", ["conversationId", "userId"]);
  const collection = (kind: string): Row[] => {
    if (kind === "attachments") return attachments;
    if (kind === "objects") return objects;
    if (kind === "cleanup") return cleanup;
    if (kind === "participants") return participants;
    throw new Error(`Unknown table ${kind}`);
  };
  const and =
    (...checks: Array<(row: Row) => boolean>) =>
    (row: Row) =>
      checks.every((check) => check(row));
  const eq = (column: string, value: unknown) => (row: Row) => row[column] === value;
  const gt = (column: string, value: unknown) => (row: Row) =>
    row[column] instanceof Date && value instanceof Date && row[column] > value;
  const isNull = (column: string) => (row: Row) =>
    row[column] === null || row[column] === undefined;
  let sequence = attachments.length + cleanup.length;
  const transaction = {
    async execute() {},
    select() {
      return {
        from(target: { __kind: string }) {
          return {
            where(predicate: (row: Row) => boolean) {
              return {
                async limit(limit: number) {
                  return collection(target.__kind).filter(predicate).slice(0, limit);
                },
              };
            },
          };
        },
      };
    },
    insert(target: { __kind: string }) {
      return {
        values(value: Omit<Row, "id"> & { id?: string }) {
          return {
            async returning() {
              const row = { id: value.id ?? `${target.__kind}-${++sequence}`, ...value } as Row;
              collection(target.__kind).push(row);
              return [row];
            },
          };
        },
      };
    },
    delete(target: { __kind: string }) {
      return {
        where(predicate: (row: Row) => boolean) {
          return {
            async returning() {
              const sourceRows = collection(target.__kind);
              const removed = sourceRows.filter(predicate);
              for (const row of removed) sourceRows.splice(sourceRows.indexOf(row), 1);
              return removed;
            },
          };
        },
      };
    },
  };
  const serialize = serializedTransactions();
  const db = {
    transaction<T>(work: (value: typeof transaction) => Promise<T>) {
      return serialize(async () => await work(transaction));
    },
  };
  let uuid = 0;
  const module = new Function(
    "db",
    "messageAttachments",
    "storedObjects",
    "storageBlobCleanupQueue",
    "conversationParticipants",
    "putFile",
    "decideStorageQuota",
    "DEFAULT_STORAGE_QUOTA",
    "StorageServiceError",
    "randomUUID",
    "and",
    "eq",
    "gt",
    "isNull",
    "sql",
    `${javascript}; return { reserveMessageAttachment, storeMessageAttachment };`,
  )(
    db,
    messageAttachments,
    storedObjects,
    storageBlobCleanupQueue,
    conversationParticipants,
    async () => {
      throw new Error("blob write failed");
    },
    decideStorageQuota,
    DEFAULT_STORAGE_QUOTA,
    TestStorageServiceError,
    () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
    and,
    eq,
    gt,
    isNull,
    () => ({ lock: true }),
  ) as {
    reserveMessageAttachment(input: {
      ownerId: string;
      conversationId: string;
      data: Uint8Array;
      mimeType: string;
      originalName: string;
    }): Promise<{ attachmentId: string }>;
    storeMessageAttachment(input: {
      ownerId: string;
      conversationId: string;
      data: Uint8Array;
      mimeType: string;
      originalName: string;
    }): Promise<{ attachmentId: string }>;
  };
  const input = (byteSize: number) => ({
    ownerId: "owner-a",
    conversationId: "conversation-a",
    data: new Uint8Array(byteSize),
    mimeType: "text/plain",
    originalName: "quota.txt",
  });
  return { ...module, input, attachments, objects, cleanup };
}

describe("durable messaging attachment quota", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} serializes count admission and includes claimed attachments`, async () => {
      const quota = loadPostgresMessagingQuota(mode, { attachments: rows(99, 1) });
      const results = await Promise.allSettled([
        quota.reserveMessageAttachment(quota.input(1)),
        quota.reserveMessageAttachment(quota.input(1)),
      ]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
      expect(quota.attachments).toHaveLength(100);
    });

    test(`${mode} enforces bytes and retains failed writes until cleanup`, async () => {
      const byteQuota = loadPostgresMessagingQuota(mode, {
        attachments: rows(9, 10 * 1024 * 1024),
        objects: [
          {
            id: "stored-tail",
            ownerId: "owner-a",
            byteSize: 10 * 1024 * 1024 - 1,
          },
        ],
      });
      await expect(byteQuota.reserveMessageAttachment(byteQuota.input(1))).resolves.toBeTruthy();
      await expect(byteQuota.reserveMessageAttachment(byteQuota.input(1))).rejects.toMatchObject({
        code: "STORAGE_QUOTA_EXCEEDED",
      });

      const rollback = loadPostgresMessagingQuota(mode, { attachments: rows(99, 1) });
      await expect(rollback.storeMessageAttachment(rollback.input(1))).rejects.toThrow(
        "blob write failed",
      );
      expect(rollback.attachments).toHaveLength(99);
      expect(rollback.cleanup).toEqual([
        expect.objectContaining({
          ownerId: "owner-a",
          byteSize: 1,
          source: "messaging-attachment-upload-cancel",
        }),
      ]);
      await expect(rollback.reserveMessageAttachment(rollback.input(1))).rejects.toMatchObject({
        code: "STORAGE_QUOTA_EXCEEDED",
      });
      rollback.cleanup.splice(0);
      await expect(rollback.reserveMessageAttachment(rollback.input(1))).resolves.toBeTruthy();
    });
  }
});
