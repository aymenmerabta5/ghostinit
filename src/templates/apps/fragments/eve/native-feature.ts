import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import type { EvePlatformMode, EvePlatformTarget } from "./protocol.js";

function paths(target: EvePlatformTarget, mode: EvePlatformMode) {
  const sourceRoot =
    target === "expo"
      ? `${mode === "monorepo" ? "apps/mobile/" : ""}src`
      : `${mode === "monorepo" ? "apps/desktop/" : ""}src/renderer`;
  return {
    sourceRoot,
    alias: target === "desktop" && mode === "single" ? "@/renderer" : "@",
    root: `${sourceRoot}/features/agent`,
  };
}

export function nativeEveRouteContent(target: EvePlatformTarget, mode: EvePlatformMode): string {
  const { alias } = paths(target, mode);
  return target === "expo"
    ? `import { AgentScreen } from "${alias}/features/agent/screen";\nexport default AgentScreen;\n`
    : `import { createFileRoute } from "@tanstack/react-router";\nimport { AgentScreen } from "${alias}/features/agent/screen";\nexport const Route = createFileRoute("/agent")({ component: AgentScreen });\n`;
}

function conversationView(
  target: EvePlatformTarget,
  mode: EvePlatformMode,
  hasI18n: boolean,
  source: string,
): string {
  const start = source.indexOf("  if (isPending)");
  const end = source.lastIndexOf("\n}");
  if (start < 0 || end <= start) throw new Error("Native agent presentation boundary is missing");
  let body = source.slice(start, end);
  const composerStart = body.indexOf(
    target === "expo"
      ? '          <View className="flex-row items-center gap-2">'
      : "        <form onSubmit=",
  );
  const marker = target === "expo" ? "          </View>" : "</form>";
  const composerEnd = body.indexOf(marker, composerStart);
  if (composerStart < 0 || composerEnd < composerStart)
    throw new Error("Native agent composer boundary is missing");
  body =
    body.slice(0, composerStart) + "        {composer}" + body.slice(composerEnd + marker.length);
  body = body.replaceAll("submitting", "pending");
  const imports =
    target === "expo"
      ? `import { ActivityIndicator, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";`
      : `import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bubble, BubbleContent, Marker, MarkerContent, Message, MessageContent, MessageHeader, MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/chat";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";`;
  return `import type * as React from "react";
${imports}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChatMessage } from "../model";
${hasI18n ? `import type { NamespaceTranslate } from "${nativeI18nImportPath(target === "expo" ? "mobile" : "desktop", mode)}";` : ""}
export interface AgentViewProps { isPending: boolean; isAuthenticated: boolean; ${target === "desktop" ? "pending: boolean; " : ""}error: string | null;
  messages: readonly ChatMessage[]; composer: React.ReactNode; ${hasI18n ? 't: NamespaceTranslate<"agent">;' : ""} }
export function AgentView({ isPending, isAuthenticated${target === "desktop" ? ", pending" : ""}, error, messages, composer${hasI18n ? ", t" : ""} }: AgentViewProps): React.JSX.Element {
${body}
}
`;
}

export function nativeEveFeatureFiles(
  target: EvePlatformTarget,
  mode: EvePlatformMode,
  hasI18n: boolean,
  source: string,
): TemplateFile[] {
  const { root, alias } = paths(target, mode);
  const i18n = nativeI18nTemplate(
    hasI18n,
    "agent",
    nativeI18nImportPath(target === "expo" ? "mobile" : "desktop", mode),
  );
  const route =
    target === "expo"
      ? `${mode === "monorepo" ? "apps/mobile/" : ""}app/agent.tsx`
      : `${mode === "monorepo" ? "apps/desktop/" : ""}src/renderer/routes/agent.tsx`;
  return [
    file(route, nativeEveRouteContent(target, mode)),
    file(
      `${root}/model.ts`,
      `export interface ChatMessage { readonly id: number; readonly role: "assistant" | "user"; readonly text: string }
export type ConversationEvent = { kind: "user" | "assistant"; id: number; text: string };
export function conversationReducer(messages: readonly ChatMessage[], event: ConversationEvent): readonly ChatMessage[] {
  if (event.kind === "user") return [...messages, { id: event.id, role: "user", text: event.text }];
  return messages.some((message) => message.id === event.id)
    ? messages.map((message) => message.id === event.id ? { ...message, text: event.text } : message)
    : [...messages, { id: event.id, role: "assistant", text: event.text }];
}
`,
    ),
    file(
      `${root}/queries.ts`,
      `import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { currentQueryAuthGeneration, subscribeQueryAuthGeneration } from "${alias}/lib/query-client";
import { useAuth } from "${alias}/hooks/${target === "expo" ? "use-auth" : "useAuth"}";
export function useAgentOwnership() {
  const client = useQueryClient();
  const subscribe = useCallback((changed: () => void) => subscribeQueryAuthGeneration(client, changed), [client]);
  const read = useCallback(() => currentQueryAuthGeneration(client), [client]);
  const generation = useSyncExternalStore(subscribe, read, () => 0);
  const identity = useAuth();
  return { generation, isPending: identity.isPending, isAuthenticated: identity.isAuthenticated };
}
`,
    ),
    file(
      `${root}/mutations.ts`,
      `import { eveClient, type EveInvokeOptions, type EveSessionCursor } from "${alias}/lib/eve-client";
export function invokeAgent(message: string, session: EveSessionCursor | null, options: EveInvokeOptions) { return eveClient.invoke(message, session, options); }
export type { EveSessionCursor } from "${alias}/lib/eve-client";
`,
    ),
    file(
      `${root}/use-agent-scope.ts`,
      `import { useAgentOwnership } from "./queries";
export function useAgentScope() {
  const owner = useAgentOwnership();
  return { key: owner.generation, phase: owner.isPending ? "pending" as const : owner.isAuthenticated ? "authenticated" as const : "anonymous" as const };
}
`,
    ),
    file(
      `${root}/use-agent-conversation.ts`,
      `import { useEffect, useReducer, useRef } from "react";
import { useAuthOwnedMutation } from "${alias}/hooks/use-auth-owned-mutation";
import { invokeAgent, type EveSessionCursor } from "./mutations";
import { conversationReducer } from "./model";
export function useAgentConversation(waitingMessage: string, errorMessage: string) {
  const [messages, dispatch] = useReducer(conversationReducer, []);
  const sequence = useRef(0);
  const session = useRef<EveSessionCursor | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const request = useAuthOwnedMutation(async (message: string, isCurrent) => {
    const userId = ++sequence.current;
    const assistantId = ++sequence.current;
    dispatch({ kind: "user", id: userId, text: message });
    const active = new AbortController();
    controller.current = active;
    try {
      const result = await invokeAgent(message, session.current, { signal: active.signal,
        onText: (text) => { if (isCurrent() && !active.signal.aborted) dispatch({ kind: "assistant", id: assistantId, text }); },
      });
      if (!isCurrent() || active.signal.aborted) return;
      session.current = result.session;
      if (!result.message) dispatch({ kind: "assistant", id: assistantId, text: waitingMessage });
    } finally { if (controller.current === active) controller.current = null; }
  });
  return { messages, send: request.run, pending: request.isPending, error: request.error ? errorMessage : null };
}
export type AgentSend = ReturnType<typeof useAgentConversation>["send"];
`,
    ),
    file(
      `${root}/use-agent-prompt.ts`,
      `${target === "expo" ? 'import { useForm } from "@tanstack/react-form";' : 'import { useAppForm } from "@/components/ui/form";'}
import type { AgentSend } from "./use-agent-conversation";
export function useAgentPrompt(send: AgentSend, invalidMessage: string) {
  const form = ${target === "expo" ? "useForm" : "useAppForm"}({ defaultValues: { message: "" },
    validators: { onSubmit: ({ value }) => value.message.trim() && value.message.length <= 65536 ? undefined : invalidMessage },
    onSubmit: async ({ value }) => { const result = await send(value.message.trim()); if (result.status === "success" && result.isCurrent()) form.reset(); },
  });
  return form;
}
export type AgentPromptForm = ReturnType<typeof useAgentPrompt>;
`,
    ),
    file(
      `${root}/agent-prompt.tsx`,
      `import type * as React from "react";
import { useAgentPrompt } from "./use-agent-prompt";
import { AgentPromptView } from "./components/agent-prompt";
import type { AgentSend } from "./use-agent-conversation";
${i18n.importLine}
export function AgentPrompt({ send, pending }: { send: AgentSend; pending: boolean }): React.JSX.Element {
${i18n.hookLine}
  const form = useAgentPrompt(send, ${i18n.value("requestError", "Enter a message of at most 64 KiB.")});
  return <AgentPromptView form={form} pending={pending} label={${i18n.value("messageLabel", "Message Eve")}} placeholder={${i18n.value("messagePlaceholder", "Message Eve")}} working={${i18n.value("working", "Working…")}} submitLabel={${i18n.value("send", "Send")}} />;
}
`,
    ),
    file(
      `${root}/components/agent-prompt.tsx`,
      `import type * as React from "react";
${target === "expo" ? 'import { View } from "react-native";\nimport { Text } from "@/components/ui/text";\nimport { NativeFormField } from "@/components/form-fields/native-field";' : 'import { Form } from "@/components/ui/form";'}
${target === "expo" ? 'import { Button } from "@/components/ui/button";' : ""}
import type { AgentPromptForm } from "../use-agent-prompt";
export function AgentPromptView({ form, pending, label, placeholder, working, submitLabel }: { form: AgentPromptForm; pending: boolean; label: string; placeholder: string; working: string; submitLabel: string }): React.JSX.Element {
  return ${target === "expo" ? `<View className="gap-2"><form.Field name="message">{(field) => <NativeFormField label={label} value={field.state.value} placeholder={placeholder} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} disabled={pending} maxLength={65536} />}</form.Field><form.Subscribe selector={(state) => Boolean(state.values.message.trim())}>{(hasMessage) => <Button disabled={pending || !hasMessage} onPress={() => void form.handleSubmit()}><Text>{pending ? working : submitLabel}</Text></Button>}</form.Subscribe></View>` : `<form.AppForm><Form form={form} className="flex flex-col gap-2"><form.AppField name="message">{(field) => <field.TextField label={label} placeholder={placeholder} disabled={pending} maxLength={65536} />}</form.AppField><form.SubmitButton disabled={pending} pendingLabel={working}>{submitLabel}</form.SubmitButton></Form></form.AppForm>`};
}
`,
    ),
    file(
      `${root}/screen.tsx`,
      `import type * as React from "react";
import { useAgentScope } from "./use-agent-scope";
import { useAgentConversation } from "./use-agent-conversation";
import { AgentView } from "./components/agent-view";
import { AgentPrompt } from "./agent-prompt";
${i18n.importLine}
export function AgentScreen(): React.JSX.Element { const scope = useAgentScope(); return <AgentSession key={scope.key} phase={scope.phase} />; }
function AgentSession({ phase }: { phase: "pending" | "authenticated" | "anonymous" }): React.JSX.Element {
${i18n.hookLine}
  const conversation = useAgentConversation(${i18n.value("waiting", "Eve is waiting for your next action.")}, ${i18n.value("requestError", "Eve request failed.")});
  return <AgentView messages={conversation.messages} error={conversation.error}${target === "desktop" ? " pending={conversation.pending}" : ""} isPending={phase === "pending"} isAuthenticated={phase === "authenticated"} composer={<AgentPrompt send={conversation.send} pending={conversation.pending} />}${hasI18n ? " t={t}" : ""} />;
}
`,
    ),
    file(`${root}/components/agent-view.tsx`, conversationView(target, mode, hasI18n, source)),
  ];
}
