import { file, type TemplateFile } from "../../../shared.js";
import {
  convexTanstackMessagingDataContent,
  convexTanstackMessagingQueriesContent,
} from "./convex-tanstack-data.js";

type MessagingMode = "monorepo" | "single";

function appRoot(mode: MessagingMode): string {
  return mode === "monorepo" ? "apps/web/" : "";
}

function routeGeneratedRoot(mode: MessagingMode): string {
  return mode === "monorepo" ? "../../../../convex/_generated" : "../../convex/_generated";
}

function componentGeneratedRoot(mode: MessagingMode): string {
  return mode === "monorepo"
    ? "../../../../../../convex/_generated"
    : "../../../../convex/_generated";
}

function routeContent(mode: MessagingMode): string {
  const generated = routeGeneratedRoot(mode);
  return `"use client";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { loadInitialConversations, loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";
import { currentQueryAuthScope, messagingConversationsQueryKey } from "@/lib/query-client";
import type { Id } from "${generated}/dataModel";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import { ConvexMessageThread } from "./-components/messages/convex-message-thread";
import { useConvexConversations, useStartConvexConversation } from "./-components/messages/convex-messaging-queries";

function MessagesPage(): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const initialConversations = scope
    ? queryClient.getQueryData<{ conversations: Array<{ id: string }> }>(messagingConversationsQueryKey(scope))
    : undefined;
  // Convex remains the live overlay; the scoped Start snapshot removes the first-render waterfall.
  const liveConversations = useConvexConversations();
  const conversationItems = liveConversations
    ? liveConversations.map((conversation) => ({ key: String(conversation._id), liveId: conversation._id }))
    : (initialConversations?.conversations ?? []).map((conversation) => ({ key: conversation.id, liveId: null }));
  const getOrCreate = useStartConvexConversation();
  const [selected, setSelected] = React.useState<Id<"conversations"> | null>(null);
  const [peerId, setPeerId] = React.useState("");
  const [starting, setStarting] = React.useState(false);
  const [startError, setStartError] = React.useState(false);
  const startInFlight = React.useRef(false);
  async function startConversation(): Promise<void> {
    if (!peerId.trim() || startInFlight.current) return;
    startInFlight.current = true; setStarting(true); setStartError(false);
    try { const conversation = await getOrCreate(peerId.trim()); setSelected(conversation._id); setPeerId(""); }
    catch { setStartError(true); }
    finally { startInFlight.current = false; setStarting(false); }
  }
  return <main className="min-h-screen bg-background p-6">
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
    <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1><p className="max-w-[65ch] text-sm text-muted-foreground">{t("desktopDescription")}</p></header>
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
      <Card><CardHeader><CardTitle className="text-base">{t("conversations")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">
        {conversationItems.map((conversation) => <Button key={conversation.key} type="button" variant={conversation.liveId !== null && selected === conversation.liveId ? "secondary" : "outline"} disabled={conversation.liveId === null} onClick={() => { if (conversation.liveId !== null) setSelected(conversation.liveId); }} className="w-full justify-start font-mono text-xs">{conversation.key.slice(0, 8)}</Button>)}
        <div className="flex flex-col gap-2"><Input value={peerId} aria-label={t("peerUserId")} onChange={(event) => setPeerId(event.target.value)} placeholder={t("peerUserId")} /><Button variant="outline" disabled={starting || !peerId.trim()} aria-busy={starting} onClick={() => void startConversation()}>{starting ? t("starting") : t("startDirectMessage")}</Button></div>
        {startError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("operationError")}</AlertDescription></Alert> : null}
      </CardContent></Card>
      {selected ? <Card><CardContent className="flex flex-col gap-3 p-4"><ConvexMessageThread conversationId={selected} /></CardContent></Card> : <Empty><EmptyHeader><EmptyTitle>{t("selectConversationShort")}</EmptyTitle></EmptyHeader></Empty>}
    </div>
    </div>
  </main>;
}

export const Route = createFileRoute("/messages")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  loader: ({ context }) => Promise.all([
    loadProtectedRoute(context),
    loadInitialConversations(context),
  ]),
  component: MessagesPage,
});
`;
}

function attachmentUploadContent(mode: MessagingMode): string {
  const generated = componentGeneratedRoot(mode);
  return `"use client";
import type { Id } from "${generated}/dataModel";

export interface PendingConvexAttachmentUpload {
  readonly conversationId: string;
  readonly fileFingerprint: string;
  readonly attachmentId: Id<"messageAttachments">;
}

export interface AttachmentFingerprintInput {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly lastModified: number;
}

export function convexAttachmentFingerprint(file: AttachmentFingerprintInput): string {
  return JSON.stringify([file.name, file.size, file.type, file.lastModified]);
}

export function reusableConvexAttachmentId(
  pending: PendingConvexAttachmentUpload | null,
  conversationId: string,
  fileFingerprint: string,
): Id<"messageAttachments"> | undefined {
  return pending?.conversationId === conversationId && pending.fileFingerprint === fileFingerprint
    ? pending.attachmentId
    : undefined;
}

function attachmentIdFrom(value: unknown): Id<"messageAttachments"> {
  if (typeof value !== "object" || value === null || !("attachmentId" in value) || typeof value.attachmentId !== "string") {
    throw new Error("The attachment response did not include an id.");
  }
  return value.attachmentId as Id<"messageAttachments">;
}

export async function uploadConvexMessageAttachment(
  conversationId: Id<"conversations">,
  file: File,
): Promise<Id<"messageAttachments">> {
  const body = new FormData();
  body.append("file", file);
  body.append("conversationId", String(conversationId));
  const response = await fetch("/api/messaging/attachments", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Ghostinit-Conversation-Id": String(conversationId) },
    body,
  });
  if (!response.ok) throw new Error(\`Attachment upload failed with status \${response.status}.\`);
  return attachmentIdFrom(await response.json());
}
`;
}

function composerContent(mode: MessagingMode): string {
  const generated = componentGeneratedRoot(mode);
  return `"use client";
import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "${generated}/api";
import type { Id } from "${generated}/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";
import {
  convexAttachmentFingerprint,
  reusableConvexAttachmentId,
  uploadConvexMessageAttachment,
  type PendingConvexAttachmentUpload,
} from "./convex-attachment-upload";

export function ConvexMessageComposer({ conversationId }: { conversationId: Id<"conversations"> }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const sendMessage = useMutation(api.messaging.sendMessage);
  const sendTyping = useMutation(api.messaging.sendTyping);
  const [body, setBody] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const submitInFlight = React.useRef(false);
  const pendingUpload = React.useRef<PendingConvexAttachmentUpload | null>(null);
  React.useEffect(() => {
    if (pendingUpload.current?.conversationId !== String(conversationId)) pendingUpload.current = null;
  }, [conversationId]);

  async function submit(): Promise<void> {
    const trimmed = body.trim();
    if ((!trimmed && !file) || submitInFlight.current) return;
    submitInFlight.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      let attachmentIds: Id<"messageAttachments">[] | undefined;
      if (file) {
        const fileFingerprint = convexAttachmentFingerprint(file);
        let attachmentId = reusableConvexAttachmentId(pendingUpload.current, String(conversationId), fileFingerprint);
        if (!attachmentId) {
          attachmentId = await uploadConvexMessageAttachment(conversationId, file);
          pendingUpload.current = { conversationId: String(conversationId), fileFingerprint, attachmentId };
        }
        attachmentIds = [attachmentId];
      }
      await sendMessage({
        conversationId,
        ...(trimmed ? { body: trimmed } : {}),
        ...(attachmentIds ? { attachmentIds } : {}),
      });
      pendingUpload.current = null;
      setBody("");
      setFile(null);
      await sendTyping({ conversationId, isTyping: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("sendError"));
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  return <div className="flex flex-col gap-2">
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input value={body} onChange={(event) => { setBody(event.target.value); void sendTyping({ conversationId, isTyping: event.target.value.length > 0 }); }} placeholder={t("messagePlaceholder")} onKeyDown={(event) => { if (event.key === "Enter" && !file) void submit(); }} />
      <Input type="file" onChange={(event) => { const nextFile = event.target.files?.[0] ?? null; const reusable = nextFile ? reusableConvexAttachmentId(pendingUpload.current, String(conversationId), convexAttachmentFingerprint(nextFile)) : undefined; if (!reusable) pendingUpload.current = null; setFile(nextFile); }} className="max-w-[160px]" />
      <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? t("sending") : t("send")}</Button>
    </div>
  </div>;
}
`;
}

function threadContent(mode: MessagingMode): string {
  const generated = componentGeneratedRoot(mode);
  return `"use client";
import * as React from "react";
import type { Id } from "${generated}/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { ConvexMessageComposer } from "./convex-message-composer";
import { useConvexMessages, useConvexTyping } from "./convex-messaging-queries";

export function ConvexMessageThread({ conversationId }: { conversationId: Id<"conversations"> }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const messages = useConvexMessages(conversationId);
  const typing = useConvexTyping(conversationId);
  return <>
    <div className="flex max-h-[400px] flex-col gap-2 overflow-auto">
      {messages === undefined ? <div aria-busy="true" aria-label={t("loadingMessages")}><Skeleton className="h-32 w-full" /></div> : messages.messages.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noMessages")}</EmptyTitle></EmptyHeader></Empty> : messages.messages.map((message) => <Card key={message._id}><CardContent className="flex flex-col gap-1 p-3">
        {message.body ? <div className="text-sm">{message.body}</div> : null}
        {message.attachments.map((attachment) => attachment.url ? <a key={attachment.id} href={attachment.url} className="text-xs underline">{attachment.originalName}</a> : null)}
      </CardContent></Card>)}
    </div>
    {(typing?.length ?? 0) > 0 ? <div className="animate-pulse text-xs text-muted-foreground">{t("typing")}</div> : null}
    <ConvexMessageComposer conversationId={conversationId} />
  </>;
}
`;
}

export function messagingConvexTanstackWebFiles(mode: MessagingMode = "monorepo"): TemplateFile[] {
  const root = appRoot(mode);
  const componentRoot = `${root}src/routes/-components/messages`;
  return [
    file(`${root}src/routes/messages.tsx`, routeContent(mode)),
    file(
      `${componentRoot}/convex-messaging-data.ts`,
      convexTanstackMessagingDataContent(componentGeneratedRoot(mode)),
    ),
    file(
      `${componentRoot}/convex-messaging-queries.ts`,
      convexTanstackMessagingQueriesContent(componentGeneratedRoot(mode)),
    ),
    file(`${componentRoot}/convex-attachment-upload.ts`, attachmentUploadContent(mode)),
    file(`${componentRoot}/convex-message-composer.tsx`, composerContent(mode)),
    file(`${componentRoot}/convex-message-thread.tsx`, threadContent(mode)),
  ];
}
