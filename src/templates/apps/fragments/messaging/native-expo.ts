// @allow-long 680: Expo messaging adapters encode two distinct data transports and one native surface
import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import {
  realtimeExpoClientContent,
  realtimeUnsupportedExpoClientContent,
} from "../realtime/index.js";

type MessagingDatabase = "postgres" | "convex";
type MessagingMode = "monorepo" | "single";

function expoRoot(mode: MessagingMode): string {
  return mode === "monorepo" ? "apps/mobile/" : "";
}

function attachmentHelpers(mode: MessagingMode, database: MessagingDatabase): string {
  const envImport = mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo";
  return `import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { authClient } from "@/lib/auth-client";
import { env } from "${envImport}";

export interface NativeAttachmentDraft {
  uri: string;
  name: string;
  mimeType: string;
}

function apiUrl(path: string): string {
  const base = env.EXPO_PUBLIC_API_URL || env.EXPO_PUBLIC_APP_URL;
  if (!base) throw new Error("Configure EXPO_PUBLIC_API_URL before using messaging attachments");
  return new URL(path, base.endsWith("/") ? base : base + "/").toString();
}

function safeFileName(value: string): string {
  const leaf = value.replaceAll("\\\\", "/").split("/").at(-1) ?? "attachment";
  return (leaf.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\\.+/, "") || "attachment").slice(0, 128);
}

export async function pickNativeAttachment(): Promise<NativeAttachmentDraft | null> {
  if (Platform.OS === "web") throw new Error("Use the web messaging surface to attach browser files");
  const picked = await File.pickFileAsync({ multipleFiles: false });
  if (picked.canceled) return null;
  const selected = picked.result;
  if (!selected.uri) throw new Error("The selected attachment has no file URI");
  return {
    uri: selected.uri,
    name: safeFileName(selected.name || "attachment"),
    mimeType: selected.type || "application/octet-stream",
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  if (Platform.OS === "web") return {};
  const cookie = await authClient.getCookie();
  return cookie ? { cookie } : {};
}

function nativeAttachmentRequest(value: string): { url: string; authenticated: boolean } {
  const backend = new URL(apiUrl("/"));
  const url = new URL(value, backend);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new Error("Invalid attachment URL");
  }
  if (url.origin === backend.origin && /^\\/api\\/messaging\\/attachments\\/[^/]+$/.test(url.pathname)) {
    return { url: url.toString(), authenticated: true };
  }
  ${
    database === "convex"
      ? `const configuredConvex = env.EXPO_PUBLIC_CONVEX_URL;
  if (configuredConvex) {
    const convex = new URL(configuredConvex);
    if (!convex.username && !convex.password && url.origin === convex.origin && /^\\/api\\/storage\\/[^/]+$/.test(url.pathname)) {
      // Convex storage URLs grant bearer access; never send application cookies.
      return { url: url.toString(), authenticated: false };
    }
  }`
      : ""
  }
  throw new Error("Attachment URL is outside the configured messaging storage boundary");
}

async function fetchNativeAttachment(value: string, signal?: AbortSignal): Promise<Response> {
  const request = nativeAttachmentRequest(value);
  return await fetch(request.url, {
    credentials: request.authenticated ? "include" : "omit",
    headers: request.authenticated ? await authHeaders() : {},
    redirect: "error",
    signal,
  });
}

export async function loadNativeAttachmentPreview(value: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw new Error("Attachment preview was cancelled");
  const response = await fetchNativeAttachment(value, signal);
  if (!response.ok) throw new Error("Attachment preview failed");
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!mimeType || !new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]).has(mimeType)) {
    throw new Error("Attachment is not a supported preview image");
  }
  const maximumBytes = 10 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maximumBytes) throw new Error("Attachment preview is too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (signal.aborted) throw new Error("Attachment preview was cancelled");
  if (bytes.byteLength > maximumBytes) throw new Error("Attachment preview is too large");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return "data:" + mimeType + ";base64," + btoa(binary);
}

export async function uploadNativeAttachment(
  conversationId: string,
  draft: NativeAttachmentDraft,
): Promise<string> {
  const body = new FormData();
  body.append("conversationId", conversationId);
  const localResponse = await fetch(draft.uri);
  if (!localResponse.ok) throw new Error("Unable to read the selected attachment");
  body.append("file", await localResponse.blob(), draft.name);
  const response = await fetch(apiUrl("api/messaging/attachments"), {
    method: "POST",
    credentials: "include",
    headers: { "X-Ghostinit-Conversation-Id": conversationId, ...(await authHeaders()) },
    body,
  });
  if (!response.ok) throw new Error("Attachment upload failed with status " + response.status);
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || typeof Reflect.get(value, "attachmentId") !== "string") {
    throw new Error("Attachment upload returned no attachment id");
  }
  return String(Reflect.get(value, "attachmentId"));
}

export async function downloadNativeAttachment(url: string, originalName: string): Promise<void> {
  const response = await fetchNativeAttachment(url);
  if (!response.ok) throw new Error("Attachment download failed with status " + response.status);
  const output = new File(Paths.cache, safeFileName(originalName));
  output.write(new Uint8Array(await response.arrayBuffer()));
  if (await Sharing.isAvailableAsync()) {
    const mimeType = response.headers.get("content-type");
    await Sharing.shareAsync(output.uri, mimeType ? { mimeType } : {});
  }
}
`;
}

function postgresAdapterContent(mode: MessagingMode): string {
  return `"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpcClient } from "@/lib/orpc";
import { subscribeRealtime, sendTypingRealtime, type MessagingRealtimeEvent } from "@/lib/realtime";
${attachmentHelpers(mode, "postgres")}

export type NativeMessagingTransport = "realtime" | "polling";
export type ConversationId = string;

function createClientMessageKey(): string {
  const cryptoValue: unknown = Reflect.get(globalThis, "crypto");
  const randomUUID = typeof cryptoValue === "object" && cryptoValue !== null ? Reflect.get(cryptoValue, "randomUUID") : null;
  if (typeof randomUUID === "function") {
    const value: unknown = Reflect.apply(randomUUID, cryptoValue, []);
    if (typeof value === "string") return value;
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

export function useNativeMessaging(conversationId: ConversationId | null) {
  const queryClient = useQueryClient();
  const pendingSend = React.useRef<{ signature: string; clientMessageKey: string } | null>(null);
  const [transport, setTransport] = React.useState<NativeMessagingTransport>("polling");
  const [typingUsers, setTypingUsers] = React.useState<Set<string>>(() => new Set());
  const conversations = useQuery({
    queryKey: ["messaging", "conversations"],
    refetchInterval: transport === "polling" ? 5_000 : false,
    queryFn: async () => (await orpcClient.messaging.listConversations()).conversations,
  });
  const messages = useQuery({
    queryKey: ["messaging", "messages", conversationId],
    enabled: Boolean(conversationId),
    refetchInterval: transport === "polling" ? 5_000 : false,
    queryFn: async () => conversationId
      ? (await orpcClient.messaging.listMessages({ conversationId, limit: 50 })).messages
      : [],
  });
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
    mutationFn: async (input: { conversationId: string; body: string; clientMessageKey: string; attachment?: NativeAttachmentDraft | null }) => {
      const attachmentIds = input.attachment
        ? [await uploadNativeAttachment(input.conversationId, input.attachment)]
        : undefined;
      return await orpcClient.messaging.sendMessage({
        conversationId: input.conversationId,
        clientMessageKey: input.clientMessageKey,
        ...(input.body ? { body: input.body } : {}),
        ...(attachmentIds ? { attachmentIds } : {}),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messaging", "messages", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] }),
      ]);
    },
  });
  return {
    conversations: conversations.data ?? [],
    conversationsPending: conversations.isPending,
    conversationsError: conversations.error,
    conversationsFetching: conversations.isFetching,
    async retryConversations(): Promise<void> { await conversations.refetch(); },
    messages: messages.data ?? [],
    messagesPending: messages.isPending,
    messagesError: messages.error,
    messagesFetching: messages.isFetching,
    async retryMessages(): Promise<void> { if (conversationId) await messages.refetch(); },
    transport,
    typing: typingUsers.size > 0,
    pending: startMutation.isPending || sendMutation.isPending,
    async startConversation(peerUserId: string): Promise<string> {
      const conversation = await startMutation.mutateAsync(peerUserId);
      await queryClient.invalidateQueries({ queryKey: ["messaging", "conversations"] });
      return conversation.id;
    },
    async sendMessage(body: string, attachment?: NativeAttachmentDraft | null): Promise<void> {
      if (!conversationId) throw new Error("Select a conversation first");
      const signature = JSON.stringify([
        conversationId,
        body,
        attachment ? [attachment.uri, attachment.name, attachment.mimeType] : null,
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
    async refresh(): Promise<void> {
      await Promise.all([conversations.refetch(), messages.refetch()]);
    },
  };
}
`;
}

function convexImport(mode: MessagingMode): string {
  return mode === "monorepo" ? "../../../../../convex/_generated" : "../../../convex/_generated";
}

function convexAdapterContent(mode: MessagingMode): string {
  const generated = convexImport(mode);
  return `"use client";
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { z } from "zod";
import { api } from "${generated}/api";
import type { Id } from "${generated}/dataModel";
${attachmentHelpers(mode, "convex")}

export type NativeMessagingTransport = "native";
export type ConversationId = Id<"conversations">;

const conversationIdSchema = z.custom<ConversationId>(
  (value) => typeof value === "string" && value.length > 0,
  "Invalid conversation id",
);
const conversationListSchema = z.array(z.object({ _id: conversationIdSchema }).passthrough());
const attachmentSchema = z.object({
  id: z.string(),
  mimeType: z.string(),
  originalName: z.string(),
  url: z.string(),
});
const messagePageSchema = z.object({
  messages: z.array(z.object({
    _id: z.string(),
    senderId: z.string(),
    body: z.string().optional(),
    createdAt: z.number(),
    attachments: z.array(attachmentSchema),
  }).passthrough()),
  nextCursor: z.string().nullable(),
});
const typingListSchema = z.array(z.object({ userId: z.string() }));

export function useNativeMessaging(conversationId: ConversationId | null) {
  const activeMutation = React.useRef<
    | { kind: "start"; signature: string; promise: Promise<ConversationId> }
    | { kind: "send"; signature: string; promise: Promise<void> }
    | null
  >(null);
  const [pending, setPending] = React.useState(false);
  const rawConversations: unknown = useQuery(api.messaging.listConversations);
  const rawMessages: unknown = useQuery(api.messaging.listMessages, conversationId ? { conversationId, limit: 50 } : "skip");
  const rawTyping: unknown = useQuery(api.messaging.listTyping, conversationId ? { conversationId } : "skip");
  const conversations = rawConversations === undefined
    ? undefined
    : conversationListSchema.parse(rawConversations);
  const messages = rawMessages === undefined ? undefined : messagePageSchema.parse(rawMessages);
  const typing = rawTyping === undefined ? undefined : typingListSchema.parse(rawTyping);
  const startMutation = useMutation(api.messaging.getOrCreateConversation);
  const sendMutation = useMutation(api.messaging.sendMessage);
  const typingMutation = useMutation(api.messaging.sendTyping);
  return {
    conversations: (conversations ?? []).map((conversation) => ({ ...conversation, id: conversation._id })),
    conversationsPending: conversations === undefined,
    messages: (messages?.messages ?? []).map((message) => ({ ...message, id: message._id })),
    messagesPending: messages === undefined,
    transport: "native" as const,
    typing: (typing?.length ?? 0) > 0,
    pending,
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
    async sendMessage(body: string, attachment?: NativeAttachmentDraft | null): Promise<void> {
      if (!conversationId) throw new Error("Select a conversation first");
      const signature = JSON.stringify([conversationId, body, attachment ? [attachment.uri, attachment.name, attachment.mimeType] : null]);
      const active = activeMutation.current;
      if (active) {
        if (active.kind === "send" && active.signature === signature) return await active.promise;
        throw new Error("Another messaging action is in progress");
      }
      setPending(true);
      const promise = (async () => {
        const attachmentIds = attachment
          ? [await uploadNativeAttachment(String(conversationId), attachment) as Id<"messageAttachments">]
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
    async refresh(): Promise<void> {
      // Convex queries are live subscriptions; no manual invalidation is necessary.
    },
  };
}
`;
}

function expoMessagesScreenContent(
  database: MessagingDatabase,
  mode: MessagingMode,
  hasI18n = false,
): string {
  const adapter = `@/adapters/messaging/${database}`;
  const i18n = nativeI18nTemplate(hasI18n, "messaging", nativeI18nImportPath("mobile", mode));
  const readFailure = (kind: "conversations" | "messages"): string =>
    database === "postgres"
      ? `{${kind === "messages" ? "selected && " : ""}messaging.${kind}Error ? <Alert variant="destructive" accessibilityRole="alert"><AlertTitle>${i18n.child("operationError", "Messaging operation failed")}</AlertTitle><Button variant="outline" size="sm" disabled={messaging.${kind}Fetching} onPress={() => void messaging.${kind === "messages" ? "retryMessages" : "retryConversations"}()}>${i18n.child("refresh", "Refresh")}</Button></Alert> : null}`
      : "";
  const operationError = hasI18n
    ? i18n.value("operationError", "Messaging operation failed")
    : 'cause instanceof Error ? cause.message : "Messaging operation failed"';
  const threadTitle = hasI18n
    ? 't("thread", { id: String(selected).slice(0, 10) })'
    : '"Thread " + String(selected).slice(0, 10)';
  const transportDescription =
    database === "convex"
      ? `{${i18n.value("liveDescription", "Messages and typing update live.")}}`
      : `{messaging.transport === "polling" ? ${i18n.value("pollingDescription", "Refreshing every five seconds while the secure realtime connection is unavailable.")} : ${i18n.value("liveDescription", "Messages and typing update live.")}}`;
  return `import * as React from "react";
import { Image, ScrollView, View } from "react-native";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import {
  downloadNativeAttachment,
  loadNativeAttachmentPreview,
  pickNativeAttachment,
  useNativeMessaging,
  type ConversationId,
  type NativeAttachmentDraft,
} from "${adapter}";
${i18n.importLine}

function AttachmentPreview({ url, name }: { url: string; name: string }): React.JSX.Element {
${i18n.hookLine}
  const [source, setSource] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    const controller = new AbortController();
    setSource(null);
    setFailed(false);
    void loadNativeAttachmentPreview(url, controller.signal).then(
      (value) => { if (!controller.signal.aborted) setSource(value); },
      () => { if (!controller.signal.aborted) setFailed(true); },
    );
    return () => controller.abort();
  }, [url]);
  if (failed) return <Text accessibilityRole="alert">${i18n.child("operationError", "Attachment preview unavailable")}</Text>;
  if (!source) return <Skeleton className="h-40 w-full" />;
  return <Image source={{ uri: source }} accessibilityLabel={name} className="h-40 w-full rounded-md" resizeMode="cover" />;
}

export default function MessagesScreen(): React.JSX.Element {
${i18n.hookLine}
  const [selected, setSelected] = React.useState<ConversationId | null>(null);
  const [peerId, setPeerId] = React.useState("");
  const [body, setBody] = React.useState("");
  const [attachment, setAttachment] = React.useState<NativeAttachmentDraft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const messaging = useNativeMessaging(selected);
  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    try { await action(); } ${hasI18n ? "catch {" : "catch (cause) {"} setError(${operationError}); }
  }
  return <View className="flex-1 bg-background"><ScrollView contentInsetAdjustmentBehavior="automatic"><View className="w-full max-w-[960px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-xs font-semibold uppercase tracking-widest text-primary">${i18n.child("privateChannel", "Private channel")}</Text><Text className="text-3xl font-bold tracking-tight">${i18n.child("title", "Messages")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("mobileDescription", "Direct conversations with authenticated attachments.")}</Text></View>
    <Alert><AlertTitle>${database === "convex" ? i18n.child("nativeRealtime", "Native realtime") : i18n.child("securePolling", "Realtime with polling fallback")}</AlertTitle><AlertDescription>${transportDescription}</AlertDescription><Button size="sm" variant="outline" onPress={() => void messaging.refresh()}>${i18n.child("refresh", "Refresh")}</Button></Alert>
    {error ? <Alert variant="destructive" accessibilityRole="alert"><AlertTitle>${i18n.child("operationError", "Messaging operation failed")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>${i18n.child("conversations", "Conversations")}</CardTitle><CardDescription>${i18n.child("mobileConversationsDescription", "Start a direct thread with an existing user ID.")}</CardDescription></CardHeader><CardContent className="gap-3"><View className="flex-row gap-2"><Input className="flex-1" value={peerId} onChangeText={setPeerId} autoCapitalize="none" placeholder={${i18n.value("peerUserId", "Peer user ID")}} /><Button disabled={messaging.pending || !peerId.trim()} onPress={() => void run(async () => { const id = await messaging.startConversation(peerId.trim()); setSelected(id); setPeerId(""); })}>${i18n.child("start", "Start")}</Button></View>${readFailure("conversations")}{messaging.conversationsPending ? <View accessibilityLabel={${i18n.value("loadingConversations", "Loading conversations")}} accessibilityState={{ busy: true }}><Skeleton className="h-12 w-full" /></View> : messaging.conversations.length === 0 ? ${database === "postgres" ? "messaging.conversationsError ? null : " : ""}<Text className="py-3 text-center text-sm text-muted-foreground">${i18n.child("noConversations", "No conversations yet")}</Text> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">{messaging.conversations.map((conversation) => <Button key={String(conversation.id)} size="sm" variant={selected === conversation.id ? "default" : "outline"} accessibilityState={{ selected: selected === conversation.id }} onPress={() => setSelected(conversation.id)}><Text className="font-mono text-xs">{String(conversation.id).slice(0, 12)}</Text></Button>)}</ScrollView>}</CardContent></Card>
    <Card><CardHeader><CardTitle>{selected ? ${threadTitle} : ${i18n.value("selectConversation", "Select a conversation")}}</CardTitle><CardDescription>{messaging.typing ? ${i18n.value("typing", "Someone is typing…")} : ${i18n.value("participantOnly", "Messages are visible only to conversation participants.")}}</CardDescription></CardHeader><CardContent className="gap-3">${readFailure("messages")}{!selected ? <Text className="py-8 text-center text-sm text-muted-foreground">${i18n.child("selectConversationShort", "Select a conversation.")}</Text> : messaging.messagesPending ? <View accessibilityLabel={${i18n.value("loadingMessages", "Loading messages")}} accessibilityState={{ busy: true }}><Skeleton className="h-32 w-full" /></View> : messaging.messages.length === 0 ? ${database === "postgres" ? "messaging.messagesError ? null : " : ""}<Text className="py-8 text-center text-sm text-muted-foreground">${i18n.child("noMessages", "No messages yet. Say hello.")}</Text> : <View className="gap-2">{messaging.messages.map((message) => <Card key={String(message.id)}><CardHeader><CardDescription>{String(message.senderId).slice(0, 10)}</CardDescription></CardHeader><CardContent className="gap-2">{message.body ? <Text>{message.body}</Text> : null}{message.attachments?.map((item) => <Button key={String(item.id ?? item.url)} variant="outline" onPress={() => void run(() => downloadNativeAttachment(item.url, item.originalName ?? "attachment"))}>{item.mimeType?.startsWith("image/") ? <AttachmentPreview url={item.url} name={item.originalName ?? "attachment"} /> : null}<Text>{item.originalName ?? ${i18n.value("downloadAttachment", "Download attachment")}}</Text></Button>)}</CardContent></Card>)}</View>}
      <Input value={body} onChangeText={(value) => { setBody(value); messaging.sendTyping(value.length > 0); }} placeholder={${i18n.value("messagePlaceholder", "Type a message…")}} multiline maxLength={4000} />{attachment ? <Alert><AlertDescription>{attachment.name}</AlertDescription><Button size="sm" variant="outline" onPress={() => setAttachment(null)}>${i18n.child("remove", "Remove")}</Button></Alert> : null}<View className="flex-row gap-2"><Button variant="outline" disabled={!selected || messaging.pending} onPress={() => void run(async () => setAttachment(await pickNativeAttachment()))}>${i18n.child("attach", "Attach")}</Button><Button className="flex-1" disabled={!selected || messaging.pending || (!body.trim() && !attachment)} onPress={() => void run(async () => { await messaging.sendMessage(body.trim(), attachment); setBody(""); setAttachment(null); })}>{messaging.pending ? ${i18n.value("sending", "Sending…")} : ${i18n.value("send", "Send")}}</Button></View>
    </CardContent></Card>
  </View></ScrollView></View>;
}
`;
}

export function nativeExpoMessagingFiles(
  database: MessagingDatabase,
  mode: MessagingMode,
  hasI18n = false,
): TemplateFile[] {
  const root = expoRoot(mode);
  const files = [
    file(
      `${root}src/adapters/messaging/${database}.ts`,
      database === "convex" ? convexAdapterContent(mode) : postgresAdapterContent(mode),
    ),
    file(`${root}app/(app)/messages.tsx`, expoMessagesScreenContent(database, mode, hasI18n)),
  ];
  if (database === "postgres") {
    const realtime =
      mode === "single" ? realtimeUnsupportedExpoClientContent() : realtimeExpoClientContent();
    files.push(file(`${root}src/lib/realtime.ts`, realtime));
  }
  return files;
}

export { convexAdapterContent as expoConvexMessagingAdapterContent };
export { expoMessagesScreenContent, postgresAdapterContent as expoPostgresMessagingAdapterContent };
