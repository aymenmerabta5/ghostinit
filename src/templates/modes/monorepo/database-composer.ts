// @allow-long 6-imports: database composer aggregates postgres/convex/start variants with versioned deps
import { file, packageJson, tsconfig, codeScripts, type TemplateFile } from "../../shared.js";
import { databasePackage, startDatabaseFiles } from "../../database.js";
import { convexDatabaseFiles, convexStartDatabaseFiles } from "../../database/convex.js";
import { convexMessagingDatabaseFiles } from "../../messaging/convex.js";
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
  const hasAuth = addons ? hasAddon(addons, "auth") : true;
  const hasEmail = addons ? hasAddon(addons, "email") : true;
  const hasI18n = Boolean(addons && hasAddon(addons, "i18n"));
  const hasMobile = Boolean(addons && hasAddon(addons, "mobile"));
  const hasBilling = addons
    ? hasAddon(addons, "billing") ||
      (["stripe", "chargily", "paddle", "polar"] as const).some((provider) =>
        hasAddon(addons, provider),
      )
    : true;
  const hasMessaging = Boolean(addons && hasAddon(addons, "messaging"));

  if (isConvex) {
    const base = [
      ...convexDatabaseFiles(projectName, runtime, "monorepo", {
        auth: hasAuth,
        billing: hasBilling,
        email: hasEmail,
        i18n: hasI18n,
        mobile: hasMobile,
        posts: hasAuth,
      }),
      ...convexStartDatabaseFiles(projectName),
    ];
    if (!hasMessaging) return base;
    const extra = convexMessagingFiles();
    const schemaIdx = base.findIndex((f) => f.path === "convex/schema.ts");
    if (schemaIdx !== -1) {
      const orig = base[schemaIdx].content;
      const patch = [
        "  conversations: defineTable({",
        '    createdBy: v.id("users"),',
        "    directKey: v.string(),",
        "    createdAt: v.number(),",
        "    updatedAt: v.number(),",
        '  }).index("by_createdBy", ["createdBy"]).index("by_directKey", ["directKey"]),',
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
        '    attachmentIds: v.optional(v.array(v.id("messageAttachments"))),',
        '    replyToId: v.optional(v.id("messages")),',
        "    createdAt: v.number(),",
        '  }).index("by_conversation_created", ["conversationId", "createdAt"]),',
        "",
        "  messageAttachments: defineTable({",
        '    conversationId: v.id("conversations"),',
        '    ownerId: v.id("users"),',
        '    messageId: v.optional(v.id("messages")),',
        "    mimeType: v.string(),",
        "    byteSize: v.number(),",
        "    originalName: v.string(),",
        "    createdAt: v.number(),",
        "    expiresAt: v.number(),",
        '  }).index("by_messageId", ["messageId"]).index("by_owner", ["ownerId"]).index("by_pending_owner", ["ownerId", "conversationId", "expiresAt"]),',
        "",
        "  attachmentUploadIntents: defineTable({",
        '    conversationId: v.id("conversations"),',
        '    ownerId: v.id("users"),',
        "    expectedByteSize: v.number(),",
        '    status: v.union(v.literal("pending"), v.literal("committed")),',
        "    expiresAt: v.number(),",
        '    storageId: v.optional(v.id("_storage")),',
        '  }).index("by_owner", ["ownerId"]).index("by_owner_status", ["ownerId", "status"]).index("by_owner_expiry", ["ownerId", "expiresAt"]).index("by_expiry", ["expiresAt"]).index("by_storageId", ["storageId"]),',
        "",
        "  attachmentStorage: defineTable({",
        '    attachmentId: v.id("messageAttachments"),',
        '    storageId: v.id("_storage"),',
        '  }).index("by_attachmentId", ["attachmentId"]).index("by_storageId", ["storageId"]),',
        "",
        "  typingIndicators: defineTable({",
        '    conversationId: v.id("conversations"),',
        '    userId: v.id("users"),',
        "    isTyping: v.boolean(),",
        "    updatedAt: v.number(),",
        '  }).index("by_conversation", ["conversationId"]).index("by_conversation_user", ["conversationId", "userId"]),',
        "",
      ].join("\n");
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

  const base = [
    ...databasePackage(projectName, runtime, {
      auth: hasAuth,
      billing: hasBilling,
      posts: hasAuth,
    }),
    ...startDatabaseFiles(projectName),
  ];
  if (!hasMessaging) return base;
  const schemaIndex = base.findIndex(
    (templateFile) => templateFile.path === "packages/database/src/schema/index.ts",
  );
  if (schemaIndex !== -1 && !base[schemaIndex].content.includes('export * from "./messaging"')) {
    base[schemaIndex] = {
      ...base[schemaIndex],
      content: base[schemaIndex].content.replace(
        'export * from "./posts";',
        'export * from "./posts";\nexport * from "./messaging";',
      ),
    };
  }
  return [...base, ...postgresMessagingFiles()];
}

function postgresMessagingFiles(): TemplateFile[] {
  return [
    file(
      "packages/database/src/schema/tables/conversations.ts",
      `import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.js";

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  directKey: text("direct_key").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("conversations_updated_at_idx").on(table.updatedAt)]);
`,
    ),
    file(
      "packages/database/src/schema/tables/conversation_participants.ts",
      `import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.js";
import { conversations } from "./conversations.js";

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at"),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index("conversation_participants_user_idx").on(table.userId, table.conversationId),
  ],
);
`,
    ),
    file(
      "packages/database/src/schema/tables/messages.ts",
      `import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.js";
import { conversations } from "./conversations.js";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  clientMessageKey: text("client_message_key").notNull(),
  body: text("body"),
  replyToId: uuid("reply_to_id").references((): import("drizzle-orm/pg-core").AnyPgColumn => messages.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  uniqueIndex("messages_actor_conversation_client_key_uidx").on(
    table.senderId,
    table.conversationId,
    table.clientMessageKey,
  ),
]);
`,
    ),
    file(
      "packages/database/src/schema/tables/message_attachments.ts",
      `import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.js";
import { conversations } from "./conversations.js";
import { messages } from "./messages.js";

export const messageAttachments = pgTable("message_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "restrict" }),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "restrict" }),
  storageKey: text("storage_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  originalName: text("original_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  uploadedAt: timestamp("uploaded_at"),
}, (table) => [
  index("message_attachments_message_idx").on(table.messageId),
  index("message_attachments_owner_idx").on(table.ownerId),
  index("message_attachments_pending_owner_idx").on(table.ownerId, table.conversationId, table.expiresAt),
  index("message_attachments_expired_pending_idx")
    .on(table.expiresAt, table.id)
    .where(sql\`\${table.messageId} is null\`),
]);
`,
    ),
    file(
      "packages/database/src/schema/tables/messaging_realtime_outbox.ts",
      `import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.js";
import { conversations } from "./conversations.js";
import { messages } from "./messages.js";

export const messagingRealtimeOutbox = pgTable("messaging_realtime_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  attemptCount: integer("attempt_count").notNull().default(0),
  availableAt: timestamp("available_at").notNull().defaultNow(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at"),
  publishedAt: timestamp("published_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("messaging_realtime_outbox_message_uidx").on(table.messageId),
  index("messaging_realtime_outbox_pending_idx").on(
    table.publishedAt,
    table.availableAt,
    table.attemptCount,
  ),
  index("messaging_realtime_outbox_lease_idx").on(table.leaseExpiresAt),
]);
`,
    ),
    file(
      "packages/database/src/schema/tables/messaging_websocket_tickets.ts",
      `import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sessions, users } from "../auth.js";

/**
 * Stores only a SHA-256 digest of each short-lived native WebSocket ticket.
 * The unique session index bounds outstanding tickets to one per session and
 * lets a newly issued ticket atomically invalidate its predecessor.
 */
export const messagingWebsocketTickets = pgTable("messaging_websocket_tickets", {
  ticketHash: text("ticket_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("messaging_websocket_tickets_session_uidx").on(table.sessionId),
  index("messaging_websocket_tickets_expires_idx").on(table.expiresAt),
]);
`,
    ),
    file(
      "packages/database/src/schema/messaging.ts",
      `export { conversations } from "./tables/conversations.js";
export { conversationParticipants } from "./tables/conversation_participants.js";
export { messages } from "./tables/messages.js";
export { messageAttachments } from "./tables/message_attachments.js";
export { messagingRealtimeOutbox } from "./tables/messaging_realtime_outbox.js";
export { messagingWebsocketTickets } from "./tables/messaging_websocket_tickets.js";
`,
    ),
  ];
}

function convexMessagingFiles(): TemplateFile[] {
  return convexMessagingDatabaseFiles();
}

function databaseStubPackage(runtime: Runtime): TemplateFile[] {
  const executor = runtime === "bun" ? "bun" : "node";
  return [
    file(
      "packages/database/package.json",
      packageJson({
        name: "@repo/database",
        exports: {
          ".": "./src/index.ts",
          "./schema": "./src/schema/index.ts",
        },
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
      "packages/database/src/disabled.ts",
      `export const DATABASE_DISABLED_MESSAGE =
  "[ghostinit] database is disabled (--database none). Enable --database postgres or convex to use @repo/database.";

/**
 * Import-compatible marker for a value that cannot perform persistence.
 * Every property is \`never\`, so application code cannot accidentally build a
 * database query while database=none. The proxy also fails closed at runtime.
 */
export interface DisabledDatabaseValue {
  readonly [property: string]: never;
}

export function disabledDatabaseValue(label: string): DisabledDatabaseValue {
  const target: DisabledDatabaseValue = Object.create(null);
  return new Proxy(target, {
    get(_target, property): never {
      throw new Error(\`\${DATABASE_DISABLED_MESSAGE} Attempted to access \${label}.\${String(property)}.\`);
    },
    set(): never {
      throw new Error(\`\${DATABASE_DISABLED_MESSAGE} Attempted to mutate \${label}.\`);
    },
  });
}
`,
    ),
    file(
      "packages/database/src/index.ts",
      `// database=none stub — no real DB configured.
// This file exists so imports like \`import { db, users } from "@repo/database"\`
// still resolve when --database none. Any actual DB call will throw with a
// clear message guiding to enable postgres or convex.
import { disabledDatabaseValue } from "./disabled.js";

export const db = disabledDatabaseValue("db");
export const pool = db;
export {
  accounts,
  adminAuditEvents,
  identityAuditEvents,
  invitations,
  members,
  organizationRoles,
  organizations,
  passkeys,
  rateLimits,
  sessions,
  teamMembers,
  teams,
  twoFactor,
  twoFactors,
  users,
  verifications,
  checkouts,
  customers,
  invoices,
  license_keys,
  products,
  subscriptions,
  usage_events,
  webhook_events,
  billingProviderEnum,
  checkoutStatusEnum,
  invoiceStatusEnum,
  licenseKeyStatusEnum,
  recurringIntervalEnum,
  subscriptionStatusEnum,
  posts,
} from "./schema/index.js";
`,
    ),
    file(
      "packages/database/src/schema/index.ts",
      `// Import-compatible, fail-closed schema surface for database=none.
import { disabledDatabaseValue } from "../disabled.js";

export const users = disabledDatabaseValue("users");
export const accounts = disabledDatabaseValue("accounts");
export const sessions = disabledDatabaseValue("sessions");
export const verifications = disabledDatabaseValue("verifications");
export const passkeys = disabledDatabaseValue("passkeys");
export const rateLimits = disabledDatabaseValue("rateLimits");
export const twoFactors = disabledDatabaseValue("twoFactors");
export const twoFactor = twoFactors;
export const organizations = disabledDatabaseValue("organizations");
export const members = disabledDatabaseValue("members");
export const invitations = disabledDatabaseValue("invitations");
export const teams = disabledDatabaseValue("teams");
export const teamMembers = disabledDatabaseValue("teamMembers");
export const organizationRoles = disabledDatabaseValue("organizationRoles");
export const adminAuditEvents = disabledDatabaseValue("adminAuditEvents");
export const identityAuditEvents = disabledDatabaseValue("identityAuditEvents");
export const posts = disabledDatabaseValue("posts");
export const products = disabledDatabaseValue("products");
export const customers = disabledDatabaseValue("customers");
export const subscriptions = disabledDatabaseValue("subscriptions");
export const checkouts = disabledDatabaseValue("checkouts");
export const invoices = disabledDatabaseValue("invoices");
export const license_keys = disabledDatabaseValue("license_keys");
export const usage_events = disabledDatabaseValue("usage_events");
export const webhook_events = disabledDatabaseValue("webhook_events");
export const billingProviderEnum = disabledDatabaseValue("billingProviderEnum");
export const subscriptionStatusEnum = disabledDatabaseValue("subscriptionStatusEnum");
export const checkoutStatusEnum = disabledDatabaseValue("checkoutStatusEnum");
export const invoiceStatusEnum = disabledDatabaseValue("invoiceStatusEnum");
export const licenseKeyStatusEnum = disabledDatabaseValue("licenseKeyStatusEnum");
export const recurringIntervalEnum = disabledDatabaseValue("recurringIntervalEnum");
`,
    ),
    file(
      "packages/database/src/schema/auth.ts",
      `import { disabledDatabaseValue } from "../disabled.js";

export const users = disabledDatabaseValue("users");
export const accounts = disabledDatabaseValue("accounts");
export const sessions = disabledDatabaseValue("sessions");
export const verifications = disabledDatabaseValue("verifications");
export const passkeys = disabledDatabaseValue("passkeys");
export const rateLimits = disabledDatabaseValue("rateLimits");
export const twoFactors = disabledDatabaseValue("twoFactors");
export const twoFactor = twoFactors;
export const organizations = disabledDatabaseValue("organizations");
export const members = disabledDatabaseValue("members");
export const invitations = disabledDatabaseValue("invitations");
export const teams = disabledDatabaseValue("teams");
export const teamMembers = disabledDatabaseValue("teamMembers");
export const organizationRoles = disabledDatabaseValue("organizationRoles");
export const adminAuditEvents = disabledDatabaseValue("adminAuditEvents");
export const identityAuditEvents = disabledDatabaseValue("identityAuditEvents");
`,
    ),
    file(
      "packages/database/src/schema/posts.ts",
      `import { disabledDatabaseValue } from "../disabled.js";

export const posts = disabledDatabaseValue("posts");
`,
    ),
    file(
      "packages/database/src/schema/billing.ts",
      `import { disabledDatabaseValue } from "../disabled.js";

export const products = disabledDatabaseValue("products");
export const customers = disabledDatabaseValue("customers");
export const subscriptions = disabledDatabaseValue("subscriptions");
export const checkouts = disabledDatabaseValue("checkouts");
export const invoices = disabledDatabaseValue("invoices");
export const license_keys = disabledDatabaseValue("license_keys");
export const usage_events = disabledDatabaseValue("usage_events");
export const webhook_events = disabledDatabaseValue("webhook_events");
`,
    ),
    file(
      "packages/database/src/schema/enums.ts",
      `import { disabledDatabaseValue } from "../disabled.js";

export const billingProviderEnum = disabledDatabaseValue("billingProviderEnum");
export const subscriptionStatusEnum = disabledDatabaseValue("subscriptionStatusEnum");
export const checkoutStatusEnum = disabledDatabaseValue("checkoutStatusEnum");
export const invoiceStatusEnum = disabledDatabaseValue("invoiceStatusEnum");
export const licenseKeyStatusEnum = disabledDatabaseValue("licenseKeyStatusEnum");
export const recurringIntervalEnum = disabledDatabaseValue("recurringIntervalEnum");
`,
    ),
  ];
}
