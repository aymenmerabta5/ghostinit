export function messagingWorkspaceViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import type { useMessagingWorkspace } from "../use-messaging-workspace";

export function MessagingWorkspaceView({ selected, setSelected, peerId, setPeerId, conversations, conversationsLoading, conversationsError, conversationsFetching, refreshConversations, starting, startError, startConversation, children }: ReturnType<typeof useMessagingWorkspace> & { children: React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="flex min-w-0 flex-col gap-7">
    <header className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("desktopDescription")}</p></header>
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle as="h2">{t("conversations")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
        {conversationsError ? <Alert variant="destructive"><AlertTitle>{t("operationError")}</AlertTitle><AlertDescription><Button type="button" variant="outline" size="sm" disabled={conversationsFetching} aria-busy={conversationsFetching} onClick={refreshConversations}>{t("refresh")}</Button></AlertDescription></Alert> : null}
        {conversationsLoading ? <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("loadingConversations")}>{Array.from({length:4}).map((_,index)=><Skeleton key={index} className="h-10 w-full" />)}</div> : conversations.length === 0 ? conversationsError ? null : <Empty><EmptyHeader><EmptyTitle>{t("noConversations")}</EmptyTitle><EmptyDescription>{t("noConversationsDescription")}</EmptyDescription></EmptyHeader></Empty> : <div className="flex flex-col gap-2">{conversations.map(conversation => <Button key={conversation.id} type="button" variant={selected === conversation.id ? "secondary" : "outline"} onClick={() => setSelected(conversation.id)} aria-pressed={selected === conversation.id} className="h-auto min-h-14 w-full flex-col items-start gap-1 py-3 text-start"><span className="text-sm font-medium">{t("conversation")}</span><code dir="ltr" title={conversation.id} className="text-xs text-muted-foreground">{conversation.id.slice(0,8)}</code></Button>)}</div>}
        <div className="flex flex-col gap-2"><Field><FieldLabel htmlFor="message-recipient">{t("peerUserId")}</FieldLabel><Input id="message-recipient" value={peerId} aria-describedby="message-recipient-help" onChange={event=>setPeerId(event.target.value)} placeholder={t("peerUserId")} /><FieldDescription id="message-recipient-help">{t("peerUserIdHelp")}</FieldDescription></Field><Button variant="outline" disabled={starting || !peerId.trim()} aria-busy={starting} onClick={startConversation}>{starting ? t("starting") : t("startDirectMessage")}</Button></div>
        {startError ? <Alert variant="destructive"><AlertDescription>{t("operationError")}</AlertDescription></Alert> : null}
      </CardContent></Card>
      <div>{children ?? <Empty className="min-h-64 rounded-lg border bg-card"><EmptyHeader><EmptyTitle>{t("selectOrStart")}</EmptyTitle></EmptyHeader></Empty>}</div>
    </div>
  </div></main>;
}
`;
}

export function messageComposerViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";
import type { useMessageComposer } from "../use-message-composer";

export function MessageComposerView({ body, hasFile, pending, error, changeBody, changeFile, submit }: ReturnType<typeof useMessageComposer>): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  return <div className="flex flex-col gap-2">
    {error ? <Alert variant="destructive"><AlertDescription>{t("sendError")}</AlertDescription></Alert> : null}
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input value={body} aria-label={t("messagePlaceholder")} onChange={event=>changeBody(event.target.value)} placeholder={t("messagePlaceholder")} onKeyDown={event=>{if(event.key === "Enter" && !hasFile)submit();}} />
      <Input type="file" onChange={event=>changeFile(event.target.files?.[0] ?? null)} className="max-w-[160px]" />
      <Button onClick={submit} disabled={pending || (!body.trim() && !hasFile)} aria-busy={pending}>{pending ? t("sending") : t("send")}</Button>
    </div>
  </div>;
}
`;
}

export function messageThreadViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { MessageList } from "./message-list";
import type { useMessageThread } from "../use-message-thread";

export function MessageThreadView({ conversationId, messages, loading, typing, error, refreshing, refresh, children }: ReturnType<typeof useMessageThread> & { children: React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  return <Card><CardHeader><CardTitle as="h2">{t("thread", {id:conversationId.slice(0,8)})}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
    {error ? <Alert variant="destructive"><AlertTitle>{t("operationError")}</AlertTitle><AlertDescription><Button type="button" variant="outline" size="sm" disabled={refreshing} aria-busy={refreshing} onClick={refresh}>{t("refresh")}</Button></AlertDescription></Alert> : null}
    {!error || (messages?.length ?? 0) > 0 ? <MessageList messages={messages} isLoading={loading} isTyping={typing} /> : null}
    {children}
  </CardContent></Card>;
}
`;
}
