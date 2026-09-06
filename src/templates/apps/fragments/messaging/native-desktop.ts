// @allow-long 610: Electron messaging adapters keep Postgres polling and Convex reactivity explicit
import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import {
  realtimeDesktopClientContent,
  realtimeUnsupportedDesktopClientContent,
} from "../realtime/index.js";

type MessagingDatabase = "postgres" | "convex";
type MessagingMode = "monorepo" | "single";

function desktopRoot(mode: MessagingMode): string {
  return mode === "monorepo" ? "apps/desktop/src/renderer/" : "src/renderer/";
}

function attachmentHelpers(mode: MessagingMode, isConvex = false): string {
  const fetchImport =
    mode === "monorepo" ? "@/adapters/desktop-fetch" : "@/renderer/adapters/desktop-fetch";
  return `import { desktopBridgeFetch } from "${fetchImport}";

function desktopMessagingApiUrl(path: string): string {
  let base: URL;
  try {
    const configured = window.desktopBridge.apiUrl;
    base = new URL(configured.endsWith("/") ? configured : configured + "/");
  } catch {
    throw new Error("The desktop bridge must expose a valid HTTP(S) API URL");
  }
  if ((base.protocol !== "https:" && base.protocol !== "http:") || base.username || base.password) {
    throw new Error("The desktop bridge must expose a trusted HTTP(S) API URL");
  }
  const attachmentBase = new URL("api/messaging/attachments", base);
  const attachmentPath = attachmentBase.pathname.endsWith("/")
    ? attachmentBase.pathname.slice(0, -1)
    : attachmentBase.pathname;
  const url = new URL(path.replace(new RegExp("^/+"), ""), base);
  if (
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    (url.pathname !== attachmentPath && !url.pathname.startsWith(attachmentPath + "/"))
  ) {
    throw new Error("Messaging attachments must use the configured API origin");
  }
  return url.toString();
}

export async function uploadDesktopAttachment(conversationId: string, source: File): Promise<string> {
  const body = new FormData();
  body.append("conversationId", conversationId);
  body.append("file", source);
  const response = await desktopBridgeFetch(desktopMessagingApiUrl("/api/messaging/attachments"), {
    method: "POST",
    credentials: "include",
    headers: { "X-Ghostinit-Conversation-Id": conversationId },
    body,
  });
  if (!response.ok) throw new Error("Attachment upload failed with status " + response.status);
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || typeof Reflect.get(value, "attachmentId") !== "string") {
    throw new Error("Attachment upload returned no attachment id");
  }
  return String(Reflect.get(value, "attachmentId"));
}

export async function downloadDesktopAttachment(url: string, originalName: string): Promise<void> {
${
  isConvex
    ? `  const target = new URL(url, window.desktopBridge.apiUrl);
  let response: Response;
  if (target.origin === window.desktopBridge.convexUrl && target.pathname.startsWith("/api/storage/")) {
    const result = await window.desktopBridge.convexStorageFetch(url);
    response = new Response(new Uint8Array(result.body).buffer, result);
  } else {
    response = await desktopBridgeFetch(desktopMessagingApiUrl(url), { credentials: "include" });
  }`
    : '  const response = await desktopBridgeFetch(desktopMessagingApiUrl(url), { credentials: "include" });'
}
  if (!response.ok) throw new Error("Attachment download failed with status " + response.status);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128) || "attachment";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
`;
}

function desktopPostgresAdapterContent(mode: MessagingMode): string {
  const realtimeImport = mode === "monorepo" ? "@/lib/realtime" : "@/renderer/lib/realtime";
  const orpcImport = mode === "monorepo" ? "@/lib/orpc" : "@/renderer/lib/orpc";
  return `import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpcClient } from "${orpcImport}";
import { subscribeRealtime, sendTypingRealtime, type MessagingRealtimeEvent } from "${realtimeImport}";
${attachmentHelpers(mode)}

export type ConversationId = string;
export type DesktopMessagingTransport = "realtime" | "polling";

function createClientMessageKey(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

export function useDesktopMessaging(conversationId: ConversationId | null) {
  const queryClient = useQueryClient();
  const pendingSend = React.useRef<{ signature: string; clientMessageKey: string } | null>(null);
  const [transport, setTransport] = React.useState<DesktopMessagingTransport>("polling");
  const [typingUsers, setTypingUsers] = React.useState<Set<string>>(() => new Set());
  const conversations = useQuery({ queryKey: ["messaging", "conversations"], refetchInterval: transport === "polling" ? 5_000 : false, queryFn: async () => (await orpcClient.messaging.listConversations()).conversations });
  const messages = useQuery({ queryKey: ["messaging", "messages", conversationId], enabled: Boolean(conversationId), refetchInterval: transport === "polling" ? 5_000 : false, queryFn: async () => conversationId ? (await orpcClient.messaging.listMessages({ conversationId, limit: 50 })).messages : [] });
  React.useEffect(() => {
    if (!conversationId) return;
    try {
      const unsubscribe = subscribeRealtime(conversationId, (event: MessagingRealtimeEvent) => {
        if (event.type === "message" && event.conversationId === conversationId) {
          void queryClient.invalidateQueries({ queryKey: ["messaging", "messages", conversationId] });
          void queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] });
        }
        if (event.type === "typing" && event.conversationId === conversationId) {
          setTypingUsers((current) => {
            const next = new Set(current);
            if (event.isTyping) next.add(event.userId); else next.delete(event.userId);
            return next;
          });
        }
      }, (connected) => {
        setTransport(connected ? "realtime" : "polling");
        if (!connected) setTypingUsers(new Set());
      });
      return unsubscribe;
    } catch {
      setTransport("polling");
      setTypingUsers(new Set());
      return undefined;
    }
  }, [conversationId, queryClient]);
  const startMutation = useMutation({ mutationFn: async (peerUserId: string) => await orpcClient.messaging.getOrCreateConversation({ peerUserId }) });
  const sendMutation = useMutation({
    mutationFn: async (input: { conversationId: string; body: string; clientMessageKey: string; attachment?: File | null }) => {
      const attachmentIds = input.attachment ? [await uploadDesktopAttachment(input.conversationId, input.attachment)] : undefined;
      await orpcClient.messaging.sendMessage({ conversationId: input.conversationId, clientMessageKey: input.clientMessageKey, ...(input.body ? { body: input.body } : {}), ...(attachmentIds ? { attachmentIds } : {}) });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messaging", "messages", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] }),
      ]);
    },
  });
  return {
    conversations: conversations.data ?? [], conversationsPending: conversations.isPending,
    messages: messages.data ?? [], messagesPending: messages.isPending,
    transport, typing: typingUsers.size > 0, pending: startMutation.isPending || sendMutation.isPending,
    async startConversation(peerUserId: string): Promise<string> {
      const conversation = await startMutation.mutateAsync(peerUserId);
      await queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] });
      return conversation.id;
    },
    async sendMessage(body: string, attachment?: File | null): Promise<void> {
      if (!conversationId) throw new Error("Select a conversation first");
      const signature = JSON.stringify([
        conversationId,
        body,
        attachment
          ? [attachment.name, attachment.size, attachment.type, attachment.lastModified]
          : null,
      ]);
      const attempt = pendingSend.current?.signature === signature
        ? pendingSend.current
        : { signature, clientMessageKey: createClientMessageKey() };
      pendingSend.current = attempt;
      await sendMutation.mutateAsync({
        conversationId,
        body,
        clientMessageKey: attempt.clientMessageKey,
        attachment,
      });
      if (pendingSend.current?.clientMessageKey === attempt.clientMessageKey) pendingSend.current = null;
      if (transport === "realtime") sendTypingRealtime(conversationId, false);
    },
    sendTyping(isTyping: boolean): void {
      if (conversationId && transport === "realtime") sendTypingRealtime(conversationId, isTyping);
    },
    async refresh(): Promise<void> { await Promise.all([conversations.refetch(), messages.refetch()]); },
  };
}
`;
}

function convexGeneratedRoot(mode: MessagingMode): string {
  return mode === "monorepo"
    ? "../../../../../../convex/_generated"
    : "../../../../convex/_generated";
}

function desktopConvexAdapterContent(mode: MessagingMode): string {
  const generated = convexGeneratedRoot(mode);
  return `import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { z } from "zod";
import { api } from "${generated}/api";
import type { Id } from "${generated}/dataModel";
${attachmentHelpers(mode, true)}

export type ConversationId = Id<"conversations">;
export type DesktopMessagingTransport = "native";

const conversationIdSchema = z.custom<ConversationId>(
  (value) => typeof value === "string" && value.length > 0,
  "Invalid conversation id",
);
const conversationListSchema = z.array(z.object({ _id: conversationIdSchema }).passthrough());
const attachmentSchema = z.object({ id: z.string(), mimeType: z.string(), originalName: z.string(), url: z.string() });
const messagePageSchema = z.object({
  messages: z.array(z.object({ _id: z.string(), senderId: z.string(), body: z.string().optional(), createdAt: z.number(), attachments: z.array(attachmentSchema) }).passthrough()),
  nextCursor: z.string().nullable(),
});
const typingListSchema = z.array(z.object({ userId: z.string() }));

export function useDesktopMessaging(conversationId: ConversationId | null) {
  const activeMutation = React.useRef<
    | { kind: "start"; signature: string; promise: Promise<ConversationId> }
    | { kind: "send"; signature: string; promise: Promise<void> }
    | null
  >(null);
  const [pending, setPending] = React.useState(false);
  const rawConversations: unknown = useQuery(api.messaging.listConversations);
  const rawMessages: unknown = useQuery(api.messaging.listMessages, conversationId ? { conversationId, limit: 50 } : "skip");
  const rawTyping: unknown = useQuery(api.messaging.listTyping, conversationId ? { conversationId } : "skip");
  const conversations = rawConversations === undefined ? undefined : conversationListSchema.parse(rawConversations);
  const messages = rawMessages === undefined ? undefined : messagePageSchema.parse(rawMessages);
  const typing = rawTyping === undefined ? undefined : typingListSchema.parse(rawTyping);
  const startMutation = useMutation(api.messaging.getOrCreateConversation);
  const sendMutation = useMutation(api.messaging.sendMessage);
  const typingMutation = useMutation(api.messaging.sendTyping);
  return {
    conversations: (conversations ?? []).map((conversation) => ({ ...conversation, id: conversation._id })), conversationsPending: conversations === undefined,
    messages: (messages?.messages ?? []).map((message) => ({ ...message, id: message._id })), messagesPending: messages === undefined,
    transport: "native" as const, typing: (typing?.length ?? 0) > 0, pending,
    async startConversation(peerUserId: string): Promise<ConversationId> {
      const active = activeMutation.current;
      if (active) {
        if (active.kind === "start" && active.signature === peerUserId) return await active.promise;
        throw new Error("Another messaging action is in progress");
      }
      setPending(true);
      const promise = (async () => (await startMutation({ peerUserId }))._id)();
      activeMutation.current = { kind: "start", signature: peerUserId, promise };
      try { return await promise; }
      finally { if (activeMutation.current?.promise === promise) { activeMutation.current = null; setPending(false); } }
    },
    async sendMessage(body: string, attachment?: File | null): Promise<void> {
      if (!conversationId) throw new Error("Select a conversation first");
      const signature = JSON.stringify([conversationId, body, attachment ? [attachment.name, attachment.size, attachment.type, attachment.lastModified] : null]);
      const active = activeMutation.current;
      if (active) {
        if (active.kind === "send" && active.signature === signature) return await active.promise;
        throw new Error("Another messaging action is in progress");
      }
      setPending(true);
      const promise = (async () => {
        const attachmentIds = attachment
          ? [await uploadDesktopAttachment(String(conversationId), attachment) as Id<"messageAttachments">]
          : undefined;
        await sendMutation({ conversationId, ...(body ? { body } : {}), ...(attachmentIds ? { attachmentIds } : {}) });
        // Typing is advisory; a failed reset must not turn a confirmed send into a retry.
        await typingMutation({ conversationId, isTyping: false }).catch(() => undefined);
      })();
      activeMutation.current = { kind: "send", signature, promise };
      try { await promise; }
      finally { if (activeMutation.current?.promise === promise) { activeMutation.current = null; setPending(false); } }
    },
    sendTyping(isTyping: boolean): void {
      if (conversationId) void typingMutation({ conversationId, isTyping }).catch(() => undefined);
    },
    async refresh(): Promise<void> { /* Convex queries are live subscriptions. */ },
  };
}
`;
}

function desktopMessagesRouteContent(
  database: MessagingDatabase,
  mode: MessagingMode,
  hasI18n = false,
): string {
  const adapter =
    mode === "monorepo"
      ? `@/adapters/messaging/${database}`
      : `@/renderer/adapters/messaging/${database}`;
  const i18n = nativeI18nTemplate(hasI18n, "messaging", nativeI18nImportPath("desktop", mode));
  const operationError = hasI18n
    ? i18n.value("operationError", "Messaging operation failed")
    : 'cause instanceof Error ? cause.message : "Messaging operation failed"';
  const catchParameter = hasI18n ? "" : " (cause)";
  const threadTitle = hasI18n
    ? 't("thread", { id: String(selected).slice(0, 10) })'
    : '"Thread " + String(selected).slice(0, 10)';
  const transportDescription =
    database === "convex"
      ? `{${i18n.value("liveDescription", "Messages and typing update live.")}}`
      : `{messaging.transport === "polling" ? ${i18n.value("pollingDescription", "Refreshing every five seconds while the secure realtime connection is unavailable.")} : ${i18n.value("liveDescription", "Messages and typing update live.")}}`;
  return `import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Attachment, AttachmentActions, AttachmentContent, AttachmentGroup, AttachmentTitle, Bubble, BubbleContent, Marker, MarkerContent, Message, MessageContent, MessageHeader, MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/chat";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { downloadDesktopAttachment, useDesktopMessaging, type ConversationId } from "${adapter}";
${i18n.importLine}

export const Route = createFileRoute("/messages")({ component: MessagesPage });

function MessagesPage(): React.JSX.Element {
${i18n.hookLine}
  const [selected, setSelected] = React.useState<ConversationId | null>(null);
  const [peerId, setPeerId] = React.useState("");
  const [body, setBody] = React.useState("");
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const messaging = useDesktopMessaging(selected);
  async function run(action: () => Promise<void>): Promise<void> { setError(null); try { await action(); } catch${catchParameter} { setError(${operationError}); } }
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">${i18n.child("privateChannel", "Private channel")}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">${i18n.child("title", "Messages")}</h1><p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">${i18n.child("desktopDescription", "Direct conversations with authenticated attachment transfer.")}</p></div>
    <Alert><AlertTitle>${database === "convex" ? i18n.child("nativeRealtime", "Native realtime") : i18n.child("securePolling", "Realtime with polling fallback")}</AlertTitle><AlertDescription><p>${transportDescription}</p><Button size="sm" variant="outline" onClick={() => void messaging.refresh()}>${i18n.child("refresh", "Refresh")}</Button></AlertDescription></Alert>
    {error ? <Alert variant="destructive"><AlertTitle>${i18n.child("operationError", "Messaging operation failed")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]"><Card><CardHeader><CardTitle>${i18n.child("conversations", "Conversations")}</CardTitle><CardDescription>${i18n.child("desktopConversationsDescription", "Start a direct thread by user ID.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex gap-2"><Input value={peerId} onChange={(event) => setPeerId(event.target.value)} placeholder={${i18n.value("peerUserId", "Peer user ID")}} /><Button disabled={messaging.pending || !peerId.trim()} onClick={() => void run(async () => { const id = await messaging.startConversation(peerId.trim()); setSelected(id); setPeerId(""); })}>${i18n.child("start", "Start")}</Button></div>{messaging.conversations.map((conversation) => <Button type="button" variant={selected === conversation.id ? "default" : "outline"} key={String(conversation.id)} onClick={() => setSelected(conversation.id)} className="w-full justify-start font-mono text-xs">{String(conversation.id).slice(0, 12)}</Button>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>{selected ? ${threadTitle} : ${i18n.value("selectConversation", "Select a conversation")}}</CardTitle><CardDescription>${i18n.child("verifiedParticipants", "Only verified participants can read this thread.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><MessageScrollerProvider autoScroll><MessageScroller className="max-h-[420px]"><MessageScrollerViewport><MessageScrollerContent role="log" aria-live="polite">{messaging.messages.length === 0 ? <Empty><EmptyHeader><EmptyTitle>${i18n.child("noMessages", "No messages yet")}</EmptyTitle><EmptyDescription>${i18n.child("verifiedParticipants", "Only verified participants can read this thread.")}</EmptyDescription></EmptyHeader></Empty> : messaging.messages.map((message) => <MessageScrollerItem key={String(message.id)} messageId={String(message.id)}><Message align="start"><MessageContent className="text-start"><MessageHeader>{String(message.senderId).slice(0, 10)}</MessageHeader>{message.body ? <Bubble variant="muted"><BubbleContent>{message.body}</BubbleContent></Bubble> : null}{message.attachments?.length ? <AttachmentGroup>{message.attachments.map((item) => <Attachment state="done" key={String(item.id ?? item.url)}><AttachmentContent><AttachmentTitle>{item.originalName ?? ${i18n.value("downloadAttachment", "Download attachment")}}</AttachmentTitle></AttachmentContent><AttachmentActions><Button type="button" variant="ghost" size="sm" onClick={() => void run(() => downloadDesktopAttachment(item.url, item.originalName ?? "attachment"))}>${i18n.child("downloadAttachment", "Download attachment")}</Button></AttachmentActions></Attachment>)}</AttachmentGroup> : null}</MessageContent></Message></MessageScrollerItem>)}{messaging.typing ? <MessageScrollerItem messageId="typing"><Marker><MarkerContent className="shimmer">${i18n.child("typing", "Someone is typing…")}</MarkerContent></Marker></MessageScrollerItem> : null}</MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider><Input value={body} maxLength={4000} onChange={(event) => { setBody(event.target.value); messaging.sendTyping(event.target.value.length > 0); }} placeholder={${i18n.value("messagePlaceholder", "Type a message…")}} /><div className="flex items-center gap-2"><Input type="file" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} /><Button disabled={!selected || messaging.pending || (!body.trim() && !attachment)} onClick={() => void run(async () => { await messaging.sendMessage(body.trim(), attachment); setBody(""); setAttachment(null); })}>{messaging.pending ? ${i18n.value("sending", "Sending…")} : ${i18n.value("send", "Send")}}</Button></div></CardContent></Card></div>
  </main>;
}
`;
}

export function nativeDesktopMessagingFiles(
  database: MessagingDatabase,
  mode: MessagingMode,
  hasI18n = false,
): TemplateFile[] {
  const root = desktopRoot(mode);
  const files = [
    file(
      `${root}adapters/messaging/${database}.ts`,
      database === "convex"
        ? desktopConvexAdapterContent(mode)
        : desktopPostgresAdapterContent(mode),
    ),
    file(`${root}routes/messages.tsx`, desktopMessagesRouteContent(database, mode, hasI18n)),
  ];
  if (database === "postgres") {
    const realtime =
      mode === "single"
        ? realtimeUnsupportedDesktopClientContent()
        : realtimeDesktopClientContent();
    files.push(file(`${root}lib/realtime.ts`, realtime));
  }
  return files;
}

export { desktopMessagesRouteContent };
export { desktopConvexAdapterContent, desktopPostgresAdapterContent };
