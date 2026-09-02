import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { convexStorageAdapterContent } from "../../src/templates/adapters/storage/convex-adapter.js";
import { convexStorageFunctionsContent } from "../../src/templates/adapters/storage/convex-functions.js";
import { convexStorageInternalContent } from "../../src/templates/adapters/storage/convex-internal.js";
import { convexStorageSchemaContent } from "../../src/templates/adapters/storage/convex-schema.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { storageQuotaPolicyContent } from "../../src/templates/services/storage.js";

interface StoredObjectRow {
  _id: string;
  ownerId: string;
  status: "pending" | "ready" | "cleanup";
  createdAt: number;
  expiresAt?: number;
  cleanupAfter?: number;
  cleanupAttempts?: number;
  storageId?: string;
  byteSize?: number;
}

interface InternalStorageModule {
  reserveUpload: {
    handler(
      context: unknown,
      args: { expectedByteSize: number; expectedMimeType: string },
    ): Promise<{ uploadId: string; ownerId: string }>;
  };
  cleanupExpiredUploads: {
    handler(
      context: unknown,
      args: { limit: number },
    ): Promise<{ deleted: number; deferred: number }>;
  };
}

function loadInternalStorageModule(): InternalStorageModule {
  const generated = convexStorageInternalContent()
    .replace(/^import .*;$/gm, "")
    .replaceAll("export const ", "const ");
  const prelude = [
    "const ConvexError = class ConvexError extends Error {",
    "  constructor(data) { super(data.message); this.data = data; }",
    "};",
    "const v = { id: () => null, number: () => null, string: () => null, optional: () => null, literal: () => null, union: () => null };",
    "const internalMutation = (definition) => definition;",
    "const requireActor = async (context) => context.actor;",
    storageQuotaPolicyContent().replaceAll("export ", ""),
    "",
  ].join("\n");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(prelude + generated);
  return Function(
    javascript + "\nreturn { reserveUpload, cleanupExpiredUploads };",
  )() as InternalStorageModule;
}

function cleanupHarness(initialRows: StoredObjectRow[], failingStorageIds = new Set<string>()) {
  const rows = new Map(initialRows.map((row) => [row._id, { ...row }]));
  const deletedStorageIds: string[] = [];
  let sequence = initialRows.length;
  const db = {
    query: () => {
      const predicates: Array<(row: StoredObjectRow) => boolean> = [];
      const indexQuery = {
        eq(field: keyof StoredObjectRow, value: unknown) {
          predicates.push((row) => row[field] === value);
          return indexQuery;
        },
        gt(field: keyof StoredObjectRow, value: number) {
          predicates.push((row) => typeof row[field] === "number" && row[field] > value);
          return indexQuery;
        },
        lte(field: keyof StoredObjectRow, value: number) {
          predicates.push((row) => typeof row[field] === "number" && row[field] <= value);
          return indexQuery;
        },
      };
      const query = {
        withIndex(_name: string, apply: (value: typeof indexQuery) => unknown) {
          apply(indexQuery);
          return query;
        },
        async take(limit: number) {
          return [...rows.values()]
            .filter((row) => predicates.every((check) => check(row)))
            .slice(0, limit);
        },
        async unique() {
          const matches = [...rows.values()].filter((row) =>
            predicates.every((check) => check(row)),
          );
          if (matches.length > 1) throw new Error("expected unique row");
          return matches[0] ?? null;
        },
      };
      return query;
    },
    async insert(_table: string, value: Omit<StoredObjectRow, "_id">) {
      const id = "stored:" + ++sequence;
      rows.set(id, { _id: id, ...value });
      return id;
    },
    async patch(id: string, value: Partial<StoredObjectRow>) {
      const row = rows.get(id);
      if (!row) throw new Error("missing row");
      rows.set(id, { ...row, ...value });
    },
    async delete(id: string) {
      rows.delete(id);
    },
  };
  return {
    context: {
      actor: { _id: "user:1" },
      db,
      storage: {
        async delete(storageId: string) {
          if (failingStorageIds.has(storageId)) throw new Error("storage unavailable");
          deletedStorageIds.push(storageId);
        },
      },
    },
    deletedStorageIds,
    rows,
  };
}

describe("Convex standalone storage security", () => {
  test("keeps storage IDs behind a server-owned action and internal registry", () => {
    const publicFunctions = convexStorageFunctionsContent();
    const uploadAction = publicFunctions.slice(
      publicFunctions.indexOf("export const upload"),
      publicFunctions.indexOf("export const download"),
    );
    const publicArgs = uploadAction.slice(
      uploadAction.indexOf("args:"),
      uploadAction.indexOf("handler:"),
    );
    const adapter = convexStorageAdapterContent("monorepo");

    expect(uploadAction).toContain("export const upload = action({");
    expect(uploadAction).toContain("bytes: v.bytes()");
    expect(uploadAction).toContain("ctx.storage.store");
    expect(uploadAction).toContain("new Blob([args.bytes], { type: managedContentType })");
    expect(uploadAction).toContain("{ sha256: expectedSha256 }");
    expect(uploadAction).toContain("internal.storageInternal.reserveManagedBlob");
    expect(uploadAction).toContain("internal.storageInternal.bindUploadStorage");
    expect(uploadAction).not.toContain("generateUploadUrl");
    expect(publicArgs).not.toContain("storageId");
    expect(publicFunctions).not.toContain("export const beginUpload");
    expect(publicFunctions).not.toContain("export const commitUpload");
    expect(publicFunctions).not.toContain("export const abortUpload");

    expect(adapter).toContain("upload(input:");
    expect(adapter).toContain("bytes: ArrayBuffer");
    expect(adapter).not.toContain("uploadUrl");
    expect(adapter).not.toContain("storageIdFromUpload");
    expect(adapter).not.toContain("commitUpload");
    expect(adapter).not.toContain("abortUpload");
  });

  test("bounds actor reservations and reclaims only capability-registered IDs", () => {
    const internal = convexStorageInternalContent(true);
    const schema = convexStorageSchemaContent();
    const abort = internal.slice(
      internal.indexOf("export const abortUpload"),
      internal.indexOf("export const cleanupExpiredUploads"),
    );

    expect(internal).toContain("MAX_PENDING_UPLOADS_PER_ACTOR = 4");
    expect(internal).toContain('.withIndex("by_owner"');
    expect(internal).toContain("DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner + 1");
    expect(internal).toContain("const decision = decideStorageQuota(");
    expect(internal).toContain('.query("messageAttachments")');
    expect(internal).toContain('.query("attachmentUploadIntents")');
    expect(internal).toContain('.withIndex("by_owner_status_expiry"');
    expect(internal).toContain(".take(MAX_PENDING_UPLOADS_PER_ACTOR)");
    expect(internal).toContain("UPLOAD_QUOTA_EXCEEDED");
    expect(abort).toContain('args: { uploadId: v.id("storedObjects"), ownerId: v.id("users") }');
    expect(abort).not.toContain("storageId: v.");

    expect(internal).toContain('.query("_storage")');
    expect(internal).toContain('query("attachmentStorage")');
    expect(internal).toContain("managed.expectedSha256 !== object.sha256");
    expect(internal).toContain("managed.managedContentType !== object.contentType");
    expect(internal).toContain("Never erase row-only ownership evidence");
    expect(internal).toContain("await ctx.storage.delete(object.storageId)");
    expect(internal).toContain('.withIndex("by_status_cleanup"');
    expect(internal).toContain("cleanupBackoff");
    expect(internal).toContain('status: "cleanup"');

    expect(schema).toContain('v.literal("cleanup")');
    expect(schema).toContain('.index("by_owner_status_expiry"');
    expect(schema).toContain('.index("by_lifecycle", ["lifecycleKind", "lifecycleId"])');
    expect(schema).toContain('.index("by_status_updated", ["status", "updatedAt"])');
    expect(schema).toContain('.index("by_status_cleanup"');
  });

  test("enforces the pending limit and makes progress past failed cleanup rows", async () => {
    const internal = loadInternalStorageModule();
    const quotaHarness = cleanupHarness([]);
    for (let index = 0; index < 4; index += 1) {
      await internal.reserveUpload.handler(quotaHarness.context, {
        expectedByteSize: 1,
        expectedMimeType: "text/plain",
      });
    }
    await expect(
      internal.reserveUpload.handler(quotaHarness.context, {
        expectedByteSize: 1,
        expectedMimeType: "text/plain",
      }),
    ).rejects.toThrow("Too many uploads are in progress");

    const cleanup = cleanupHarness(
      [
        {
          _id: "expired:1",
          ownerId: "user:1",
          status: "pending",
          createdAt: 0,
          expiresAt: 0,
          cleanupAfter: 0,
          storageId: "_storage:owned-1",
        },
        {
          _id: "retry:1",
          ownerId: "user:1",
          status: "cleanup",
          createdAt: 0,
          cleanupAfter: 0,
          storageId: "_storage:temporarily-unavailable",
        },
        {
          _id: "expired:2",
          ownerId: "user:1",
          status: "pending",
          createdAt: 0,
          expiresAt: 0,
          cleanupAfter: 0,
        },
        {
          _id: "expired:3",
          ownerId: "user:1",
          status: "pending",
          createdAt: 0,
          expiresAt: 0,
          cleanupAfter: 0,
          storageId: "_storage:owned-2",
        },
      ],
      new Set(["_storage:temporarily-unavailable"]),
    );
    expect(await internal.cleanupExpiredUploads.handler(cleanup.context, { limit: 3 })).toEqual({
      deleted: 2,
      deferred: 1,
    });
    expect(cleanup.deletedStorageIds).toEqual(["_storage:owned-1"]);
    expect(cleanup.rows.get("retry:1")).toMatchObject({
      status: "cleanup",
      cleanupAttempts: 1,
    });

    expect(await internal.cleanupExpiredUploads.handler(cleanup.context, { limit: 3 })).toEqual({
      deleted: 1,
      deferred: 0,
    });
    expect(cleanup.deletedStorageIds).toEqual(["_storage:owned-1", "_storage:owned-2"]);
    expect(cleanup.deletedStorageIds).not.toContain("_storage:foreign-capability");
  });

  for (const mode of ["monorepo", "single"] as const) {
    test(mode + " composition invokes the authenticated action without a storage ID", () => {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "convex-storage-security",
          mode,
          framework: "nextjs",
          database: "convex",
          preset: "custom",
          auth: true,
          api: true,
          storage: true,
          messaging: false,
          email: false,
          analytics: false,
          billing: [],
          apps: ["web"],
          features: [],
        }),
      );
      const path =
        mode === "monorepo"
          ? "packages/api/src/composition/storage.ts"
          : "src/server/api/composition/storage.ts";
      const composition = files.find((entry) => entry.path === path)?.content ?? "";

      expect(composition).toContain("fetchAuthAction");
      expect(composition).toContain("api.storage.upload");
      expect(composition).toContain("bytes: input.bytes");
      expect(composition).not.toContain("api.storage.beginUpload");
      expect(composition).not.toContain("api.storage.commitUpload");
      expect(composition).not.toContain('Id<"_storage">');
    });
  }
});
