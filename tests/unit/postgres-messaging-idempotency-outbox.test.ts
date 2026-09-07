import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function project(
  mode: "monorepo" | "single",
  apps: ProjectConfig["apps"] = ["web"],
): ProjectConfig {
  return {
    name: `messaging-outbox-${mode}`,
    version: "0.1.0",
    runtime: "bun",
    mode,
    framework: "nextjs",
    database: "postgres",
    apps,
    billing: [],
    features: [],
    messaging: true,
  } as ProjectConfig;
}

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const match = files.find((entry) => entry.path === path);
  if (!match) throw new Error(`Missing generated file: ${path}`);
  return match.content;
}

describe("Postgres messaging idempotency and durable realtime outbox", () => {
  test("scopes client keys by actor and conversation in both Postgres layouts", () => {
    const monorepo = generateProjectFiles(project("monorepo"));
    const single = generateProjectFiles(project("single"));
    const monorepoMessages = content(monorepo, "packages/database/src/schema/tables/messages.ts");
    const monorepoOutbox = content(
      monorepo,
      "packages/database/src/schema/tables/messaging_realtime_outbox.ts",
    );
    const singleSchema = content(single, "src/server/db/schema/messaging.ts");

    for (const schema of [monorepoMessages, singleSchema]) {
      expect(schema).toContain('clientMessageKey: text("client_message_key").notNull()');
      expect(schema).toContain('uniqueIndex("messages_actor_conversation_client_key_uidx")');
      expect(schema).toContain(
        "table.senderId,\n    table.conversationId,\n    table.clientMessageKey",
      );
    }
    for (const schema of [monorepoOutbox, singleSchema]) {
      expect(schema).toContain('pgTable("messaging_realtime_outbox"');
      expect(schema).toContain('attemptCount: integer("attempt_count").notNull().default(0)');
      expect(schema).toContain('leaseToken: text("lease_token")');
      expect(schema).toContain('publishedAt: timestamp("published_at")');
      expect(schema).toContain('uniqueIndex("messaging_realtime_outbox_message_uidx")');
    }
  });

  test("uses conflict-safe replay and commits attachment claims with one outbox row", () => {
    const files = generateProjectFiles(project("monorepo"));
    const composition = content(files, "packages/api/src/composition/messaging.ts");
    const service = content(files, "packages/services/src/messaging/facade.ts");
    const sendStart = service.indexOf("async sendMessage");
    const sendEnd = service.indexOf("async markRead", sendStart);
    const send = service.slice(sendStart, sendEnd);

    expect(composition).toContain(".onConflictDoNothing({");
    expect(composition).toContain(
      "target: [messages.senderId, messages.conversationId, messages.clientMessageKey]",
    );
    expect(composition).toContain("eq(messages.clientMessageKey, input.clientMessageKey)");
    expect(composition).toContain("(existing.body ?? null) === input.body");
    expect(composition).toContain("(existing.replyToId ?? null) === input.replyToId");
    expect(composition).toContain("sameStringSet(");
    expect(composition).toContain('"MESSAGING_IDEMPOTENCY_CONFLICT"');
    expect(composition).toContain("await transaction.insert(messagingRealtimeOutbox).values({");
    expect(composition.indexOf(".insert(messages)")).toBeLessThan(
      composition.indexOf(".update(messageAttachments)"),
    );
    expect(composition.indexOf(".update(messageAttachments)")).toBeLessThan(
      composition.indexOf("transaction.insert(messagingRealtimeOutbox)"),
    );
    expect(send).toContain("scheduleMessageDelivery()");
    expect(send).not.toContain("await realtime.publish");
  });

  test("upserts direct conversations atomically and uses a stable composite message cursor", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generateProjectFiles(project(mode));
      const composition = content(
        files,
        mode === "monorepo"
          ? "packages/api/src/composition/messaging.ts"
          : "src/server/api/composition/messaging.ts",
      );
      const createStart = composition.indexOf("async createDirectConversation");
      const createEnd = composition.indexOf("async listConversations", createStart);
      const create = composition.slice(createStart, createEnd);
      const listStart = composition.indexOf("async listMessages");
      const listEnd = composition.indexOf("async createMessage", listStart);
      const list = composition.slice(listStart, listEnd);
      const service = content(
        files,
        mode === "monorepo"
          ? "packages/services/src/messaging/facade.ts"
          : "src/server/services/messaging/facade.ts",
      );

      expect(create).toContain(".onConflictDoNothing({ target: conversations.directKey })");
      expect(create).toContain("inserted ??");
      expect(create).toContain("eq(conversations.directKey, directKey)");
      expect(create).toContain(
        "target: [conversationParticipants.conversationId, conversationParticipants.userId]",
      );
      expect(create.indexOf("insert(conversations)")).toBeLessThan(
        create.indexOf("insert(conversationParticipants)"),
      );
      expect(service).toContain("return await repository.createDirectConversation(first, second)");
      expect(service).not.toContain("repository.findDirectConversation");

      expect(list).toContain(".select({ id: messages.id, createdAt: messages.createdAt })");
      expect(list).toContain("eq(messages.createdAt, cursorPosition.createdAt)");
      expect(list).toContain("lt(messages.id, cursorPosition.id)");
      expect(list).toContain(".orderBy(desc(messages.createdAt), desc(messages.id))");
      expect(list.indexOf("const nextCursor =")).toBeLessThan(list.indexOf("[...pageRows]"));
      expect(list).toContain("messages: [...pageRows]");
      expect(list).not.toContain("messages: pageRows\n        .reverse()");
      expect(composition).toContain("lte(users.banExpires, new Date())");
    }
  });

  test("advances the read marker only to the requested message in both Postgres layouts", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generateProjectFiles(project(mode));
      const composition = content(
        files,
        mode === "monorepo"
          ? "packages/api/src/composition/messaging.ts"
          : "src/server/api/composition/messaging.ts",
      );
      const markReadStart = composition.indexOf("async markRead");
      const markReadEnd = composition.indexOf("\n  },", markReadStart);
      const markRead = composition.slice(markReadStart, markReadEnd);
      const contract = content(
        files,
        mode === "monorepo"
          ? "packages/api/src/procedures/messaging/mark-read.ts"
          : "src/server/api/procedures/messaging/mark-read.ts",
      );
      const service = content(
        files,
        mode === "monorepo"
          ? "packages/services/src/messaging/facade.ts"
          : "src/server/services/messaging/facade.ts",
      );

      expect(markRead).toContain("async markRead(conversationId, userId, messageId)");
      expect(markRead).toContain(".select({ createdAt: messages.createdAt })");
      expect(markRead).toContain("eq(messages.id, messageId)");
      expect(markRead).toContain("eq(messages.conversationId, conversationId)");
      expect(markRead).toContain(".set({ lastReadAt: target.createdAt })");
      expect(markRead).toContain("isNull(conversationParticipants.lastReadAt)");
      expect(markRead).toContain("lt(conversationParticipants.lastReadAt, target.createdAt)");
      expect(markRead).not.toContain("lastReadAt: new Date()");
      expect(contract).toContain("messageId: z.string().min(1)");
      expect(service).toContain(
        "repository.markRead(input.conversationId, actor.id, input.messageId)",
      );
    }
  });

  test("emits a lease-safe bounded retry worker and stable package export", () => {
    const monorepo = generateProjectFiles(project("monorepo"));
    const single = generateProjectFiles(project("single"));
    const worker = content(monorepo, "packages/api/src/messaging-outbox.ts");
    const singleWorker = content(single, "src/server/api/messaging-outbox.ts");
    const packageJson = JSON.parse(content(monorepo, "packages/api/package.json")) as {
      exports?: Record<string, string>;
    };

    expect(packageJson.exports?.["./messaging-outbox"]).toBe("./src/messaging-outbox.ts");
    for (const source of [worker, singleWorker]) {
      expect(source).toContain('.for("update", { skipLocked: true })');
      expect(source).toContain("lt(messagingRealtimeOutbox.attemptCount, options.maxAttempts)");
      expect(source).toContain("messagingRealtimeOutbox.attemptCount} + 1");
      expect(source).toContain("eq(messagingRealtimeOutbox.leaseToken, leaseToken)");
      expect(source).toContain(".delete(messagingRealtimeOutbox)");
      expect(source).toContain("baseRetryMs * 2 ** exponent");
      expect(source).toContain("export async function drainMessagingRealtimeOutbox(");
      expect(source).toContain("export function startMessagingRealtimeOutboxWorker(");
      expect(source).toContain("export const startMessagingOutboxWorker =");
      expect(source).toContain("async stop(): Promise<void>");
    }
    expect(singleWorker).toContain('from "@/server/db/schema/messaging"');
    expect(singleWorker).not.toContain("@repo/");
  });

  test("requires and reuses one client key for each Postgres send attempt", () => {
    const files = generateProjectFiles(project("monorepo", ["web", "mobile", "desktop"]));
    const contract = content(files, "packages/api/src/procedures/messaging/send-message.ts");
    const web = content(files, "apps/web/src/app/(app)/messages/hooks/use-messaging.ts");
    const webComposer = content(
      files,
      "apps/web/src/app/(app)/messages/_components/message-composer.tsx",
    );
    const mobile = content(files, "apps/mobile/src/adapters/messaging/postgres.ts");
    const desktop = content(files, "apps/desktop/src/renderer/adapters/messaging/postgres.ts");

    expect(contract).toContain("clientMessageKey: z.string().trim().min(16).max(128)");
    for (const client of [web, mobile, desktop]) {
      expect(client).toContain("createClientMessageKey()");
      expect(client).toContain("pendingSend.current?.signature === signature");
      expect(client).toContain("clientMessageKey: attempt.clientMessageKey");
    }
    for (const client of [mobile, desktop]) {
      expect(client).toContain("const signature = JSON.stringify([");
      expect(client).toContain(": { signature, clientMessageKey: createClientMessageKey() };");
      expect(client).toContain("pendingSend.current = attempt;");
      expect(client.indexOf("pendingSend.current = attempt;")).toBeLessThan(
        client.indexOf("await sendMutation.mutateAsync({"),
      );
      expect(client.indexOf("await sendMutation.mutateAsync({")).toBeLessThan(
        client.indexOf(
          "if (pendingSend.current?.clientMessageKey === attempt.clientMessageKey) pendingSend.current = null;",
        ),
      );
    }
    expect(webComposer).toContain("pendingAttachmentUpload.current");
    expect(webComposer).toContain("messageAttachmentFingerprint(file)");
    expect(webComposer).toContain("reusablePendingAttachmentId(");
    expect(webComposer).toContain("attachmentId = attachmentIdFrom(await response.json())");
    expect(
      webComposer.indexOf("pendingAttachmentUpload.current = null;\n      setBody"),
    ).toBeGreaterThan(webComposer.indexOf("await send(body.trim(), attachmentIds)"));
  });

  test("reuses an uploaded attachment only for the same conversation and file fingerprint", async () => {
    const files = generateProjectFiles(project("monorepo"));
    const web = content(files, "apps/web/src/app/(app)/messages/hooks/use-messaging.ts");
    const start = web.indexOf("export interface PendingMessageAttachmentUpload");
    const end = web.indexOf("export function useConversations");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(web.slice(start, end));
    const root = await mkdtemp(join(tmpdir(), "ghostinit-messaging-retry-"));
    const modulePath = join(root, "attachment-retry.mjs");
    try {
      await writeFile(modulePath, javascript);
      const helpers = (await import(
        `${pathToFileURL(modulePath).href}?run=${crypto.randomUUID()}`
      )) as {
        messageAttachmentFingerprint(file: {
          name: string;
          size: number;
          type: string;
          lastModified: number;
        }): string;
        reusablePendingAttachmentId(
          pending: {
            conversationId: string;
            fileFingerprint: string;
            attachmentId: string;
          } | null,
          conversationId: string,
          fingerprint: string,
        ): string | undefined;
      };
      const fingerprint = helpers.messageAttachmentFingerprint({
        name: "evidence.pdf",
        size: 42,
        type: "application/pdf",
        lastModified: 123,
      });
      const pending = {
        conversationId: "conversation-1",
        fileFingerprint: fingerprint,
        attachmentId: "attachment-1",
      };

      expect(helpers.reusablePendingAttachmentId(pending, "conversation-1", fingerprint)).toBe(
        "attachment-1",
      );
      expect(
        helpers.reusablePendingAttachmentId(pending, "conversation-2", fingerprint),
      ).toBeUndefined();
      expect(
        helpers.reusablePendingAttachmentId(pending, "conversation-1", `${fingerprint}-changed`),
      ).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
