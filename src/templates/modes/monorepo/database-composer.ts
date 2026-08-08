// @allow-long 6-imports: database composer aggregates postgres/convex/start variants with versioned deps
import { file, packageJson, tsconfig, codeScripts, type TemplateFile } from "../../shared.js";
import { databasePackage, startDatabaseFiles } from "../../database.js";
import { convexDatabaseFiles, convexStartDatabaseFiles } from "../../database/convex.js";
import type { AddonInstallerMap, DatabaseProvider } from "../../../lib/addons.js";
import { hasAddon } from "../../../lib/addons.js";
import * as v from "../../versions.js";

type Runtime = "node" | "bun";

export function databaseComposerFiles(
  projectName: string,
  runtime: Runtime,
  addons?: AddonInstallerMap,
  database?: DatabaseProvider,
): TemplateFile[] {
  const isConvex = database === "convex" || Boolean(addons && hasAddon(addons, "convex"));
  const hasMessaging = Boolean(addons && hasAddon(addons, "messaging"));

  if (isConvex) {
    const base = [
      ...convexDatabaseFiles(projectName, runtime),
      ...convexStartDatabaseFiles(projectName),
    ];
    if (!hasMessaging) return base;
    const extra = convexMessagingFiles();
    // Patch convex/schema.ts to include messaging tables + typingIndicators
    const schemaIdx = base.findIndex((f) => f.path === "convex/schema.ts");
    if (schemaIdx !== -1) {
      const orig = base[schemaIdx].content;
      const patch = [
        "  conversations: defineTable({",
        '    createdBy: v.id("users"),',
        "    createdAt: v.number(),",
        "    updatedAt: v.number(),",
        '  }).index("by_createdBy", ["createdBy"]),',
        "",
        "  conversationParticipants: defineTable({",
        '    conversationId: v.id("conversations"),',
        '    userId: v.id("users"),',
        "    joinedAt: v.number(),",
        "    lastReadAt: v.optional(v.number()),",
        '  }).index("by_conversationId", ["conversationId"]).index("by_userId", ["userId"]).index("by_conversation_user", ["conversationId", "userId"]),',
        "",
        "  messages: defineTable({",
        '    conversationId: v.id("conversations"),',
        '    senderId: v.id("users"),',
        "    body: v.optional(v.string()),",
        '    attachmentIds: v.optional(v.array(v.id("_storage"))),',
        '    replyToId: v.optional(v.id("messages")),',
        "    createdAt: v.number(),",
        '  }).index("by_conversation_created", ["conversationId", "createdAt"]),',
        "",
        "  typingIndicators: defineTable({",
        '    conversationId: v.id("conversations"),',
        '    userId: v.id("users"),',
        "    isTyping: v.boolean(),",
        "    updatedAt: v.number(),",
        '  }).index("by_conversation", ["conversationId"]).index("by_conversation_user", ["conversationId", "userId"]),',
        "",
      ].join("\n");
      // Insert before final posts block closing: find "  posts: defineTable" and insert patch before it
      let newContent: string;
      if (orig.includes("  posts: defineTable")) {
        newContent = orig.replace("  posts: defineTable", `${patch}  posts: defineTable`);
      } else if (orig.includes("});")) {
        newContent = orig.replace("});", `${patch}});`);
      } else {
        newContent = orig;
      }
      base[schemaIdx] = { ...base[schemaIdx], content: newContent };
    }
    return [...base, ...extra];
  }

  if (database === "none") {
    // Database disabled — emit a stub @repo/database so @repo/auth and other
    // consumers still typecheck. The stub exports the same symbols (db, users,
    // etc.) but throws at runtime with a clear message guiding to --database
    // postgres|convex. Without this, `import { db } from "@repo/database"` in
    // packages/auth/src/index.ts is TS2307 and the whole project fails to
    // typecheck (generation-matrix invariant).
    return databaseStubPackage(runtime);
  }

  const base = [...databasePackage(projectName, runtime), ...startDatabaseFiles(projectName)];
  if (!hasMessaging) return base;
  return [...base, ...postgresMessagingFiles()];
}

function postgresMessagingFiles(): TemplateFile[] {
  return [
    file(
      "packages/database/src/schema/tables/conversations.ts",
      `import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
`,
    ),
    file(
      "packages/database/src/schema/tables/conversation_participants.ts",
      `import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id").notNull(),
    userId: uuid("user_id").notNull(),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);
`,
    ),
    file(
      "packages/database/src/schema/tables/messages.ts",
      `import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull(),
  senderId: uuid("sender_id").notNull(),
  body: text("body"),
  replyToId: uuid("reply_to_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
`,
    ),
    file(
      "packages/database/src/schema/tables/message_attachments.ts",
      `import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
export const messageAttachments = pgTable("message_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull(),
  storageKey: text("storage_key").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  originalName: text("original_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
`,
    ),
    file(
      "packages/database/src/schema/messaging.ts",
      `export { conversations } from "./tables/conversations.js";
export { conversationParticipants } from "./tables/conversation_participants.js";
export { messages } from "./tables/messages.js";
export { messageAttachments } from "./tables/message_attachments.js";
`,
    ),
  ];
}

function convexMessagingFiles(): TemplateFile[] {
  return [
    file(
      "convex/messaging.ts",
      `// @allow-long 280: DM messaging for convex — native reactivity, ctx.storage for files, typingIndicators TTL
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/better-auth";

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx as never);
    if (!userId) return [];
    const parts = await ctx.db.query("conversationParticipants").withIndex("by_userId", (q) => q.eq("userId", userId as never)).collect();
    const convIds = [...new Set(parts.map((p) => p.conversationId))];
    const convs = await Promise.all(convIds.map((id) => ctx.db.get(id as never)));
    return convs.filter(Boolean).map((c) => ({ ...c, participants: parts.filter((p) => p.conversationId === c!._id) }));
  },
});

export const getOrCreateConversation = mutation({
  args: { peerUserId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx as never);
    if (!userId) throw new Error("UNAUTHORIZED");
    const me = userId as unknown as string;
    const peer = args.peerUserId as unknown as string;
    const a = me < peer ? me : peer;
    const b = me < peer ? peer : me;
    // Find existing DM by checking participants pair
    const myParts = await ctx.db.query("conversationParticipants").withIndex("by_userId", (q) => q.eq("userId", me as never)).collect();
    for (const p of myParts) {
      const other = await ctx.db.query("conversationParticipants").withIndex("by_conversationId", (q) => q.eq("conversationId", p.conversationId)).collect();
      const ids = other.map((o) => o.userId as unknown as string).sort();
      if (ids.length === 2 && ids[0] === a && ids[1] === b) {
        const conv = await ctx.db.get(p.conversationId);
        return conv;
      }
    }
    const convId = await ctx.db.insert("conversations", { createdBy: userId as never, createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.insert("conversationParticipants", { conversationId: convId, userId: userId as never, joinedAt: Date.now() });
    await ctx.db.insert("conversationParticipants", { conversationId: convId, userId: args.peerUserId, joinedAt: Date.now() });
    return await ctx.db.get(convId);
  },
});

export const listMessages = query({
  args: { conversationId: v.id("conversations"), limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx as never);
    if (!userId) throw new Error("UNAUTHORIZED");
    const msgs = await ctx.db.query("messages").withIndex("by_conversation_created", (q) => q.eq("conversationId", args.conversationId)).order("desc").take(args.limit ?? 20);
    const withUrls = await Promise.all(msgs.map(async (m) => {
      const atts = m.attachmentIds ? await Promise.all((m.attachmentIds as unknown as string[]).map(async (id) => ({ storageId: id, url: await ctx.storage.getUrl(id as never) }))) : [];
      return { ...m, attachments: atts };
    }));
    return { messages: withUrls.reverse(), nextCursor: null };
  },
});

export const sendMessage = mutation({
  args: { conversationId: v.id("conversations"), body: v.optional(v.string()), attachmentIds: v.optional(v.array(v.id("_storage"))) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx as never);
    if (!userId) throw new Error("UNAUTHORIZED");
    if (!args.body && !args.attachmentIds?.length) throw new Error("body or attachment required");
    const id = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: userId as never,
      body: args.body,
      attachmentIds: args.attachmentIds,
      createdAt: Date.now(),
    } as never);
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() } as never);
    return await ctx.db.get(id);
  },
});

export const markRead = mutation({
  args: { conversationId: v.id("conversations"), messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx as never);
    if (!userId) throw new Error("UNAUTHORIZED");
    const part = await ctx.db.query("conversationParticipants").withIndex("by_conversation_user", (q) => q.eq("conversationId", args.conversationId).eq("userId", userId as never)).unique();
    if (part) await ctx.db.patch(part._id, { lastReadAt: Date.now() } as never);
    return { ok: true };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx as never);
    if (!userId) throw new Error("UNAUTHORIZED");
    return await ctx.storage.generateUploadUrl();
  },
});

export const sendTyping = mutation({
  args: { conversationId: v.id("conversations"), isTyping: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx as never);
    if (!userId) throw new Error("UNAUTHORIZED");
    const existing = await ctx.db.query("typingIndicators").withIndex("by_conversation_user", (q) => q.eq("conversationId", args.conversationId).eq("userId", userId as never)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { isTyping: args.isTyping, updatedAt: Date.now() } as never);
    } else {
      await ctx.db.insert("typingIndicators", { conversationId: args.conversationId, userId: userId as never, isTyping: args.isTyping, updatedAt: Date.now() } as never);
    }
    return { ok: true };
  },
});

export const listTyping = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const fiveSecAgo = Date.now() - 5000;
    const all = await ctx.db.query("typingIndicators").withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId)).collect();
    return all.filter((t) => t.isTyping && t.updatedAt > fiveSecAgo);
  },
});
`,
    ),
  ];
}

function databaseStubPackage(runtime: Runtime): TemplateFile[] {
  const executor = runtime === "bun" ? "bun" : "node";
  return [
    file(
      "packages/database/package.json",
      packageJson({
        name: "@repo/database",
        exports: { ".": "./src/index.ts" },
        scripts: {
          ...codeScripts(),
          "db:generate": `${executor} --env-file=../../.env.local drizzle-kit generate`,
          "db:migrate": `${executor} --env-file=../../.env.local drizzle-kit migrate`,
          "db:push": `${executor} --env-file=../../.env.local drizzle-kit push`,
        },
        dependencies: {
          "@repo/config": "workspace:*",
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/database/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          types: ["node"],
          outDir: "./dist",
          rootDir: "./src",
          declaration: true,
        },
      }),
    ),
    file(
      "packages/database/src/index.ts",
      `// database=none stub — no real DB configured.
// This file exists so imports like \`import { db, users } from "@repo/database"\`
// still resolve when --database none. Any actual DB call will throw with a
// clear message guiding to enable postgres or convex.
export const db: any = new Proxy({} as unknown as Record<string, unknown>, {
  get() { throw new Error("[ghostinit] database is disabled (--database none). Enable --database postgres or convex to use @repo/database."); },
});
export const pool: any = db;
export const users: any = {};
export const accounts: any = {};
export const sessions: any = {};
export const verifications: any = {};
export const twoFactor: any = {};
export const posts: any = {};
export * from "./schema/index.js";
`,
    ),
    file(
      "packages/database/src/schema/index.ts",
      `// stub schema — re-exports empty for database=none
export const users: any = {};
export const accounts: any = {};
export const sessions: any = {};
export const verifications: any = {};
export const twoFactor: any = {};
export const posts: any = {};
export const products: any = {};
export const customers: any = {};
export const subscriptions: any = {};
export const checkouts: any = {};
export const invoices: any = {};
export const license_keys: any = {};
export const usage_events: any = {};
export const webhook_events: any = {};
`,
    ),
    file(
      "packages/database/src/schema/auth.ts",
      `export const users: any = {};
export const accounts: any = {};
export const sessions: any = {};
export const verifications: any = {};
export const twoFactor: any = {};
`,
    ),
    file(
      "packages/database/src/schema/posts.ts",
      `export const posts: any = {};
`,
    ),
    file(
      "packages/database/src/schema/billing.ts",
      `export const products: any = {};
export const customers: any = {};
export const subscriptions: any = {};
export const checkouts: any = {};
export const invoices: any = {};
export const license_keys: any = {};
export const usage_events: any = {};
export const webhook_events: any = {};
`,
    ),
    file(
      "packages/database/src/schema/enums.ts",
      `export const billingProviderEnum: any = {};
export const subscriptionStatusEnum: any = {};
export const checkoutStatusEnum: any = {};
export const invoiceStatusEnum: any = {};
export const licenseKeyStatusEnum: any = {};
export const recurringIntervalEnum: any = {};
`,
    ),
  ];
}
