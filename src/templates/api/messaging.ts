// @allow-long 900: secure messaging API renderer includes Postgres composition, outbox worker, and seven procedures
import { file, type TemplateFile } from "../shared.js";

const sharedImports = `import { implement } from "@orpc/server";
import { protectedProcedure } from "../../middleware/auth.js";
import { createServiceORPCError } from "../../utils/service-error.js";
import { createMessagingServiceForRequest, toMessagingActor } from "../../composition/messaging.js";
import type { ApiContext } from "../../context.js";`;

const errorMap = `{
  MESSAGING_UNAUTHENTICATED: "UNAUTHORIZED",
  MESSAGING_ACTOR_BANNED: "FORBIDDEN",
  MESSAGING_FORBIDDEN: "FORBIDDEN",
  MESSAGING_USER_NOT_FOUND: "NOT_FOUND",
  MESSAGING_INVALID_RECIPIENT: "BAD_REQUEST",
  MESSAGING_INVALID_MESSAGE: "BAD_REQUEST",
  MESSAGING_IDEMPOTENCY_CONFLICT: "CONFLICT",
  MESSAGING_MESSAGE_NOT_FOUND: "NOT_FOUND",
  MESSAGING_ATTACHMENT_FORBIDDEN: "FORBIDDEN",
}`;

function compositionContent(): string {
  return `import "server-only";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import {
  conversationParticipants,
  conversations,
  db,
  messageAttachments,
  messagingRealtimeOutbox,
  messages,
  sessions,
  users,
} from "@repo/database";
import {
  authorizeRealtimeConversation,
  getPresenceAuthorized,
  publish,
  subscribeAuthorized,
  type RealtimeEvent,
} from "@repo/realtime";
import { messaging } from "@repo/services";
import { createContext, type ApiContext } from "../context.js";
import { scheduleMessagingRealtimeOutboxDrain } from "../messaging-outbox.js";

export function toMessagingActor(user: NonNullable<ApiContext["user"]>): messaging.MessagingActor {
  return { id: user.id, banned: user.banned === true };
}

export type MessagingStreamEvent = Exclude<RealtimeEvent, { type: "presence" }>;

export async function canUserAccessConversation(userId: string, conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

export async function hasCurrentMessagingSubscriptionAuthorization(
  initialContext: ApiContext,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const initialSessionId = initialContext.sessionId;
  if (!initialSessionId) return false;
  if (initialContext.websocketAuthentication === "ticket") {
    const now = new Date();
    const rows = await db
      .select({ sessionId: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, initialSessionId),
          eq(sessions.userId, userId),
          gt(sessions.expiresAt, now),
          isNull(sessions.revokedAt),
          or(eq(users.banned, false), isNull(users.banned), lte(users.banExpires, now)),
        ),
      )
      .limit(1);
    if (rows.length !== 1) return false;
  } else {
    const currentContext = await createContext(initialContext.headers);
    if (
      currentContext.sessionId !== initialSessionId ||
      currentContext.user?.id !== userId ||
      currentContext.user.banned === true
    ) {
      return false;
    }
  }
  return await canUserAccessConversation(userId, conversationId);
}

function toMessageRecord(
  message: typeof messages.$inferSelect,
  attachments: Array<typeof messageAttachments.$inferSelect>,
): messaging.MessageRecord {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    body: message.body ?? null,
    replyToId: message.replyToId ?? null,
    createdAt: message.createdAt,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      url: \`/api/messaging/attachments/\${attachment.id}\`,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize,
      originalName: attachment.originalName,
    })),
  };
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

const repository: messaging.MessagingRepositoryPort = {
  async userExists(userId) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          or(eq(users.banned, false), isNull(users.banned), lte(users.banExpires, new Date())),
        ),
      )
      .limit(1);
    return rows.length === 1;
  },
  async createDirectConversation(firstUserId, secondUserId) {
    const directKey = [firstUserId, secondUserId].sort().join(":");
    return await db.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(conversations)
        .values({ createdBy: firstUserId, directKey })
        .onConflictDoNothing({ target: conversations.directKey })
        .returning();
      const conversation =
        inserted ??
        (
          await transaction
            .select()
            .from(conversations)
            .where(eq(conversations.directKey, directKey))
            .limit(1)
        )[0];
      if (!conversation) throw new Error("Direct conversation upsert did not return a row");
      await transaction
        .insert(conversationParticipants)
        .values([
          { conversationId: conversation.id, userId: firstUserId },
          { conversationId: conversation.id, userId: secondUserId },
        ])
        .onConflictDoNothing({
          target: [conversationParticipants.conversationId, conversationParticipants.userId],
        });
      return conversation;
    });
  },
  async listConversations(userId) {
    return await db
      .select({
        id: conversations.id,
        createdBy: conversations.createdBy,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(eq(conversationParticipants.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  },
  async isParticipant(conversationId, userId) {
    return await canUserAccessConversation(userId, conversationId);
  },
  async listMessages(conversationId, limit, cursor) {
    let cursorPosition: { id: string; createdAt: Date } | undefined;
    if (cursor) {
      const cursorRows = await db
        .select({ id: messages.id, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.id, cursor), eq(messages.conversationId, conversationId)))
        .limit(1);
      cursorPosition = cursorRows[0];
    }
    const rows = await db
      .select()
      .from(messages)
      .where(
        cursorPosition
          ? and(
              eq(messages.conversationId, conversationId),
              or(
                lt(messages.createdAt, cursorPosition.createdAt),
                and(
                  eq(messages.createdAt, cursorPosition.createdAt),
                  lt(messages.id, cursorPosition.id),
                ),
              ),
            )
          : eq(messages.conversationId, conversationId),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? pageRows.at(-1)?.id ?? null : null;
    const ids = pageRows.map((message) => message.id);
    const attachments = ids.length
      ? await db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, ids))
      : [];
    return {
      messages: [...pageRows]
        .reverse()
        .map((message) =>
          toMessageRecord(
            message,
            attachments.filter((attachment) => attachment.messageId === message.id),
          ),
        ),
      nextCursor,
    };
  },
  async createMessage(input) {
    return await db.transaction(async (transaction) => {
      const currentParticipant = await transaction
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, input.senderId),
          ),
        )
        .limit(1);
      if (currentParticipant.length !== 1) {
        throw new messaging.MessagingServiceError(
          "MESSAGING_FORBIDDEN",
          "Conversation access denied",
        );
      }
      const inserted = await transaction
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: input.senderId,
          clientMessageKey: input.clientMessageKey,
          body: input.body,
          replyToId: input.replyToId,
        })
        .onConflictDoNothing({
          target: [messages.senderId, messages.conversationId, messages.clientMessageKey],
        })
        .returning();
      const message = inserted[0];

      if (!message) {
        const existingRows = await transaction
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, input.conversationId),
              eq(messages.senderId, input.senderId),
              eq(messages.clientMessageKey, input.clientMessageKey),
            ),
          )
          .limit(1);
        const existing = existingRows[0];
        if (!existing) {
          throw new messaging.MessagingServiceError(
            "MESSAGING_IDEMPOTENCY_CONFLICT",
            "The client message key could not be resolved",
          );
        }
        const existingAttachments = await transaction
          .select()
          .from(messageAttachments)
          .where(eq(messageAttachments.messageId, existing.id));
        const samePayload =
          (existing.body ?? null) === input.body &&
          (existing.replyToId ?? null) === input.replyToId &&
          sameStringSet(
            existingAttachments.map((attachment) => attachment.id),
            input.attachmentIds,
          );
        if (!samePayload) {
          throw new messaging.MessagingServiceError(
            "MESSAGING_IDEMPOTENCY_CONFLICT",
            "The client message key was already used for a different message",
          );
        }
        return toMessageRecord(existing, existingAttachments);
      }

      let attachments: Array<typeof messageAttachments.$inferSelect> = [];
      if (input.attachmentIds.length > 0) {
        attachments = await transaction
          .update(messageAttachments)
          .set({ messageId: message.id })
          .where(
            and(
              inArray(messageAttachments.id, input.attachmentIds),
              eq(messageAttachments.ownerId, input.senderId),
              eq(messageAttachments.conversationId, input.conversationId),
              isNull(messageAttachments.messageId),
              isNotNull(messageAttachments.uploadedAt),
              gt(messageAttachments.expiresAt, new Date()),
            ),
          )
          .returning();
        if (attachments.length !== input.attachmentIds.length) {
          throw new messaging.MessagingServiceError(
            "MESSAGING_ATTACHMENT_FORBIDDEN",
            "One or more attachments cannot be claimed",
          );
        }
      }
      await transaction.insert(messagingRealtimeOutbox).values({
        conversationId: input.conversationId,
        messageId: message.id,
        userId: input.senderId,
        availableAt: message.createdAt,
        createdAt: message.createdAt,
      });
      await transaction
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));
      return toMessageRecord(message, attachments);
    });
  },
  async messageBelongsToConversation(messageId, conversationId) {
    const rows = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
      .limit(1);
    return rows.length === 1;
  },
  async markRead(conversationId, userId, messageId) {
    const targetRows = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
      .limit(1);
    const target = targetRows[0];
    if (!target) {
      throw new messaging.MessagingServiceError(
        "MESSAGING_MESSAGE_NOT_FOUND",
        "Message not found in this conversation",
      );
    }
    await db
      .update(conversationParticipants)
      .set({ lastReadAt: target.createdAt })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
          or(
            isNull(conversationParticipants.lastReadAt),
            lt(conversationParticipants.lastReadAt, target.createdAt),
          ),
        ),
      );
  },
};

export function createMessagingServiceForRequest(): messaging.MessagingService {
  return messaging.createMessagingService({
    repository,
    scheduleMessageDelivery: scheduleMessagingRealtimeOutboxDrain,
    realtime: {
      async authorize(userId, conversationId) {
        authorizeRealtimeConversation(userId, conversationId);
      },
      async publish(event) {
        await publish(event.conversationId, event);
      },
      async listTyping(conversationId, userId) {
        return [...getPresenceAuthorized(conversationId, userId).entries()]
          .filter(([, value]) => value.online)
          .map(([userId, value]) => ({ userId, updatedAt: new Date(value.lastSeen) }));
      },
    },
  });
}

export async function subscribeToMessagingEvents(
  context: ApiContext,
  actor: messaging.MessagingActor,
  conversationId: string,
  subscriptionOwnerId: string,
  handler: (event: MessagingStreamEvent) => void,
  onRevoked: () => void,
): Promise<() => void> {
  await createMessagingServiceForRequest().authorizeRealtime(actor, conversationId);
  return await subscribeAuthorized(
    actor.id,
    conversationId,
    async (candidateConversationId, candidateUserId) =>
      await hasCurrentMessagingSubscriptionAuthorization(
        context,
        candidateUserId,
        candidateConversationId,
      ),
    (event) => {
      if (event.type !== "presence") handler(event);
    },
    undefined,
    subscriptionOwnerId,
    onRevoked,
  );
}
`;
}

function listConversationsContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedImports}

const conversationSchema = z.object({
  id: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
const contract = { listConversations: oc.route({ method: "GET", path: "/messaging/conversations" }).output(z.object({ conversations: z.array(conversationSchema) })) };
export const messagingListConversationsContract = contract.listConversations;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingListConversations = implementer.listConversations.handler(async ({ context }) => {
  const user = await protectedProcedure(context);
  try {
    return { conversations: await createMessagingServiceForRequest().listConversations(toMessagingActor(user)) };
  } catch (error) {
    return createServiceORPCError(error, { codeMap: ${errorMap}, fallbackMessage: "Unable to list conversations" });
  }
});
`;
}

function listMessagesContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedImports}

const attachmentSchema = z.object({ id: z.string().min(1), url: z.string(), mimeType: z.string(), byteSize: z.number().int(), originalName: z.string() });
const messageSchema = z.object({ id: z.string().min(1), conversationId: z.string().min(1), senderId: z.string().min(1), body: z.string().nullable(), replyToId: z.string().min(1).nullable(), createdAt: z.date(), attachments: z.array(attachmentSchema) });
const contract = { listMessages: oc.route({ method: "GET", path: "/messaging/messages" }).input(z.object({ conversationId: z.string().min(1), limit: z.number().int().min(1).max(50).optional(), cursor: z.string().min(1).optional() })).output(z.object({ messages: z.array(messageSchema), nextCursor: z.string().min(1).nullable() })) };
export const messagingListMessagesContract = contract.listMessages;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingListMessages = implementer.listMessages.handler(async ({ input, context }) => {
  const user = await protectedProcedure(context);
  try {
    return await createMessagingServiceForRequest().listMessages(toMessagingActor(user), input);
  } catch (error) {
    return createServiceORPCError(error, { codeMap: ${errorMap}, fallbackMessage: "Unable to list messages" });
  }
});
`;
}

function getOrCreateContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedImports}

const contract = { getOrCreateConversation: oc.route({ method: "POST", path: "/messaging/conversations/find-or-create" }).input(z.object({ peerUserId: z.string().min(1) })).output(z.object({ id: z.string().min(1), createdBy: z.string().min(1), createdAt: z.date(), updatedAt: z.date() })) };
export const messagingGetOrCreateConversationContract = contract.getOrCreateConversation;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingGetOrCreateConversation = implementer.getOrCreateConversation.handler(async ({ input, context }) => {
  const user = await protectedProcedure(context);
  try {
    return await createMessagingServiceForRequest().getOrCreateConversation(toMessagingActor(user), input.peerUserId);
  } catch (error) {
    return createServiceORPCError(error, { codeMap: ${errorMap}, fallbackMessage: "Unable to create conversation" });
  }
});
`;
}

function sendMessageContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedImports}

const attachmentSchema = z.object({ id: z.string().min(1), url: z.string(), mimeType: z.string(), byteSize: z.number().int(), originalName: z.string() });
const messageSchema = z.object({ id: z.string().min(1), conversationId: z.string().min(1), senderId: z.string().min(1), body: z.string().nullable(), replyToId: z.string().min(1).nullable(), createdAt: z.date(), attachments: z.array(attachmentSchema) });
const contract = { sendMessage: oc.route({ method: "POST", path: "/messaging/messages" }).input(z.object({ conversationId: z.string().min(1), clientMessageKey: z.string().trim().min(16).max(128), body: z.string().trim().min(1).max(4000).optional(), replyToId: z.string().min(1).optional(), attachmentIds: z.array(z.string().min(1)).max(5).optional() }).refine((value) => Boolean(value.body || value.attachmentIds?.length), "A body or attachment is required")).output(messageSchema) };
export const messagingSendMessageContract = contract.sendMessage;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingSendMessage = implementer.sendMessage.handler(async ({ input, context }) => {
  const user = await protectedProcedure(context);
  try {
    return await createMessagingServiceForRequest().sendMessage(toMessagingActor(user), input);
  } catch (error) {
    return createServiceORPCError(error, { codeMap: ${errorMap}, fallbackMessage: "Unable to send message" });
  }
});
`;
}

function markReadContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedImports}

const contract = { markRead: oc.route({ method: "POST", path: "/messaging/read" }).input(z.object({ conversationId: z.string().min(1), messageId: z.string().min(1) })).output(z.object({ ok: z.literal(true) })) };
export const messagingMarkReadContract = contract.markRead;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingMarkRead = implementer.markRead.handler(async ({ input, context }) => {
  const user = await protectedProcedure(context);
  try {
    return await createMessagingServiceForRequest().markRead(toMessagingActor(user), input);
  } catch (error) {
    return createServiceORPCError(error, { codeMap: ${errorMap}, fallbackMessage: "Unable to mark message read" });
  }
});
`;
}

function sendTypingContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedImports}

const contract = { sendTyping: oc.route({ method: "POST", path: "/messaging/typing" }).input(z.object({ conversationId: z.string().min(1), isTyping: z.boolean() })).output(z.object({ ok: z.literal(true) })) };
export const messagingSendTypingContract = contract.sendTyping;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingSendTyping = implementer.sendTyping.handler(async ({ input, context }) => {
  const user = await protectedProcedure(context);
  try {
    return await createMessagingServiceForRequest().sendTyping(toMessagingActor(user), input.conversationId, input.isTyping);
  } catch (error) {
    return createServiceORPCError(error, { codeMap: ${errorMap}, fallbackMessage: "Unable to update typing state" });
  }
});
`;
}

function createWebsocketTicketContent(): string {
  return `import { createHash, randomBytes } from "node:crypto";
import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { z } from "zod";
import { db, messagingWebsocketTickets } from "@repo/database";
import { protectedProcedure } from "../../middleware/auth.js";
import type { ApiContext } from "../../context.js";

const NATIVE_WEBSOCKET_TICKET_TTL_MS = 30_000;

function ticketDigest(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

const contract = {
  createWebsocketTicket: oc
    .route({ method: "POST", path: "/messaging/websocket-ticket" })
    .input(z.object({}))
    .output(
      z.object({
        ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        expiresAt: z.date(),
      }),
    ),
};

export const messagingCreateWebsocketTicketContract = contract.createWebsocketTicket;
const implementer = implement<typeof contract, ApiContext>(contract);

export const messagingCreateWebsocketTicket = implementer.createWebsocketTicket.handler(
  async ({ context }) => {
    const user = await protectedProcedure(context);
    const sessionId = context.sessionId;
    const nativeClient = context.headers.get("x-ghostinit-native-client");
    if (!sessionId) {
      throw new ORPCError("UNAUTHORIZED", { message: "A current session is required" });
    }
    if (nativeClient !== "expo" && nativeClient !== "desktop") {
      throw new ORPCError("FORBIDDEN", {
        message: "WebSocket tickets are reserved for authenticated native clients",
      });
    }

    const ticket = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + NATIVE_WEBSOCKET_TICKET_TTL_MS);
    try {
      await db
        .insert(messagingWebsocketTickets)
        .values({
          ticketHash: ticketDigest(ticket),
          userId: user.id,
          sessionId,
          expiresAt,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: messagingWebsocketTickets.sessionId,
          set: {
            ticketHash: ticketDigest(ticket),
            userId: user.id,
            expiresAt,
            createdAt: new Date(),
          },
        });
    } catch {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Unable to issue a WebSocket ticket",
      });
    }
    return { ticket, expiresAt };
  },
);
`;
}

function subscribeContent(): string {
  return `import { eventIterator, oc } from "@orpc/contract";
import { EventPublisher, implement, ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../middleware/auth.js";
import { createServiceORPCError } from "../../utils/service-error.js";
import {
  subscribeToMessagingEvents,
  toMessagingActor,
  type MessagingStreamEvent,
} from "../../composition/messaging.js";
import type { ApiContext } from "../../context.js";

export const messagingRealtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    conversationId: z.string().min(1),
    messageId: z.string().min(1),
    userId: z.string().min(1),
    timestamp: z.number().finite(),
  }),
  z.object({
    type: z.literal("read"),
    conversationId: z.string().min(1),
    messageId: z.string().min(1),
    userId: z.string().min(1),
    timestamp: z.number().finite(),
  }),
  z.object({
    type: z.literal("typing"),
    conversationId: z.string().min(1),
    userId: z.string().min(1),
    isTyping: z.boolean(),
    timestamp: z.number().finite(),
  }),
]);
export type MessagingRealtimeEvent = z.infer<typeof messagingRealtimeEventSchema>;

const contract = {
  subscribe: oc
    .route({ method: "GET", path: "/messaging/subscribe" })
    .input(
      z.object({
        conversationId: z
          .string()
          .min(1)
          .max(128)
          .refine((value) => value.trim() === value, "Conversation ID must not contain outer whitespace"),
      }),
    )
    .output(eventIterator(messagingRealtimeEventSchema)),
};

export const messagingSubscribeContract = contract.subscribe;
const implementer = implement<typeof contract, ApiContext>(contract);

export const messagingSubscribe = implementer.subscribe.handler(
  async ({ input, context, signal }) => {
    const user = await protectedProcedure(context);
    const publisher = new EventPublisher<{ event: MessagingStreamEvent }>({
      maxBufferedEvents: 64,
    });
    const iterator = publisher.subscribe("event", { signal, maxBufferedEvents: 64 });
    let unsubscribe: (() => void) | undefined;
    let revoked = false;
    try {
      unsubscribe = await subscribeToMessagingEvents(
        context,
        toMessagingActor(user),
        input.conversationId,
        context.sessionId ?? user.id,
        (event) => publisher.publish("event", event),
        () => {
          revoked = true;
          void iterator.return?.();
        },
      );
    } catch (error) {
      await iterator.return?.();
      return createServiceORPCError(error, {
        codeMap: ${errorMap},
        fallbackMessage: "Unable to subscribe to conversation events",
      });
    }

    return (async function* streamMessagingEvents() {
      try {
        for await (const event of iterator) yield event;
        if (revoked) {
          throw new ORPCError("FORBIDDEN", {
            message: "Conversation access was revoked",
          });
        }
      } finally {
        unsubscribe?.();
      }
    })();
  },
);
`;
}

function messagingOutboxContent(): string {
  return `import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, messagingRealtimeOutbox } from "@repo/database";
import { publish } from "@repo/realtime";

export interface MessagingRealtimeOutboxDrainOptions {
  limit?: number;
  maxAttempts?: number;
  leaseMs?: number;
  baseRetryMs?: number;
  now?: () => Date;
}

export interface MessagingRealtimeOutboxDrainResult {
  claimed: number;
  published: number;
  failed: number;
  exhausted: number;
}

export interface MessagingRealtimeOutboxWorkerOptions extends MessagingRealtimeOutboxDrainOptions {
  pollMs?: number;
  onError?: (error: unknown) => void;
}

export interface MessagingRealtimeOutboxWorker {
  stop(): Promise<void>;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(name + " is outside safe bounds");
  }
  return resolved;
}

async function claimMessagingRealtimeOutbox(
  options: Required<Pick<MessagingRealtimeOutboxDrainOptions, "limit" | "maxAttempts" | "leaseMs">> & {
    claimedAt: Date;
  },
) {
  return await db.transaction(async (transaction) => {
    const candidates = await transaction
      .select()
      .from(messagingRealtimeOutbox)
      .where(
        and(
          isNull(messagingRealtimeOutbox.publishedAt),
          lt(messagingRealtimeOutbox.attemptCount, options.maxAttempts),
          lte(messagingRealtimeOutbox.availableAt, options.claimedAt),
          or(
            isNull(messagingRealtimeOutbox.leaseExpiresAt),
            lte(messagingRealtimeOutbox.leaseExpiresAt, options.claimedAt),
          ),
        ),
      )
      .orderBy(
        asc(messagingRealtimeOutbox.availableAt),
        asc(messagingRealtimeOutbox.createdAt),
        asc(messagingRealtimeOutbox.id),
      )
      .limit(options.limit)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return [];
    const leaseToken = randomUUID();
    return await transaction
      .update(messagingRealtimeOutbox)
      .set({
        attemptCount: sql\`\${messagingRealtimeOutbox.attemptCount} + 1\`,
        leaseToken,
        leaseExpiresAt: new Date(options.claimedAt.getTime() + options.leaseMs),
      })
      .where(
        and(
          inArray(messagingRealtimeOutbox.id, candidates.map((candidate) => candidate.id)),
          isNull(messagingRealtimeOutbox.publishedAt),
        ),
      )
      .returning();
  });
}

export async function drainMessagingRealtimeOutbox(
  options: MessagingRealtimeOutboxDrainOptions = {},
): Promise<MessagingRealtimeOutboxDrainResult> {
  const limit = boundedInteger(options.limit, 25, 1, 100, "Messaging outbox batch size");
  const maxAttempts = boundedInteger(options.maxAttempts, 8, 1, 20, "Messaging outbox max attempts");
  const leaseMs = boundedInteger(options.leaseMs, 60_000, 5_000, 300_000, "Messaging outbox lease");
  const baseRetryMs = boundedInteger(options.baseRetryMs, 1_000, 100, 60_000, "Messaging outbox retry delay");
  const now = options.now ?? (() => new Date());
  const claimed = await claimMessagingRealtimeOutbox({ limit, maxAttempts, leaseMs, claimedAt: now() });
  let published = 0;
  let failed = 0;
  let exhausted = 0;

  for (const event of claimed) {
    const leaseToken = event.leaseToken;
    if (!leaseToken) {
      failed += 1;
      continue;
    }
    try {
      await publish(event.conversationId, {
        type: "message",
        conversationId: event.conversationId,
        userId: event.userId,
        messageId: event.messageId,
        timestamp: event.createdAt.getTime(),
      });
      // A delivered row has no remaining durable work. Delete it with the
      // lease token as the CAS guard so normal messaging traffic cannot grow
      // the outbox table without bound.
      const settled = await db
        .delete(messagingRealtimeOutbox)
        .where(
          and(
            eq(messagingRealtimeOutbox.id, event.id),
            eq(messagingRealtimeOutbox.leaseToken, leaseToken),
          ),
        )
        .returning({ id: messagingRealtimeOutbox.id });
      if (settled.length === 1) published += 1;
    } catch {
      failed += 1;
      if (event.attemptCount >= maxAttempts) exhausted += 1;
      const exponent = Math.min(Math.max(event.attemptCount - 1, 0), 6);
      const delayMs = Math.min(baseRetryMs * 2 ** exponent, 60_000);
      await db
        .update(messagingRealtimeOutbox)
        .set({
          availableAt: new Date(now().getTime() + delayMs),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: "Realtime publish failed",
        })
        .where(
          and(
            eq(messagingRealtimeOutbox.id, event.id),
            eq(messagingRealtimeOutbox.leaseToken, leaseToken),
          ),
        );
    }
  }

  return { claimed: claimed.length, published, failed, exhausted };
}

let scheduledDrain: Promise<void> | undefined;

/** Coalesced best-effort wake-up; periodic workers remain the retry authority. */
export function scheduleMessagingRealtimeOutboxDrain(): void {
  if (scheduledDrain) return;
  scheduledDrain = Promise.resolve()
    .then(async () => {
      await drainMessagingRealtimeOutbox();
    })
    .catch(() => undefined)
    .finally(() => {
      scheduledDrain = undefined;
    });
}

function notifyWorkerError(handler: ((error: unknown) => void) | undefined, error: unknown): void {
  if (!handler) return;
  try {
    handler(error);
  } catch {
    return;
  }
}

/** Starts a bounded, non-overlapping outbox loop and returns a graceful stop handle. */
export function startMessagingRealtimeOutboxWorker(
  options: MessagingRealtimeOutboxWorkerOptions = {},
): MessagingRealtimeOutboxWorker {
  const pollMs = boundedInteger(options.pollMs, 1_000, 100, 60_000, "Messaging outbox poll interval");
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = (): void => {
    if (stopped) return;
    running = drainMessagingRealtimeOutbox(options)
      .then(() => undefined)
      .catch((error: unknown) => notifyWorkerError(options.onError, error))
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, pollMs);
      });
  };

  timer = setTimeout(tick, 0);
  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}

/** Stable concise startup alias for generated custom servers and Nitro plugins. */
export const startMessagingOutboxWorker = startMessagingRealtimeOutboxWorker;
`;
}

function wsContent(): string {
  return `import { appRouter } from "./router.js";

export async function createWsHandler(adapter: "ws" | "bun-ws" | "crossws" = "ws") {
  if (adapter === "crossws") {
    const { experimental_RPCHandler } = await import("@orpc/server/crossws");
    return new experimental_RPCHandler(appRouter);
  }
  if (adapter === "bun-ws") {
    const { RPCHandler } = await import("@orpc/server/bun-ws");
    return new RPCHandler(appRouter);
  }
  const { RPCHandler } = await import("@orpc/server/ws");
  return new RPCHandler(appRouter);
}

export type WsHandler = Awaited<ReturnType<typeof createWsHandler>>;
`;
}

export function messagingApiFiles(): TemplateFile[] {
  return [
    file("packages/api/src/composition/messaging.ts", compositionContent()),
    file("packages/api/src/procedures/messaging/list-conversations.ts", listConversationsContent()),
    file("packages/api/src/procedures/messaging/list-messages.ts", listMessagesContent()),
    file(
      "packages/api/src/procedures/messaging/get-or-create-conversation.ts",
      getOrCreateContent(),
    ),
    file("packages/api/src/procedures/messaging/send-message.ts", sendMessageContent()),
    file("packages/api/src/procedures/messaging/mark-read.ts", markReadContent()),
    file("packages/api/src/procedures/messaging/send-typing.ts", sendTypingContent()),
    file(
      "packages/api/src/procedures/messaging/create-websocket-ticket.ts",
      createWebsocketTicketContent(),
    ),
    file("packages/api/src/procedures/messaging/subscribe.ts", subscribeContent()),
    file("packages/api/src/messaging-outbox.ts", messagingOutboxContent()),
    file("packages/api/src/ws.ts", wsContent()),
  ];
}
