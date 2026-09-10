export function convexSidebarViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ConversationId, ConversationItem } from "../model";
export function ConvexConversationSidebar({ conversations, selected, onSelect, children }: { conversations: ConversationItem[]; selected: ConversationId | null; onSelect(id: ConversationId): void; children: React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  return <Card><CardHeader><CardTitle as="h2">{t("conversations")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">
    {conversations.map((conversation) => <Button key={conversation.key} type="button" variant={conversation.liveId !== null && selected === conversation.liveId ? "secondary" : "outline"} disabled={conversation.liveId === null} onClick={() => { if (conversation.liveId !== null) onSelect(conversation.liveId); }} className="h-auto min-h-14 w-full flex-col items-start gap-1 py-3 text-start"><span className="text-sm font-medium">{t("conversation")}</span><code dir="ltr" title={conversation.key} className="text-xs text-muted-foreground">{conversation.key.slice(0, 8)}</code></Button>)}
    {children}
  </CardContent></Card>;
}
`;
}

export function convexStartFormViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { StartConversationFormState } from "../types";
export function StartConversationFormView({ state }: { state: StartConversationFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const { form, error } = state;
  return <form.AppForm><Form form={form} className="flex flex-col gap-2">
    <form.AppField name="peerUserId">{(field) => <field.TextField label={t("peerUserId")} description={t("peerUserIdHelp")} placeholder={t("peerUserId")} required />}</form.AppField>
    <form.SubmitButton variant="outline" pendingLabel={t("starting")}>{t("startDirectMessage")}</form.SubmitButton>
    {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
  </Form></form.AppForm>;
}
`;
}

export function convexThreadViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import type { MessagePage } from "../model";
export function ConvexMessageThreadView({ messages, typing, children }: { messages: MessagePage | undefined; typing: boolean; children: React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  return <Card><CardContent className="flex flex-col gap-3 p-4">
    <div className="flex max-h-[400px] flex-col gap-2 overflow-auto">
      {messages === undefined ? <div aria-busy="true" aria-label={t("loadingMessages")}><Skeleton className="h-32 w-full" /></div> : messages.messages.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noMessages")}</EmptyTitle></EmptyHeader></Empty> : messages.messages.map((message) => <Card key={message._id}><CardContent className="flex flex-col gap-1 p-3">{message.body ? <div className="text-sm">{message.body}</div> : null}{message.attachments.map((attachment) => <a key={attachment.id} href={attachment.url} className="text-xs underline">{attachment.originalName}</a>)}</CardContent></Card>)}
    </div>
    {typing ? <div className="animate-pulse text-xs text-muted-foreground">{t("typing")}</div> : null}
    {children}
  </CardContent></Card>;
}
`;
}

export function convexComposerViewContent(attachments: boolean): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ConvexMessageFormState } from "../types";
export function ConvexMessageComposerView({ state }: { state: ConvexMessageFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const { form, error, onBodyChanged } = state;
  return <form.AppForm><Form form={form} className="flex flex-col gap-2">
    {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <form.Subscribe selector={(state) => state.isSubmitting}>{(pending) => <div className="flex flex-col gap-2 sm:flex-row">
      <form.AppField name="body">{(field) => <Field className="flex-1"><FieldLabel className="sr-only">{t("messagesLabel")}</FieldLabel><Input value={field.state.value} disabled={pending} placeholder={t("messagePlaceholder")} aria-label={t("messagesLabel")} onBlur={field.handleBlur} onChange={(event) => { field.handleChange(event.target.value); onBodyChanged(event.target.value); }} ${attachments ? "" : "required"} /></Field>}</form.AppField>
${attachments ? `      <form.AppField name="file">{(field) => <Field className="sm:max-w-[160px]"><FieldLabel className="sr-only">{t("attach")}</FieldLabel><Input ref={state.fileInput} type="file" disabled={pending} aria-label={t("attach")} onBlur={field.handleBlur} onChange={(event) => { const file = event.target.files?.[0] ?? null; state.onFileChanged(file); field.handleChange(file); }} /></Field>}</form.AppField>` : ""}
      <form.SubmitButton pendingLabel={t("sending")}>{t("send")}</form.SubmitButton>
    </div>}</form.Subscribe>
  </Form></form.AppForm>;
}
`;
}

export function convexScreenContent(): string {
  return `"use client";
import type * as React from "react";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSurfaceTranslations } from "@/lib/translations";
import { useConvexInbox } from "./use-convex-inbox";
import { ConvexConversationSidebar } from "./components/conversation-sidebar";
import { StartConversationForm } from "./start-conversation-form";
import { ConvexMessageThread } from "./message-thread";
import type { InitialConversation } from "./model";
export function ConvexMessagesPage({ initialConversations = [] }: { initialConversations?: InitialConversation[] }): React.JSX.Element {
  const t = useSurfaceTranslations("messaging");
  const inbox = useConvexInbox(initialConversations);
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="flex min-w-0 flex-col gap-7">
    <header className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("desktopDescription")}</p></header>
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)]">
      <ConvexConversationSidebar conversations={inbox.items} selected={inbox.selected} onSelect={inbox.select}><StartConversationForm key={inbox.generation} onStarted={inbox.select} /></ConvexConversationSidebar>
      {inbox.selected ? <ConvexMessageThread key={inbox.generation + ":" + inbox.selected} conversationId={inbox.selected} /> : <Empty className="min-h-64 rounded-lg border bg-card"><EmptyHeader><EmptyTitle>{t("selectConversationShort")}</EmptyTitle></EmptyHeader></Empty>}
    </div>
  </div></main>;
}
`;
}
