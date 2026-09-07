// @allow-long 1820: one cross-platform renderer shares messaging UI, bounded websocket hosts, runtime compatibility, and attachment surfaces
import { file, type TemplateFile } from "../../../shared.js";
import { realtimeNextClientContent, realtimeTanstackClientContent } from "../realtime/index.js";
import { messagingAttachmentRouteFiles } from "./attachments.js";
import { messagingConvexAttachmentRouteFiles } from "./convex-attachments.js";
import { messagingConvexTanstackWebFiles } from "./convex-tanstack.js";
import { convexNextMessageViewsContent } from "./convex-next-data.js";
import { nativeExpoMessagingFiles } from "./native-expo.js";
import { nativeDesktopMessagingFiles } from "./native-desktop.js";
import { nextUpgradeDispatcherContent } from "./next-upgrade.js";

function messagingHookContent(router: "next" | "tanstack"): string {
  const content = `"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import {
  subscribeRealtime,
  sendTypingRealtime,
  type MessagingRealtimeEvent,
} from "@/lib/realtime";

export interface ConversationSummary {
  id: string;
  peerName?: string;
}

export interface MessageSummary {
  id: string;
  body?: string | null;
  senderId: string;
  createdAt: string;
  attachments?: Array<{ url: string; mimeType: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toConversation(value: unknown): ConversationSummary | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return {
    id: value.id,
    ...(typeof value.peerName === "string" ? { peerName: value.peerName } : {}),
  };
}

function toAttachment(value: unknown): { url: string; mimeType: string } | undefined {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.mimeType !== "string") {
    return undefined;
  }
  return { url: value.url, mimeType: value.mimeType };
}

function toMessage(value: unknown): MessageSummary | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.senderId !== "string"
  ) {
    return undefined;
  }
  const createdAt = value.createdAt instanceof Date
    ? value.createdAt
    : typeof value.createdAt === "string" ? new Date(value.createdAt) : null;
  if (!createdAt || !Number.isFinite(createdAt.getTime())) return undefined;
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.flatMap((item) => {
        const attachment = toAttachment(item);
        return attachment ? [attachment] : [];
      })
    : undefined;
  return {
    id: value.id,
    senderId: value.senderId,
    createdAt: createdAt.toISOString(),
    ...(typeof value.body === "string" || value.body === null ? { body: value.body } : {}),
    ...(attachments ? { attachments } : {}),
  };
}

function createClientMessageKey(): string {
  const cryptoValue: unknown = Reflect.get(globalThis, "crypto");
  if (typeof cryptoValue === "object" && cryptoValue !== null) {
    const randomUUID: unknown = Reflect.get(cryptoValue, "randomUUID");
    if (typeof randomUUID === "function") {
      const generated: unknown = Reflect.apply(randomUUID, cryptoValue, []);
      if (typeof generated === "string" && generated.length >= 16) return generated;
    }
  }
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join("-");
}

export interface PendingMessageAttachmentUpload {
  conversationId: string;
  fileFingerprint: string;
  attachmentId: string;
}

export interface MessageAttachmentFingerprintInput {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export function messageAttachmentFingerprint(file: MessageAttachmentFingerprintInput): string {
  return JSON.stringify([file.name, file.size, file.type, file.lastModified]);
}

export function reusablePendingAttachmentId(
  pending: PendingMessageAttachmentUpload | null,
  conversationId: string,
  fileFingerprint: string,
): string | undefined {
  return pending?.conversationId === conversationId && pending.fileFingerprint === fileFingerprint
    ? pending.attachmentId
    : undefined;
}

export function useConversations() {
  return useQuery(
    orpc.messaging.listConversations.queryOptions({
      select: (data) =>
        data.conversations.flatMap((value) => {
          const conversation = toConversation(value);
          return conversation ? [conversation] : [];
        }),
    }),
  );
}

export function useMessages(conversationId: string) {
  const qc = useQueryClient();
  const query = useQuery(
    orpc.messaging.listMessages.queryOptions({
      input: { conversationId, limit: 50 },
      enabled: conversationId.length > 0,
      select: (data) =>
        data.messages.flatMap((value) => {
          const message = toMessage(value);
          return message ? [message] : [];
        }),
    }),
  );

  React.useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = subscribeRealtime(conversationId, (event: MessagingRealtimeEvent) => {
      if (event.type === "message" && event.conversationId === conversationId) {
        void qc.invalidateQueries({
          queryKey: orpc.messaging.listMessages.key({ type: "query" }),
        });
        void qc.invalidateQueries({
          queryKey: orpc.messaging.listConversations.key({ type: "query" }),
        });
      }
    });
    return unsubscribe;
  }, [conversationId, qc]);

  return query;
}

export function useTyping(conversationId: string) {
  const [typingUsers, setTypingUsers] = React.useState<Set<string>>(new Set());
  const timeouts = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  React.useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = subscribeRealtime(conversationId, (event: MessagingRealtimeEvent) => {
      if (
        event.type === "typing" &&
        event.conversationId === conversationId
      ) {
        const userId = event.userId;
        setTypingUsers((prev) => {
          const next = new Set(prev);
          if (event.isTyping) next.add(userId);
          else next.delete(userId);
          return next;
        });
        const existing = timeouts.current.get(userId);
        if (existing) clearTimeout(existing);
        if (event.isTyping) {
          const timeout = setTimeout(() => {
            setTypingUsers((previous) => {
              const next = new Set(previous);
              next.delete(userId);
              return next;
            });
            timeouts.current.delete(userId);
          }, 3000);
          timeouts.current.set(userId, timeout);
        }
      }
    });
    return () => {
      unsubscribe();
      for (const timeout of timeouts.current.values()) clearTimeout(timeout);
      timeouts.current.clear();
    };
  }, [conversationId]);
  return typingUsers;
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  const pendingSend = React.useRef<{ signature: string; clientMessageKey: string } | null>(null);
  const mutation = useMutation(
    orpc.messaging.sendMessage.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({
          queryKey: orpc.messaging.listMessages.key({ type: "query" }),
        });
        await qc.invalidateQueries({
          queryKey: orpc.messaging.listConversations.key({ type: "query" }),
        });
      },
    }),
  );
  return {
    send: async (body: string, attachmentIds?: string[]) => {
      const signature = JSON.stringify([
        conversationId,
        body,
        [...(attachmentIds ?? [])].sort(),
      ]);
      const attempt = pendingSend.current?.signature === signature
        ? pendingSend.current
        : { signature, clientMessageKey: createClientMessageKey() };
      pendingSend.current = attempt;
      const result = await mutation.mutateAsync({
        conversationId,
        clientMessageKey: attempt.clientMessageKey,
        ...(body ? { body } : {}),
        ...(attachmentIds?.length ? { attachmentIds } : {}),
      });
      if (pendingSend.current?.clientMessageKey === attempt.clientMessageKey) {
        pendingSend.current = null;
      }
      return result;
    },
    sendTyping: (isTyping: boolean) => sendTypingRealtime(conversationId, isTyping),
    isPending: mutation.isPending,
  };
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  const mutation = useMutation(orpc.messaging.getOrCreateConversation.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.messaging.listConversations.key({ type: "query" }) });
    },
  }));
  return {
    start: async (peerUserId: string): Promise<string> => {
      const conversation = await mutation.mutateAsync({ peerUserId });
      if (typeof conversation.id !== "string") {
        throw new Error("The conversation response did not include an id.");
      }
      return conversation.id;
    },
    isPending: mutation.isPending,
  };
}
`;
  if (router === "next") return content;
  return content
    .replace(
      'import { orpc } from "@/lib/orpc";',
      `import { orpc } from "@/lib/orpc";
import {
  authScopedQueryKey,
  currentQueryAuthScope,
  messagingConversationsQueryKey,
} from "@/lib/query-client";`,
    )
    .replace(
      /export function useConversations\(\) \{[\s\S]*?\n\}\n\nexport function useMessages/,
      `export function useConversations() {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const options = orpc.messaging.listConversations.queryOptions({
    select: (data) =>
      data.conversations.flatMap((value) => {
        const conversation = toConversation(value);
        return conversation ? [conversation] : [];
      }),
  });
  return useQuery({
    ...options,
    queryKey: scope
      ? messagingConversationsQueryKey(scope)
      : ["auth", "anonymous", "messaging", "conversations"],
    enabled: Boolean(scope) && typeof window !== "undefined",
  });
}

export function useMessages`,
    )
    .replace(
      /export function useMessages\(conversationId: string\) \{[\s\S]*?\n\}\n\nexport function useTyping/,
      `export function useMessages(conversationId: string) {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const options = orpc.messaging.listMessages.queryOptions({
    input: { conversationId, limit: 50 },
    select: (data) =>
      data.messages.flatMap((value) => {
        const message = toMessage(value);
        return message ? [message] : [];
      }),
  });
  const query = useQuery({
    ...options,
    queryKey: scope
      ? authScopedQueryKey(scope, options.queryKey)
      : ["auth", "anonymous", ...options.queryKey],
    enabled: Boolean(scope) && conversationId.length > 0 && typeof window !== "undefined",
  });

  React.useEffect(() => {
    if (!conversationId || !scope) return;
    const unsubscribe = subscribeRealtime(conversationId, (event: MessagingRealtimeEvent) => {
      if (event.type === "message" && event.conversationId === conversationId) {
        void queryClient.invalidateQueries({
          queryKey: authScopedQueryKey(
            scope,
            orpc.messaging.listMessages.key({ type: "query" }),
          ),
        });
        void queryClient.invalidateQueries({
          queryKey: messagingConversationsQueryKey(scope),
        });
      }
    });
    return unsubscribe;
  }, [conversationId, queryClient, scope]);

  return query;
}

export function useTyping`,
    )
    .replace(
      /export function useSendMessage\(conversationId: string\) \{[\s\S]*?\n\}\n\nexport function useStartConversation/,
      `export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const pendingSend = React.useRef<{ signature: string; clientMessageKey: string } | null>(null);
  const mutation = useMutation(
    orpc.messaging.sendMessage.mutationOptions({
      onSuccess: async () => {
        if (!scope) return;
        await queryClient.invalidateQueries({
          queryKey: authScopedQueryKey(
            scope,
            orpc.messaging.listMessages.key({ type: "query" }),
          ),
        });
        await queryClient.invalidateQueries({
          queryKey: messagingConversationsQueryKey(scope),
        });
      },
    }),
  );
  return {
    send: async (body: string, attachmentIds?: string[]) => {
      const signature = JSON.stringify([
        conversationId,
        body,
        [...(attachmentIds ?? [])].sort(),
      ]);
      const attempt = pendingSend.current?.signature === signature
        ? pendingSend.current
        : { signature, clientMessageKey: createClientMessageKey() };
      pendingSend.current = attempt;
      const result = await mutation.mutateAsync({
        conversationId,
        clientMessageKey: attempt.clientMessageKey,
        ...(body ? { body } : {}),
        ...(attachmentIds?.length ? { attachmentIds } : {}),
      });
      if (pendingSend.current?.clientMessageKey === attempt.clientMessageKey) {
        pendingSend.current = null;
      }
      return result;
    },
    sendTyping: (isTyping: boolean) => sendTypingRealtime(conversationId, isTyping),
    isPending: mutation.isPending,
  };
}

export function useStartConversation`,
    )
    .replace(
      /export function useStartConversation\(\) \{[\s\S]*?\n\}\n$/,
      `export function useStartConversation() {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const mutation = useMutation(
    orpc.messaging.getOrCreateConversation.mutationOptions({
      onSuccess: async () => {
        if (!scope) return;
        await queryClient.invalidateQueries({
          queryKey: messagingConversationsQueryKey(scope),
        });
      },
    }),
  );
  return {
    start: async (peerUserId: string): Promise<string> => {
      const conversation = await mutation.mutateAsync({ peerUserId });
      if (typeof conversation.id !== "string") {
        throw new Error("The conversation response did not include an id.");
      }
      return conversation.id;
    },
    isPending: mutation.isPending,
  };
}
`,
    );
}

function messagingConversationListContent(
  hooksImport: string,
  router: "next" | "tanstack",
): string {
  const initialImport = router === "next" ? ", type ConversationSummary" : "";
  const initialParameter =
    router === "next"
      ? `,
  initialConversations,
}: {
  onSelect: (id: string) => void;
  selectedId: string | null;
  initialConversations: ConversationSummary[];`
      : `,
}: {
  onSelect: (id: string) => void;
  selectedId: string | null;`;
  const displayedConversations =
    router === "next"
      ? `  const conversations = data ?? initialConversations;
  const loading = isLoading && conversations.length === 0;`
      : `  const conversations = data ?? [];
  const loading = isLoading;`;
  return `"use client";
import type { JSX } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { useConversations${initialImport} } from "${hooksImport}";

export function ConversationList({
  onSelect,
  selectedId${initialParameter}
}): JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const { data, isLoading, error, isFetching, refetch } = useConversations();
${displayedConversations}
  const failure = error ? <Alert variant="destructive" role="alert"><AlertTitle>{t("operationError")}</AlertTitle><AlertDescription><Button type="button" variant="outline" size="sm" disabled={isFetching} aria-busy={isFetching} onClick={() => void refetch()}>{t("refresh")}</Button></AlertDescription></Alert> : null;
  if (loading) {
    return <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("loadingConversations")}>{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>;
  }
  if (conversations.length === 0) {
    return <>{failure ?? <Empty><EmptyHeader><EmptyTitle>{t("noConversations")}</EmptyTitle><EmptyDescription>{t("noConversationsDescription")}</EmptyDescription></EmptyHeader></Empty>}</>;
  }
  return <div className="flex flex-col gap-2">{failure}{conversations.map((conversation) => (
    <Button key={conversation.id} type="button" variant={selectedId === conversation.id ? "secondary" : "outline"} onClick={() => onSelect(conversation.id)} aria-pressed={selectedId === conversation.id} className="w-full justify-between text-start">
      <span className="font-mono text-xs truncate">{conversation.id.slice(0, 8)}</span><Badge variant="secondary">{t("directMessage")}</Badge>
    </Button>
  ))}</div>;
}
`;
}

function messagingMessageListContent(hooksImport: string, router: "next" | "tanstack"): string {
  const imageImport = router === "next" ? 'import Image from "next/image";\n' : "";
  const attachmentImage =
    router === "next"
      ? '<Image src={attachment.url} alt={t("attachmentAlt")} width={200} height={200} className="h-auto max-w-[200px] rounded" />'
      : '<img src={attachment.url} alt={t("attachmentAlt")} className="max-w-[200px] rounded" loading="lazy" />';
  return `"use client";
${imageImport}import type { JSX } from "react";
import { Attachment, AttachmentContent, AttachmentGroup, AttachmentMedia, AttachmentTitle, Bubble, BubbleContent, Marker, MarkerContent, Message, MessageContent, MessageHeader, MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/chat";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import type { MessageSummary } from "${hooksImport}";

export function MessageList({
  messages,
  isLoading,
  isTyping,
}: {
  messages: MessageSummary[] | undefined;
  isLoading: boolean;
  isTyping: boolean;
}): JSX.Element {
  const locale = useSurfaceLocale();
  const t = useSurfaceTranslations("messaging");
  if (isLoading) {
    return <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("loadingMessages")}>{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
  }
  return <MessageScrollerProvider autoScroll><MessageScroller className="max-h-[400px]"><MessageScrollerViewport><MessageScrollerContent role="log" aria-live="polite" aria-label={t("messagesLabel")}>
    {(messages ?? []).length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noMessages")}</EmptyTitle></EmptyHeader></Empty> : (messages ?? []).map((message) => (
      <MessageScrollerItem key={message.id} messageId={message.id}><Message align="start"><MessageContent className="text-start"><MessageHeader>{message.senderId.slice(0, 6)} • {new Date(message.createdAt).toLocaleTimeString(locale)}</MessageHeader>{message.body ? <Bubble variant="muted"><BubbleContent>{message.body}</BubbleContent></Bubble> : null}{message.attachments?.length ? <AttachmentGroup>{message.attachments.map((attachment) => <Attachment key={attachment.url} state="done">{attachment.mimeType.startsWith("image/") ? <AttachmentMedia>${attachmentImage}</AttachmentMedia> : null}<AttachmentContent><AttachmentTitle><a href={attachment.url} className="underline">{attachment.url}</a></AttachmentTitle></AttachmentContent></Attachment>)}</AttachmentGroup> : null}</MessageContent></Message></MessageScrollerItem>
    ))}
    {isTyping ? <MessageScrollerItem messageId="typing"><Marker><MarkerContent className="shimmer">{t("typing")}</MarkerContent></Marker></MessageScrollerItem> : null}
  </MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider>;
}
`;
}

function messagingComposerContent(hooksImport: string): string {
  return `"use client";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";
import {
  messageAttachmentFingerprint,
  reusablePendingAttachmentId,
  useSendMessage,
  type PendingMessageAttachmentUpload,
} from "${hooksImport}";

function attachmentIdFrom(value: unknown): string {
  if (typeof value !== "object" || value === null || !("attachmentId" in value) || typeof value.attachmentId !== "string") {
    throw new Error("The attachment response did not include an id.");
  }
  return value.attachmentId;
}

export function MessageComposer({ conversationId }: { conversationId: string }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const { send, sendTyping, isPending } = useSendMessage(conversationId);
  const [body, setBody] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const uploadInFlight = React.useRef(false);
  const pendingAttachmentUpload = React.useRef<PendingMessageAttachmentUpload | null>(null);
  React.useEffect(() => {
    if (pendingAttachmentUpload.current?.conversationId !== conversationId) pendingAttachmentUpload.current = null;
  }, [conversationId]);

  async function submit(): Promise<void> {
    if ((!body.trim() && !file) || uploadInFlight.current) return;
    uploadInFlight.current = true;
    setError(false);
    setIsUploading(true);
    try {
      let attachmentIds: string[] | undefined;
      if (file) {
        const fileFingerprint = messageAttachmentFingerprint(file);
        let attachmentId = reusablePendingAttachmentId(pendingAttachmentUpload.current, conversationId, fileFingerprint);
        if (!attachmentId) {
          const form = new FormData();
          form.append("file", file);
          form.append("conversationId", conversationId);
          const response = await fetch("/api/messaging/attachments", {
            method: "POST",
            headers: { "X-Ghostinit-Conversation-Id": conversationId },
            body: form,
          });
          if (!response.ok) throw new Error(\`Attachment upload failed with status \${response.status}.\`);
          attachmentId = attachmentIdFrom(await response.json());
          pendingAttachmentUpload.current = { conversationId, fileFingerprint, attachmentId };
        }
        attachmentIds = [attachmentId];
      }
      await send(body.trim(), attachmentIds);
      pendingAttachmentUpload.current = null;
      setBody("");
      setFile(null);
      try { sendTyping(false); } catch { /* Delivery succeeded; typing cleanup is advisory. */ }
    } catch {
      setError(true);
    } finally {
      uploadInFlight.current = false;
      setIsUploading(false);
    }
  }

  return <div className="flex flex-col gap-2">
    {error ? <Alert variant="destructive" role="alert"><AlertDescription>{t("sendError")}</AlertDescription></Alert> : null}
    <div className="flex flex-col gap-2 sm:flex-row">
    <Input value={body} aria-label={t("messagePlaceholder")} onChange={(event) => { setBody(event.target.value); sendTyping(event.target.value.length > 0); }} placeholder={t("messagePlaceholder")} onKeyDown={(event) => { if (event.key === "Enter" && !file) void submit(); }} />
    <Input type="file" onChange={(event) => {
      const nextFile = event.target.files?.[0] ?? null;
      const reusable = nextFile ? reusablePendingAttachmentId(pendingAttachmentUpload.current, conversationId, messageAttachmentFingerprint(nextFile)) : undefined;
      if (!reusable) pendingAttachmentUpload.current = null;
      setFile(nextFile);
    }} className="max-w-[160px]" />
    <Button onClick={() => void submit()} disabled={isPending || isUploading || (!body.trim() && !file)} aria-busy={isPending || isUploading}>{isPending || isUploading ? t("sending") : t("send")}</Button>
    </div>
  </div>;
}
`;
}

function messagingThreadContent(hooksImport: string, componentImport: string): string {
  return `"use client";
import type { JSX } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { useMessages, useTyping } from "${hooksImport}";
import { MessageComposer } from "${componentImport}/message-composer";
import { MessageList } from "${componentImport}/message-list";

export function MessageThread({ conversationId }: { conversationId: string }): JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const { data: messages, isLoading, error, isFetching, refetch } = useMessages(conversationId);
  const typing = useTyping(conversationId);
  return <Card>
    <CardHeader><CardTitle className="text-base">{t("thread", { id: conversationId.slice(0, 8) })}</CardTitle></CardHeader>
    <CardContent className="flex flex-col gap-3">
      {error ? <Alert variant="destructive" role="alert"><AlertTitle>{t("operationError")}</AlertTitle><AlertDescription><Button type="button" variant="outline" size="sm" disabled={isFetching} aria-busy={isFetching} onClick={() => void refetch()}>{t("refresh")}</Button></AlertDescription></Alert> : null}
      {!error || (messages?.length ?? 0) > 0 ? <MessageList messages={messages} isLoading={isLoading} isTyping={typing.size > 0} /> : null}
      <MessageComposer conversationId={conversationId} />
    </CardContent>
  </Card>;
}
`;
}

function messagingPageContent(router: "next" | "tanstack"): string {
  const tanstack = router === "tanstack";
  const componentImport = tanstack ? "./-components/messages" : "./_components";
  const hooksImport = tanstack ? "./-hooks/use-messaging" : "./hooks/use-messaging";
  const routeImport = tanstack
    ? `import { createFileRoute } from "@tanstack/react-router";
import { loadInitialConversations, loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";
`
    : "";
  const routeExport = tanstack
    ? `
export const Route = createFileRoute("/messages")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  loader: ({ context }) => Promise.all([
    loadProtectedRoute(context),
    loadInitialConversations(context),
  ]),
  component: MessagesPage,
});
`
    : "";
  const defaultExport = tanstack ? "" : "export default ";
  const nextConversationType = tanstack
    ? ""
    : `import type { ConversationSummary } from "${hooksImport}";
`;
  const pageParameters = tanstack
    ? ""
    : "{ initialConversations }: { initialConversations: ConversationSummary[] }";
  const initialConversationProp = tanstack ? "" : " initialConversations={initialConversations}";
  return `"use client";
import * as React from "react";
${routeImport}import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";
import { ConversationList } from "${componentImport}/conversation-list";
import { MessageThread } from "${componentImport}/message-thread";
import { useStartConversation } from "${hooksImport}";
${nextConversationType}

${defaultExport}function MessagesPage(${pageParameters}): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [peerId, setPeerId] = React.useState("");
  const [startError, setStartError] = React.useState(false);
  const startInFlight = React.useRef(false);
  const { start, isPending } = useStartConversation();
  async function startConversation(): Promise<void> {
    if (!peerId.trim() || startInFlight.current) return;
    startInFlight.current = true; setStartError(false);
    try {
      const conversationId = await start(peerId.trim());
      setSelected(conversationId); setPeerId("");
    } catch { setStartError(true); }
    finally { startInFlight.current = false; }
  }
  return <main className="min-h-screen bg-background p-6 md:p-8">
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
    <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1><p className="max-w-[65ch] text-sm text-muted-foreground">{t("desktopDescription")}</p></header>
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
      <Card><CardHeader><CardTitle className="text-base">{t("conversations")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
        <ConversationList onSelect={setSelected} selectedId={selected}${initialConversationProp} />
        <div className="flex flex-col gap-2">
          <Input value={peerId} aria-label={t("peerUserId")} onChange={(event) => setPeerId(event.target.value)} placeholder={t("peerUserId")} />
          <Button variant="outline" disabled={isPending || !peerId.trim()} aria-busy={isPending} onClick={() => void startConversation()}>{isPending ? t("starting") : t("startDirectMessage")}</Button>
        </div>
        {startError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("operationError")}</AlertDescription></Alert> : null}
      </CardContent></Card>
      <div>{selected ? <MessageThread conversationId={selected} /> : <Empty><EmptyHeader><EmptyTitle>{t("selectOrStart")}</EmptyTitle></EmptyHeader></Empty>}</div>
    </div>
    </div>
  </main>;
}
${routeExport}`;
}

function messagingWebComponentFiles(router: "next" | "tanstack"): TemplateFile[] {
  const tanstack = router === "tanstack";
  const root = tanstack
    ? "apps/web/src/routes/-components/messages"
    : "apps/web/src/app/(app)/messages/_components";
  const hooksImport = tanstack ? "../../-hooks/use-messaging" : "../hooks/use-messaging";
  return [
    file(`${root}/conversation-list.tsx`, messagingConversationListContent(hooksImport, router)),
    file(`${root}/message-list.tsx`, messagingMessageListContent(hooksImport, router)),
    file(`${root}/message-composer.tsx`, messagingComposerContent(hooksImport)),
    file(`${root}/message-thread.tsx`, messagingThreadContent(hooksImport, ".")),
  ];
}

function messagingNextRouteContent(mode: "monorepo" | "single"): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest, type ConversationDto } from "${applicationModule}";
import MessagesPage from "./client";

function conversationSummary(value: ConversationDto) {
  return [{ id: value.id }];
}

async function MessagesData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const current = await application.me();
  if (!current.user) redirect("/sign-in");
  const result = await application.messaging.listConversations();
  return <MessagesPage initialConversations={result.conversations.flatMap(conversationSummary)} />;
}

export default function Page(): React.JSX.Element {
  return <Suspense fallback={<div className="min-h-48" aria-busy="true" />}><MessagesData /></Suspense>;
}
`;
}

function singleSafeRealtimeContent(content: string, mode: "monorepo" | "single"): string {
  return mode === "single"
    ? content
        .replace('from "@repo/api"', 'from "@/server/api"')
        .replace('from "@repo/config/', 'from "@/lib/env/')
    : content;
}

export function messagingNextFiles(mode: "monorepo" | "single" = "monorepo"): TemplateFile[] {
  return [
    file(
      "apps/web/src/lib/realtime.ts",
      singleSafeRealtimeContent(realtimeNextClientContent(), mode),
    ),
    file("apps/web/src/app/(app)/messages/hooks/use-messaging.ts", messagingHookContent("next")),
    file("apps/web/src/app/(app)/messages/client.tsx", messagingPageContent("next")),
    file("apps/web/src/app/(app)/messages/page.tsx", messagingNextRouteContent(mode)),
    ...messagingWebComponentFiles("next"),
  ];
}

export function messagingTanstackFiles(mode: "monorepo" | "single" = "monorepo"): TemplateFile[] {
  return [
    file(
      "apps/web/src/lib/realtime.ts",
      singleSafeRealtimeContent(realtimeTanstackClientContent(), mode),
    ),
    file("apps/web/src/routes/messages.tsx", messagingPageContent("tanstack")),
    file("apps/web/src/routes/-hooks/use-messaging.ts", messagingHookContent("tanstack")),
    ...messagingWebComponentFiles("tanstack"),
  ];
}

export function messagingExpoFiles(
  mode: "monorepo" | "single" = "monorepo",
  hasI18n = false,
): TemplateFile[] {
  return nativeExpoMessagingFiles("postgres", mode, hasI18n);
}

function convexApiImport(mode: "monorepo" | "single", router: "next" | "tanstack"): string {
  if (mode === "single")
    return router === "next" ? "../../../../convex/_generated/api" : "../../convex/_generated/api";
  return router === "next"
    ? "../../../../../../convex/_generated/api"
    : "../../../../convex/_generated/api";
}

function messagingConvexNextClientContent(mode: "monorepo" | "single"): string {
  const apiImport = convexApiImport(mode, "next");
  const dataModelImport = apiImport.replace(/\/api$/, "/dataModel");
  return `"use client";
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "${apiImport}";
import type { Id } from "${dataModelImport}";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSurfaceTranslations } from "@/lib/translations";
import {
  ConvexConversationSidebar,
  type ConvexConversationItem,
} from "./_components/convex-conversation-sidebar";
import { ConvexMessageThread } from "./_components/convex-message-thread";

interface InitialConversation {
  id: string;
}

interface LiveConversation {
  _id: Id<"conversations">;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLiveConversation(value: unknown): value is LiveConversation {
  return isRecord(value) && typeof value._id === "string";
}

export default function MessagesPage({
  initialConversations,
}: {
  initialConversations: InitialConversation[];
}): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const liveValue: unknown = useQuery(api.messaging.listConversations);
  const liveConversations = Array.isArray(liveValue)
    ? liveValue.filter(isLiveConversation)
    : undefined;
  const [selected, setSelected] = React.useState<Id<"conversations"> | null>(null);
  const getOrCreate = useMutation(api.messaging.getOrCreateConversation);
  const conversationItems: ConvexConversationItem[] = liveConversations
    ? liveConversations.map((conversation) => ({
        key: conversation._id,
        liveId: conversation._id,
      }))
    : initialConversations.map((conversation) => ({ key: conversation.id, liveId: null }));

  async function startConversation(peerUserId: string): Promise<boolean> {
    const value: unknown = await getOrCreate({ peerUserId });
    if (!isLiveConversation(value)) return false;
    setSelected(value._id);
    return true;
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1><p className="max-w-[65ch] text-sm text-muted-foreground">{t("desktopDescription")}</p></header>
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
        <ConvexConversationSidebar
          conversations={conversationItems}
          selected={selected}
          onSelect={setSelected}
          onStart={startConversation}
        />
        {selected ? (
          <ConvexMessageThread conversationId={selected} />
        ) : (
          <Empty><EmptyHeader><EmptyTitle>{t("selectConversationShort")}</EmptyTitle></EmptyHeader></Empty>
        )}
        </div>
      </div>
    </main>
  );
}
`;
}

function messagingConvexConversationSidebarContent(mode: "monorepo" | "single"): string {
  const dataModelImport = `../${convexApiImport(mode, "next").replace(/\/api$/, "/dataModel")}`;
  return `"use client";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Id } from "${dataModelImport}";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";

export interface ConvexConversationItem {
  key: string;
  liveId: Id<"conversations"> | null;
}

export function ConvexConversationSidebar({
  conversations,
  selected,
  onSelect,
  onStart,
}: {
  conversations: ConvexConversationItem[];
  selected: Id<"conversations"> | null;
  onSelect: (id: Id<"conversations">) => void;
  onStart: (peerUserId: string) => Promise<boolean>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const [peerId, setPeerId] = React.useState("");
  const [starting, setStarting] = React.useState(false);
  const [startError, setStartError] = React.useState(false);
  const startInFlight = React.useRef(false);

  async function start(): Promise<void> {
    const normalizedPeerId = peerId.trim();
    if (!normalizedPeerId || startInFlight.current) return;
    startInFlight.current = true; setStartError(false);
    setStarting(true);
    try {
      if (await onStart(normalizedPeerId)) setPeerId(""); else setStartError(true);
    } catch { setStartError(true); }
    finally {
      startInFlight.current = false;
      setStarting(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("conversations")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2">
        {conversations.map((conversation) => (
          <Button
            key={conversation.key}
            type="button"
            variant={conversation.liveId !== null && selected === conversation.liveId ? "secondary" : "outline"}
            disabled={conversation.liveId === null}
            onClick={() => { if (conversation.liveId !== null) onSelect(conversation.liveId); }}
            className="w-full justify-start font-mono text-xs"
          >
            {conversation.key.slice(0, 8)}
          </Button>
        ))}
        <div className="flex flex-col gap-2">
          <Input value={peerId} aria-label={t("peerUserId")} onChange={(event) => setPeerId(event.target.value)} placeholder={t("peerUserId")} />
          <Button type="button" variant="outline" disabled={!peerId.trim() || starting} aria-busy={starting} onClick={() => void start()}>
            {starting ? t("starting") : t("startDirectMessage")}
          </Button>
        </div>
        {startError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("operationError")}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}
`;
}

function messagingConvexMessageThreadContent(mode: "monorepo" | "single"): string {
  const apiImport = `../${convexApiImport(mode, "next")}`;
  const dataModelImport = apiImport.replace(/\/api$/, "/dataModel");
  return `"use client";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation, useQuery } from "convex/react";
import { api } from "${apiImport}";
import type { Id } from "${dataModelImport}";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { messageViews } from "./convex-message-views";

export function ConvexMessageThread({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const messagesValue: unknown = useQuery(api.messaging.listMessages, { conversationId, limit: 30 });
  const typingValue: unknown = useQuery(api.messaging.listTyping, { conversationId });
  const sendMessage = useMutation(api.messaging.sendMessage);
  const sendTyping = useMutation(api.messaging.sendTyping);
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState(false);
  const sendInFlight = React.useRef(false);
  const messages = messageViews(messagesValue);
  async function submit(): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed || sendInFlight.current) return;
    sendInFlight.current = true; setSending(true); setSendError(false);
    try {
      await sendMessage({ conversationId, body: trimmed });
      setBody("");
      try { await sendTyping({ conversationId, isTyping: false }); } catch { /* Delivery succeeded; typing cleanup is advisory. */ }
    } catch { setSendError(true); }
    finally { sendInFlight.current = false; setSending(false); }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex max-h-[400px] flex-col gap-2 overflow-auto">
          {messagesValue === undefined ? <div aria-busy="true" aria-label={t("loadingMessages")}><Skeleton className="h-32 w-full" /></div> : messages.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noMessages")}</EmptyTitle></EmptyHeader></Empty> : messages.map((message) => (
            <Card key={message.id}><CardContent className="flex flex-col gap-1 p-3">
              {message.body ? <div className="text-sm">{message.body}</div> : null}
              {message.attachments.map((attachment) => (
                <a key={attachment.id} href={attachment.url} className="text-xs underline">{attachment.originalName}</a>
              ))}
            </CardContent></Card>
          ))}
        </div>
        {Array.isArray(typingValue) && typingValue.length > 0 ? (
          <div className="animate-pulse text-xs text-muted-foreground">{t("typing")}</div>
        ) : null}
        {sendError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("sendError")}</AlertDescription></Alert> : null}
        <div className="flex gap-2">
          <Input
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              void sendTyping({ conversationId, isTyping: event.target.value.length > 0 }).catch(() => undefined);
            }}
            placeholder={t("messagePlaceholder")}
          />
          <Button type="button" disabled={sending || !body.trim()} aria-busy={sending} onClick={() => void submit()}>{sending ? t("sending") : t("send")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
`;
}

export function messagingConvexNextFiles(mode: "monorepo" | "single" = "monorepo"): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  return [
    file(`${root}src/app/(app)/messages/client.tsx`, messagingConvexNextClientContent(mode)),
    file(
      `${root}src/app/(app)/messages/_components/convex-conversation-sidebar.tsx`,
      messagingConvexConversationSidebarContent(mode),
    ),
    file(
      `${root}src/app/(app)/messages/_components/convex-message-thread.tsx`,
      messagingConvexMessageThreadContent(mode),
    ),
    file(
      `${root}src/app/(app)/messages/_components/convex-message-views.ts`,
      convexNextMessageViewsContent(),
    ),
    file(`${root}src/app/(app)/messages/page.tsx`, messagingNextRouteContent(mode)),
  ];
}

export function messagingConvexTanstackFiles(
  mode: "monorepo" | "single" = "monorepo",
): TemplateFile[] {
  return messagingConvexTanstackWebFiles(mode);
}

function websocketAuthContent(mode: "monorepo" | "single"): string {
  const authImport = mode === "monorepo" ? "@repo/auth" : "@/server/auth";
  const apiImport = mode === "monorepo" ? "@repo/api" : "@/server/api";
  const databaseImport =
    mode === "monorepo"
      ? `import { db, messagingWebsocketTickets, sessions, users } from "@repo/database";`
      : `import { db } from "@/server/db";
import { sessions, users } from "@/server/db/schema/auth";
import { messagingWebsocketTickets } from "@/server/db/schema/messaging";`;
  return `import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { auth } from "${authImport}";
import { createContext, type ApiContext } from "${apiImport}";
import { env } from "${mode === "monorepo" ? "@repo/config/server" : "@/lib/env/server"}";
${databaseImport}

export interface WebSocketIdentity {
  userId: string;
  sessionId: string;
  authentication: "cookie" | "ticket";
}

export interface AuthenticatedWebSocket extends WebSocketIdentity {
  context: ApiContext;
}

export const MAX_WEBSOCKET_CONNECTIONS = 512;
export const MAX_WEBSOCKETS_PER_USER = 8;
export const WEBSOCKET_AUTHENTICATION_TIMEOUT_MS = 5_000;
export const NATIVE_WEBSOCKET_PROTOCOL_PREFIX = "ghostinit-ticket.";

let nextWebSocketSlot = 1;
const webSocketSlotOwners = new Map<number, string>();
const webSocketSlotsByUser = new Map<string, number>();

export function acquireWebSocketSlot(userId: string): number | null {
  const userSlots = webSocketSlotsByUser.get(userId) ?? 0;
  if (
    webSocketSlotOwners.size >= MAX_WEBSOCKET_CONNECTIONS ||
    userSlots >= MAX_WEBSOCKETS_PER_USER
  ) {
    return null;
  }
  const slot = nextWebSocketSlot++;
  webSocketSlotOwners.set(slot, userId);
  webSocketSlotsByUser.set(userId, userSlots + 1);
  return slot;
}

export function releaseWebSocketSlot(slot: number): void {
  const userId = webSocketSlotOwners.get(slot);
  if (!userId) return;
  webSocketSlotOwners.delete(slot);
  const remaining = (webSocketSlotsByUser.get(userId) ?? 1) - 1;
  if (remaining > 0) webSocketSlotsByUser.set(userId, remaining);
  else webSocketSlotsByUser.delete(userId);
}

export function trustedWebSocketOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  const configured = [
    env.BETTER_AUTH_URL,
    env.SITE_URL,
  ];
  const allowed = new Set<string>();
  for (const value of configured) {
    if (!value) continue;
    try {
      allowed.add(new URL(value).origin);
    } catch {
      // Invalid configuration never widens the origin allowlist.
    }
  }
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function nativeWebSocketTicket(headers: Headers): string | null {
  const candidates = (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(NATIVE_WEBSOCKET_PROTOCOL_PREFIX));
  if (candidates.length !== 1) return null;
  const ticket = candidates[0]?.slice(NATIVE_WEBSOCKET_PROTOCOL_PREFIX.length) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(ticket) ? ticket : null;
}

export function hasNativeWebSocketTicket(headers: Headers): boolean {
  return nativeWebSocketTicket(headers) !== null;
}

function ticketDigest(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

async function currentTicketIdentity(expected: WebSocketIdentity): Promise<AuthenticatedWebSocket | null> {
  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      name: users.name,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, expected.sessionId),
        eq(sessions.userId, expected.userId),
        gt(sessions.expiresAt, now),
        isNull(sessions.revokedAt),
        or(eq(users.banned, false), isNull(users.banned), lte(users.banExpires, now)),
      ),
    )
    .limit(1);
  const current = rows[0];
  if (!current) return null;
  const headers = new Headers({ "x-ghostinit-native-client": "websocket-ticket" });
  const requestContext = await createContext(headers);
  // A ticket can authorize only the messaging WebSocket router. Its facade must
  // remain anonymous so ordinary HTTP application operations fail closed.
  if (requestContext.user || requestContext.application.principal) return null;
  const context: ApiContext = {
    ...requestContext,
    headers,
    websocketAuthentication: "ticket",
    sessionId: current.sessionId,
    user: {
      id: current.userId,
      identityId: current.userId,
      email: current.email,
      emailVerified: current.emailVerified === true,
      name: current.name ?? null,
      role: current.role ?? "user",
      banned: false,
    },
  };
  return { ...expected, context };
}

async function consumeNativeWebSocketTicket(
  headers: Headers,
): Promise<AuthenticatedWebSocket | null> {
  const ticket = nativeWebSocketTicket(headers);
  if (!ticket) return null;
  const consumed = await db
    .delete(messagingWebsocketTickets)
    .where(
      and(
        eq(messagingWebsocketTickets.ticketHash, ticketDigest(ticket)),
        gt(messagingWebsocketTickets.expiresAt, new Date()),
      ),
    )
    .returning({
      userId: messagingWebsocketTickets.userId,
      sessionId: messagingWebsocketTickets.sessionId,
    });
  const identity = consumed[0];
  if (!identity) return null;
  return await currentTicketIdentity({ ...identity, authentication: "ticket" });
}

async function authenticateCookieWebSocket(
  headers: Headers,
  expected?: WebSocketIdentity,
): Promise<AuthenticatedWebSocket | null> {
  if (expected?.authentication === "ticket") return null;
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  const userId = session?.user?.id;
  const sessionId = session?.session?.id;
  if (
    !userId ||
    !sessionId ||
    session.user.banned === true ||
    (expected && (expected.userId !== userId || expected.sessionId !== sessionId))
  ) {
    return null;
  }
  const context = await createContext(headers);
  if (
    !context.user?.id ||
    context.user.id !== userId ||
    context.sessionId !== sessionId ||
    context.user.banned === true
  ) {
    return null;
  }
  return { userId, sessionId, authentication: "cookie", context };
}

async function withAuthenticationDeadline(
  operation: Promise<AuthenticatedWebSocket | null>,
): Promise<AuthenticatedWebSocket | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), WEBSOCKET_AUTHENTICATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function authenticateWebSocket(
  headers: Headers,
  expected?: WebSocketIdentity,
): Promise<AuthenticatedWebSocket | null> {
  if (expected?.authentication === "ticket") {
    return await withAuthenticationDeadline(currentTicketIdentity(expected));
  }
  if (!expected && hasNativeWebSocketTicket(headers)) {
    return await withAuthenticationDeadline(consumeNativeWebSocketTicket(headers));
  }
  return await withAuthenticationDeadline(authenticateCookieWebSocket(headers, expected));
}
`;
}

function tanstackWebSocketFiles(mode: "monorepo" | "single"): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  const apiImport = mode === "monorepo" ? "@repo/api" : "@/server/api";
  const outboxImport =
    mode === "monorepo" ? "@repo/api/messaging-outbox" : "@/server/api/messaging-outbox";
  const cleanupImport =
    mode === "monorepo" ? "@repo/api/workers/storage/cleanup" : "@/server/workers/storage/cleanup";
  return [
    file(`${root}server/transport/websocket-auth.ts`, websocketAuthContent(mode)),
    file(
      `${root}server/plugins/00-nitro-websocket-compat.ts`,
      `import type { Hooks as CrosswsHooks } from "crossws";
import { definePlugin } from "nitro";

const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024;

type BunServeOptions = Record<PropertyKey, unknown>;
type BunServe = (options: BunServeOptions) => unknown;

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function hooksFrom(value: unknown): Partial<CrosswsHooks> | undefined {
  return isRecord(value) ? (value as Partial<CrosswsHooks>) : undefined;
}

function rejectionHooks(status: 404 | 503): Partial<CrosswsHooks> {
  return {
    upgrade: () =>
      new Response(status === 404 ? "WebSocket route not found" : "WebSocket service unavailable", {
        status,
      }),
  };
}

function guardedApplicationHooks(value: unknown): Partial<CrosswsHooks> {
  const applicationHooks = hooksFrom(value);
  const upgrade = applicationHooks?.upgrade;
  if (typeof upgrade !== "function") {
    return rejectionHooks(503);
  }
  return {
    ...applicationHooks,
    upgrade: async (request) => {
      try {
        return await upgrade(request);
      } catch {
        return new Response("WebSocket service unavailable", { status: 503 });
      }
    },
  };
}

function isWebSocketUpgrade(request: Request): boolean {
  return (request.headers.get("upgrade") ?? "")
    .toLowerCase()
    .split(",")
    .some((value) => value.trim() === "websocket");
}

function requestPathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

function responseWithHooks(status: 404 | 503, hooks: Partial<CrosswsHooks>): Response {
  return Object.assign(
    new Response(status === 404 ? "WebSocket route not found" : "WebSocket service unavailable", {
      status,
    }),
    { crossws: hooks },
  );
}

/**
 * Nitro 3 beta resolves websocket hooks by fetching the requested route. Its
 * empty-hook fallback otherwise upgrades unknown paths, so wrap only websocket
 * fetches and preserve an explicit /api/ws boundary. @orpc/server/crossws owns
 * the application protocol and dispatches accepted frames to the typed router.
 */
export default definePlugin((nitroApp) => {
  const originalFetch = nitroApp.fetch.bind(nitroApp);
  nitroApp.fetch = async (request) => {
    if (!isWebSocketUpgrade(request)) return originalFetch(request);
    if (requestPathname(request) !== "/api/ws") {
      return responseWithHooks(404, rejectionHooks(404));
    }
    let response: Response;
    try {
      response = await originalFetch(request);
    } catch {
      return responseWithHooks(503, rejectionHooks(503));
    }
    return Object.assign(response, {
      crossws: guardedApplicationHooks(Reflect.get(response, "crossws")),
    });
  };
  const bunValue: unknown = Reflect.get(globalThis, "Bun");
  if (bunValue === undefined) return;
  if (!isRecord(bunValue)) {
    throw new Error("Nitro websocket compatibility adapter received an invalid Bun runtime");
  }
  const bunRuntime = bunValue;
  const originalServe = bunRuntime.serve;
  if (typeof originalServe !== "function") {
    throw new Error("Nitro websocket compatibility adapter cannot verify Bun.serve");
  }
  const invokeOriginalServe: BunServe = (options) =>
    Reflect.apply(originalServe, bunRuntime, [options]);
  let armed = true;
  const patchedServe: BunServe = (options) => {
    const websocket = isRecord(options.websocket) ? options.websocket : undefined;
    if (!armed || !websocket) return invokeOriginalServe(options);
    armed = false;
    bunRuntime.serve = originalServe;
    if (bunRuntime.serve !== originalServe) {
      throw new Error("Nitro websocket compatibility adapter could not restore Bun.serve");
    }
    return invokeOriginalServe({
      ...options,
      websocket: { ...websocket, maxPayloadLength: MAX_WEBSOCKET_PAYLOAD_BYTES },
    });
  };
  bunRuntime.serve = patchedServe;
  if (bunRuntime.serve !== patchedServe) {
    throw new Error("Nitro websocket compatibility adapter could not wrap Bun.serve");
  }
});
`,
    ),
    file(
      `${root}server/plugins/messaging-outbox.ts`,
      `import { definePlugin } from "nitro";
import { startMessagingOutboxWorker } from "${outboxImport}";
import { runPostgresStorageCleanupWorker } from "${cleanupImport}";

interface MessagingOutboxGlobal {
  __ghostinitMessagingOutboxWorker?: ReturnType<typeof startMessagingOutboxWorker>;
  __ghostinitStorageCleanup?: {
    controller: AbortController;
    task: Promise<void>;
  };
}

export default definePlugin((nitroApp) => {
  const processState = globalThis as typeof globalThis & MessagingOutboxGlobal;
  const worker =
    processState.__ghostinitMessagingOutboxWorker ?? startMessagingOutboxWorker();
  processState.__ghostinitMessagingOutboxWorker = worker;
  const cleanup =
    processState.__ghostinitStorageCleanup ?? (() => {
      const controller = new AbortController();
      const task = runPostgresStorageCleanupWorker(controller.signal).catch(() => {
        console.error(JSON.stringify({ scope: "storage-cleanup", event: "worker-stopped" }));
      });
      return { controller, task };
  })();
  processState.__ghostinitStorageCleanup = cleanup;
  let stopped = false;
  nitroApp.hooks.hook("close", async () => {
    if (stopped) return;
    stopped = true;
    if (processState.__ghostinitMessagingOutboxWorker === worker) {
      delete processState.__ghostinitMessagingOutboxWorker;
      await worker.stop();
    }
    if (processState.__ghostinitStorageCleanup === cleanup) {
      delete processState.__ghostinitStorageCleanup;
      cleanup.controller.abort();
      await cleanup.task;
    }
  });
});
`,
    ),
    file(
      `${root}server/websocket-handler.ts`,
      `import { experimental_RPCHandler } from "@orpc/server/crossws";
import { defineWebSocket, defineWebSocketHandler } from "nitro/h3";
import { messagingWebSocketRouter } from "${apiImport}";
import {
  acquireWebSocketSlot,
  authenticateWebSocket,
  hasNativeWebSocketTicket,
  releaseWebSocketSlot,
  trustedWebSocketOrigin,
  type WebSocketIdentity,
} from "./transport/websocket-auth";

const handler = new experimental_RPCHandler(messagingWebSocketRouter);
const MAX_RPC_MESSAGE_BYTES = 64 * 1024;
const MAX_RPC_QUEUE_MESSAGES = 32;
const MAX_RPC_QUEUE_BYTES = 256 * 1024;

interface RpcQueueState {
  tail: Promise<void>;
  messages: number;
  bytes: number;
  closed: boolean;
}

const rpcQueues = new WeakMap<object, RpcQueueState>();

function readIdentity(value: unknown): WebSocketIdentity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.userId === "string" &&
    typeof record.sessionId === "string" &&
    (record.authentication === "cookie" || record.authentication === "ticket")
    ? {
        userId: record.userId,
        sessionId: record.sessionId,
        authentication: record.authentication,
      }
    : null;
}

function readSlot(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function messageByteLength(message: { rawData: unknown; uint8Array(): Uint8Array }): number {
  return typeof message.rawData === "string"
    ? new TextEncoder().encode(message.rawData).byteLength
    : message.uint8Array().byteLength;
}

function queueFor(peer: object): RpcQueueState {
  let state = rpcQueues.get(peer);
  if (!state) {
    state = { tail: Promise.resolve(), messages: 0, bytes: 0, closed: false };
    rpcQueues.set(peer, state);
  }
  return state;
}

export const applicationWebSocketHooks = defineWebSocket({
  async upgrade(request) {
    if (!hasNativeWebSocketTicket(request.headers) && !trustedWebSocketOrigin(request.headers)) {
      return new Response("WebSocket origin denied", { status: 403 });
    }
    const authenticated = await authenticateWebSocket(request.headers);
    if (!authenticated) {
      return new Response("WebSocket authentication required", { status: 401 });
    }
    return {
      context: {
        ...request.context,
        websocketIdentity: {
          userId: authenticated.userId,
          sessionId: authenticated.sessionId,
          authentication: authenticated.authentication,
        },
      },
    };
  },
  open(peer) {
    const expected = readIdentity(peer.context.websocketIdentity);
    if (!expected) {
      peer.close(1008, "WebSocket authentication required");
      return;
    }
    const slot = acquireWebSocketSlot(expected.userId);
    if (slot === null) {
      peer.close(1013, "WebSocket connection limit reached");
      return;
    }
    peer.context.websocketSlot = slot;
    queueFor(peer);
  },
  async message(peer, message) {
    const expected = readIdentity(peer.context.websocketIdentity);
    if (!expected || readSlot(peer.context.websocketSlot) === null) {
      peer.close(1008, "WebSocket authentication required");
      return;
    }
    const bytes = messageByteLength(message);
    if (bytes > MAX_RPC_MESSAGE_BYTES) {
      peer.close(1009, "WebSocket message is too large");
      return;
    }
    const state = queueFor(peer);
    if (
      state.closed ||
      state.messages >= MAX_RPC_QUEUE_MESSAGES ||
      state.bytes + bytes > MAX_RPC_QUEUE_BYTES
    ) {
      state.closed = true;
      peer.close(1013, "WebSocket request queue overloaded");
      return;
    }
    state.messages += 1;
    state.bytes += bytes;
    const work = state.tail
      .then(async () => {
        if (state.closed) return;
        const authenticated = await authenticateWebSocket(peer.request.headers, expected);
        if (!authenticated) {
          state.closed = true;
          peer.close(1008, "WebSocket session is no longer authorized");
          return;
        }
        await handler.message(peer, message, { context: authenticated.context });
      })
      .catch(() => {
        state.closed = true;
        peer.close(1011, "WebSocket request failed");
      })
      .finally(() => {
        state.messages -= 1;
        state.bytes -= bytes;
      });
    state.tail = work;
    await work;
  },
  close(peer) {
    const state = rpcQueues.get(peer);
    if (state) state.closed = true;
    rpcQueues.delete(peer);
    const slot = readSlot(peer.context.websocketSlot);
    if (slot !== null) releaseWebSocketSlot(slot);
    peer.context.websocketSlot = undefined;
    handler.close(peer);
  },
});

export default defineWebSocketHandler(applicationWebSocketHooks);
`,
    ),
    file(
      `${root}server/routes/api/ws.ts`,
      `export { default } from "../../websocket-handler";
`,
    ),
  ];
}

function nextWebSocketFiles(mode: "monorepo" | "single"): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  const apiImport = mode === "monorepo" ? "@repo/api" : "@/server/api";
  const outboxImport =
    mode === "monorepo" ? "@repo/api/messaging-outbox" : "@/server/api/messaging-outbox";
  const cleanupImport =
    mode === "monorepo" ? "@repo/api/workers/storage/cleanup" : "@/server/workers/storage/cleanup";
  return [
    file(`${root}src/server/transport/websocket-auth.ts`, websocketAuthContent(mode)),
    file(
      `${root}src/app/api/ws/route.ts`,
      `import { trustedWebSocketOrigin } from "@/server/transport/websocket-auth";

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }
  if (!trustedWebSocketOrigin(request.headers)) {
    return new Response("WebSocket origin denied", { status: 403 });
  }
  return new Response(
    "WebSocket upgrades require the generated custom server. Run bun run dev in development or bun run start in production.",
    { status: 501 },
  );
}
`,
    ),
    file(
      mode === "single" ? "next-server.ts" : `${root}server.ts`,
      `import { IncomingMessage, Server, type IncomingHttpHeaders } from "node:http";
import { Duplex } from "node:stream";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { messagingWebSocketRouter } from "${apiImport}";
import { startMessagingOutboxWorker } from "${outboxImport}";
import { runPostgresStorageCleanupWorker } from "${cleanupImport}";
import {
  acquireWebSocketSlot,
  authenticateWebSocket,
  hasNativeWebSocketTicket,
  releaseWebSocketSlot,
  trustedWebSocketOrigin,
  type WebSocketIdentity,
} from "./src/server/transport/websocket-auth";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOST ?? "0.0.0.0";

${nextUpgradeDispatcherContent()}

const server = new ApplicationHttpServer(async (request, response) => {
  await handle(request, response);
});
// Upgrade admission must work before Next installs its listener on the first HTTP request.
server.on("upgrade", () => {});
const app = next({
  dev: process.env.NODE_ENV !== "production",
  // Bun cannot resolve new Turbopack external-package links after a cold start.
  webpack: Boolean(process.versions.bun),
  hostname,
  port,
  httpServer: server,
  // The launcher passes the source app root because this bundle lives under .ghostinit/runtime.
  dir: process.argv[2] ?? dirname(fileURLToPath(import.meta.url)),
});
await app.prepare();
const messagingOutbox = startMessagingOutboxWorker();
const storageCleanupAbort = new AbortController();
const storageCleanupTask = runPostgresStorageCleanupWorker(storageCleanupAbort.signal).catch(
  () => {
    console.error(JSON.stringify({ scope: "storage-cleanup", event: "worker-stopped" }));
  },
);
const handle = app.getRequestHandler();
const { RPCHandler } = await import("@orpc/server/websocket");
const rpcHandler = new RPCHandler(messagingWebSocketRouter);
const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024;
const MAX_RPC_QUEUE_MESSAGES = 32;
const MAX_RPC_QUEUE_BYTES = 256 * 1024;
const webSocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_WEBSOCKET_PAYLOAD_BYTES,
  perMessageDeflate: false,
});

interface SocketQueueState {
  tail: Promise<void>;
  messages: number;
  bytes: number;
  closed: boolean;
}

function toWebHeaders(input: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (typeof value === "string") {
      headers.set(name, value);
    }
  }
  return headers;
}

function rejectUpgrade(
  socket: { end(data: string, callback: () => void): unknown; destroy(): unknown },
  status: number,
  text: string,
): void {
  socket.end("HTTP/1.1 " + status + " " + text + "\\r\\nConnection: close\\r\\n\\r\\n", () => socket.destroy());
}

async function currentIdentity(
  headers: Headers,
  expected?: WebSocketIdentity,
) {
  return await authenticateWebSocket(headers, expected);
}

function rawDataByteLength(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.byteLength, 0);
  return data.byteLength;
}

function rpcMessageData(data: RawData, isBinary: boolean): string | ArrayBuffer {
  if (Array.isArray(data)) {
    const joined = Buffer.concat(data);
    return isBinary ? Uint8Array.from(joined).buffer : joined.toString();
  }
  if (data instanceof ArrayBuffer) {
    return isBinary ? data.slice(0) : new TextDecoder().decode(data);
  }
  const copied = Uint8Array.from(data);
  return isBinary ? copied.buffer : new TextDecoder().decode(copied);
}

function registerRpcSocket(
  socket: WebSocket,
  headers: Headers,
  expected: WebSocketIdentity,
): void {
  const queue: SocketQueueState = {
    tail: Promise.resolve(),
    messages: 0,
    bytes: 0,
    closed: false,
  };
  socket.on("message", (data, isBinary) => {
    const bytes = rawDataByteLength(data);
    if (bytes > MAX_WEBSOCKET_PAYLOAD_BYTES) {
      queue.closed = true;
      socket.close(1009, "WebSocket message is too large");
      return;
    }
    if (
      queue.closed ||
      queue.messages >= MAX_RPC_QUEUE_MESSAGES ||
      queue.bytes + bytes > MAX_RPC_QUEUE_BYTES
    ) {
      queue.closed = true;
      socket.close(1013, "WebSocket request queue overloaded");
      return;
    }
    const message = rpcMessageData(data, isBinary);
    queue.messages += 1;
    queue.bytes += bytes;
    const work = queue.tail
      .then(async () => {
        if (queue.closed) return;
        const current = await currentIdentity(headers, expected);
        if (!current) {
          queue.closed = true;
          socket.close(1008, "WebSocket session is no longer authorized");
          return;
        }
        await rpcHandler.message(socket, message, {
          context: current.context,
        });
      })
      .catch(() => {
        queue.closed = true;
        socket.close(1011, "WebSocket request failed");
      })
      .finally(() => {
        queue.messages -= 1;
        queue.bytes -= bytes;
      });
    queue.tail = work;
  });
  socket.on("close", () => {
    queue.closed = true;
    rpcHandler.close(socket);
  });
}

async function upgradeRequest(
  req: import("node:http").IncomingMessage,
  socket: import("node:stream").Duplex,
  head: Buffer,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "localhost"));
  if (url.pathname !== "/api/ws") {
    socket.destroy();
    return;
  }
  const headers = toWebHeaders(req.headers);
  if (!hasNativeWebSocketTicket(headers) && !trustedWebSocketOrigin(headers)) {
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }
  const authenticated = await currentIdentity(headers);
  if (!authenticated) {
    rejectUpgrade(socket, 401, "Unauthorized");
    return;
  }
  const expected = {
    userId: authenticated.userId,
    sessionId: authenticated.sessionId,
    authentication: authenticated.authentication,
  };
  const slot = acquireWebSocketSlot(expected.userId);
  if (slot === null) {
    rejectUpgrade(socket, 429, "Too Many Requests");
    return;
  }
  let upgraded = false;
  try {
    webSocketServer.handleUpgrade(req, socket, head, (webSocket) => {
      upgraded = true;
      webSocket.once("close", () => releaseWebSocketSlot(slot));
      registerRpcSocket(webSocket, headers, expected);
    });
  } finally {
    if (!upgraded) releaseWebSocketSlot(slot);
  }
}

server.once("close", () => storageCleanupAbort.abort());
server.listen(port, hostname, () => {
  const publicHost = hostname === "0.0.0.0" ? "localhost" : hostname.includes(":") ? "[" + hostname + "]" : hostname;
  console.log("> Ready on http://" + publicHost + ":" + port + " (oRPC WebSocket /api/ws)");
});

let shutdownPromise: Promise<void> | undefined;
function shutdown(): Promise<void> {
  shutdownPromise ??= (async () => {
    storageCleanupAbort.abort();
    await Promise.all([messagingOutbox.stop(), storageCleanupTask]);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  })();
  return shutdownPromise;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown().catch(() => {
      console.error(JSON.stringify({ scope: "web-server", event: "shutdown-failed" }));
      process.exitCode = 1;
    });
  });
}
`,
    ),
  ];
}
export function messagingFilesFor(
  framework: string,
  database: string,
  apps: string[],
  mode: "monorepo" | "single" = "monorepo",
  hasI18n = false,
): TemplateFile[] {
  const hasWeb = apps.includes("web");
  const hasMobile = apps.includes("mobile");
  const hasDesktop = apps.includes("desktop");
  const isConvex = database === "convex";
  const isTanstack = framework === "tanstack-start";
  const files: TemplateFile[] = [];
  if (!hasWeb && !hasMobile && !hasDesktop) return files;
  if (isConvex) {
    if (hasWeb) {
      files.push(
        ...(isTanstack ? messagingConvexTanstackFiles(mode) : messagingConvexNextFiles(mode)),
      );
      files.push(...messagingConvexAttachmentRouteFiles(isTanstack ? "tanstack" : "next", mode));
    }
    if (hasMobile) {
      files.push(...nativeExpoMessagingFiles("convex", mode, hasI18n));
    }
    if (hasDesktop) {
      files.push(...nativeDesktopMessagingFiles("convex", mode, hasI18n));
    }
    return files;
  }
  // Postgres (oRPC+WS)
  if (hasWeb) {
    if (isTanstack) files.push(...messagingTanstackFiles(mode));
    else files.push(...messagingNextFiles(mode));
  }
  if (hasMobile) files.push(...nativeExpoMessagingFiles("postgres", mode, hasI18n));
  if (hasDesktop) files.push(...nativeDesktopMessagingFiles("postgres", mode, hasI18n));

  if (isTanstack && hasWeb) files.push(...tanstackWebSocketFiles(mode));
  else if (hasWeb) files.push(...nextWebSocketFiles(mode));
  if (hasWeb) {
    files.push(...messagingAttachmentRouteFiles(isTanstack ? "tanstack" : "next", mode));
  }
  files.push(file("data/uploads/.gitkeep", ""));
  return files;
}
/** Pure reference used by generation tests and mirrored by emitted WS handshakes. */
export function isTrustedWebSocketOrigin(
  origin: string | null | undefined,
  configuredUrls: readonly (string | undefined)[],
): boolean {
  if (!origin) return false;
  const allowed = new Set<string>();
  for (const value of configuredUrls) {
    if (!value) continue;
    try {
      allowed.add(new URL(value).origin);
    } catch {
      // Invalid configured URLs never widen the allowlist.
    }
  }
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
