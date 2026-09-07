// @allow-long 320: deterministic Postgres and Convex transaction harnesses validate quota parity
import { describe, expect, test } from "bun:test";
import { convexStorageFunctionsContent } from "../../src/templates/adapters/storage/convex-functions.js";
import { convexStorageInternalContent } from "../../src/templates/adapters/storage/convex-internal.js";
import { storageAdapterFiles } from "../../src/templates/adapters/storage/index.js";
import { postgresStorageAdapterContent } from "../../src/templates/adapters/storage/postgres.js";
import {
  DEFAULT_STORAGE_QUOTA,
  storageQuotaPolicyContent,
  storageServiceFiles,
} from "../../src/templates/services/storage.js";

interface UsageRow {
  id: string;
  ownerId: string;
  byteSize: number;
  status: "pending" | "ready" | "cleanup";
}

class TestStorageServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const quotaPolicyJavascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
  storageQuotaPolicyContent().replaceAll("export ", ""),
);
const decideStorageQuota = Function(`${quotaPolicyJavascript}; return decideStorageQuota;`)() as (
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

function loadPostgresReservation(initialRows: UsageRow[], initialDeletingRows: UsageRow[] = []) {
  const generated = postgresStorageAdapterContent("single");
  const start = generated.indexOf("interface OwnedReservationInput");
  const end = generated.indexOf("async function bindOwnedReservation", start);
  if (start < 0 || end < 0) throw new Error("Postgres quota reservation helper is missing");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    generated.slice(start, end),
  );
  const rows = initialRows.map((row) => ({ ...row }));
  const deletingRows = initialDeletingRows.map((row) => ({ ...row }));
  let sequence = rows.length;
  const columns = {
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
  } as const;
  const cleanupColumns = {
    __table: "cleanup",
    ownerId: "ownerId",
    byteSize: "byteSize",
  } as const;
  const transaction = {
    async execute() {},
    select() {
      return {
        from(table: { __table: string }) {
          return {
            where(predicate: (row: UsageRow) => boolean) {
              return {
                async limit(limit: number) {
                  const selected = table.__table === "cleanup" ? deletingRows : rows;
                  return selected.filter(predicate).slice(0, limit);
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        values(value: Omit<UsageRow, "id">) {
          return {
            async returning() {
              const row = { id: `object-${++sequence}`, ...value } as UsageRow;
              rows.push(row);
              return [{ id: row.id }];
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
  const eq = (column: keyof UsageRow, value: unknown) => (row: UsageRow) => row[column] === value;
  const sql = () => ({ lock: true });
  const reserveOwnedObject = new Function(
    "db",
    "storedObjects",
    "storageBlobCleanupQueue",
    "DEFAULT_STORAGE_QUOTA",
    "decideStorageQuota",
    "randomUUID",
    "StorageServiceError",
    "eq",
    "sql",
    `${javascript}; return reserveOwnedObject;`,
  )(
    db,
    columns,
    cleanupColumns,
    DEFAULT_STORAGE_QUOTA,
    decideStorageQuota,
    () => "00000000-0000-4000-8000-000000000001",
    TestStorageServiceError,
    eq,
    sql,
  ) as (input: {
    ownerId: string;
    byteSize: number;
    mimeType: string;
    originalName: string;
    createdAt: Date;
  }) => Promise<{ reservationId: string; storageKey: string }>;
  return { reserveOwnedObject, rows };
}

function loadConvexReservation(initialRows: UsageRow[]) {
  const generated = convexStorageInternalContent()
    .replace(/^import .*;$/gm, "")
    .replaceAll("export const ", "const ");
  const prelude = `
const ConvexError = class ConvexError extends Error {
  constructor(data) { super(data.message); this.data = data; }
};
const v = { id: () => null, number: () => null, string: () => null, optional: () => null, literal: () => null, union: () => null };
const internalMutation = (definition) => definition;
const requireActor = async (context) => context.actor;
${storageQuotaPolicyContent().replaceAll("export ", "")}
`;
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(prelude + generated);
  const module = Function(`${javascript}; return { reserveUpload };`)() as {
    reserveUpload: {
      handler(
        context: unknown,
        input: { expectedByteSize: number; expectedMimeType: string },
      ): Promise<{ uploadId: string; ownerId: string }>;
    };
  };
  const rows = initialRows.map((row) => ({ _id: row.id, ...row }));
  let sequence = rows.length;
  const context = {
    actor: { _id: "owner-a" },
    db: {
      query() {
        const predicates: Array<(row: (typeof rows)[number]) => boolean> = [];
        const indexQuery = {
          eq(field: keyof (typeof rows)[number], value: unknown) {
            predicates.push((row) => row[field] === value);
            return indexQuery;
          },
          gt(field: keyof (typeof rows)[number], value: number) {
            predicates.push((row) => typeof row[field] === "number" && row[field] > value);
            return indexQuery;
          },
        };
        return {
          withIndex(_name: string, apply: (query: typeof indexQuery) => unknown) {
            apply(indexQuery);
            return {
              async take(limit: number) {
                return rows
                  .filter((row) => predicates.every((predicate) => predicate(row)))
                  .slice(0, limit);
              },
            };
          },
        };
      },
      async insert(_table: string, value: Omit<UsageRow, "id">) {
        const id = `object-${++sequence}`;
        rows.push({ _id: id, id, ...value });
        return id;
      },
    },
  };
  const serialize = serializedTransactions();
  return {
    reserve(expectedByteSize: number) {
      // Convex mutations are serializable/OCC retried. Model their externally
      // observable order while exercising the generated mutation unchanged.
      return serialize(
        async () =>
          await module.reserveUpload.handler(context, {
            expectedByteSize,
            expectedMimeType: "text/plain",
          }),
      );
    },
    rows,
  };
}

function readyRows(count: number, byteSize: number): UsageRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `ready-${index}`,
    ownerId: "owner-a",
    byteSize,
    status: "ready" as const,
  }));
}

describe("durable per-owner storage quotas", () => {
  test("uses one application-owned starter policy for both generated adapters", () => {
    expect(DEFAULT_STORAGE_QUOTA).toEqual({
      maxObjectBytes: 10 * 1024 * 1024,
      maxObjectsPerOwner: 100,
      maxBytesPerOwner: 100 * 1024 * 1024,
      pendingReservationTtlMs: 15 * 60 * 1000,
    });
    const servicePolicy = storageServiceFiles("single").find((file) =>
      file.path.endsWith("/storage/policy.ts"),
    )?.content;
    const convexPolicy = storageAdapterFiles({ mode: "single", database: "convex" }).find(
      (file) => file.path === "convex/storagePolicy.ts",
    )?.content;
    expect(servicePolicy).toBe(storageQuotaPolicyContent());
    expect(convexPolicy).toBe(servicePolicy);
    expect(postgresStorageAdapterContent("single")).toContain(
      "import { decideStorageQuota, DEFAULT_STORAGE_QUOTA, StorageServiceError, type OwnedStoragePort }",
    );
    expect(convexStorageFunctionsContent()).toContain(
      'DEFAULT_STORAGE_QUOTA } from "./storagePolicy"',
    );
  });

  test("Postgres serializes concurrent reservations at the exact object-count boundary", async () => {
    const quota = loadPostgresReservation(readyRows(99, 1));
    const input = {
      ownerId: "owner-a",
      byteSize: 1,
      mimeType: "text/plain",
      originalName: "quota.txt",
      createdAt: new Date(0),
    };
    const results = await Promise.allSettled([
      quota.reserveOwnedObject(input),
      quota.reserveOwnedObject(input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(quota.rows).toHaveLength(100);
    expect(quota.rows.at(-1)).toMatchObject({ status: "pending", byteSize: 1 });
  });

  test("Postgres admits the exact byte boundary and rejects the next reservation", async () => {
    const quota = loadPostgresReservation([
      ...readyRows(9, 10 * 1024 * 1024),
      ...readyRows(1, 10 * 1024 * 1024 - 1).map((row) => ({ ...row, id: "tail" })),
    ]);
    const input = {
      ownerId: "owner-a",
      byteSize: 1,
      mimeType: "text/plain",
      originalName: "quota.txt",
      createdAt: new Date(0),
    };
    await expect(quota.reserveOwnedObject(input)).resolves.toMatchObject({
      storageKey: "00000000-0000-4000-8000-000000000001",
    });
    await expect(quota.reserveOwnedObject(input)).rejects.toMatchObject({
      code: "STORAGE_QUOTA_EXCEEDED",
    });

    const deletionBacklog = loadPostgresReservation(readyRows(99, 1), [
      { id: "deleting-1", ownerId: "owner-a", byteSize: 1, status: "cleanup" },
    ]);
    await expect(deletionBacklog.reserveOwnedObject(input)).rejects.toMatchObject({
      code: "STORAGE_QUOTA_EXCEEDED",
    });
  });

  test("Convex counts ready and pending rows at exact count and byte boundaries", async () => {
    const countQuota = loadConvexReservation(readyRows(99, 1));
    const countResults = await Promise.allSettled([countQuota.reserve(1), countQuota.reserve(1)]);
    expect(countResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(countResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(countQuota.rows).toHaveLength(100);

    const byteQuota = loadConvexReservation([
      ...readyRows(9, 10 * 1024 * 1024),
      ...readyRows(1, 10 * 1024 * 1024 - 1).map((row) => ({ ...row, id: "tail" })),
    ]);
    await expect(byteQuota.reserve(1)).resolves.toMatchObject({ ownerId: "owner-a" });
    await expect(byteQuota.reserve(1)).rejects.toThrow("Storage quota exceeded");
  });

  test("keeps reservation conversion and release inside durable metadata transitions", () => {
    const postgres = postgresStorageAdapterContent("single");
    expect(postgres.indexOf("reserveOwnedObject({")).toBeLessThan(
      postgres.indexOf("await putFile("),
    );
    expect(postgres).toContain('eq(storedObjects.status, "pending")');
    expect(postgres).toContain('.set({ status: "ready", expiresAt: null');
    expect(postgres).toContain('source: "stored-object-upload-cancel"');
    expect(postgres).toContain('source: "stored-object-reservation-expired"');

    const convex = convexStorageInternalContent();
    expect(convex).toContain("byteSize: args.expectedByteSize");
    expect(convex).toContain('status: "ready"');
    expect(convex).toContain("await ctx.db.delete(object._id)");
  });
});
