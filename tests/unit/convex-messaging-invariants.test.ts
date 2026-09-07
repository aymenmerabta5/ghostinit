import { describe, expect, test } from "bun:test";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function convexProject(mode: "monorepo" | "single"): ProjectConfig {
  return {
    name: `convex-messaging-${mode}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework: "nextjs",
    database: "convex",
    apps: ["web"],
    billing: [],
    features: [],
    messaging: true,
  } as ProjectConfig;
}

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const found = files.find((entry) => entry.path === path)?.content;
  if (found === undefined) throw new Error(`Missing generated file: ${path}`);
  return found;
}

function before(source: string, first: string, second: string): void {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  expect(firstIndex).toBeGreaterThanOrEqual(0);
  expect(secondIndex).toBeGreaterThan(firstIndex);
}

describe("generated Convex messaging invariants", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} emits native opaque cursor pagination`, () => {
      const boundary = content(generateProjectFiles(convexProject(mode)), "convex/messaging.ts");

      expect(boundary).toContain('.withIndex("by_conversation_created"');
      expect(boundary).toContain('.order("desc")');
      expect(boundary).toContain("Number.isSafeInteger(requestedLimit)");
      expect(boundary).toContain(".paginate({ cursor: args.cursor ?? null, numItems: limit })");
      expect(boundary).toContain("page.page.map(async (message)");
      expect(boundary).toContain("nextCursor: page.isDone ? null : page.continueCursor");
      expect(boundary).not.toContain("nextCursor: null");
    });
  }

  test("keeps generic upload URLs and storage IDs behind a trusted byte upload action", () => {
    const files = generateProjectFiles(convexProject("monorepo"));
    const boundary = content(files, "convex/messaging.ts");
    const bridge = content(files, "convex/messagingServer.ts");

    expect(boundary).not.toContain("generateUploadUrl");
    expect(boundary).not.toContain("registerAttachment");
    expect(boundary).toContain("await requireDirectParticipantSet(");
    expect(bridge).toContain("serverToken: v.string()");
    expect(bridge).toContain("conversationId: v.string()");
    expect(bridge).toContain("bytes: v.bytes()");
    expect(bridge).toContain("requireTrustedServerToken(args.serverToken)");
    expect(bridge).toContain("args.bytes.byteLength > MAX_ATTACHMENT_BYTES");
    expect(bridge).toContain("new Blob([args.bytes], { type: managedContentType })");
    expect(bridge).toContain("{ sha256: expectedSha256 }");
    expect(bridge).toContain("internal.storageInternal.reserveManagedBlob");
    expect(bridge).toContain("internal.storageInternal.bindManagedBlob");
    before(bridge, "beginAttachmentUpload", "ctx.storage.store");
    before(bridge, "reserveManagedBlob", "ctx.storage.store");
    before(bridge, "ctx.storage.store", "bindAttachmentUpload");
    before(bridge, "bindAttachmentUpload", "commitAttachmentUpload");
    before(bridge, "commitAttachmentUpload", "abortAttachmentUpload");
    expect(bridge).toContain("export const authorizeUpload = action");
    expect(bridge).toContain("internal.messagingInternal.authorizeAttachmentUpload");
  });

  test("rejects cross-user intent use, storage replay, and committed-intent replay", () => {
    const internal = content(
      generateProjectFiles(convexProject("single")),
      "convex/messagingInternal.ts",
    );

    expect(internal).toContain('ctx.db.normalizeId("users", actorId)');
    expect(internal).toContain('ctx.db.normalizeId("conversations", value)');
    expect(internal).toContain("intent.ownerId !== actor._id");
    expect(internal).toContain("intent.conversationId !== conversationId");
    expect(internal).toContain('intent.status !== "pending"');
    expect(internal).toContain("intent.storageId !== args.storageId");
    expect(internal).toContain('.withIndex("by_storageId"');
    expect(internal).toContain("existingIntent._id !== intent._id");
    before(internal, "existingStorage ||", 'ctx.db.insert("messageAttachments"');
    before(
      internal,
      'ctx.db.insert("attachmentStorage"',
      'ctx.db.patch(intent._id, { status: "committed"',
    );
    const abort = internal.slice(
      internal.indexOf("export const abortAttachmentUpload"),
      internal.indexOf("export const cleanupExpiredUploads"),
    );
    before(abort, "const committedStorage = args.storageId", "const intent = await ctx.db.get");
    expect(abort).toContain('ctx.db.normalizeId("users", args.actorId)');
    expect(abort).toContain('ctx.db.normalizeId("conversations", args.conversationId)');
    expect(abort).toContain('.withIndex("by_lifecycle"');
    expect(abort).not.toContain("requireExistingActor");
    expect(abort).not.toContain("requireConversationId");
  });

  test("trusts actual Convex storage metadata rather than client metadata", () => {
    const internal = content(
      generateProjectFiles(convexProject("monorepo")),
      "convex/messagingInternal.ts",
    );

    expect(internal).toContain("const metadata = await ctx.db.system.get(args.storageId)");
    expect(internal).toContain("byteSize !== args.expectedByteSize");
    expect(internal).toContain("mimeType !== expectedMimeType");
    expect(internal).toContain("!ALLOWED_ATTACHMENT_MIME.has(mimeType)");
    before(
      internal,
      "const metadata = await ctx.db.system.get",
      'ctx.db.insert("messageAttachments"',
    );
    before(internal, "byteSize !== args.expectedByteSize", 'ctx.db.insert("messageAttachments"');
  });

  test("derives direct keys and applies public message invariants to internal writes", () => {
    const internal = content(
      generateProjectFiles(convexProject("single")),
      "convex/messagingInternal.ts",
    );

    expect(internal).not.toContain("directKey: v.string()");
    expect(internal).toContain("args.firstUserId === args.secondUserId");
    expect(internal).toContain(
      'const directKey = [String(args.firstUserId), String(args.secondUserId)].sort().join(":")',
    );
    expect(internal).toContain("await requireDirectParticipantSet(");
    expect(internal).toContain("const body = args.body?.trim()");
    expect(internal).toContain("const attachmentIds = [...new Set(args.attachmentIds)]");
    expect(internal).toContain("body.length > 4000");
    expect(internal).toContain("attachmentIds.length > 5");
    expect(internal).toContain("await requireMessage(ctx, args.conversationId, args.replyToId)");
    expect(internal).toContain("attachment.ownerId !== args.senderId");
    expect(internal).toContain("attachment.conversationId !== args.conversationId");
    expect(internal).not.toContain("now: v.number()");
    before(internal, "attachmentIds.length > 5", 'ctx.db.insert("messages"');
    before(internal, "attachment.ownerId !== args.senderId", 'ctx.db.insert("messages"');
  });

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} advances read markers to the requested message without regression`, () => {
      const files = generateProjectFiles(convexProject(mode));
      const boundary = content(files, "convex/messaging.ts");
      const internal = content(files, "convex/messagingInternal.ts");
      const publicStart = boundary.indexOf("export const markRead");
      const publicEnd = boundary.indexOf("\nexport const ", publicStart + 1);
      const publicMarkRead = boundary.slice(publicStart, publicEnd);
      const internalStart = internal.indexOf("export const markRead");
      const internalEnd = internal.indexOf("\nexport const ", internalStart + 1);
      const internalMarkRead = internal.slice(internalStart, internalEnd);

      expect(publicMarkRead).toContain('messageId: v.id("messages")');
      expect(publicMarkRead).toContain(
        "const message = await requireMessage(ctx, args.conversationId, args.messageId)",
      );
      expect(publicMarkRead).toContain("Math.max(participant.lastReadAt ?? 0, message.createdAt)");
      expect(publicMarkRead).not.toContain("Date.now()");

      expect(internalMarkRead).toContain('messageId: v.id("messages")');
      expect(internalMarkRead).toContain(
        "const message = await requireMessage(ctx, args.conversationId, args.messageId)",
      );
      expect(internalMarkRead).toContain(
        "Math.max(participant.lastReadAt ?? 0, message.createdAt)",
      );
      expect(internalMarkRead).not.toContain("Date.now()");
    });
  }

  test("bounds upload intents and cleans only messaging-owned storage evidence", () => {
    const files = generateProjectFiles(convexProject("monorepo"));
    const internal = content(files, "convex/messagingInternal.ts");
    const schema = content(files, "convex/schema.ts");
    const crons = content(files, "convex/crons.ts");

    expect(schema).toContain('.index("by_owner", ["ownerId"])');
    expect(schema).toContain("expectedByteSize: v.number()");
    expect(schema).toContain('v.literal("pending"), v.literal("committed")');
    expect(internal).toContain("decideStorageQuota, DEFAULT_STORAGE_QUOTA");
    expect(internal).toContain("managedStorageBaseMimeType");
    expect(internal).toContain('.query("messageAttachments")');
    expect(internal).toContain('.query("attachmentUploadIntents")');
    expect(internal).toContain('.query("storedObjects")');
    expect(internal).toContain("args.expectedByteSize");
    expect(internal).toContain('decision === "quota-exceeded"');
    expect(internal).toContain('.withIndex("by_expiry"');
    expect(internal).toContain(".take(args.limit)");
    expect(internal).toContain("await ctx.storage.delete(storageId)");
    expect(internal).not.toContain('.query("_storage")');
    expect(internal).not.toContain("ctx.db.system.query");
    expect(crons).toContain("internal.messagingInternal.cleanupExpiredUploads");
    expect(crons).toContain("internal.storageInternal.stageManagedOrphanPage");
    expect(crons).toContain("internal.storageInternal.cleanupManagedBlobBatch");
  });
});
