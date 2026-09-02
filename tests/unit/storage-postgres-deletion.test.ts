import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { postgresStorageAdapterContent } from "../../src/templates/adapters/storage/postgres.js";

interface StoredRow {
  id: string;
  ownerId: string;
  storageKey: string;
  status?: "pending" | "ready";
  byteSize?: number;
  expiresAt?: Date | null;
}

interface CleanupRow {
  id: string;
  storageKey: string;
  source: string;
  ownerId?: string | null;
  byteSize?: number | null;
  attempt: number;
  availableAt: Date;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DeleteHarness {
  storedRows: StoredRow[];
  cleanupRows: CleanupRow[];
  events: string[];
  blobFailures: number;
  queueInsertFailures: number;
  queueAckFailures: number;
  replaceLeaseDuringBlobDelete: boolean;
}

interface GeneratedStorageModule {
  postgresOwnedStorageAdapter: {
    deleteOwned(input: { id: string; ownerId: string }): Promise<boolean>;
  };
  runPostgresStorageCleanupBatch(input?: { limit?: number; now?: Date }): Promise<{
    reservationsReleased: number;
    claimed: number;
    deleted: number;
    failed: number;
    leaseLost: number;
  }>;
}

const temporaryRoots: string[] = [];
const globalHarnessNames: string[] = [];

afterEach(async () => {
  for (const name of globalHarnessNames.splice(0)) {
    delete (globalThis as Record<string, unknown>)[name];
  }
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function cleanupRow(storageKey: string, availableAt = new Date(0)): CleanupRow {
  return {
    id: crypto.randomUUID(),
    storageKey,
    source: "test",
    ownerId: null,
    byteSize: null,
    attempt: 0,
    availableAt,
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

async function loadAdapter(harness: DeleteHarness): Promise<GeneratedStorageModule> {
  const root = await mkdtemp(join(tmpdir(), "ghostinit-storage-postgres-"));
  temporaryRoots.push(root);
  const harnessName = `__ghostinitStorageDelete_${crypto.randomUUID().replaceAll("-", "")}`;
  globalHarnessNames.push(harnessName);
  (globalThis as Record<string, unknown>)[harnessName] = harness;

  const fakes = `const harness = (globalThis as Record<string, unknown>)[${JSON.stringify(harnessName)}] as {
  storedRows: Array<Record<string, unknown>>;
  cleanupRows: Array<Record<string, unknown>>;
  events: string[];
  blobFailures: number;
  queueInsertFailures: number;
  queueAckFailures: number;
  replaceLeaseDuringBlobDelete: boolean;
};
type Predicate = { op: string; column?: string; value?: unknown; conditions?: Predicate[] };
const scalar = (value: unknown) => value instanceof Date ? value.getTime() : value;
const eq = (column: string, value: unknown): Predicate => ({ op: "eq", column, value });
const gt = (column: string, value: unknown): Predicate => ({ op: "gt", column, value });
const lte = (column: string, value: unknown): Predicate => ({ op: "lte", column, value });
const isNull = (column: string): Predicate => ({ op: "null", column });
const and = (...conditions: Predicate[]): Predicate => ({ op: "and", conditions });
const or = (...conditions: Predicate[]): Predicate => ({ op: "or", conditions });
const asc = (column: string) => column;
const sql = (_strings: TemplateStringsArray, ..._values: unknown[]) => ({ op: "increment" });
const matches = (row: Record<string, unknown>, predicate: Predicate): boolean => {
  if (predicate.op === "and") return predicate.conditions!.every((item) => matches(row, item));
  if (predicate.op === "or") return predicate.conditions!.some((item) => matches(row, item));
  const current = row[predicate.column!];
  if (predicate.op === "eq") return current === predicate.value;
  if (predicate.op === "null") return current === null || current === undefined;
  if (predicate.op === "gt") return Number(scalar(current)) > Number(scalar(predicate.value));
  if (predicate.op === "lte") return Number(scalar(current)) <= Number(scalar(predicate.value));
  throw new Error("Unknown predicate " + predicate.op);
};
const storedObjects = {
  __table: "stored",
  id: "id",
  ownerId: "ownerId",
  storageKey: "storageKey",
  status: "status",
  mimeType: "mimeType",
  byteSize: "byteSize",
  originalName: "originalName",
  expiresAt: "expiresAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  $inferSelect: undefined as never,
};
const storageBlobCleanupQueue = {
  __table: "cleanup",
  id: "id",
  storageKey: "storageKey",
  source: "source",
  ownerId: "ownerId",
  byteSize: "byteSize",
  attempt: "attempt",
  availableAt: "availableAt",
  leaseToken: "leaseToken",
  leaseExpiresAt: "leaseExpiresAt",
  lastError: "lastError",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};
const rowsFor = (table: { __table: string }) =>
  table.__table === "stored" ? harness.storedRows : harness.cleanupRows;
const database = {
  select: (_selection?: unknown) => ({
    from: (table: { __table: string }) => ({
      where: (predicate: Predicate) => ({
        orderBy: (..._order: unknown[]) => ({
          limit: (limit: number) => ({
            for: async (_kind: string, _options: unknown) =>
              rowsFor(table).filter((row) => matches(row, predicate)).slice(0, limit),
          }),
        }),
        limit: async (limit: number) => rowsFor(table).filter((row) => matches(row, predicate)).slice(0, limit),
      }),
    }),
  }),
  delete: (table: { __table: string }) => ({
    where: (predicate: Predicate) => ({
      returning: async (_selection?: unknown) => {
        if (table.__table === "cleanup" && harness.queueAckFailures > 0) {
          harness.queueAckFailures -= 1;
          throw new Error("cleanup acknowledgement unavailable");
        }
        const rows = rowsFor(table);
        const removed = rows.filter((row) => matches(row, predicate));
        for (const row of removed) rows.splice(rows.indexOf(row), 1);
        harness.events.push(table.__table === "stored" ? "metadata-delete" : "queue-ack");
        return removed;
      },
    }),
  }),
  insert: (table: { __table: string }) => ({
    values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => ({
      returning: async (_selection?: unknown) => {
        if (table.__table !== "cleanup") throw new Error("unexpected insert table");
        harness.events.push("queue-insert");
        if (harness.queueInsertFailures > 0) {
          harness.queueInsertFailures -= 1;
          throw new Error("cleanup queue unavailable");
        }
        const inserted = [];
        for (const value of Array.isArray(input) ? input : [input]) {
          if (harness.cleanupRows.some((row) => row.storageKey === value.storageKey)) {
            throw new Error("duplicate cleanup storage key");
          }
          const now = value.availableAt as Date;
          const row = {
            id: crypto.randomUUID(),
            storageKey: value.storageKey,
            source: value.source,
            ownerId: value.ownerId ?? null,
            byteSize: value.byteSize ?? null,
            attempt: 0,
            availableAt: now,
            leaseToken: null,
            leaseExpiresAt: null,
            lastError: null,
            createdAt: now,
            updatedAt: value.updatedAt,
          };
          harness.cleanupRows.push(row);
          inserted.push(row);
        }
        return inserted;
      },
    }),
  }),
  update: (table: { __table: string }) => ({
    set: (changes: Record<string, unknown>) => ({
      where: (predicate: Predicate) => ({
        returning: async (_selection?: unknown) => {
          const changed = rowsFor(table).filter((row) => matches(row, predicate));
          for (const row of changed) {
            for (const [key, value] of Object.entries(changes)) {
              row[key] = key === "attempt" && typeof value === "object" ? Number(row[key]) + 1 : value;
            }
          }
          harness.events.push(changes.leaseToken === null ? "queue-release" : "queue-claim");
          // Database drivers return detached result records. Preserve that
          // behavior so a simulated concurrent lease replacement cannot
          // mutate the worker's already-returned lease token in place.
          return structuredClone(changed);
        },
      }),
    }),
  }),
  transaction: async <T>(work: (transaction: typeof database) => Promise<T>): Promise<T> => {
    const storedSnapshot = structuredClone(harness.storedRows);
    const cleanupSnapshot = structuredClone(harness.cleanupRows);
    try {
      const result = await work(database);
      harness.events.push("commit");
      return result;
    } catch (error) {
      harness.storedRows.splice(0, harness.storedRows.length, ...storedSnapshot);
      harness.cleanupRows.splice(0, harness.cleanupRows.length, ...cleanupSnapshot);
      harness.events.push("rollback");
      throw error;
    }
  },
};
const db = database;
const deleteFile = async (storageKey: string): Promise<void> => {
  harness.events.push("blob-delete:" + storageKey);
  if (harness.replaceLeaseDuringBlobDelete) {
    harness.replaceLeaseDuringBlobDelete = false;
    const row = harness.cleanupRows.find((item) => item.storageKey === storageKey);
    if (row) {
      row.leaseToken = "replacement-lease";
      row.leaseExpiresAt = new Date(Date.now() + 60_000);
    }
  }
  if (harness.blobFailures > 0) {
    harness.blobFailures -= 1;
    throw new Error("blob backend unavailable");
  }
};
const getFile = async (_storageKey: string): Promise<Uint8Array | null> => null;
const putFile = async (): Promise<never> => { throw new Error("put is unavailable in this harness"); };
`;
  const source = postgresStorageAdapterContent("single")
    .replace('import "server-only";\n', "")
    .replace(
      'import { randomBytes } from "node:crypto";\n',
      'import { randomBytes } from "node:crypto";\n',
    )
    .replace('import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";\n', "")
    .replace(
      'import { db } from "../../db";\nimport { storedObjects, storageBlobCleanupQueue } from "../../db/schema/storage";\n',
      fakes,
    )
    .replace('import { deleteFile, getFile, putFile } from "../../storage";\n', "")
    .replace(
      'import { decideStorageQuota, DEFAULT_STORAGE_QUOTA, StorageServiceError, type OwnedStoragePort } from "../../services/storage";\n',
      "const DEFAULT_STORAGE_QUOTA = Object.freeze({ maxObjectBytes: 10 * 1024 * 1024, maxObjectsPerOwner: 100, maxBytesPerOwner: 100 * 1024 * 1024, pendingReservationTtlMs: 15 * 60 * 1000 });\nconst decideStorageQuota = (sizes: readonly number[], expected: number) => sizes.length >= DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner || sizes.reduce((sum, size) => sum + size, 0) > DEFAULT_STORAGE_QUOTA.maxBytesPerOwner - expected ? 'quota-exceeded' : 'allow';\nclass StorageServiceError extends Error { constructor(readonly code: string, message: string) { super(message); } }\n",
    );
  const path = join(root, "adapter.ts");
  await writeFile(path, source);
  return (await import(
    `${pathToFileURL(path).href}?run=${crypto.randomUUID()}`
  )) as GeneratedStorageModule;
}

function harness(rows: StoredRow[] = []): DeleteHarness {
  return {
    storedRows: rows.map((row) => ({
      status: "ready",
      byteSize: 1,
      expiresAt: null,
      ...row,
    })),
    cleanupRows: [],
    events: [],
    blobFailures: 0,
    queueInsertFailures: 0,
    queueAckFailures: 0,
    replaceLeaseDuringBlobDelete: false,
  };
}

describe("generated PostgreSQL durable storage cleanup", () => {
  test("releases an expired quota reservation and drains its bound blob tombstone", async () => {
    const state = harness([
      {
        id: "pending-a",
        ownerId: "owner-a",
        storageKey: "blob-pending-a",
        status: "pending",
        byteSize: 1024,
        expiresAt: new Date("2026-08-29T23:59:00.000Z"),
      },
    ]);
    const { runPostgresStorageCleanupBatch } = await loadAdapter(state);
    const now = new Date("2026-08-30T00:00:00.000Z");

    expect(await runPostgresStorageCleanupBatch({ limit: 1, now })).toEqual({
      reservationsReleased: 1,
      claimed: 1,
      deleted: 1,
      failed: 0,
      leaseLost: 0,
    });
    expect(state.storedRows).toHaveLength(0);
    expect(state.cleanupRows).toHaveLength(0);
    expect(state.events).toContain("blob-delete:blob-pending-a");
  });

  test("does not enqueue or touch a blob when the owner-scoped delete matches nothing", async () => {
    const state = harness([{ id: "object-a", ownerId: "owner-a", storageKey: "blob-a" }]);
    const { postgresOwnedStorageAdapter } = await loadAdapter(state);

    expect(
      await postgresOwnedStorageAdapter.deleteOwned({ id: "object-a", ownerId: "owner-b" }),
    ).toBe(false);
    expect(state.storedRows).toHaveLength(1);
    expect(state.cleanupRows).toHaveLength(0);
    expect(state.events).not.toContain("blob-delete:blob-a");
  });

  test("commits metadata removal only with one durable opaque tombstone", async () => {
    const state = harness([{ id: "object-a", ownerId: "owner-a", storageKey: "blob-a" }]);
    const { postgresOwnedStorageAdapter } = await loadAdapter(state);

    expect(
      await postgresOwnedStorageAdapter.deleteOwned({ id: "object-a", ownerId: "owner-a" }),
    ).toBe(true);
    expect(state.storedRows).toHaveLength(0);
    expect(state.cleanupRows).toHaveLength(1);
    expect(state.cleanupRows[0]).toMatchObject({
      storageKey: "blob-a",
      source: "stored-object-delete",
      ownerId: "owner-a",
      byteSize: 1,
    });
    expect(state.events).toEqual(["metadata-delete", "queue-insert", "commit"]);

    expect(
      await postgresOwnedStorageAdapter.deleteOwned({ id: "object-a", ownerId: "owner-a" }),
    ).toBe(false);
    expect(state.cleanupRows).toHaveLength(1);
  });

  test("rolls metadata deletion back when the durable queue insert fails", async () => {
    const state = harness([{ id: "object-a", ownerId: "owner-a", storageKey: "blob-a" }]);
    state.queueInsertFailures = 1;
    const { postgresOwnedStorageAdapter } = await loadAdapter(state);

    await expect(
      postgresOwnedStorageAdapter.deleteOwned({ id: "object-a", ownerId: "owner-a" }),
    ).rejects.toThrow("cleanup queue unavailable");
    expect(state.storedRows).toHaveLength(1);
    expect(state.cleanupRows).toHaveLength(0);
    expect(state.events).toEqual(["metadata-delete", "queue-insert", "rollback"]);
  });

  test("treats a duplicate cleanup key as corruption and keeps metadata", async () => {
    const state = harness([{ id: "object-a", ownerId: "owner-a", storageKey: "blob-a" }]);
    state.cleanupRows.push(cleanupRow("blob-a"));
    const { postgresOwnedStorageAdapter } = await loadAdapter(state);

    await expect(
      postgresOwnedStorageAdapter.deleteOwned({ id: "object-a", ownerId: "owner-a" }),
    ).rejects.toThrow("duplicate cleanup storage key");
    expect(state.storedRows).toHaveLength(1);
    expect(state.cleanupRows).toHaveLength(1);
  });

  test("bounded worker leases one row at a time and acknowledges only its live lease", async () => {
    const state = harness();
    state.cleanupRows.push(cleanupRow("blob-a"), cleanupRow("blob-b"));
    const { runPostgresStorageCleanupBatch } = await loadAdapter(state);
    const now = new Date("2026-08-30T00:00:00.000Z");

    expect(await runPostgresStorageCleanupBatch({ limit: 1, now })).toEqual({
      reservationsReleased: 0,
      claimed: 1,
      deleted: 1,
      failed: 0,
      leaseLost: 0,
    });
    expect(state.cleanupRows).toHaveLength(1);
    expect(state.events.filter((event) => event.startsWith("blob-delete:"))).toHaveLength(1);
    await expect(runPostgresStorageCleanupBatch({ limit: 101, now })).rejects.toThrow(
      "between 1 and 100",
    );
  });

  test("blob failure releases the lease with backoff while retaining the key", async () => {
    const state = harness();
    state.cleanupRows.push(cleanupRow("blob-a"));
    state.blobFailures = 1;
    const { runPostgresStorageCleanupBatch } = await loadAdapter(state);
    const now = new Date("2026-08-30T00:00:00.000Z");

    expect(await runPostgresStorageCleanupBatch({ limit: 1, now })).toEqual({
      reservationsReleased: 0,
      claimed: 1,
      deleted: 0,
      failed: 1,
      leaseLost: 0,
    });
    expect(state.cleanupRows[0]).toMatchObject({
      storageKey: "blob-a",
      attempt: 1,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: "Blob deletion failed",
    });
    expect(state.cleanupRows[0]!.availableAt.getTime()).toBeGreaterThan(now.getTime());
  });

  test("reclaims an expired crash lease without losing the blob key", async () => {
    const state = harness();
    const row = cleanupRow("blob-a");
    row.leaseToken = "crashed-worker";
    row.leaseExpiresAt = new Date("2026-08-29T23:59:00.000Z");
    state.cleanupRows.push(row);
    const { runPostgresStorageCleanupBatch } = await loadAdapter(state);

    expect(
      await runPostgresStorageCleanupBatch({
        limit: 1,
        now: new Date("2026-08-30T00:00:00.000Z"),
      }),
    ).toEqual({ reservationsReleased: 0, claimed: 1, deleted: 1, failed: 0, leaseLost: 0 });
    expect(state.cleanupRows).toHaveLength(0);
  });

  test("acknowledgement failure retains the tombstone for idempotent retry", async () => {
    const state = harness();
    state.cleanupRows.push(cleanupRow("blob-a"));
    state.queueAckFailures = 1;
    const { runPostgresStorageCleanupBatch } = await loadAdapter(state);
    const now = new Date("2026-08-30T00:00:00.000Z");

    expect(await runPostgresStorageCleanupBatch({ limit: 1, now })).toMatchObject({
      claimed: 1,
      failed: 1,
    });
    expect(state.cleanupRows).toHaveLength(1);
    const retryTime = new Date(state.cleanupRows[0]!.availableAt.getTime() + 1);
    expect(await runPostgresStorageCleanupBatch({ limit: 1, now: retryTime })).toMatchObject({
      claimed: 1,
      deleted: 1,
    });
    expect(state.events.filter((event) => event === "blob-delete:blob-a")).toHaveLength(2);
    expect(state.cleanupRows).toHaveLength(0);
  });

  test("a stale lease cannot acknowledge a row reclaimed by another worker", async () => {
    const state = harness();
    state.cleanupRows.push(cleanupRow("blob-a"));
    state.replaceLeaseDuringBlobDelete = true;
    const { runPostgresStorageCleanupBatch } = await loadAdapter(state);
    const now = new Date("2026-08-30T00:00:00.000Z");

    expect(await runPostgresStorageCleanupBatch({ limit: 1, now })).toEqual({
      reservationsReleased: 0,
      claimed: 1,
      deleted: 0,
      failed: 0,
      leaseLost: 1,
    });
    expect(state.cleanupRows).toHaveLength(1);
    expect(state.cleanupRows[0]!.leaseToken).toBe("replacement-lease");
  });

  test("a stale lease cannot release a failed row reclaimed by another worker", async () => {
    const state = harness();
    state.cleanupRows.push(cleanupRow("blob-a"));
    state.replaceLeaseDuringBlobDelete = true;
    state.blobFailures = 1;
    const { runPostgresStorageCleanupBatch } = await loadAdapter(state);
    const now = new Date("2026-08-30T00:00:00.000Z");

    expect(await runPostgresStorageCleanupBatch({ limit: 1, now })).toEqual({
      reservationsReleased: 0,
      claimed: 1,
      deleted: 0,
      failed: 0,
      leaseLost: 1,
    });
    expect(state.cleanupRows).toHaveLength(1);
    expect(state.cleanupRows[0]!.leaseToken).toBe("replacement-lease");
    expect(state.cleanupRows[0]!.lastError).toBeNull();
  });
});
