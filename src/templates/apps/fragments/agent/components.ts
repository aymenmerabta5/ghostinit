import { file, type TemplateFile } from "../../../shared.js";

export function agentHeaderContent(): string {
  return `"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { useSurfaceTranslations } from "@/lib/translations";

export function AgentHeader({ agentRoot }: { agentRoot: string }): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return <div className="flex flex-col gap-3">
    <div className="flex items-center gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> {t("durableBadge")}</span></Badge>
    </div>
    <p className="text-sm text-muted-foreground max-w-[65ch] leading-relaxed">{t("webDescription", { agentRoot })}</p>
  </div>;
}
`;
}

export function agentTranscriptContent(): string {
  return `"use client";
import type * as React from "react";
import { Bubble, BubbleContent, Marker, MarkerContent, Message, MessageContent, MessageHeader, MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/chat";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSurfaceTranslations } from "@/lib/translations";

interface AgentMessage {
  id: string;
  role: string;
  parts: readonly { type: string; text?: string }[];
}

export function AgentTranscript({ messages, streaming }: { messages: readonly AgentMessage[]; streaming: boolean }): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return <MessageScrollerProvider autoScroll><MessageScroller className="max-h-96"><MessageScrollerViewport><MessageScrollerContent role="log" aria-live="polite" aria-label={t("conversationLabel")}>
    {messages.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("empty")}</EmptyTitle><EmptyDescription>{t("conversationDescription")}</EmptyDescription></EmptyHeader></Empty> : messages.map((message) => (
      <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}><Message align={message.role === "user" ? "end" : "start"}><MessageContent><MessageHeader>{message.role}</MessageHeader><Bubble align={message.role === "user" ? "end" : "start"} variant={message.role === "user" ? "default" : "muted"}><BubbleContent>{message.parts.map((part, index) => part.type === "text" ? <p key={message.id + "-text-" + String(index)}>{part.text}</p> : null)}</BubbleContent></Bubble></MessageContent></Message></MessageScrollerItem>
    ))}
    {streaming ? <MessageScrollerItem messageId="streaming"><Marker><MarkerContent className="shimmer">{t("streaming")}</MarkerContent></Marker></MessageScrollerItem> : null}
  </MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider>;
}
`;
}

export function agentPromptContent(): string {
  return `"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";

export function AgentPrompt({ busy, onSend }: { busy: boolean; onSend(input: string): unknown }): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  const [input, setInput] = React.useState("");
  return <form onSubmit={(event) => { event.preventDefault(); if (!input.trim() || busy) return; void onSend(input); setInput(""); }}>
    <FieldGroup><Field><FieldLabel className="sr-only" htmlFor="agent-message">{t("messageLabel")}</FieldLabel>
      <div className="flex gap-2"><Input id="agent-message" value={input} onChange={(event) => setInput(event.target.value)} placeholder={busy ? t("workingPlaceholder") : t("messagePlaceholder")} disabled={busy} className="flex-1" /><Button type="submit" disabled={busy || !input.trim()}>{busy ? t("working") : t("send")}</Button></div>
    </Field></FieldGroup>
  </form>;
}
`;
}

export function agentComponentFiles(mode: "single" | "monorepo"): TemplateFile[] {
  const root = mode === "single" ? "src" : "apps/web/src";
  return [
    file(`${root}/features/agent/agent-header.tsx`, agentHeaderContent()),
    file(`${root}/features/agent/agent-transcript.tsx`, agentTranscriptContent()),
    file(`${root}/features/agent/agent-prompt.tsx`, agentPromptContent()),
  ];
}
