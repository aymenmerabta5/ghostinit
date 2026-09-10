import { posix } from "node:path";
import { file, type TemplateFile } from "../../../shared.js";

type NativeTarget = "expo" | "desktop";
type MessagingMode = "single" | "monorepo";

function modelContent(generated: string): string {
  return `import { z } from "zod";
import type { Id } from "${generated}/dataModel";

export const conversationIdSchema = z.custom<Id<"conversations">>(
  (value) => typeof value === "string" && value.length > 0,
  "Invalid conversation id",
);
export const attachmentIdSchema = z.custom<Id<"messageAttachments">>(
  (value) => typeof value === "string" && value.length > 0,
  "Invalid attachment id",
);
export const conversationSchema = z.object({ _id: conversationIdSchema }).passthrough();
export const conversationListSchema = z.array(conversationSchema);
export const attachmentSchema = z.object({
  id: z.string(), mimeType: z.string(), originalName: z.string(), url: z.string(),
});
export const messagePageSchema = z.object({
  messages: z.array(z.object({
    _id: z.string(), senderId: z.string(), body: z.string().optional(),
    createdAt: z.number(), attachments: z.array(attachmentSchema),
  }).passthrough()),
  nextCursor: z.string().nullable(),
});
export const typingListSchema = z.array(z.object({ userId: z.string() }));
`;
}

function queriesContent(generated: string): string {
  return `"use client";
import { useQuery } from "convex/react";
import { api } from "${generated}/api";
import { conversationIdSchema, conversationListSchema, messagePageSchema, typingListSchema } from "./model";

// Convex owns these live query results; failures continue to reach its error boundary.
async function refreshLiveSubscription(): Promise<void> { /* Live subscriptions need no invalidation. */ }

export function useMessagingReads(conversationId: string | null) {
  const selected = conversationId === null ? null : conversationIdSchema.parse(conversationId);
  const rawConversations: unknown = useQuery(api.messaging.listConversations);
  const rawMessages: unknown = useQuery(api.messaging.listMessages, selected ? { conversationId: selected, limit: 50 } : "skip");
  const rawTyping: unknown = useQuery(api.messaging.listTyping, selected ? { conversationId: selected } : "skip");
  const conversations = rawConversations === undefined ? undefined : conversationListSchema.parse(rawConversations);
  const messages = rawMessages === undefined ? undefined : messagePageSchema.parse(rawMessages);
  const typing = rawTyping === undefined ? undefined : typingListSchema.parse(rawTyping);
  return {
    conversations: (conversations ?? []).map((conversation) => ({ ...conversation, id: conversation._id })),
    conversationsPending: conversations === undefined,
    conversationsError: null as Error | null,
    conversationsFetching: false,
    retryConversations: refreshLiveSubscription,
    messages: (messages?.messages ?? []).map((message) => ({ ...message, id: message._id })),
    messagesPending: selected !== null && messages === undefined,
    messagesError: null as Error | null,
    messagesFetching: false,
    retryMessages: refreshLiveSubscription,
    typing: (typing?.length ?? 0) > 0,
    transport: "native" as const,
    refresh: refreshLiveSubscription,
  };
}
`;
}

function mutationsContent(target: NativeTarget, mode: MessagingMode, generated: string): string {
  const prefix = target === "desktop" && mode === "single" ? "@/renderer" : "@";
  const upload = target === "expo" ? "uploadNativeAttachment" : "uploadDesktopAttachment";
  return `"use client";
import { useCallback } from "react";
import { useMutation as useConvexMutation } from "convex/react";
import { api } from "${generated}/api";
import { useAuthOwnedEffect } from "${prefix}/hooks/use-auth-owned-effect";
import { useMessagingCommandMutation } from "./use-messaging-command-mutation";
import { messagingSendSignature, type MessagingCommandScope } from "./command-types";
import { ${upload} } from "${prefix}/adapters/messaging/convex";
import { attachmentIdSchema, conversationIdSchema, conversationSchema } from "./model";
import type { AttachmentDraft } from "./types";

export function useStartConversationMutation(scope: MessagingCommandScope) {
  const start = useConvexMutation(api.messaging.getOrCreateConversation);
  return useMessagingCommandMutation(scope, "start", async (peerUserId: string): Promise<string> => conversationSchema.parse(await start({ peerUserId }))._id, (peerUserId) => peerUserId);
}

export function useSendMessageMutation(scope: MessagingCommandScope) {
  const send = useConvexMutation(api.messaging.sendMessage);
  const typing = useConvexMutation(api.messaging.sendTyping);
  return useMessagingCommandMutation(scope, "send", async (input: { conversationId: string; body: string; clientMessageKey: string; attachment?: AttachmentDraft | null }, isCurrent): Promise<void> => {
    const conversationId = conversationIdSchema.parse(input.conversationId);
    const attachmentIds = input.attachment
      ? [attachmentIdSchema.parse(await ${upload}(String(conversationId), input.attachment, isCurrent))]
      : undefined;
    if (!isCurrent()) return;
    await send({ conversationId, ...(input.body ? { body: input.body } : {}), ...(attachmentIds ? { attachmentIds } : {}) });
    // Typing is advisory; a failed reset cannot turn a confirmed send into a retry.
    if (isCurrent()) await typing({ conversationId, isTyping: false }).catch(() => undefined);
  }, messagingSendSignature);
}

export function useTypingNotifier(conversationId: string | null): (isTyping: boolean) => void {
  const captureOwner = useAuthOwnedEffect();
  const typing = useConvexMutation(api.messaging.sendTyping);
  return useCallback((isTyping: boolean) => {
    if (!conversationId || !captureOwner()()) return;
    void typing({ conversationId: conversationIdSchema.parse(conversationId), isTyping }).catch(() => undefined);
  }, [conversationId, captureOwner, typing]);
}
`;
}

export function nativeConvexMessagingDataFiles(
  target: NativeTarget,
  mode: MessagingMode,
  featureRoot: string,
): TemplateFile[] {
  const generated = posix.relative(featureRoot, "convex/_generated");
  return [
    file(`${featureRoot}/model.ts`, modelContent(generated)),
    file(`${featureRoot}/queries.ts`, queriesContent(generated)),
    file(`${featureRoot}/mutations.ts`, mutationsContent(target, mode, generated)),
  ];
}
