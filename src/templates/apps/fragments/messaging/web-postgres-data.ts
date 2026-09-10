type Router = "next" | "tanstack";

export function messagingWebQueriesContent(router: Router): string {
  const scoped = router === "tanstack";
  const conversationsKey = scoped
    ? "messagingConversationsQueryKey(scope)"
    : 'orpc.messaging.listConversations.key({ type: "query" })';
  const messagesKey = scoped
    ? 'authScopedQueryKey(scope, orpc.messaging.listMessages.key({ type: "query" }))'
    : 'orpc.messaging.listMessages.key({ type: "query" })';
  return `import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { subscribeRealtime, type MessagingRealtimeEvent } from "@/lib/realtime";
${scoped ? 'import { authScopedQueryKey, currentQueryAuthScope, messagingConversationsQueryKey } from "@/lib/query-client";' : ""}
import { toConversation, toMessage } from "./model";

export function useConversations() {
  ${scoped ? "const queryClient = useQueryClient();\n  const scope = currentQueryAuthScope(queryClient);" : ""}
  const options = orpc.messaging.listConversations.queryOptions({ select: (data) => data.conversations.flatMap(value => toConversation(value) ?? []) });
  return useQuery(${scoped ? '{ ...options, queryKey: scope ? messagingConversationsQueryKey(scope) : ["auth", "anonymous", "messaging", "conversations"], enabled: Boolean(scope) && typeof window !== "undefined" }' : "options"});
}

export function useMessageQuery(conversationId: string) {
  ${scoped ? "const queryClient = useQueryClient();\n  const scope = currentQueryAuthScope(queryClient);" : ""}
  const options = orpc.messaging.listMessages.queryOptions({ input: { conversationId, limit: 50 }, select: (data) => data.messages.flatMap(value => toMessage(value) ?? []) });
  const query = useQuery({ ...options, ${scoped ? 'queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", ...options.queryKey],' : ""} enabled: ${scoped ? 'Boolean(scope) && typeof window !== "undefined" && ' : ""}conversationId.length > 0 });
  return { data: query.data, isPending: query.isPending, error: query.error, isFetching: query.isFetching, refetch: query.refetch, canSubscribe: ${scoped ? "Boolean(scope)" : "true"} };
}

export function useInvalidateMessaging() {
  const queryClient = useQueryClient();
  ${scoped ? "const scope = currentQueryAuthScope(queryClient);" : ""}
  return useCallback(async () => {
    ${scoped ? "if (!scope) return;" : ""}
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ${messagesKey} }),
      queryClient.invalidateQueries({ queryKey: ${conversationsKey} }),
    ]);
  }, [queryClient${scoped ? ", scope" : ""}]);
}

export function useInvalidateConversations() {
  const queryClient = useQueryClient();
  ${scoped ? "const scope = currentQueryAuthScope(queryClient);" : ""}
  return useCallback(async () => {
    ${scoped ? "if (!scope) return;" : ""}
    await queryClient.invalidateQueries({ queryKey: ${conversationsKey} });
  }, [queryClient${scoped ? ", scope" : ""}]);
}

export function subscribeConversation(conversationId: string, listener: (event: MessagingRealtimeEvent) => void): () => void {
  return subscribeRealtime(conversationId, listener);
}
`;
}

export function messagingWebMutationsContent(): string {
  return `import { useRef } from "react";
import { orpcClient } from "@/lib/orpc";
import { sendTypingRealtime } from "@/lib/realtime";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { createClientMessageKey } from "./model";
import { useInvalidateMessaging, useInvalidateConversations } from "./queries";

export async function uploadMessageAttachment(conversationId: string, file: File): Promise<string> {
  const form = new FormData(); form.append("file", file); form.append("conversationId", conversationId);
  const response = await fetch("/api/messaging/attachments", { method: "POST", credentials: "same-origin", headers: { "X-Ghostinit-Conversation-Id": conversationId }, body: form });
  if (!response.ok) throw new Error(\`Attachment upload failed with status \${response.status}.\`);
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || !("attachmentId" in value) || typeof value.attachmentId !== "string") throw new Error("The attachment response did not include an id.");
  return value.attachmentId;
}

export function useSendMessage(conversationId: string) {
  const pendingSend = useRef<{ signature: string; clientMessageKey: string } | null>(null);
  const invalidate = useInvalidateMessaging();
  const mutation = useAuthOwnedMutation(async (input: { body: string; attachmentIds?: string[] }) => {
    const signature = JSON.stringify([conversationId, input.body, [...(input.attachmentIds ?? [])].sort()]);
    const attempt = pendingSend.current?.signature === signature ? pendingSend.current : { signature, clientMessageKey: createClientMessageKey() };
    pendingSend.current = attempt;
    const result = await orpcClient.messaging.sendMessage({ conversationId, clientMessageKey: attempt.clientMessageKey, ...(input.body ? { body: input.body } : {}), ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}) });
    return { value: result, clientMessageKey: attempt.clientMessageKey };
  }, { onSuccess: async () => { await invalidate(); } });
  return {
    send: async (body: string, attachmentIds?: string[]) => {
      const result = await mutation.run({ body, attachmentIds });
      if (result.status === "error") throw result.error;
      if (result.status !== "success" || !result.isCurrent()) return null;
      if (pendingSend.current?.clientMessageKey === result.data.clientMessageKey) pendingSend.current = null;
      return result.data.value;
    },
    sendTyping: (isTyping: boolean) => sendTypingRealtime(conversationId, isTyping),
    isPending: mutation.isPending,
  };
}

export function useStartConversation() {
  const invalidate = useInvalidateConversations();
  const mutation = useAuthOwnedMutation(async (peerUserId: string) => {
    const conversation = await orpcClient.messaging.getOrCreateConversation({ peerUserId });
    if (typeof conversation.id !== "string") throw new Error("The conversation response did not include an id.");
    return conversation.id;
  }, { onSuccess: async () => { await invalidate(); } });
  return {
    start: async (peerUserId: string): Promise<string | null> => {
      const result = await mutation.run(peerUserId);
      if (result.status === "error") throw result.error;
      return result.status === "success" && result.isCurrent() ? result.data : null;
    },
    isPending: mutation.isPending, error: mutation.error,
  };
}
`;
}
