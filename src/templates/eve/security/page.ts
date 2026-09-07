import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

export function tanstackEveAgentPageFile(mode: ProjectMode): TemplateFile {
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  const agentRoot = mode === "monorepo" ? "apps/eve/agent" : "agent";
  return file(
    `${root}/routes/agent.tsx`,
    `import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useEveAgent } from "eve/react";
import { loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bubble, BubbleContent, Marker, MarkerContent, Message, MessageContent, MessageHeader, MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/chat";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AgentHeader } from "@/features/agent/agent-header";
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute("/agent")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  // Eve output is a user-triggered stream; only the authenticated session is preloadable.
  loader: ({ context }) => loadProtectedRoute(context),
  component: AgentPage,
});

function AgentPage(): React.JSX.Element {
  const agent = useEveAgent({ host: "/api/agent" });
  const t = useSurfaceTranslations("agent");
  const [input, setInput] = React.useState("");
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6 md:p-8 lg:p-10">
        <AgentHeader agentRoot="${agentRoot}/" />
        <Separator />
        <Card className="flex flex-col gap-4 p-4">
          <CardHeader className="p-0">
            <CardTitle className="text-base">{t("conversationTitle")}</CardTitle>
            <CardDescription>{t("conversationDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-0">
            <MessageScrollerProvider autoScroll><MessageScroller className="max-h-96"><MessageScrollerViewport><MessageScrollerContent role="log" aria-live="polite" aria-label={t("conversationLabel")}>
              {agent.data.messages.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("empty")}</EmptyTitle><EmptyDescription>{t("conversationDescription")}</EmptyDescription></EmptyHeader></Empty> : agent.data.messages.map((message) => (
                <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}><Message align={message.role === "user" ? "end" : "start"}><MessageContent><MessageHeader>{message.role}</MessageHeader><Bubble align={message.role === "user" ? "end" : "start"} variant={message.role === "user" ? "default" : "muted"}><BubbleContent>{message.parts.map((part, index) => part.type === "text" ? <p key={message.id + "-text-" + String(index)}>{part.text}</p> : null)}</BubbleContent></Bubble></MessageContent></Message></MessageScrollerItem>
              ))}
              {agent.status === "streaming" ? <MessageScrollerItem messageId="streaming"><Marker><MarkerContent className="shimmer">{t("streaming")}</MarkerContent></Marker></MessageScrollerItem> : null}
            </MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider>
            <form onSubmit={(event) => { event.preventDefault(); if (!input.trim() || isBusy) return; void agent.send(input); setInput(""); }}><FieldGroup><Field><FieldLabel className="sr-only" htmlFor="agent-message">{t("messageLabel")}</FieldLabel><div className="flex gap-2"><Input id="agent-message" value={input} onChange={(event) => setInput(event.target.value)} placeholder={isBusy ? t("workingPlaceholder") : t("messagePlaceholder")} disabled={isBusy} className="flex-1" /><Button type="submit" disabled={isBusy || !input.trim()}>{isBusy ? t("working") : t("send")}</Button></div></Field></FieldGroup></form>
            {agent.error ? <Alert variant="destructive"><AlertTitle>{t("requestError")}</AlertTitle><AlertDescription className="break-all text-xs">{String(agent.error)}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
`,
  );
}

export function tanstackEveAgentHeaderFile(mode: ProjectMode): TemplateFile {
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  return file(
    `${root}/features/agent/agent-header.tsx`,
    `"use client";
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
    <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
      {t("webDescription", { agentRoot })}
    </p>
  </div>;
}
`,
  );
}
