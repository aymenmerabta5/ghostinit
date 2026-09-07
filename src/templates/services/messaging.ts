// @allow-long 330: one renderer emits the messaging contracts, application ports, policy, and facade
import { file, type TemplateFile } from "../shared.js";
import type { ProjectMode } from "../../lib/addons.js";

function serviceRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/services/src/messaging" : "src/server/services/messaging";
}

function contractsContent(): string {
  return `import "server-only";

export interface MessagingActor {
  id: string;
  banned: boolean;
}

export interface ConversationRecord {
  id: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageAttachmentView {
  id: string;
  url: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  replyToId: string | null;
  createdAt: Date;
  attachments: MessageAttachmentView[];
}

export interface MessagePage {
  messages: MessageRecord[];
  nextCursor: string | null;
}

export interface TypingUser {
  userId: string;
  updatedAt: Date;
}

export type MessagingRealtimeEvent =
  | { type: "message"; conversationId: string; messageId: string; userId: string; timestamp: number }
  | { type: "read"; conversationId: string; messageId: string; userId: string; timestamp: number }
  | { type: "typing"; conversationId: string; userId: string; isTyping: boolean; timestamp: number };
`;
}

function portsContent(): string {
  return `import "server-only";
import type {
  ConversationRecord,
  MessagePage,
  MessageRecord,
  MessagingRealtimeEvent,
  TypingUser,
} from "./contracts.js";

export interface CreateMessageRecordInput {
  conversationId: string;
  senderId: string;
  clientMessageKey: string;
  body: string | null;
  replyToId: string | null;
  attachmentIds: string[];
}

/**
 * Application-owned persistence contract. Implementations must claim all
 * attachment IDs and a durable realtime outbox event atomically with message
 * creation. Implementations must reject attachments that are expired, already
 * claimed, owned by another actor, or bound to another conversation. Replaying
 * the same actor/conversation/clientMessageKey and immutable payload returns the
 * original record; reusing the key for another payload must conflict.
 */
export interface MessagingRepositoryPort {
  userExists(userId: string): Promise<boolean>;
  /** Atomically upsert the direct conversation and both participant rows. */
  createDirectConversation(firstUserId: string, secondUserId: string): Promise<ConversationRecord>;
  listConversations(userId: string): Promise<ConversationRecord[]>;
  isParticipant(conversationId: string, userId: string): Promise<boolean>;
  listMessages(conversationId: string, limit: number, cursor?: string): Promise<MessagePage>;
  createMessage(input: CreateMessageRecordInput): Promise<MessageRecord>;
  messageBelongsToConversation(messageId: string, conversationId: string): Promise<boolean>;
  /** Advance to the target message's position without using wall-clock time or regressing. */
  markRead(conversationId: string, userId: string, messageId: string): Promise<void>;
}

/** Realtime is an output port; it never decides conversation membership. */
export interface MessagingRealtimePort {
  authorize(userId: string, conversationId: string): Promise<void>;
  publish(event: MessagingRealtimeEvent): Promise<void>;
  listTyping(conversationId: string, userId: string): Promise<TypingUser[]>;
}
`;
}

function errorsContent(): string {
  return `import "server-only";

export type MessagingErrorCode =
  | "MESSAGING_UNAUTHENTICATED"
  | "MESSAGING_ACTOR_BANNED"
  | "MESSAGING_FORBIDDEN"
  | "MESSAGING_USER_NOT_FOUND"
  | "MESSAGING_INVALID_RECIPIENT"
  | "MESSAGING_INVALID_MESSAGE"
  | "MESSAGING_IDEMPOTENCY_CONFLICT"
  | "MESSAGING_MESSAGE_NOT_FOUND"
  | "MESSAGING_ATTACHMENT_FORBIDDEN";

export class MessagingServiceError extends Error {
  readonly code: MessagingErrorCode;

  constructor(code: MessagingErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "MessagingServiceError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
`;
}

function facadeContent(): string {
  return `import "server-only";
import type { MessagingActor } from "./contracts.js";
import type { MessagingRealtimePort, MessagingRepositoryPort } from "./ports.js";
import { MessagingServiceError } from "./errors.js";

export interface MessagingServiceDependencies {
  repository: MessagingRepositoryPort;
  realtime: MessagingRealtimePort;
  /** Best-effort wake-up only; the repository's durable outbox owns delivery. */
  scheduleMessageDelivery?: () => void;
  now?: () => Date;
}

function assertActor(actor: MessagingActor): void {
  if (!actor.id) throw new MessagingServiceError("MESSAGING_UNAUTHENTICATED", "Authentication required");
  if (actor.banned) throw new MessagingServiceError("MESSAGING_ACTOR_BANNED", "Suspended accounts cannot use messaging");
}

export function createMessagingService({
  repository,
  realtime,
  scheduleMessageDelivery,
  now = () => new Date(),
}: MessagingServiceDependencies) {
  async function requireParticipant(actor: MessagingActor, conversationId: string): Promise<void> {
    assertActor(actor);
    if (!(await repository.isParticipant(conversationId, actor.id))) {
      throw new MessagingServiceError("MESSAGING_FORBIDDEN", "Conversation access denied");
    }
  }

  async function authorizeRealtime(actor: MessagingActor, conversationId: string): Promise<void> {
    await requireParticipant(actor, conversationId);
    await realtime.authorize(actor.id, conversationId);
  }

  return {
    async listConversations(actor: MessagingActor) {
      assertActor(actor);
      return await repository.listConversations(actor.id);
    },

    async getOrCreateConversation(actor: MessagingActor, peerUserId: string) {
      assertActor(actor);
      const peer = peerUserId.trim();
      if (!peer || peer === actor.id) {
        throw new MessagingServiceError("MESSAGING_INVALID_RECIPIENT", "Choose another user");
      }
      if (!(await repository.userExists(peer))) {
        throw new MessagingServiceError("MESSAGING_USER_NOT_FOUND", "User not found");
      }
      const first = actor.id < peer ? actor.id : peer;
      const second = actor.id < peer ? peer : actor.id;
      return await repository.createDirectConversation(first, second);
    },

    async listMessages(actor: MessagingActor, input: { conversationId: string; limit?: number; cursor?: string }) {
      await authorizeRealtime(actor, input.conversationId);
      const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
      return await repository.listMessages(input.conversationId, limit, input.cursor);
    },

    async sendMessage(actor: MessagingActor, input: {
      conversationId: string;
      clientMessageKey: string;
      body?: string;
      replyToId?: string;
      attachmentIds?: string[];
    }) {
      await requireParticipant(actor, input.conversationId);
      const clientMessageKey = input.clientMessageKey.trim();
      if (clientMessageKey.length < 16 || clientMessageKey.length > 128) {
        throw new MessagingServiceError(
          "MESSAGING_INVALID_MESSAGE",
          "Client message key must be between 16 and 128 characters",
        );
      }
      const body = input.body?.trim() || null;
      const attachmentIds = [...new Set(input.attachmentIds ?? [])];
      if (!body && attachmentIds.length === 0) {
        throw new MessagingServiceError("MESSAGING_INVALID_MESSAGE", "A body or attachment is required");
      }
      if (body && body.length > 4000) {
        throw new MessagingServiceError("MESSAGING_INVALID_MESSAGE", "Message body must be at most 4000 characters");
      }
      if (attachmentIds.length > 5) {
        throw new MessagingServiceError("MESSAGING_INVALID_MESSAGE", "A message can contain at most five attachments");
      }
      if (input.replyToId && !(await repository.messageBelongsToConversation(input.replyToId, input.conversationId))) {
        throw new MessagingServiceError("MESSAGING_MESSAGE_NOT_FOUND", "Reply target not found in this conversation");
      }
      const message = await repository.createMessage({
        conversationId: input.conversationId,
        senderId: actor.id,
        clientMessageKey,
        body,
        replyToId: input.replyToId ?? null,
        attachmentIds,
      });
      // Message delivery is at-least-once from the durable outbox. Waking the
      // worker must never turn an already committed message into an API error.
      if (scheduleMessageDelivery) {
        try {
          scheduleMessageDelivery();
        } catch {
          // The periodic worker will claim the durable row later.
        }
      }
      return message;
    },

    async markRead(actor: MessagingActor, input: { conversationId: string; messageId: string }) {
      await requireParticipant(actor, input.conversationId);
      if (!(await repository.messageBelongsToConversation(input.messageId, input.conversationId))) {
        throw new MessagingServiceError("MESSAGING_MESSAGE_NOT_FOUND", "Message not found in this conversation");
      }
      await repository.markRead(input.conversationId, actor.id, input.messageId);
      await realtime.publish({
        type: "read",
        conversationId: input.conversationId,
        messageId: input.messageId,
        userId: actor.id,
        timestamp: now().getTime(),
      });
      return { ok: true as const };
    },

    async sendTyping(actor: MessagingActor, conversationId: string, isTyping: boolean) {
      await requireParticipant(actor, conversationId);
      await realtime.authorize(actor.id, conversationId);
      await realtime.publish({
        type: "typing",
        conversationId,
        userId: actor.id,
        isTyping,
        timestamp: now().getTime(),
      });
      return { ok: true as const };
    },

    async listTyping(actor: MessagingActor, conversationId: string) {
      await authorizeRealtime(actor, conversationId);
      return await realtime.listTyping(conversationId, actor.id);
    },

    async authorizeRealtime(actor: MessagingActor, conversationId: string) {
      await authorizeRealtime(actor, conversationId);
      return { ok: true as const };
    },
  };
}

export type MessagingService = ReturnType<typeof createMessagingService>;
`;
}

function indexContent(): string {
  return `export { createMessagingService, type MessagingService, type MessagingServiceDependencies } from "./facade.js";
export { MessagingServiceError, type MessagingErrorCode } from "./errors.js";
export type { ConversationRecord, MessageAttachmentView, MessagePage, MessageRecord, MessagingActor, MessagingRealtimeEvent, TypingUser } from "./contracts.js";
export type { CreateMessageRecordInput, MessagingRealtimePort, MessagingRepositoryPort } from "./ports.js";
`;
}

export function messagingServiceFiles(mode: ProjectMode): TemplateFile[] {
  const root = serviceRoot(mode);
  return [
    file(`${root}/contracts.ts`, contractsContent()),
    file(`${root}/ports.ts`, portsContent()),
    file(`${root}/errors.ts`, errorsContent()),
    file(`${root}/facade.ts`, facadeContent()),
    file(`${root}/index.ts`, indexContent()),
  ];
}
