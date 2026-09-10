import { file, type TemplateFile } from "../../../shared.js";

type Target = "expo" | "desktop";
type Mode = "single" | "monorepo";

function queriesContent(alias: string): string {
  return `"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpcClient } from "${alias}/lib/orpc";
import { subscribeRealtime, type MessagingRealtimeEvent } from "${alias}/lib/realtime";
import { useAuthOwnedEffect } from "${alias}/hooks/use-auth-owned-effect";

export function useMessagingReads(conversationId: string | null) {
  const queryClient = useQueryClient();
  const captureOwner = useAuthOwnedEffect();
  const [connection, setConnection] = useState<{ id: string | null; transport: "polling" | "realtime"; typing: Set<string> }>({ id: null, transport: "polling", typing: new Set() });
  const activeConnection = connection.id === conversationId ? connection : null;
  const transport = activeConnection?.transport ?? "polling";
  const conversations = useQuery({ queryKey: ["messaging", "conversations"],
    refetchInterval: transport === "polling" ? 5_000 : false,
    queryFn: async ({ signal }) => (await orpcClient.messaging.listConversations(undefined, { signal })).conversations,
  });
  const messages = useQuery({ queryKey: ["messaging", "messages", conversationId], enabled: Boolean(conversationId),
    refetchInterval: transport === "polling" ? 5_000 : false,
    queryFn: async ({ signal }) => conversationId ? (await orpcClient.messaging.listMessages({ conversationId, limit: 50 }, { signal })).messages : [],
  });
  useEffect(() => {
    if (!conversationId) return;
    const isOwner = captureOwner();
    let active = true;
    const isCurrent = () => active && isOwner();
    const status = (connected: boolean) => {
      if (isCurrent()) setConnection((current) => ({ id: conversationId, transport: connected ? "realtime" : "polling", typing: connected && current.id === conversationId ? current.typing : new Set() }));
    };
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeRealtime(conversationId, (event: MessagingRealtimeEvent) => {
        if (!isCurrent() || event.conversationId !== conversationId) return;
        if (event.type === "message") {
          void queryClient.invalidateQueries({ queryKey: ["messaging", "messages", conversationId] });
          void queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] });
        }
        if (event.type === "typing") setConnection((current) => {
          const typing = new Set(current.id === conversationId ? current.typing : []);
          if (event.isTyping) typing.add(event.userId); else typing.delete(event.userId);
          return { id: conversationId, transport: current.id === conversationId ? current.transport : "polling", typing };
        });
      }, status);
    } catch { status(false); }
    return () => { active = false; unsubscribe?.(); };
  }, [conversationId, queryClient, captureOwner]);
  return {
    conversations: conversations.data ?? [], conversationsPending: conversations.isPending,
    conversationsError: conversations.error, conversationsFetching: conversations.isFetching,
    async retryConversations(): Promise<void> { await conversations.refetch(); },
    messages: (messages.data ?? []).map((message) => ({ ...message, body: message.body ?? undefined,
      attachments: message.attachments?.map((attachment) => ({ ...attachment, id: attachment.id ?? attachment.url })),
    })), messagesPending: Boolean(conversationId) && messages.isPending,
    messagesError: messages.error, messagesFetching: messages.isFetching,
    async retryMessages(): Promise<void> { if (conversationId) await messages.refetch(); },
    transport, typing: (activeConnection?.typing.size ?? 0) > 0,
    async refresh(): Promise<void> { await Promise.all([conversations.refetch(), ...(conversationId ? [messages.refetch()] : [])]); },
  };
}
`;
}

function mutationsContent(target: Target, alias: string): string {
  const upload = target === "expo" ? "uploadNativeAttachment" : "uploadDesktopAttachment";
  return `"use client";
import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { orpcClient } from "${alias}/lib/orpc";
import { sendTypingRealtime } from "${alias}/lib/realtime";
import { useAuthOwnedEffect } from "${alias}/hooks/use-auth-owned-effect";
import { useMessagingCommandMutation } from "./use-messaging-command-mutation";
import { messagingSendSignature, type MessagingCommandScope } from "./command-types";
import { ${upload} } from "${alias}/adapters/messaging/postgres";
import type { SendMessageInput } from "./types";

export function useStartConversationMutation(scope: MessagingCommandScope) {
  const client = useQueryClient();
  return useMessagingCommandMutation(scope, "start", async (peerUserId: string): Promise<string> => (await orpcClient.messaging.getOrCreateConversation({ peerUserId })).id, (peerUserId) => peerUserId,
    { onSuccess: () => { void client.invalidateQueries({ queryKey: ["messaging", "conversations"] }); } });
}

export function useSendMessageMutation(scope: MessagingCommandScope) {
  const client = useQueryClient();
  const prepared = useRef<{ key: string; conversationId: string; attachment: SendMessageInput["attachment"]; attachmentId: string } | null>(null);
  return useMessagingCommandMutation(scope, "send", async (input: SendMessageInput, isCurrent): Promise<void> => {
    let attachmentIds: string[] | undefined;
    if (input.attachment) {
      const previous = prepared.current;
      if (previous?.key === input.clientMessageKey && previous.conversationId === input.conversationId && previous.attachment === input.attachment) {
        attachmentIds = [previous.attachmentId];
      } else {
        const attachmentId = await ${upload}(input.conversationId, input.attachment, isCurrent);
        if (!isCurrent()) return;
        prepared.current = { key: input.clientMessageKey, conversationId: input.conversationId, attachment: input.attachment, attachmentId };
        attachmentIds = [attachmentId];
      }
    }
    if (!isCurrent()) return;
    await orpcClient.messaging.sendMessage({ conversationId: input.conversationId, clientMessageKey: input.clientMessageKey,
      ...(input.body ? { body: input.body } : {}), ...(attachmentIds ? { attachmentIds } : {}) });
    if (!isCurrent()) return;
    if (prepared.current?.key === input.clientMessageKey) prepared.current = null;
    // Typing is advisory and must never turn a confirmed send into a retry.
    try { sendTypingRealtime(input.conversationId, false); } catch { /* Realtime may have disconnected. */ }
  }, messagingSendSignature, { onSuccess: (_data, input) => {
    void client.invalidateQueries({ queryKey: ["messaging", "messages", input.conversationId] });
    void client.invalidateQueries({ queryKey: ["messaging", "conversations"] });
  } });
}

export function useTypingNotifier(conversationId: string | null): (isTyping: boolean) => void {
  const captureOwner = useAuthOwnedEffect();
  return useCallback((isTyping: boolean) => {
    if (!conversationId || !captureOwner()()) return;
    try { sendTypingRealtime(conversationId, isTyping); } catch { /* Typing is advisory. */ }
  }, [conversationId, captureOwner]);
}
`;
}

export function nativePostgresMessagingDataFiles(
  target: Target,
  mode: Mode,
  featureRoot: string,
): TemplateFile[] {
  const alias = target === "desktop" && mode === "single" ? "@/renderer" : "@";
  return [
    file(`${featureRoot}/queries.ts`, queriesContent(alias)),
    file(`${featureRoot}/mutations.ts`, mutationsContent(target, alias)),
  ];
}
