export function convexWebModelContent(generated: string): string {
  return `import { z } from "zod";
import type { Id } from "${generated}/dataModel";
export type ConversationId = Id<"conversations">;
export type AttachmentId = Id<"messageAttachments">;
export interface InitialConversation { id: string }
export interface ConversationItem { key: string; liveId: ConversationId | null }
const conversationId = z.custom<ConversationId>((value) => typeof value === "string" && value.length > 0, "Invalid conversation id");
export const convexConversationSchema = z.object({ _id: conversationId });
export const convexConversationListSchema = z.array(convexConversationSchema);
export const convexMessagePageSchema = z.object({
  messages: z.array(z.object({ _id: z.string().min(1), body: z.string().optional(), attachments: z.array(z.object({ id: z.string().min(1), url: z.string().url(), originalName: z.string() })) })),
  nextCursor: z.string().nullable(),
});
export const convexTypingListSchema = z.array(z.object({ userId: z.string().min(1) }));
export type MessagePage = z.infer<typeof convexMessagePageSchema>;
export interface PendingConvexAttachmentUpload { conversationId: string; fileFingerprint: string; generation: number; attachmentId: AttachmentId }
export function convexAttachmentFingerprint(file: Pick<File, "name" | "size" | "type" | "lastModified">): string { return JSON.stringify([file.name, file.size, file.type, file.lastModified]); }
export function reusableConvexAttachmentId(pending: PendingConvexAttachmentUpload | null, conversationId: string, fileFingerprint: string, generation: number): AttachmentId | undefined {
  return pending?.conversationId === conversationId && pending.fileFingerprint === fileFingerprint && pending.generation === generation ? pending.attachmentId : undefined;
}
export function attachmentIdFrom(value: unknown): AttachmentId {
  if (typeof value !== "object" || value === null || !("attachmentId" in value) || typeof value.attachmentId !== "string") throw new Error("The attachment response did not include an id.");
  return value.attachmentId as AttachmentId;
}
`;
}

export function convexWebQueriesContent(generated: string, next: boolean): string {
  return `"use client";
import * as React from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { useQueryClient${next ? "" : ", useQuery as useSnapshotQuery"} } from "@tanstack/react-query";
import { currentQueryAuthGeneration, currentQueryAuthScope, subscribeQueryAuthGeneration${next ? "" : ", messagingConversationsQueryKey"} } from "@/lib/query-client";
import { api } from "${generated}/api";
import { convexConversationListSchema, convexMessagePageSchema, convexTypingListSchema, type ConversationId, type InitialConversation } from "./model";

export function useMessagingOwner() {
  const queryClient = useQueryClient();
  const subscribe = React.useCallback((changed: () => void) => subscribeQueryAuthGeneration(queryClient, changed), [queryClient]);
  const read = React.useCallback(() => currentQueryAuthGeneration(queryClient), [queryClient]);
  const generation = React.useSyncExternalStore(subscribe, read, () => 0);
  return { queryClient, generation, scope: currentQueryAuthScope(queryClient) };
}
export function useConvexConversations(initialConversations: InitialConversation[] = []) {
  const owner = useMessagingOwner();
  const raw: unknown = useConvexQuery(api.messaging.listConversations);
  const live = raw === undefined ? undefined : convexConversationListSchema.parse(raw);
${
  next
    ? "  const initial = initialConversations;"
    : `  const snapshot = useSnapshotQuery<{ conversations: InitialConversation[] }>({ queryKey: owner.scope ? messagingConversationsQueryKey(owner.scope) : ["auth", "anonymous", "messaging-conversations"], enabled: false });
  const initial = snapshot.data?.conversations ?? initialConversations;`
}
  const items = live ? live.map((conversation) => ({ key: String(conversation._id), liveId: conversation._id })) : initial.map((conversation) => ({ key: conversation.id, liveId: null }));
  return { items, generation: owner.generation };
}
export function useConvexMessages(conversationId: ConversationId) {
  const raw: unknown = useConvexQuery(api.messaging.listMessages, { conversationId, limit: 30 });
  return raw === undefined ? undefined : convexMessagePageSchema.parse(raw);
}
export function useConvexTyping(conversationId: ConversationId) {
  const raw: unknown = useConvexQuery(api.messaging.listTyping, { conversationId });
  return raw === undefined ? undefined : convexTypingListSchema.parse(raw);
}
`;
}

export function convexWebMutationsContent(generated: string, attachments: boolean): string {
  return `"use client";
import { useMutation as useConvexMutation } from "convex/react";
import { api } from "${generated}/api";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { convexConversationSchema, ${attachments ? "attachmentIdFrom, " : ""}type ConversationId${attachments ? ", type AttachmentId" : ""} } from "./model";

export function useStartConvexConversation() {
  const start = useConvexMutation(api.messaging.getOrCreateConversation);
  return useAuthOwnedMutation(async (peerUserId: string) => convexConversationSchema.parse(await start({ peerUserId })));
}
export function useSendConvexMessage() {
  const send = useConvexMutation(api.messaging.sendMessage);
  return useAuthOwnedMutation(async (input: { conversationId: ConversationId; body?: string${attachments ? "; attachmentIds?: AttachmentId[]" : ""} }) => send(input));
}
export function useConvexTypingMutation() {
  const sendTyping = useConvexMutation(api.messaging.sendTyping);
  return useAuthOwnedMutation(async (input: { conversationId: ConversationId; isTyping: boolean }) => sendTyping(input));
}
${
  attachments
    ? `
export async function uploadConvexMessageAttachment(conversationId: ConversationId, file: File): Promise<AttachmentId> {
  const body = new FormData();
  body.append("file", file); body.append("conversationId", String(conversationId));
  const response = await fetch("/api/messaging/attachments", { method: "POST", credentials: "same-origin", headers: { "X-Ghostinit-Conversation-Id": String(conversationId) }, body });
  if (!response.ok) throw new Error(\`Attachment upload failed with status \${response.status}.\`);
  return attachmentIdFrom(await response.json());
}
export function useUploadConvexAttachment() {
  return useAuthOwnedMutation(async (input: { conversationId: ConversationId; file: File }) => uploadConvexMessageAttachment(input.conversationId, input.file));
}
`
    : ""
}`;
}
