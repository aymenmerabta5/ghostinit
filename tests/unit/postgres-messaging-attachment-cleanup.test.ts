import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

interface AttachmentRow {
  id: string;
  messageId: string | null;
  storageKey: string;
  expiresAt: Date;
}

interface CleanupHarness {
  attachments: AttachmentRow[];
  cleanupKeys: string[];
  events: string[];
  queueInsertFailures: number;
}

interface GeneratedCleanupWorker {
  runPostgresStorageCleanupCycle(): Promise<{
    expiredAttachments: number;
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

function generatedWorkerSource(): string {
  const files = generateProjectFiles(
    projectConfigSchema.parse({
      name: "messaging-cleanup",
      runtime: "bun",
      mode: "single",
      framework: "nextjs",
      database: "postgres",
      preset: "custom",
      auth: true,
      api: true,
      storage: true,
      messaging: true,
      email: false,
      analytics: false,
      billing: [],
      apps: ["web"],
      features: [],
    }),
  );
  const source = files.find(
    ({ path }) => path === "src/server/workers/storage/cleanup.ts",
  )?.content;
  if (!source) throw new Error("Postgres storage cleanup worker was not generated");
  return source;
}

async function loadWorker(harness: CleanupHarness): Promise<GeneratedCleanupWorker> {
  const root = await mkdtemp(join(tmpdir(), "ghostinit-messaging-cleanup-"));
  temporaryRoots.push(root);
  const harnessName = `__ghostinitMessagingCleanup_${crypto.randomUUID().replaceAll("-", "")}`;
  globalHarnessNames.push(harnessName);
  (globalThis as Record<string, unknown>)[harnessName] = harness;

  const fakes = `const harness = (globalThis as Record<string, unknown>)[${JSON.stringify(harnessName)}] as {
  attachments: Array<Record<string, unknown>>;
  cleanupKeys: string[];
  events: string[];
  queueInsertFailures: number;
};
type Predicate = { op: string; column?: string; value?: unknown; conditions?: Predicate[] };
const scalar = (value: unknown) => value instanceof Date ? value.getTime() : value;
const isNull = (column: string): Predicate => ({ op: "null", column });
const lte = (column: string, value: unknown): Predicate => ({ op: "lte", column, value });
const inArray = (column: string, value: unknown[]): Predicate => ({ op: "in", column, value });
const and = (...conditions: Predicate[]): Predicate => ({ op: "and", conditions });
const asc = (column: string) => column;
const sql = () => ({ lock: true });
const matches = (row: Record<string, unknown>, predicate: Predicate): boolean => {
  if (predicate.op === "and") return predicate.conditions!.every((item) => matches(row, item));
  const current = row[predicate.column!];
  if (predicate.op === "null") return current === null || current === undefined;
  if (predicate.op === "lte") return Number(scalar(current)) <= Number(scalar(predicate.value));
  if (predicate.op === "in") return (predicate.value as unknown[]).includes(current);
  throw new Error("Unknown predicate " + predicate.op);
};
const messageAttachments = {
  id: "id",
  ownerId: "ownerId",
  messageId: "messageId",
  storageKey: "storageKey",
  expiresAt: "expiresAt",
};
const storageBlobCleanupQueue = { id: "id", storageKey: "storageKey" };
const database = {
  execute: async () => { harness.events.push("owner-lock"); },
  select: (_selection: unknown) => ({
    from: (_table: unknown) => ({
      where: (predicate: Predicate) => ({
        orderBy: (..._order: unknown[]) => ({
          limit: (limit: number) => ({
            for: async (_kind: string, _options: unknown) => {
              harness.events.push("select-for-update-skip-locked");
              return harness.attachments.filter((row) => matches(row, predicate)).slice(0, limit);
            },
          }),
        }),
      }),
    }),
  }),
  delete: (_table: unknown) => ({
    where: (predicate: Predicate) => ({
      returning: async (_selection: unknown) => {
        harness.events.push("delete-attachments");
        const removed = harness.attachments.filter((row) => matches(row, predicate));
        for (const row of removed) harness.attachments.splice(harness.attachments.indexOf(row), 1);
        return removed;
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (values: Array<{ storageKey: string }>) => ({
      returning: async (_selection: unknown) => {
        harness.events.push("insert-tombstones");
        if (harness.queueInsertFailures > 0) {
          harness.queueInsertFailures -= 1;
          throw new Error("cleanup queue unavailable");
        }
        for (const value of values) {
          if (harness.cleanupKeys.includes(value.storageKey)) throw new Error("duplicate cleanup key");
          harness.cleanupKeys.push(value.storageKey);
        }
        return values.map((_value, index) => ({ id: "cleanup-" + index }));
      },
    }),
  }),
  transaction: async <T>(work: (transaction: typeof database) => Promise<T>): Promise<T> => {
    const attachmentSnapshot = structuredClone(harness.attachments);
    const cleanupSnapshot = [...harness.cleanupKeys];
    try {
      const result = await work(database);
      harness.events.push("commit");
      return result;
    } catch (error) {
      harness.attachments.splice(0, harness.attachments.length, ...attachmentSnapshot);
      harness.cleanupKeys.splice(0, harness.cleanupKeys.length, ...cleanupSnapshot);
      harness.events.push("rollback");
      throw error;
    }
  },
};
const db = database;
const runPostgresStorageCleanupBatch = async () => ({
  reservationsReleased: 0,
  claimed: 0,
  deleted: 0,
  failed: 0,
  leaseLost: 0,
});
`;

  const importBlock = `import { and, asc, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { messageAttachments } from "../../db/schema/messaging";
import { storageBlobCleanupQueue } from "../../db/schema/storage";
import { runPostgresStorageCleanupBatch } from "../../adapters/storage/postgres";`;
  let source = generatedWorkerSource()
    .replace('import "server-only";\n', "")
    .replace(importBlock, fakes);
  const entrypoint = source.indexOf("\nfunction isDirectExecution(): boolean");
  if (entrypoint < 0) throw new Error("Cleanup worker entrypoint marker is missing");
  source = source.slice(0, entrypoint);
  const path = join(root, "worker.ts");
  await writeFile(path, source);
  return (await import(
    `${pathToFileURL(path).href}?run=${crypto.randomUUID()}`
  )) as GeneratedCleanupWorker;
}

function expiredAttachment(index: number, messageId: string | null = null): AttachmentRow {
  return {
    id: `attachment-${index}`,
    messageId,
    storageKey: `blob-${index}`,
    expiresAt: new Date(0),
  };
}

describe("generated Postgres messaging attachment cleanup", () => {
  test("atomically converts only expired unclaimed rows into durable tombstones", async () => {
    const future = expiredAttachment(3);
    future.expiresAt = new Date("2999-01-01T00:00:00.000Z");
    const harness: CleanupHarness = {
      attachments: [expiredAttachment(1), expiredAttachment(2, "message-2"), future],
      cleanupKeys: [],
      events: [],
      queueInsertFailures: 0,
    };
    const worker = await loadWorker(harness);

    expect(await worker.runPostgresStorageCleanupCycle()).toMatchObject({ expiredAttachments: 1 });
    expect(harness.attachments.map(({ id }) => id)).toEqual(["attachment-2", "attachment-3"]);
    expect(harness.cleanupKeys).toEqual(["blob-1"]);
    expect(harness.events).toEqual([
      "select-for-update-skip-locked",
      "owner-lock",
      "delete-attachments",
      "insert-tombstones",
      "commit",
    ]);
  });

  test("rolls attachment deletion back when tombstone persistence fails", async () => {
    const harness: CleanupHarness = {
      attachments: [expiredAttachment(1)],
      cleanupKeys: [],
      events: [],
      queueInsertFailures: 1,
    };
    const worker = await loadWorker(harness);

    await expect(worker.runPostgresStorageCleanupCycle()).rejects.toThrow(
      "cleanup queue unavailable",
    );
    expect(harness.attachments).toHaveLength(1);
    expect(harness.cleanupKeys).toHaveLength(0);
    expect(harness.events.at(-1)).toBe("rollback");
  });

  test("bounds each expired attachment sweep to one hundred rows", async () => {
    const harness: CleanupHarness = {
      attachments: Array.from({ length: 101 }, (_, index) => expiredAttachment(index)),
      cleanupKeys: [],
      events: [],
      queueInsertFailures: 0,
    };
    const worker = await loadWorker(harness);

    expect(await worker.runPostgresStorageCleanupCycle()).toMatchObject({
      expiredAttachments: 100,
    });
    expect(harness.attachments).toHaveLength(1);
    expect(harness.cleanupKeys).toHaveLength(100);
  });
});
