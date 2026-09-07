/** Runtime-checked UI DTOs also type fresh-checkout Convex AnyApi results. */
export function convexTanstackMessagingDataContent(generatedRoot: string): string {
  return `import { z } from "zod";
import type { Id } from "${generatedRoot}/dataModel";

const conversationIdSchema = z.custom<Id<"conversations">>(
  (value) => typeof value === "string" && value.length > 0,
  "Invalid conversation id",
);

export const convexConversationSchema = z.object({ _id: conversationIdSchema });
export const convexConversationListSchema = z.array(convexConversationSchema);
export const convexMessagePageSchema = z.object({
  messages: z.array(z.object({
    _id: z.string().min(1),
    body: z.string().optional(),
    attachments: z.array(z.object({
      id: z.string().min(1),
      url: z.string().url(),
      originalName: z.string(),
    })),
  })),
  nextCursor: z.string().nullable(),
});
export const convexTypingListSchema = z.array(z.object({ userId: z.string().min(1) }));
`;
}

export function convexTanstackMessagingQueriesContent(generatedRoot: string): string {
  return `import { useMutation, useQuery } from "convex/react";
import { api } from "${generatedRoot}/api";
import type { Id } from "${generatedRoot}/dataModel";
import { convexConversationListSchema, convexConversationSchema, convexMessagePageSchema, convexTypingListSchema } from "./convex-messaging-data";

export function useConvexConversations() {
  const rawConversations: unknown = useQuery(api.messaging.listConversations);
  return rawConversations === undefined ? undefined : convexConversationListSchema.parse(rawConversations);
}

export function useStartConvexConversation() {
  const start = useMutation(api.messaging.getOrCreateConversation);
  return async (peerUserId: string) => convexConversationSchema.parse(await start({ peerUserId }));
}

export function useConvexMessages(conversationId: Id<"conversations">) {
  const rawMessages: unknown = useQuery(api.messaging.listMessages, { conversationId, limit: 30 });
  return rawMessages === undefined ? undefined : convexMessagePageSchema.parse(rawMessages);
}

export function useConvexTyping(conversationId: Id<"conversations">) {
  const rawTyping: unknown = useQuery(api.messaging.listTyping, { conversationId });
  return rawTyping === undefined ? undefined : convexTypingListSchema.parse(rawTyping);
}
`;
}
