// @allow-long 1730: executable generated-code fixture keeps its isolated in-memory Convex adapter inline
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { ProjectConfig } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";

async function runMessagingTest(root: string): Promise<void> {
  const child = Bun.spawn([process.execPath, "test", "messaging.test.ts", "--timeout", "15000"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    child.exited,
    new Promise<"timeout">((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout("timeout"), 20_000);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  if (result === "timeout") {
    child.kill();
    await child.exited;
    throw new Error("Timed out running generated Convex messaging behavior test");
  }
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  if (result !== 0) {
    throw new Error(`Generated messaging test failed (${result})\n${stdout}\n${stderr}`);
  }
}

function verifyTempRoot(root: string): void {
  const absoluteRoot = resolve(root);
  const relativeToTemp = relative(resolve(tmpdir()), absoluteRoot);
  if (
    relativeToTemp === "" ||
    relativeToTemp.startsWith("..") ||
    isAbsolute(relativeToTemp) ||
    !basename(absoluteRoot).startsWith("ghostinit-convex-messaging-")
  ) {
    throw new Error(`Refusing to remove unverified temp root: ${absoluteRoot}`);
  }
}

const generatedServerRuntime = `function register(definition, kind, visibility) {
  return Object.freeze({ ...definition, __kind: kind, __visibility: visibility });
}
export function query(definition) { return register(definition, "query", "public"); }
export function mutation(definition) { return register(definition, "mutation", "public"); }
export function internalQuery(definition) { return register(definition, "query", "internal"); }
export function internalMutation(definition) { return register(definition, "mutation", "internal"); }
export function action(definition) { return register(definition, "action", "public"); }
`;

const generatedApiRuntime = `export const internal = {
  messagingInternal: {
    authorizeAttachmentUpload: "messagingInternal.authorizeAttachmentUpload",
    beginAttachmentUpload: "messagingInternal.beginAttachmentUpload",
    bindAttachmentUpload: "messagingInternal.bindAttachmentUpload",
    commitAttachmentUpload: "messagingInternal.commitAttachmentUpload",
    abortAttachmentUpload: "messagingInternal.abortAttachmentUpload",
  },
  storageInternal: {
    reserveManagedBlob: "storageInternal.reserveManagedBlob",
    bindManagedBlob: "storageInternal.bindManagedBlob",
    requestManagedBlobCleanup: "storageInternal.requestManagedBlobCleanup",
    completeManagedBlobCleanup: "storageInternal.completeManagedBlobCleanup",
  },
};
export const api = {};
`;

const generatedDataModelRuntime = `export {};
`;

const authRuntime = `import { ConvexError } from "convex/values";

export function isUserBanned(user) {
  return user.banned === true;
}

export async function requireActor(ctx) {
  const actor = ctx.actorId ? await ctx.db.get(ctx.actorId) : null;
  if (!actor) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });
  }
  if (isUserBanned(actor)) {
    throw new ConvexError({ code: "USER_BANNED", message: "User is banned" });
  }
  return actor;
}
`;

const messagingBehaviorTest = String.raw`import { expect, mock, test } from "bun:test";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type QueryOperator = "eq" | "gt" | "lt" | "lte";

interface QueryFilter {
  field: string;
  operator: QueryOperator;
  value: unknown;
}

interface IndexBuilder {
  eq: (field: string, value: unknown) => IndexBuilder;
  gt: (field: string, value: unknown) => IndexBuilder;
  lt: (field: string, value: unknown) => IndexBuilder;
  lte: (field: string, value: unknown) => IndexBuilder;
}

interface FunctionContext {
  db: MemoryDb;
  storage: MemoryStorage;
  actorId?: string;
}

const indexFields = new Map<string, readonly string[]>([
  ["conversations:by_directKey", ["directKey"]],
  ["conversationParticipants:by_conversation_user", ["conversationId", "userId"]],
  ["conversationParticipants:by_conversationId", ["conversationId"]],
  ["conversationParticipants:by_userId", ["userId"]],
  ["messages:by_conversation_created", ["conversationId", "createdAt"]],
  ["messageAttachments:by_owner", ["ownerId"]],
  ["attachmentStorage:by_attachmentId", ["attachmentId"]],
  ["attachmentStorage:by_storageId", ["storageId"]],
  ["attachmentUploadIntents:by_owner", ["ownerId"]],
  ["attachmentUploadIntents:by_owner_status", ["ownerId", "status"]],
  ["attachmentUploadIntents:by_owner_expiry", ["ownerId", "expiresAt"]],
  ["attachmentUploadIntents:by_storageId", ["storageId"]],
  ["attachmentUploadIntents:by_expiry", ["expiresAt"]],
  ["storedObjects:by_owner", ["ownerId"]],
  ["storedObjects:by_storage", ["storageId"]],
  ["storedObjects:by_owner_status_expiry", ["ownerId", "status", "expiresAt"]],
  ["storedObjects:by_status_expiry", ["status", "expiresAt"]],
  ["storedObjects:by_status_cleanup", ["status", "cleanupAfter"]],
  ["managedStorageBlobs:by_token", ["token"]],
  ["managedStorageBlobs:by_lifecycle", ["lifecycleKind", "lifecycleId"]],
  ["managedStorageBlobs:by_storage", ["storageId"]],
  ["managedStorageBlobs:by_status_updated", ["status", "updatedAt"]],
  ["managedStorageBlobs:by_status_cleanup", ["status", "cleanupAfter"]],
  ["managedStorageSweepState:by_key", ["key"]],
  ["typingIndicators:by_conversation_user", ["conversationId", "userId"]],
  ["typingIndicators:by_conversation", ["conversationId"]],
]);

class MemoryDb {
  readonly #tables = new Map<string, Map<string, Row>>([
    ["users", new Map()],
    ["conversations", new Map()],
    ["conversationParticipants", new Map()],
    ["messages", new Map()],
    ["messageAttachments", new Map()],
    ["attachmentStorage", new Map()],
    ["attachmentUploadIntents", new Map()],
    ["storedObjects", new Map()],
    ["managedStorageBlobs", new Map()],
    ["managedStorageSweepState", new Map()],
    ["typingIndicators", new Map()],
  ]);
  readonly #nextIds = new Map<string, number>();
  readonly #storageMetadata = new Map<string, Record<string, unknown>>();
  readonly systemReads: string[] = [];
  #clock = 1;

  readonly system = {
    get: async (id: string): Promise<Record<string, unknown> | null> => {
      this.systemReads.push(id);
      const metadata = this.#storageMetadata.get(id);
      return metadata ? structuredClone(metadata) : null;
    },
    query: (table: string) => {
      if (table !== "_storage") throw new Error("Unexpected system table " + table);
      let direction: "asc" | "desc" = "asc";
      const query = {
        order: (next: "asc" | "desc") => {
          direction = next;
          return query;
        },
        paginate: async (options: { cursor: string | null; numItems: number }) => {
          const rows = this.storageRows().sort((left, right) => {
            const difference = left._creationTime - right._creationTime;
            return direction === "desc" ? -difference : difference;
          });
          const start = decodeCursor(options.cursor);
          const end = Math.min(start + options.numItems, rows.length);
          return {
            page: rows.slice(start, end),
            isDone: end >= rows.length,
            continueCursor: encodeCursor(end),
          };
        },
      };
      return query;
    },
  };

  tableRows(table: string): Map<string, Row> {
    const rows = this.#tables.get(table);
    if (!rows) throw new Error("Unexpected table " + table);
    return rows;
  }

  rows(table: string): Row[] {
    return [...this.tableRows(table).values()].map((row) => structuredClone(row));
  }

  query(table: string): MemoryQuery {
    this.tableRows(table);
    return new MemoryQuery(this, table);
  }

  normalizeId(table: string, value: unknown): string | null {
    if (typeof value !== "string") return null;
    const prefix = table + ":";
    return value.startsWith(prefix) && value.length > prefix.length ? value : null;
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const rows = this.tableRows(table);
    const next = (this.#nextIds.get(table) ?? 0) + 1;
    this.#nextIds.set(table, next);
    const id = table + ":" + next;
    rows.set(id, { _id: id, _creationTime: this.#clock++, ...structuredClone(value) });
    return id;
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = this.findStoredRow(id);
    for (const [key, nextValue] of Object.entries(value)) {
      if (nextValue === undefined) delete row[key];
      else row[key] = structuredClone(nextValue);
    }
  }

  async delete(id: string): Promise<void> {
    for (const rows of this.#tables.values()) {
      if (rows.delete(id)) return;
    }
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of this.#tables.values()) {
      const row = rows.get(id);
      if (row) return structuredClone(row);
    }
    return null;
  }

  setStorageMetadata(id: string, metadata: Record<string, unknown>): void {
    this.#storageMetadata.set(
      id,
      structuredClone({ _id: id, _creationTime: this.#clock++, ...metadata }),
    );
  }

  storageRows(): Row[] {
    return [...this.#storageMetadata.values()].map((row) => structuredClone(row) as Row);
  }

  hasStorageMetadata(id: string): boolean {
    return this.#storageMetadata.has(id);
  }

  removeStorageMetadata(id: string): void {
    this.#storageMetadata.delete(id);
  }

  private findStoredRow(id: string): Row {
    for (const rows of this.#tables.values()) {
      const row = rows.get(id);
      if (row) return row;
    }
    throw new Error("Missing row " + id);
  }
}

class MemoryQuery {
  readonly #filters: QueryFilter[] = [];
  #direction: "asc" | "desc" = "asc";

  constructor(
    private readonly db: MemoryDb,
    private readonly table: string,
  ) {}

  withIndex(index: string, configure: (query: IndexBuilder) => IndexBuilder): MemoryQuery {
    const allowedFields = indexFields.get(this.table + ":" + index);
    if (!allowedFields) throw new Error("Unexpected index " + this.table + ":" + index);
    const add = (operator: QueryOperator, field: string, value: unknown): IndexBuilder => {
      if (!allowedFields.includes(field)) {
        throw new Error("Unexpected indexed field " + this.table + ":" + index + ":" + field);
      }
      this.#filters.push({ field, operator, value });
      return builder;
    };
    const builder: IndexBuilder = {
      eq: (field, value) => add("eq", field, value),
      gt: (field, value) => add("gt", field, value),
      lt: (field, value) => add("lt", field, value),
      lte: (field, value) => add("lte", field, value),
    };
    configure(builder);
    return this;
  }

  order(direction: "asc" | "desc"): MemoryQuery {
    this.#direction = direction;
    return this;
  }

  async unique(): Promise<Row | null> {
    const rows = this.matchingRows();
    if (rows.length > 1) throw new Error("Expected unique result");
    return rows[0] ?? null;
  }

  async collect(): Promise<Row[]> {
    return this.matchingRows();
  }

  async take(limit: number): Promise<Row[]> {
    return this.matchingRows().slice(0, limit);
  }

  async paginate(options: { cursor: string | null; numItems: number }) {
    const rows = this.matchingRows();
    const start = decodeCursor(options.cursor);
    const end = Math.min(start + options.numItems, rows.length);
    return {
      page: rows.slice(start, end),
      isDone: end >= rows.length,
      continueCursor: encodeCursor(end),
    };
  }

  private matchingRows(): Row[] {
    const rows = this.db.rows(this.table).filter((row) =>
      this.#filters.every((filter) => {
        const candidate = row[filter.field];
        if (filter.operator === "eq") return candidate === filter.value;
        if (filter.operator === "gt") {
          return typeof candidate === "number" &&
            typeof filter.value === "number" &&
            candidate > filter.value;
        }
        if (filter.operator === "lt") {
          return typeof candidate === "number" &&
            typeof filter.value === "number" &&
            candidate < filter.value;
        }
        return typeof candidate === "number" &&
          typeof filter.value === "number" &&
          candidate <= filter.value;
      }),
    );
    return rows.sort((left, right) => {
      const difference = numericSortValue(left) - numericSortValue(right);
      return this.#direction === "desc" ? -difference : difference;
    });
  }
}

class MemoryStorage {
  #nextId = 0;
  readonly deletedIds: string[] = [];

  constructor(private readonly db: MemoryDb) {}

  async store(blob: Blob, options?: { sha256?: string }): Promise<string> {
    const id = "_storage:" + ++this.#nextId;
    this.db.setStorageMetadata(id, {
      _id: id,
      size: blob.size,
      contentType: blob.type,
      sha256: options?.sha256,
    });
    return id;
  }

  async delete(id: string): Promise<void> {
    this.deletedIds.push(id);
    this.db.removeStorageMetadata(id);
  }

  async getUrl(id: string): Promise<string | null> {
    return (await this.db.system.get(id)) ? "https://storage.example/" + id : null;
  }
}

function numericSortValue(row: Row): number {
  if (typeof row.createdAt === "number") return row.createdAt;
  return row._creationTime;
}

class Fixture {
  readonly db = new MemoryDb();
  readonly storage = new MemoryStorage(this.db);

  context(actorId?: string): FunctionContext {
    return { db: this.db, storage: this.storage, actorId };
  }

  async user(overrides: Record<string, unknown> = {}): Promise<string> {
    return await this.db.insert("users", {
      name: "User",
      email: "user@example.com",
      banned: false,
      ...overrides,
    });
  }

  async conversation(
    firstUserId: string,
    secondUserId: string,
  ): Promise<string> {
    const directKey = [firstUserId, secondUserId].sort().join(":");
    const conversationId = await this.db.insert("conversations", {
      createdBy: firstUserId,
      directKey,
      createdAt: 1,
      updatedAt: 1,
    });
    await this.db.insert("conversationParticipants", {
      conversationId,
      userId: firstUserId,
      joinedAt: 1,
    });
    await this.db.insert("conversationParticipants", {
      conversationId,
      userId: secondUserId,
      joinedAt: 1,
    });
    return conversationId;
  }
}

function encodeCursor(offset: number): string {
  return "opaque-page:" + offset.toString(36);
}

function decodeCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  if (!cursor.startsWith("opaque-page:")) throw new Error("Invalid opaque cursor");
  const offset = Number.parseInt(cursor.slice("opaque-page:".length), 36);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid opaque cursor");
  return offset;
}

function readProperty(value: unknown, key: string): unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new Error("Expected object while reading " + key);
  }
  return Reflect.get(value, key);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error("Expected string " + label);
  return value;
}

function requireRow(value: unknown, label: string): Row {
  if (typeof value !== "object" || value === null) throw new Error("Expected row " + label);
  return value as Row;
}

async function callHandler(
  registeredFunction: unknown,
  ctx: FunctionContext | Record<string, unknown>,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const handler = readProperty(registeredFunction, "handler");
  if (typeof handler !== "function") throw new Error("Registered function has no handler");
  return await handler(ctx, args);
}

async function expectConvexError(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(readProperty(readProperty(caught, "data"), "code")).toBe(code);
}

function validator(kind: string, args: unknown[]) {
  return { kind, args };
}

const validators = new Proxy(
  {},
  {
    get: (_target, property) => (...args: unknown[]) => validator(String(property), args),
  },
);

mock.module("convex/values", () => ({
  ConvexError: class ConvexError extends Error {
    readonly data: { code: string; message: string };

    constructor(data: { code: string; message: string }) {
      super(data.message);
      this.data = data;
    }
  },
  v: validators,
}));

process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";

const messaging = await import("./convex/messaging.ts");
const messagingInternal = await import("./convex/messagingInternal.ts");
const messagingServer = await import("./convex/messagingServer.ts");
const storageInternal = await import("./convex/storageInternal.ts");

let managedTokenSequence = 0;
async function registerManagedMessagingBlob(
  fixture: Fixture,
  uploadIntentId: string,
  storageId: string,
  byteSize: number,
  mimeType: string,
): Promise<string> {
  const token = (++managedTokenSequence).toString(16).padStart(32, "0");
  const expectedSha256 = managedTokenSequence.toString(16).padStart(64, "0");
  const reserved = requireRow(
    await callHandler(storageInternal.reserveManagedBlob, fixture.context(), {
      token,
      lifecycleKind: "messaging",
      lifecycleId: uploadIntentId,
      expectedByteSize: byteSize,
      expectedMimeType: mimeType,
      expectedSha256,
    }),
    "managed blob reservation",
  );
  fixture.db.setStorageMetadata(storageId, {
    _id: storageId,
    size: byteSize,
    contentType: readProperty(reserved, "managedContentType"),
    sha256: expectedSha256,
  });
  await callHandler(storageInternal.bindManagedBlob, fixture.context(), { token, storageId });
  return token;
}

test("public conversation creation normalizes untrusted peer id strings", async () => {
  const fixture = new Fixture();
  const actorId = await fixture.user({ name: "Actor" });
  const peerId = await fixture.user({ name: "Peer" });

  await expectConvexError(
    callHandler(messaging.getOrCreateConversation, fixture.context(actorId), {
      peerUserId: "not-a-user-id",
    }),
    "NOT_FOUND",
  );
  await expectConvexError(
    callHandler(messaging.getOrCreateConversation, fixture.context(actorId), {
      peerUserId: actorId,
    }),
    "INVALID_RECIPIENT",
  );

  const first = await callHandler(
    messaging.getOrCreateConversation,
    fixture.context(actorId),
    { peerUserId: peerId },
  );
  const second = await callHandler(
    messaging.getOrCreateConversation,
    fixture.context(actorId),
    { peerUserId: peerId },
  );
  expect(readProperty(first, "_id")).toBe(readProperty(second, "_id"));
  expect(fixture.db.rows("conversationParticipants")).toHaveLength(2);
});

test("attachment download URLs require membership and protect pending ownership", async () => {
  const fixture = new Fixture();
  const ownerId = await fixture.user({ name: "Owner" });
  const peerId = await fixture.user({ name: "Peer" });
  const outsiderId = await fixture.user({ name: "Outsider" });
  const conversationId = await fixture.conversation(ownerId, peerId);
  const storageId = await fixture.storage.store(new Blob(["private attachment"], { type: "text/plain" }));
  const attachmentId = await fixture.db.insert("messageAttachments", {
    conversationId, ownerId, mimeType: "text/plain", byteSize: 18,
    originalName: "private.txt", createdAt: Date.now(), expiresAt: Date.now() + 60_000,
  });
  await fixture.db.insert("attachmentStorage", { attachmentId, storageId });
  expect(await callHandler(messaging.getAttachmentUrl, fixture.context(ownerId), { attachmentId })).toBe("https://storage.example/" + storageId);
  const storageReads = fixture.db.systemReads.length;
  await expectConvexError(callHandler(messaging.getAttachmentUrl, fixture.context(peerId), { attachmentId }), "NOT_FOUND");
  await expectConvexError(callHandler(messaging.getAttachmentUrl, fixture.context(outsiderId), { attachmentId }), "FORBIDDEN");
  expect(fixture.db.systemReads.length).toBe(storageReads);
  await callHandler(messagingInternal.insertMessage, fixture.context(), {
    conversationId, senderId: ownerId, body: "Shared attachment", attachmentIds: [attachmentId],
  });
  expect(await callHandler(messaging.getAttachmentUrl, fixture.context(peerId), { attachmentId })).toBe("https://storage.example/" + storageId);
  await fixture.storage.delete(storageId);
  await expectConvexError(callHandler(messaging.getAttachmentUrl, fixture.context(peerId), { attachmentId }), "NOT_FOUND");
});

test("typing updates use the current actor and require conversation membership", async () => {
  const fixture = new Fixture();
  const actorId = await fixture.user({ name: "Actor" });
  const peerId = await fixture.user({ name: "Peer" });
  const outsiderId = await fixture.user({ name: "Outsider" });
  const conversationId = await fixture.conversation(actorId, peerId);
  expect(await callHandler(messaging.sendTyping, fixture.context(actorId), { conversationId, isTyping: true })).toEqual({ ok: true });
  expect(await callHandler(messaging.listTyping, fixture.context(peerId), { conversationId })).toMatchObject([{ userId: actorId, conversationId, isTyping: true }]);
  await expectConvexError(callHandler(messaging.sendTyping, fixture.context(outsiderId), { conversationId, isTyping: true }), "FORBIDDEN");
  expect(fixture.db.rows("typingIndicators")).toHaveLength(1);
  await callHandler(messaging.sendTyping, fixture.context(actorId), { conversationId, isTyping: false });
  expect(await callHandler(messaging.listTyping, fixture.context(peerId), { conversationId })).toEqual([]);
  expect(fixture.db.rows("typingIndicators")).toHaveLength(1);
});

test("public message pagination uses opaque cursors without duplicates or gaps", async () => {
  const fixture = new Fixture();
  const actorId = await fixture.user({ name: "Actor" });
  const peerId = await fixture.user({ name: "Peer" });
  const outsiderId = await fixture.user({ name: "Outsider" });
  const conversationId = await fixture.conversation(actorId, peerId);
  const expectedIds: string[] = [];
  for (let index = 1; index <= 7; index += 1) {
    expectedIds.push(
      await fixture.db.insert("messages", {
        conversationId,
        senderId: index % 2 === 0 ? peerId : actorId,
        body: "message-" + index,
        attachmentIds: [],
        createdAt: index,
      }),
    );
  }

  let cursor: string | null | undefined;
  const seenIds: string[] = [];
  const cursors: Array<string | null> = [];
  do {
    const result = requireRow(
      await callHandler(messaging.listMessages, fixture.context(actorId), {
        conversationId,
        limit: 3,
        cursor,
      }),
      "message page",
    );
    const page = readProperty(result, "messages");
    if (!Array.isArray(page)) throw new Error("Expected messages array");
    seenIds.push(...page.map((message) => requireString(readProperty(message, "_id"), "message id")));
    const nextCursor = readProperty(result, "nextCursor");
    if (typeof nextCursor !== "string" && nextCursor !== null) {
      throw new Error("Expected an opaque cursor or null");
    }
    cursors.push(nextCursor);
    cursor = nextCursor;
  } while (cursor !== null);

  expect(cursors).toHaveLength(3);
  expect(cursors[0]).toMatch(/^opaque-page:/);
  expect(cursors[1]).toMatch(/^opaque-page:/);
  expect(cursors[2]).toBeNull();
  expect(seenIds).toHaveLength(expectedIds.length);
  expect(new Set(seenIds).size).toBe(expectedIds.length);
  expect([...seenIds].sort()).toEqual([...expectedIds].sort());

  await expectConvexError(
    callHandler(messaging.listMessages, fixture.context(outsiderId), {
      conversationId,
      limit: 3,
    }),
    "FORBIDDEN",
  );
});

test("public and internal mark-read stop at the target message and never regress", async () => {
  const fixture = new Fixture();
  const actorId = await fixture.user({ name: "Actor" });
  const peerId = await fixture.user({ name: "Peer" });
  const outsiderId = await fixture.user({ name: "Outsider" });
  const conversationId = await fixture.conversation(actorId, peerId);
  const foreignConversationId = await fixture.conversation(actorId, outsiderId);
  const firstMessageId = await fixture.db.insert("messages", {
    conversationId,
    senderId: peerId,
    body: "first",
    attachmentIds: [],
    createdAt: 100,
  });
  const secondMessageId = await fixture.db.insert("messages", {
    conversationId,
    senderId: peerId,
    body: "second",
    attachmentIds: [],
    createdAt: 200,
  });
  await fixture.db.insert("messages", {
    conversationId,
    senderId: peerId,
    body: "newer than the target",
    attachmentIds: [],
    createdAt: 300,
  });
  const foreignMessageId = await fixture.db.insert("messages", {
    conversationId: foreignConversationId,
    senderId: outsiderId,
    body: "foreign",
    attachmentIds: [],
    createdAt: 400,
  });
  const actorParticipant = await fixture.db
    .query("conversationParticipants")
    .withIndex("by_conversation_user", (query) =>
      query.eq("conversationId", conversationId).eq("userId", actorId),
    )
    .unique();
  const peerParticipant = await fixture.db
    .query("conversationParticipants")
    .withIndex("by_conversation_user", (query) =>
      query.eq("conversationId", conversationId).eq("userId", peerId),
    )
    .unique();
  if (!actorParticipant || !peerParticipant) throw new Error("Expected conversation participants");

  expect(
    await callHandler(messaging.markRead, fixture.context(actorId), {
      conversationId,
      messageId: firstMessageId,
    }),
  ).toEqual({ ok: true });
  expect(await fixture.db.get(actorParticipant._id)).toMatchObject({ lastReadAt: 100 });
  await callHandler(messaging.markRead, fixture.context(actorId), {
    conversationId,
    messageId: secondMessageId,
  });
  await callHandler(messaging.markRead, fixture.context(actorId), {
    conversationId,
    messageId: firstMessageId,
  });
  expect(await fixture.db.get(actorParticipant._id)).toMatchObject({ lastReadAt: 200 });
  await expectConvexError(
    callHandler(messaging.markRead, fixture.context(actorId), {
      conversationId,
      messageId: foreignMessageId,
    }),
    "NOT_FOUND",
  );
  expect(await fixture.db.get(actorParticipant._id)).toMatchObject({ lastReadAt: 200 });

  await callHandler(messagingInternal.markRead, fixture.context(), {
    conversationId,
    userId: peerId,
    messageId: secondMessageId,
  });
  await callHandler(messagingInternal.markRead, fixture.context(), {
    conversationId,
    userId: peerId,
    messageId: firstMessageId,
  });
  expect(await fixture.db.get(peerParticipant._id)).toMatchObject({ lastReadAt: 200 });
  await expectConvexError(
    callHandler(messagingInternal.markRead, fixture.context(), {
      conversationId,
      userId: peerId,
      messageId: foreignMessageId,
    }),
    "NOT_FOUND",
  );
  expect(await fixture.db.get(peerParticipant._id)).toMatchObject({ lastReadAt: 200 });
});

test("internal conversations and messages enforce the public integrity contract", async () => {
  const directFixture = new Fixture();
  const secondUserId = await directFixture.user({ name: "Second" });
  const firstUserId = await directFixture.user({ name: "First" });
  const bannedUserId = await directFixture.user({ name: "Banned", banned: true });

  await expectConvexError(
    callHandler(messagingInternal.createDirectConversation, directFixture.context(), {
      firstUserId,
      secondUserId: firstUserId,
    }),
    "INVALID_RECIPIENT",
  );
  await expectConvexError(
    callHandler(messagingInternal.createDirectConversation, directFixture.context(), {
      firstUserId,
      secondUserId: bannedUserId,
    }),
    "NOT_FOUND",
  );

  const directConversationId = requireString(
    await callHandler(messagingInternal.createDirectConversation, directFixture.context(), {
      firstUserId,
      secondUserId,
    }),
    "direct conversation id",
  );
  expect(await directFixture.db.get(directConversationId)).toMatchObject({
    directKey: [firstUserId, secondUserId].sort().join(":"),
    createdBy: firstUserId,
  });
  expect(
    await callHandler(messagingInternal.createDirectConversation, directFixture.context(), {
      firstUserId: secondUserId,
      secondUserId: firstUserId,
    }),
  ).toBe(directConversationId);

  const participantToCorrupt = await directFixture.db
    .query("conversationParticipants")
    .withIndex("by_conversation_user", (query) =>
      query.eq("conversationId", directConversationId).eq("userId", secondUserId),
    )
    .unique();
  if (!participantToCorrupt) throw new Error("Expected direct participant");
  await directFixture.db.patch(participantToCorrupt._id, { userId: bannedUserId });
  await expectConvexError(
    callHandler(messagingInternal.createDirectConversation, directFixture.context(), {
      firstUserId,
      secondUserId,
    }),
    "CONVERSATION_INTEGRITY",
  );

  const fixture = new Fixture();
  const senderId = await fixture.user({ name: "Sender" });
  const peerId = await fixture.user({ name: "Peer" });
  const foreignId = await fixture.user({ name: "Foreign" });
  const conversationId = await fixture.conversation(senderId, peerId);
  const foreignConversationId = await fixture.conversation(senderId, foreignId);
  const foreignReplyId = await fixture.db.insert("messages", {
    conversationId: foreignConversationId,
    senderId,
    body: "foreign reply",
    attachmentIds: [],
    createdAt: 1,
  });

  await expectConvexError(
    callHandler(messagingInternal.insertMessage, fixture.context(), {
      conversationId,
      senderId,
      body: "   ",
      attachmentIds: [],
    }),
    "INVALID_MESSAGE",
  );
  await expectConvexError(
    callHandler(messagingInternal.insertMessage, fixture.context(), {
      conversationId,
      senderId,
      body: "x".repeat(4001),
      attachmentIds: [],
    }),
    "INVALID_MESSAGE",
  );
  await expectConvexError(
    callHandler(messagingInternal.insertMessage, fixture.context(), {
      conversationId,
      senderId,
      body: "six files",
      attachmentIds: Array.from({ length: 6 }, (_, index) => "messageAttachments:" + (100 + index)),
    }),
    "INVALID_MESSAGE",
  );
  await expectConvexError(
    callHandler(messagingInternal.insertMessage, fixture.context(), {
      conversationId,
      senderId,
      body: "wrong reply",
      replyToId: foreignReplyId,
      attachmentIds: [],
    }),
    "NOT_FOUND",
  );

  const future = Date.now() + 60_000;
  const foreignOwnerAttachmentId = await fixture.db.insert("messageAttachments", {
    conversationId,
    ownerId: peerId,
    mimeType: "text/plain",
    byteSize: 2,
    originalName: "foreign.txt",
    createdAt: 1,
    expiresAt: future,
  });
  const foreignConversationAttachmentId = await fixture.db.insert("messageAttachments", {
    conversationId: foreignConversationId,
    ownerId: senderId,
    mimeType: "text/plain",
    byteSize: 2,
    originalName: "other.txt",
    createdAt: 1,
    expiresAt: future,
  });
  const expiredAttachmentId = await fixture.db.insert("messageAttachments", {
    conversationId,
    ownerId: senderId,
    mimeType: "text/plain",
    byteSize: 2,
    originalName: "expired.txt",
    createdAt: 1,
    expiresAt: Date.now() - 1,
  });
  for (const attachmentId of [
    foreignOwnerAttachmentId,
    foreignConversationAttachmentId,
    expiredAttachmentId,
  ]) {
    await expectConvexError(
      callHandler(messagingInternal.insertMessage, fixture.context(), {
        conversationId,
        senderId,
        body: "invalid attachment",
        attachmentIds: [attachmentId],
      }),
      "ATTACHMENT_FORBIDDEN",
    );
  }

  const validAttachmentId = await fixture.db.insert("messageAttachments", {
    conversationId,
    ownerId: senderId,
    mimeType: "text/plain",
    byteSize: 2,
    originalName: "valid.txt",
    createdAt: 1,
    expiresAt: future,
  });
  const originalNow = Date.now;
  Date.now = () => 7_654_321;
  let messageId: string;
  try {
    messageId = requireString(
      await callHandler(messagingInternal.insertMessage, fixture.context(), {
        conversationId,
        senderId,
        body: "  stored body  ",
        attachmentIds: [validAttachmentId, validAttachmentId],
        createdAt: 1,
        now: 1,
      }),
      "inserted message id",
    );
  } finally {
    Date.now = originalNow;
  }
  expect(await fixture.db.get(messageId)).toMatchObject({
    conversationId,
    senderId,
    body: "stored body",
    attachmentIds: [validAttachmentId],
    createdAt: 7_654_321,
  });
  expect(readProperty(await fixture.db.get(messageId), "now")).toBeUndefined();
  expect(await fixture.db.get(validAttachmentId)).toMatchObject({ messageId });
  expect(await fixture.db.get(conversationId)).toMatchObject({ updatedAt: 7_654_321 });
  await expectConvexError(
    callHandler(messagingInternal.insertMessage, fixture.context(), {
      conversationId,
      senderId,
      body: "claim replay",
      attachmentIds: [validAttachmentId],
    }),
    "ATTACHMENT_FORBIDDEN",
  );
});

test("internal upload intents bind and commit only matching actors, conversations, and metadata", async () => {
  const fixture = new Fixture();
  const ownerId = await fixture.user({ name: "Owner" });
  const peerId = await fixture.user({ name: "Peer" });
  const otherPeerId = await fixture.user({ name: "Other peer" });
  const conversationId = await fixture.conversation(ownerId, peerId);
  const otherConversationId = await fixture.conversation(ownerId, otherPeerId);

  await expectConvexError(
    callHandler(messagingInternal.beginAttachmentUpload, fixture.context(), {
      actorId: peerId,
      conversationId: otherConversationId,
      expectedByteSize: 3,
      expectedMimeType: "text/plain",
    }),
    "FORBIDDEN",
  );
  const uploadIntentId = requireString(
    readProperty(
      await callHandler(messagingInternal.beginAttachmentUpload, fixture.context(), {
        actorId: ownerId,
        conversationId,
        expectedByteSize: 3,
        expectedMimeType: "text/plain",
      }),
      "uploadIntentId",
    ),
    "upload intent id",
  );

  await expectConvexError(
    callHandler(messagingInternal.bindAttachmentUpload, fixture.context(), {
      actorId: peerId,
      conversationId,
      uploadIntentId,
      storageId: "_storage:1",
    }),
    "UPLOAD_NOT_FOUND",
  );
  await expectConvexError(
    callHandler(messagingInternal.bindAttachmentUpload, fixture.context(), {
      actorId: ownerId,
      conversationId: otherConversationId,
      uploadIntentId,
      storageId: "_storage:1",
    }),
    "UPLOAD_NOT_FOUND",
  );
  await expectConvexError(
    callHandler(messagingInternal.bindAttachmentUpload, fixture.context(), {
      actorId: ownerId,
      conversationId,
      uploadIntentId,
      storageId: "_storage:missing",
    }),
    "INVALID_ATTACHMENT",
  );

  const storageId = "_storage:1";
  const managedToken = await registerManagedMessagingBlob(
    fixture,
    uploadIntentId,
    storageId,
    3,
    "text/plain",
  );
  expect(
    await callHandler(messagingInternal.bindAttachmentUpload, fixture.context(), {
      actorId: ownerId,
      conversationId,
      uploadIntentId,
      storageId,
    }),
  ).toEqual({ ok: true });

  const commitArgs = {
    actorId: ownerId,
    conversationId,
    uploadIntentId,
    storageId,
    originalName: "../report.txt",
    expectedMimeType: "text/plain",
    expectedByteSize: 3,
    managedToken,
  };
  await expectConvexError(
    callHandler(messagingInternal.commitAttachmentUpload, fixture.context(), {
      ...commitArgs,
      actorId: peerId,
    }),
    "UPLOAD_NOT_FOUND",
  );
  await expectConvexError(
    callHandler(messagingInternal.commitAttachmentUpload, fixture.context(), {
      ...commitArgs,
      conversationId: otherConversationId,
    }),
    "UPLOAD_NOT_FOUND",
  );
  await expectConvexError(
    callHandler(messagingInternal.commitAttachmentUpload, fixture.context(), {
      ...commitArgs,
      expectedByteSize: 999,
    }),
    "INVALID_ATTACHMENT",
  );
  expect(fixture.db.rows("messageAttachments")).toHaveLength(0);

  const attachmentId = requireString(
    await callHandler(messagingInternal.commitAttachmentUpload, fixture.context(), commitArgs),
    "committed attachment id",
  );
  expect(await fixture.db.get(attachmentId)).toMatchObject({
    conversationId,
    ownerId,
    mimeType: "text/plain",
    byteSize: 3,
    originalName: "report.txt",
  });
  expect(fixture.db.systemReads.filter((id) => id === storageId).length).toBeGreaterThanOrEqual(3);
  await expectConvexError(
    callHandler(messagingInternal.commitAttachmentUpload, fixture.context(), commitArgs),
    "UPLOAD_NOT_FOUND",
  );

  const replayIntentId = requireString(
    readProperty(
      await callHandler(messagingInternal.beginAttachmentUpload, fixture.context(), {
        actorId: ownerId,
        conversationId,
        expectedByteSize: 3,
        expectedMimeType: "text/plain",
      }),
      "uploadIntentId",
    ),
    "replay intent id",
  );
  await expectConvexError(
    callHandler(messagingInternal.bindAttachmentUpload, fixture.context(), {
      actorId: ownerId,
      conversationId,
      uploadIntentId: replayIntentId,
      storageId,
    }),
    "STORAGE_CONFLICT",
  );
});

test("trusted messaging server action drives the real begin-bind-commit pipeline", async () => {
  const fixture = new Fixture();
  const ownerId = await fixture.user({ name: "Owner" });
  const peerId = await fixture.user({ name: "Peer" });
  const conversationId = await fixture.conversation(ownerId, peerId);

  const resolveInternal = (reference: unknown): unknown => {
    if (typeof reference !== "string") {
      throw new Error("Unexpected internal reference " + String(reference));
    }
    if (reference.startsWith("messagingInternal.")) {
      return readProperty(messagingInternal, reference.slice("messagingInternal.".length));
    }
    if (reference.startsWith("storageInternal.")) {
      return readProperty(storageInternal, reference.slice("storageInternal.".length));
    }
    throw new Error("Unexpected internal reference " + reference);
  };
  const actionContext = {
    storage: fixture.storage,
    runMutation: async (reference: unknown, args: Record<string, unknown>) =>
      await callHandler(resolveInternal(reference), fixture.context(), args),
    runQuery: async (reference: unknown, args: Record<string, unknown>) =>
      await callHandler(resolveInternal(reference), fixture.context(), args),
  };

  expect(
    await callHandler(messagingServer.authorizeUpload, actionContext, {
      serverToken: process.env.BETTER_AUTH_SECRET,
      actorId: ownerId,
      conversationId,
    }),
  ).toEqual({ ok: true });
  await expectConvexError(
    callHandler(messagingServer.upload, actionContext, {
      serverToken: "00000000000000000000000000000000",
      actorId: ownerId,
      conversationId,
      bytes: new Uint8Array([1]).buffer,
      mimeType: "text/plain",
      originalName: "blocked.txt",
    }),
    "FORBIDDEN",
  );

  const result = requireRow(
    await callHandler(messagingServer.upload, actionContext, {
      serverToken: process.env.BETTER_AUTH_SECRET,
      actorId: ownerId,
      conversationId,
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "IMAGE/PNG",
      originalName: "server.png",
    }),
    "server upload result",
  );
  const attachmentId = requireString(readProperty(result, "attachmentId"), "server attachment id");
  expect(await fixture.db.get(attachmentId)).toMatchObject({
    ownerId,
    conversationId,
    mimeType: "image/png",
    byteSize: 3,
    originalName: "server.png",
  });
  expect(fixture.db.rows("attachmentStorage")).toHaveLength(1);
  expect(fixture.db.rows("attachmentUploadIntents")).toEqual([
    expect.objectContaining({ status: "committed" }),
  ]);
  expect(fixture.db.systemReads.length).toBeGreaterThanOrEqual(2);
});

test("failed server uploads abort owned blobs while cleanup preserves committed storage", async () => {
  const failedFixture = new Fixture();
  const failedOwnerId = await failedFixture.user({ name: "Failed owner" });
  const failedPeerId = await failedFixture.user({ name: "Failed peer" });
  const failedConversationId = await failedFixture.conversation(failedOwnerId, failedPeerId);
  const failedMutationCalls: string[] = [];
  const resolveFailedInternal = (reference: unknown): unknown => {
    if (typeof reference !== "string") {
      throw new Error("Unexpected internal reference " + String(reference));
    }
    if (reference.startsWith("messagingInternal.")) {
      return readProperty(messagingInternal, reference.slice("messagingInternal.".length));
    }
    if (reference.startsWith("storageInternal.")) {
      return readProperty(storageInternal, reference.slice("storageInternal.".length));
    }
    throw new Error("Unexpected internal reference " + reference);
  };
  const failedActionContext = {
    storage: failedFixture.storage,
    runMutation: async (reference: unknown, args: Record<string, unknown>) => {
      const referenceName = requireString(reference, "internal reference");
      failedMutationCalls.push(referenceName);
      if (referenceName === "messagingInternal.commitAttachmentUpload") {
        const storageId = requireString(args.storageId, "commit storage id");
        failedFixture.db.setStorageMetadata(storageId, {
          _id: storageId,
          size: 999,
          contentType: "image/png",
        });
      }
      return await callHandler(resolveFailedInternal(reference), failedFixture.context(), args);
    },
  };

  await expectConvexError(
    callHandler(messagingServer.upload, failedActionContext, {
      serverToken: process.env.BETTER_AUTH_SECRET,
      actorId: failedOwnerId,
      conversationId: failedConversationId,
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
      originalName: "mismatch.png",
    }),
    "INVALID_ATTACHMENT",
  );
  expect(failedMutationCalls).toEqual([
    "messagingInternal.beginAttachmentUpload",
    "storageInternal.reserveManagedBlob",
    "storageInternal.bindManagedBlob",
    "messagingInternal.bindAttachmentUpload",
    "messagingInternal.commitAttachmentUpload",
    "storageInternal.requestManagedBlobCleanup",
    "storageInternal.completeManagedBlobCleanup",
    "messagingInternal.abortAttachmentUpload",
  ]);
  expect(failedFixture.storage.deletedIds).toEqual(["_storage:1"]);
  expect(failedFixture.db.hasStorageMetadata("_storage:1")).toBe(false);
  expect(failedFixture.db.rows("attachmentUploadIntents")).toHaveLength(0);
  expect(failedFixture.db.rows("messageAttachments")).toHaveLength(0);
  expect(failedFixture.db.rows("attachmentStorage")).toHaveLength(0);
  expect(failedFixture.db.rows("managedStorageBlobs")).toHaveLength(0);

  const cleanupFixture = new Fixture();
  const cleanupOwnerId = await cleanupFixture.user({ name: "Cleanup owner" });
  const cleanupPeerId = await cleanupFixture.user({ name: "Cleanup peer" });
  const cleanupConversationId = await cleanupFixture.conversation(
    cleanupOwnerId,
    cleanupPeerId,
  );
  const orphanIntentId = requireString(
    readProperty(
      await callHandler(messagingInternal.beginAttachmentUpload, cleanupFixture.context(), {
        actorId: cleanupOwnerId,
        conversationId: cleanupConversationId,
        expectedByteSize: 4,
        expectedMimeType: "image/png",
      }),
      "uploadIntentId",
    ),
    "orphan intent id",
  );
  const orphanStorageId = "_storage:orphan";
  await registerManagedMessagingBlob(
    cleanupFixture,
    orphanIntentId,
    orphanStorageId,
    4,
    "image/png",
  );
  await callHandler(messagingInternal.bindAttachmentUpload, cleanupFixture.context(), {
    actorId: cleanupOwnerId,
    conversationId: cleanupConversationId,
    uploadIntentId: orphanIntentId,
    storageId: orphanStorageId,
  });
  await cleanupFixture.db.patch(orphanIntentId, { expiresAt: 0 });

  const committedIntentId = requireString(
    readProperty(
      await callHandler(messagingInternal.beginAttachmentUpload, cleanupFixture.context(), {
        actorId: cleanupOwnerId,
        conversationId: cleanupConversationId,
        expectedByteSize: 4,
        expectedMimeType: "image/png",
      }),
      "uploadIntentId",
    ),
    "committed intent id",
  );
  const committedStorageId = "_storage:committed";
  const committedManagedToken = await registerManagedMessagingBlob(
    cleanupFixture,
    committedIntentId,
    committedStorageId,
    4,
    "image/png",
  );
  await callHandler(messagingInternal.bindAttachmentUpload, cleanupFixture.context(), {
    actorId: cleanupOwnerId,
    conversationId: cleanupConversationId,
    uploadIntentId: committedIntentId,
    storageId: committedStorageId,
  });
  const committedAttachmentId = requireString(
    await callHandler(messagingInternal.commitAttachmentUpload, cleanupFixture.context(), {
      actorId: cleanupOwnerId,
      conversationId: cleanupConversationId,
      uploadIntentId: committedIntentId,
      storageId: committedStorageId,
      originalName: "committed.png",
      expectedMimeType: "image/png",
      expectedByteSize: 4,
      managedToken: committedManagedToken,
    }),
    "committed attachment id",
  );
  const committedMessageId = await cleanupFixture.db.insert("messages", {
    conversationId: cleanupConversationId,
    senderId: cleanupOwnerId,
    body: "claimed attachment",
    attachmentIds: [committedAttachmentId],
    createdAt: Date.now(),
  });
  await cleanupFixture.db.patch(committedAttachmentId, { messageId: committedMessageId });
  await cleanupFixture.db.patch(committedIntentId, { expiresAt: 0 });
  expect(
    await callHandler(messagingInternal.cleanupExpiredUploads, cleanupFixture.context(), {
      limit: 10,
    }),
  ).toEqual({
    deletedIntents: 2,
    deletedAttachments: 0,
    deletedBlobs: 1,
    deferred: 0,
  });
  expect(cleanupFixture.storage.deletedIds).toEqual([orphanStorageId]);
  expect(cleanupFixture.db.hasStorageMetadata(orphanStorageId)).toBe(false);
  expect(cleanupFixture.db.hasStorageMetadata(committedStorageId)).toBe(true);
  expect(cleanupFixture.db.rows("attachmentUploadIntents")).toHaveLength(0);
  expect(cleanupFixture.db.rows("messageAttachments")).toEqual([
    expect.objectContaining({
      _id: committedAttachmentId,
      messageId: committedMessageId,
    }),
  ]);
  expect(cleanupFixture.db.rows("attachmentStorage")).toEqual([
    expect.objectContaining({
      attachmentId: committedAttachmentId,
      storageId: committedStorageId,
    }),
  ]);
});

test("managed storage recovery closes the action crash window without deleting foreign blobs", async () => {
  const fixture = new Fixture();
  const ownerId = await fixture.user({ name: "Crash owner" });
  const peerId = await fixture.user({ name: "Crash peer" });
  const conversationId = await fixture.conversation(ownerId, peerId);
  const uploadIntentId = requireString(
    readProperty(
      await callHandler(messagingInternal.beginAttachmentUpload, fixture.context(), {
        actorId: ownerId,
        conversationId,
        expectedByteSize: 4,
        expectedMimeType: "image/png",
      }),
      "uploadIntentId",
    ),
    "crash upload intent",
  );
  const token = "a".repeat(32);
  const expectedSha256 = "b".repeat(64);
  const reservation = requireRow(
    await callHandler(storageInternal.reserveManagedBlob, fixture.context(), {
      token,
      lifecycleKind: "messaging",
      lifecycleId: uploadIntentId,
      expectedByteSize: 4,
      expectedMimeType: "image/png",
      expectedSha256,
    }),
    "crash managed reservation",
  );
  const crashStorageId = "_storage:crash-window";
  fixture.db.setStorageMetadata(crashStorageId, {
    _creationTime: 0,
    size: 4,
    contentType: readProperty(reservation, "managedContentType"),
    sha256: expectedSha256,
  });
  const managed = fixture.db
    .rows("managedStorageBlobs")
    .find((row) => row.token === token);
  if (!managed) throw new Error("Managed crash reservation missing");
  await fixture.db.patch(managed._id, { createdAt: 0, updatedAt: 0 });
  await fixture.db.patch(uploadIntentId, { expiresAt: 0 });
  await fixture.db.delete(ownerId);
  await fixture.db.delete(conversationId);

  expect(
    await callHandler(messagingInternal.cleanupExpiredUploads, fixture.context(), { limit: 10 }),
  ).toMatchObject({ deletedIntents: 0, deferred: 1 });
  expect(fixture.db.rows("attachmentUploadIntents")).toHaveLength(1);
  expect(fixture.db.rows("managedStorageBlobs")).toHaveLength(1);

  expect(
    await callHandler(storageInternal.stageManagedOrphanPage, fixture.context(), { limit: 10 }),
  ).toMatchObject({ staged: 1, leased: false });
  expect(
    await callHandler(storageInternal.cleanupManagedBlobBatch, fixture.context(), { limit: 10 }),
  ).toEqual({ deleted: 1, deferred: 0 });
  expect(fixture.storage.deletedIds).toEqual([crashStorageId]);
  expect(fixture.db.hasStorageMetadata(crashStorageId)).toBe(false);
  expect(fixture.db.rows("managedStorageBlobs")).toHaveLength(0);

  expect(
    await callHandler(messagingInternal.cleanupExpiredUploads, fixture.context(), { limit: 10 }),
  ).toMatchObject({ deletedIntents: 1, deferred: 0 });
  expect(fixture.db.rows("attachmentUploadIntents")).toHaveLength(0);

  const foreign = new Fixture();
  const foreignStorageId = "_storage:foreign-marker";
  foreign.db.setStorageMetadata(foreignStorageId, {
    _creationTime: 0,
    size: 4,
    contentType: "image/png; ghostinit-upload=" + "c".repeat(32),
    sha256: "d".repeat(64),
  });
  expect(
    await callHandler(storageInternal.stageManagedOrphanPage, foreign.context(), { limit: 10 }),
  ).toMatchObject({ staged: 0, preserved: 1, leased: false });
  expect(foreign.db.hasStorageMetadata(foreignStorageId)).toBe(true);
  expect(foreign.storage.deletedIds).toEqual([]);

  const standalone = new Fixture();
  const standaloneOwnerId = await standalone.user({ name: "Standalone owner" });
  const storedObjectId = await standalone.db.insert("storedObjects", {
    ownerId: standaloneOwnerId,
    status: "pending",
    byteSize: 5,
    createdAt: 0,
    expiresAt: 0,
    cleanupAfter: 0,
  });
  const standaloneToken = "e".repeat(32);
  const standaloneSha256 = "f".repeat(64);
  const standaloneReservation = requireRow(
    await callHandler(storageInternal.reserveManagedBlob, standalone.context(), {
      token: standaloneToken,
      lifecycleKind: "storage",
      lifecycleId: storedObjectId,
      expectedByteSize: 5,
      expectedMimeType: "text/plain",
      expectedSha256: standaloneSha256,
    }),
    "standalone managed reservation",
  );
  const standaloneStorageId = "_storage:standalone-crash";
  standalone.db.setStorageMetadata(standaloneStorageId, {
    _creationTime: 0,
    size: 5,
    contentType: readProperty(standaloneReservation, "managedContentType"),
    sha256: standaloneSha256,
  });
  const standaloneManaged = standalone.db
    .rows("managedStorageBlobs")
    .find((row) => row.token === standaloneToken);
  if (!standaloneManaged) throw new Error("Standalone managed reservation missing");
  await standalone.db.patch(standaloneManaged._id, { createdAt: 0, updatedAt: 0 });

  expect(
    await callHandler(storageInternal.cleanupExpiredUploads, standalone.context(), { limit: 10 }),
  ).toEqual({ deleted: 0, deferred: 1 });
  expect(standalone.db.rows("storedObjects")).toHaveLength(1);
  expect(
    await callHandler(storageInternal.stageManagedOrphanPage, standalone.context(), { limit: 10 }),
  ).toMatchObject({ staged: 1, leased: false });
  expect(
    await callHandler(storageInternal.cleanupManagedBlobBatch, standalone.context(), { limit: 10 }),
  ).toEqual({ deleted: 1, deferred: 0 });
  expect(standalone.storage.deletedIds).toEqual([standaloneStorageId]);
  expect(
    await callHandler(storageInternal.cleanupExpiredUploads, standalone.context(), { limit: 10 }),
  ).toEqual({ deleted: 1, deferred: 0 });
  expect(standalone.db.rows("storedObjects")).toHaveLength(0);
});

test("a complete managed sweep releases failed stores that never created a blob", async () => {
  const fixture = new Fixture();
  const ownerId = await fixture.user({ name: "Failed storage owner" });
  const storedObjectId = await fixture.db.insert("storedObjects", {
    ownerId,
    status: "pending",
    byteSize: 7,
    createdAt: 0,
    expiresAt: 0,
    cleanupAfter: 0,
  });
  const token = "1".repeat(32);
  await callHandler(storageInternal.reserveManagedBlob, fixture.context(), {
    token,
    lifecycleKind: "storage",
    lifecycleId: storedObjectId,
    expectedByteSize: 7,
    expectedMimeType: "text/plain",
    expectedSha256: "2".repeat(64),
  });
  expect(
    await callHandler(storageInternal.requestManagedBlobCleanup, fixture.context(), { token }),
  ).toMatchObject({ ok: true, deferred: true });
  expect(
    await callHandler(storageInternal.abortUpload, fixture.context(), {
      uploadId: storedObjectId,
      ownerId,
    }),
  ).toMatchObject({ ok: false, reason: "cleanup-deferred" });
  const managed = fixture.db.rows("managedStorageBlobs")[0];
  if (!managed) throw new Error("Failed-store managed reservation missing");
  await fixture.db.patch(managed._id, { createdAt: 0, updatedAt: 0 });

  expect(
    await callHandler(storageInternal.cleanupExpiredUploads, fixture.context(), { limit: 10 }),
  ).toEqual({ deleted: 0, deferred: 1 });
  expect(fixture.db.rows("storedObjects")).toHaveLength(1);
  expect(fixture.db.storageRows()).toHaveLength(0);

  expect(
    await callHandler(storageInternal.stageManagedOrphanPage, fixture.context(), { limit: 10 }),
  ).toMatchObject({ staged: 0, retired: 1, leased: false });
  expect(fixture.db.rows("managedStorageBlobs")).toHaveLength(0);
  expect(
    await callHandler(storageInternal.cleanupExpiredUploads, fixture.context(), { limit: 10 }),
  ).toEqual({ deleted: 1, deferred: 0 });
  expect(fixture.db.rows("storedObjects")).toHaveLength(0);
});

test("durable owner quota counts claimed, pending, and cleanup-blocked attachment bytes", async () => {
  const reserveSerially = () => {
    let tail: Promise<void> = Promise.resolve();
    return <T>(work: () => Promise<T>): Promise<T> => {
      const result = tail.then(work);
      tail = result.then(() => undefined, () => undefined);
      return result;
    };
  };
  const addAttachment = async (
    fixture: Fixture,
    ownerId: string,
    conversationId: string,
    byteSize: number,
    claimed: boolean,
  ) => await fixture.db.insert("messageAttachments", {
    conversationId,
    ownerId,
    ...(claimed ? { messageId: "messages:claimed" } : {}),
    mimeType: "text/plain",
    byteSize,
    originalName: "quota.txt",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });

  const countFixture = new Fixture();
  const countOwnerId = await countFixture.user({ name: "Count owner" });
  const countPeerId = await countFixture.user({ name: "Count peer" });
  const countConversationId = await countFixture.conversation(countOwnerId, countPeerId);
  for (let index = 0; index < 99; index += 1) {
    await addAttachment(countFixture, countOwnerId, countConversationId, 1, index % 2 === 0);
  }
  const serializeCount = reserveSerially();
  const countResults = await Promise.allSettled([
    serializeCount(async () => await callHandler(messagingInternal.beginAttachmentUpload, countFixture.context(), {
      actorId: countOwnerId,
      conversationId: countConversationId,
      expectedByteSize: 1,
      expectedMimeType: "text/plain",
    })),
    serializeCount(async () => await callHandler(messagingInternal.beginAttachmentUpload, countFixture.context(), {
      actorId: countOwnerId,
      conversationId: countConversationId,
      expectedByteSize: 1,
      expectedMimeType: "text/plain",
    })),
  ]);
  expect(countResults.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(countResults.filter(({ status }) => status === "rejected")).toHaveLength(1);

  const byteFixture = new Fixture();
  const byteOwnerId = await byteFixture.user({ name: "Byte owner" });
  const bytePeerId = await byteFixture.user({ name: "Byte peer" });
  const byteConversationId = await byteFixture.conversation(byteOwnerId, bytePeerId);
  for (let index = 0; index < 9; index += 1) {
    await addAttachment(byteFixture, byteOwnerId, byteConversationId, 10 * 1024 * 1024, true);
  }
  await byteFixture.db.insert("storedObjects", {
    ownerId: byteOwnerId,
    status: "ready",
    byteSize: 10 * 1024 * 1024 - 1,
    createdAt: Date.now(),
  });
  await callHandler(messagingInternal.beginAttachmentUpload, byteFixture.context(), {
    actorId: byteOwnerId,
    conversationId: byteConversationId,
    expectedByteSize: 1,
    expectedMimeType: "text/plain",
  });
  await expectConvexError(
    callHandler(messagingInternal.beginAttachmentUpload, byteFixture.context(), {
      actorId: byteOwnerId,
      conversationId: byteConversationId,
      expectedByteSize: 1,
      expectedMimeType: "text/plain",
    }),
    "STORAGE_QUOTA_EXCEEDED",
  );

  const cleanupFixture = new Fixture();
  const cleanupOwnerId = await cleanupFixture.user({ name: "Quota cleanup owner" });
  const cleanupPeerId = await cleanupFixture.user({ name: "Quota cleanup peer" });
  const cleanupConversationId = await cleanupFixture.conversation(cleanupOwnerId, cleanupPeerId);
  for (let index = 0; index < 99; index += 1) {
    await addAttachment(cleanupFixture, cleanupOwnerId, cleanupConversationId, 1, false);
  }
  const uploadIntentId = requireString(readProperty(
    await callHandler(messagingInternal.beginAttachmentUpload, cleanupFixture.context(), {
      actorId: cleanupOwnerId,
      conversationId: cleanupConversationId,
      expectedByteSize: 1,
      expectedMimeType: "text/plain",
    }),
    "uploadIntentId",
  ), "quota cleanup intent");
  await cleanupFixture.db.patch(uploadIntentId, { expiresAt: 0 });
  await expectConvexError(
    callHandler(messagingInternal.beginAttachmentUpload, cleanupFixture.context(), {
      actorId: cleanupOwnerId,
      conversationId: cleanupConversationId,
      expectedByteSize: 1,
      expectedMimeType: "text/plain",
    }),
    "STORAGE_QUOTA_EXCEEDED",
  );
  expect(await callHandler(messagingInternal.cleanupExpiredUploads, cleanupFixture.context(), {
    limit: 1,
  })).toMatchObject({ deletedIntents: 1 });
  await expect(callHandler(messagingInternal.beginAttachmentUpload, cleanupFixture.context(), {
    actorId: cleanupOwnerId,
    conversationId: cleanupConversationId,
    expectedByteSize: 1,
    expectedMimeType: "text/plain",
  })).resolves.toMatchObject({ uploadIntentId: expect.any(String) });
});
`;

describe("generated Convex messaging behavior", () => {
  for (const mode of ["monorepo", "single"] as const)
    test(`${mode} executes public, internal, and trusted-server boundaries against an in-memory Convex adapter`, async () => {
      const root = mkdtempSync(join(tmpdir(), "ghostinit-convex-messaging-"));
      try {
        const config = {
          name: `convex-messaging-behavior-${mode}`,
          runtime: "bun",
          version: "0.1.0",
          mode,
          preset: "saas",
          billing: [],
          features: [],
          database: "convex",
          framework: "tanstack-start",
          apps: ["web"],
          messaging: true,
        } as ProjectConfig;
        const files = generateProjectFiles(config);
        const transaction = new FsTransaction(root);
        for (const path of [
          "convex/messaging.ts",
          "convex/messagingInternal.ts",
          "convex/messagingServer.ts",
          "convex/storagePolicy.ts",
          "convex/storageInternal.ts",
        ]) {
          const content = files.find((file) => file.path === path)?.content ?? "";
          expect(content, path).not.toBe("");
          await transaction.write(path, content);
        }
        await transaction.write("convex/_generated/api.ts", generatedApiRuntime);
        await transaction.write("convex/_generated/server.ts", generatedServerRuntime);
        await transaction.write("convex/_generated/dataModel.ts", generatedDataModelRuntime);
        await transaction.write("convex/lib/auth.ts", authRuntime);
        await transaction.write("messaging.test.ts", messagingBehaviorTest);
        expect(transaction.getStagedFiles().map(({ path }) => path)).toEqual(
          expect.arrayContaining([
            "convex/messaging.ts",
            "convex/messagingInternal.ts",
            "convex/messagingServer.ts",
            "convex/storagePolicy.ts",
            "convex/storageInternal.ts",
            "convex/_generated/server.ts",
            "convex/lib/auth.ts",
            "messaging.test.ts",
          ]),
        );
        await transaction.commit();
        await runMessagingTest(root);
      } finally {
        verifyTempRoot(root);
        await rm(root, { recursive: true, force: true });
      }
    }, 30_000);
});
