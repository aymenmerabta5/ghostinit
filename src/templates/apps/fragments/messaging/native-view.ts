import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";

type Target = "expo" | "desktop";
type Mode = "single" | "monorepo";

export function nativeMessagingViewFiles(
  target: Target,
  mode: Mode,
  root: string,
  database: "postgres" | "convex",
  hasI18n: boolean,
): TemplateFile[] {
  const native = target === "expo";
  const i18n = nativeI18nTemplate(
    hasI18n,
    "messaging",
    nativeI18nImportPath(native ? "mobile" : "desktop", mode),
  );
  const tImport = hasI18n
    ? `import type { NamespaceTranslate } from "${nativeI18nImportPath(native ? "mobile" : "desktop", mode)}";`
    : "";
  const tType = hasI18n ? ' t: NamespaceTranslate<"messaging">;' : "";
  const tArg = hasI18n ? ", t" : "";
  const tProp = hasI18n ? " t={t}" : "";
  const event = native ? "onPress" : "onClick";
  const role = native ? 'accessibilityRole="alert"' : 'role="alert"';
  const busy = native ? "accessibilityState={{ busy: true }}" : 'aria-busy="true"';
  const label = native ? "accessibilityLabel" : "aria-label";
  const box = native ? "View" : "div";
  const text = native ? "Text" : "p";
  const coreImports = `import type * as React from "react";
${native ? 'import { View } from "react-native";\nimport { Text } from "@/components/ui/text";' : ""}
import { Alert, AlertTitle } from "@/components/ui/alert";`;
  const failure = (kind: "conversations" | "messages") =>
    `{messaging.${kind}Error ? <Alert variant="destructive" ${role}><AlertTitle>${i18n.child("operationError", "Messaging operation failed")}</AlertTitle><Button variant="outline" size="sm" disabled={messaging.${kind}Fetching} ${event}={() => void messaging.${kind === "messages" ? "retryMessages" : "retryConversations"}()}>${i18n.child("refresh", "Refresh")}</Button></Alert> : null}`;
  const conversationList = `${failure("conversations")}{messaging.conversationsPending ? <${box} ${busy} ${label}={${i18n.value("loadingConversations", "Loading conversations")}}><Skeleton className="h-12 w-full" /></${box}> : messaging.conversations.length === 0 ? messaging.conversationsError ? null : <${text} className="py-3 text-sm text-muted-foreground">${i18n.child("noConversations", "No conversations yet")}</${text}> : <${box} className="gap-2${native ? "" : " flex flex-col"}">{messaging.conversations.map((conversation) => <Button key={conversation.id} variant={selected === conversation.id ? "default" : "outline"} ${native ? "accessibilityState={{ selected: selected === conversation.id }}" : 'type="button" aria-pressed={selected === conversation.id}'} ${event}={() => onSelect(conversation.id)}><${native ? "Text" : "span"} className="font-mono text-xs">{conversation.id.slice(0, 12)}</${native ? "Text" : "span"}></Button>)}</${box}>}`;
  const messages = `{!selected ? <${text} className="py-8 text-center text-muted-foreground">${i18n.child("selectConversationShort", "Select a conversation.")}</${text}> : messaging.messagesPending ? <${box} ${busy} ${label}={${i18n.value("loadingMessages", "Loading messages")}}><Skeleton className="h-32 w-full" /></${box}> : messaging.messages.length === 0 ? messaging.messagesError ? null : <${text} className="py-8 text-center text-muted-foreground">${i18n.child("noMessages", "No messages yet. Say hello.")}</${text}> : messaging.messages.map((message) => ${native ? '<Card key={message.id}><CardHeader><CardDescription>{message.senderId.slice(0, 10)}</CardDescription></CardHeader><CardContent className="gap-2">{message.body ? <Text>{message.body}</Text> : null}{message.attachments?.map((attachment) => <View key={attachment.id}>{renderAttachment(attachment)}</View>)}</CardContent></Card>' : '<MessageScrollerItem key={message.id} messageId={message.id}><Message align="start"><MessageContent className="text-start"><MessageHeader>{message.senderId.slice(0, 10)}</MessageHeader>{message.body ? <Bubble variant="muted"><BubbleContent>{message.body}</BubbleContent></Bubble> : null}{message.attachments?.map((attachment) => <div key={attachment.id}>{renderAttachment(attachment)}</div>)}</MessageContent></Message></MessageScrollerItem>'})}`;
  const thread = `${failure("messages")}${native ? `<View className="gap-2">${messages}</View>` : `<MessageScrollerProvider autoScroll><MessageScroller className="max-h-[420px]"><MessageScrollerViewport><MessageScrollerContent role="log" aria-live="polite">${messages}</MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider>`}{messaging.typing ? <${text} className="text-sm text-muted-foreground">${i18n.child("typing", "Someone is typing…")}</${text}> : null}{composer}`;
  const workspace = `<${box} className="${native ? "gap-6" : "grid gap-6 lg:grid-cols-[300px_1fr]"}"><Card><CardHeader><CardTitle>${i18n.child("conversations", "Conversations")}</CardTitle><CardDescription>${i18n.child(native ? "mobileConversationsDescription" : "desktopConversationsDescription", "Start a direct thread with an existing user ID.")}</CardDescription></CardHeader><CardContent className="${native ? "gap-3" : "flex flex-col gap-3"}">{startForm}<MessagingConversationsView selected={selected} onSelect={onSelect} messaging={messaging}${tProp} /></CardContent></Card><Card><CardHeader><CardTitle>{selected ? ${hasI18n ? 't("thread", { id: selected.slice(0, 10) })' : '"Thread " + selected.slice(0, 10)'} : ${i18n.value("selectConversation", "Select a conversation")}}</CardTitle><CardDescription>${i18n.child("participantOnly", "Messages are visible only to conversation participants.")}</CardDescription></CardHeader><CardContent className="${native ? "gap-3" : "flex flex-col gap-3"}"><MessagingThreadView selected={selected} messaging={messaging} composer={composer} renderAttachment={renderAttachment}${tProp} /></CardContent></Card></${box}>`;
  const heading = `<${box}><${text} className="text-xs font-semibold uppercase tracking-widest text-primary">${i18n.child("privateChannel", "Private channel")}</${text}><${native ? "Text" : "h1"} className="mt-1 text-3xl font-semibold tracking-tight">${i18n.child("title", "Messages")}</${native ? "Text" : "h1"}><${text} className="mt-2 text-sm text-muted-foreground">${i18n.child(native ? "mobileDescription" : "desktopDescription", "Direct conversations with authenticated attachments.")}</${text}></${box}><Alert><AlertTitle>${database === "convex" ? i18n.child("nativeRealtime", "Native realtime") : i18n.child("securePolling", "Realtime with polling fallback")}</AlertTitle><AlertDescription>{messaging.transport === "polling" ? ${i18n.value("pollingDescription", "Refreshing every five seconds while the secure realtime connection is unavailable.")} : ${i18n.value("liveDescription", "Messages and typing update live.")}}</AlertDescription><Button variant="outline" size="sm" ${event}={() => void messaging.refresh()}>${i18n.child("refresh", "Refresh")}</Button></Alert>`;
  return [
    file(
      `${root}/components/messaging-workspace-view.tsx`,
      `${coreImports}
import { AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
${native ? 'import { ScrollView } from "react-native";' : ""}
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessagingConversationsView } from "./messaging-conversations-view";
import { MessagingThreadView } from "./messaging-thread-view";
import type { MessagingAttachment, MessagingSnapshot } from "../types";
${tImport}
export interface MessagingWorkspaceViewProps { selected: string | null; onSelect(id: string): void; messaging: MessagingSnapshot; startForm: React.ReactNode; composer: React.ReactNode; renderAttachment(attachment: MessagingAttachment): React.ReactNode;${tType} }
export function MessagingWorkspaceView({ selected, onSelect, messaging, startForm, composer, renderAttachment${tArg} }: MessagingWorkspaceViewProps): React.JSX.Element {
  return ${native ? `<View className="flex-1 bg-background"><ScrollView contentInsetAdjustmentBehavior="automatic"><View className="w-full max-w-[960px] self-center gap-5 p-5">${heading}${workspace}</View></ScrollView></View>` : `<main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">${heading}${workspace}</main>`};
}
`,
    ),
    file(
      `${root}/components/messaging-conversations-view.tsx`,
      `${coreImports}
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MessagingSnapshot } from "../types";
${tImport}
export function MessagingConversationsView({ selected, onSelect, messaging${tArg} }: { selected: string | null; onSelect(id: string): void; messaging: MessagingSnapshot;${tType} }): React.JSX.Element {
  return <${box} className="${native ? "gap-3" : "flex flex-col gap-3"}">${conversationList}</${box}>;
}
`,
    ),
    file(
      `${root}/components/messaging-thread-view.tsx`,
      `${coreImports}
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
${native ? 'import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";' : 'import { Bubble, BubbleContent, Message, MessageContent, MessageHeader, MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/chat";'}
import type { MessagingAttachment, MessagingSnapshot } from "../types";
${tImport}
export function MessagingThreadView({ selected, messaging, composer, renderAttachment${tArg} }: { selected: string | null; messaging: MessagingSnapshot; composer: React.ReactNode; renderAttachment(attachment: MessagingAttachment): React.ReactNode;${tType} }): React.JSX.Element {
  return <${box} className="${native ? "gap-3" : "flex flex-col gap-3"}">${thread}</${box}>;
}
`,
    ),
    file(
      `${root}/components/start-conversation-form-view.tsx`,
      `${coreImports}
${native ? 'import { Button } from "@/components/ui/button";' : ""}
${native ? 'import { NativeFormField } from "@/components/form-fields/native-field";' : 'import { Form } from "@/components/ui/form";'}
import type { StartConversationWorkflow } from "../use-start-conversation-form";
${tImport}
export function StartConversationFormView({ workflow${tArg} }: { workflow: StartConversationWorkflow;${tType} }): React.JSX.Element {
  const { form, pending, error } = workflow;
  return <${box} className="${native ? "gap-3" : "flex flex-col gap-3"}">{error ? <Alert variant="destructive" ${role}><AlertTitle>${i18n.child("operationError", "Messaging operation failed")}</AlertTitle></Alert> : null}${native ? `<form.Field name="peerId">{(field) => <NativeFormField label={${i18n.value("peerUserId", "Peer user ID")}} value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} disabled={pending} autoCapitalize="none" />}</form.Field><form.Subscribe selector={(state) => Boolean(state.values.peerId.trim())}>{(hasPeer) => <Button disabled={pending || !hasPeer} onPress={() => void form.handleSubmit()}><Text>${i18n.child("start", "Start")}</Text></Button>}</form.Subscribe>` : `<form.AppForm><Form form={form} className="flex flex-col gap-3"><form.AppField name="peerId">{(field) => <field.TextField label={${i18n.value("peerUserId", "Peer user ID")}} disabled={pending} />}</form.AppField><form.SubmitButton disabled={pending}>${i18n.child("start", "Start")}</form.SubmitButton></Form></form.AppForm>`}</${box}>;
}
`,
    ),
    file(
      `${root}/components/message-composer-view.tsx`,
      `${coreImports}
${native ? 'import { AlertDescription } from "@/components/ui/alert";\nimport { Button } from "@/components/ui/button";' : ""}
${native ? 'import { NativeFormField } from "@/components/form-fields/native-field";' : 'import { Form } from "@/components/ui/form";\nimport { Input } from "@/components/ui/input";'}
import type { MessageComposerWorkflow } from "../use-message-composer";
${tImport}
export function MessageComposerView({ workflow${tArg} }: { workflow: MessageComposerWorkflow;${tType} }): React.JSX.Element {
  const { form, pending, error, notifyTyping, setAttachment${native ? ", pickAttachment" : ""} } = workflow;
  return <${box} className="${native ? "gap-3" : "flex flex-col gap-3"}">{error ? <Alert variant="destructive" ${role}><AlertTitle>${i18n.child("operationError", "Messaging operation failed")}</AlertTitle></Alert> : null}${native ? `<form.Field name="body">{(field) => <NativeFormField label={${i18n.value("messagePlaceholder", "Type a message…")}} value={field.state.value} onChange={(value) => { field.handleChange(value); notifyTyping(Boolean(value.length)); }} onBlur={field.handleBlur} errors={field.state.meta.errors} disabled={pending} maxLength={4000} />}</form.Field><form.Subscribe selector={(state) => state.values.attachment}>{(attachment) => attachment ? <Alert><AlertDescription>{attachment.name}</AlertDescription><Button variant="outline" size="sm" disabled={pending} onPress={() => setAttachment(null)}><Text>${i18n.child("remove", "Remove")}</Text></Button></Alert> : null}</form.Subscribe><Button variant="outline" disabled={pending} onPress={() => void pickAttachment()}><Text>${i18n.child("attach", "Attach")}</Text></Button><form.Subscribe selector={(state) => Boolean(state.values.body.trim() || state.values.attachment)}>{(canSend) => <Button disabled={pending || !canSend} onPress={() => void form.handleSubmit()}><Text>{pending ? ${i18n.value("sending", "Sending…")} : ${i18n.value("send", "Send")}}</Text></Button>}</form.Subscribe>` : `<form.AppForm><Form form={form} className="flex flex-col gap-3"><form.AppField name="body" listeners={{ onChange: ({ value }) => notifyTyping(Boolean(value.length)) }}>{(field) => <field.TextAreaField label={${i18n.value("messagePlaceholder", "Type a message…")}} maxLength={4000} disabled={pending} />}</form.AppField><form.Field name="attachment">{(field) => <Input key={field.state.value ? "selected" : "empty"} type="file" aria-label={${i18n.value("attach", "Attach")}} disabled={pending} onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />}</form.Field><form.SubmitButton disabled={pending} pendingLabel={${i18n.value("sending", "Sending…")}}>${i18n.child("send", "Send")}</form.SubmitButton></Form></form.AppForm>`}</${box}>;
}
`,
    ),
    file(
      `${root}/components/messaging-attachment-view.tsx`,
      `${coreImports}
import { Button } from "@/components/ui/button";
${native ? 'import { Image } from "react-native";\nimport { Skeleton } from "@/components/ui/skeleton";' : ""}
import type { MessagingAttachment } from "../types";
${tImport}
export function MessagingAttachmentView({ attachment, pending, error, download${native ? ", preview, previewError, previewPending" : ""}${tArg} }: { attachment: MessagingAttachment; pending: boolean; error: Error | null; download(): void;${native ? " preview: string | undefined; previewError: Error | null; previewPending: boolean;" : ""}${tType} }): React.JSX.Element {
  return <${box} className="${native ? "gap-2" : "flex flex-col gap-2"}">${native ? `{attachment.mimeType?.startsWith("image/") ? previewError ? <Text accessibilityRole="alert">${i18n.child("operationError", "Attachment preview unavailable")}</Text> : previewPending ? <Skeleton className="h-40 w-full" /> : preview ? <Image source={{ uri: preview }} accessibilityLabel={attachment.originalName ?? ${i18n.value("downloadAttachment", "Download attachment")}} className="h-40 w-full rounded-md" resizeMode="cover" /> : null : null}` : ""}<Button variant="outline" disabled={pending} ${event}={download}><${native ? "Text" : "span"}>{attachment.originalName ?? ${i18n.value("downloadAttachment", "Download attachment")}}</${native ? "Text" : "span"}></Button>{error ? <Alert variant="destructive" ${role}><AlertTitle>${i18n.child("operationError", "Messaging operation failed")}</AlertTitle></Alert> : null}</${box}>;
}
`,
    ),
    file(
      `${root}/start-conversation-form.tsx`,
      `import type * as React from "react";
import { useStartConversationForm } from "./use-start-conversation-form";
import { StartConversationFormView } from "./components/start-conversation-form-view";
import type { MessagingCommandScope } from "./command-types";
${i18n.importLine}
export function StartConversationForm({ scope, onStarted }: { scope: MessagingCommandScope; onStarted(id: string): void }): React.JSX.Element {
${i18n.hookLine}
  const workflow = useStartConversationForm(scope, onStarted, ${i18n.value("peerUserId", "Peer user ID")});
  return <StartConversationFormView workflow={workflow}${tProp} />;
}
`,
    ),
    file(
      `${root}/message-composer.tsx`,
      `import type * as React from "react";
import { useMessageComposer } from "./use-message-composer";
import { MessageComposerView } from "./components/message-composer-view";
import type { MessagingCommandScope } from "./command-types";
${i18n.importLine}
export function MessageComposer({ scope, conversationId }: { scope: MessagingCommandScope; conversationId: string }): React.JSX.Element {
${i18n.hookLine}
  const workflow = useMessageComposer(scope, conversationId, ${i18n.value("messagePlaceholder", "Enter a message or choose an attachment.")});
  return <MessageComposerView workflow={workflow}${tProp} />;
}
`,
    ),
    file(
      `${root}/messaging-attachment.tsx`,
      `import type * as React from "react";
import { useMessagingAttachment } from "./use-messaging-attachment";
import { MessagingAttachmentView } from "./components/messaging-attachment-view";
import type { MessagingAttachment } from "./types";
${i18n.importLine}
export function MessagingAttachmentItem({ attachment }: { attachment: MessagingAttachment }): React.JSX.Element {
${i18n.hookLine}
  const workflow = useMessagingAttachment(attachment);
  return <MessagingAttachmentView attachment={attachment} {...workflow}${tProp} />;
}
`,
    ),
    file(
      `${root}/screen.tsx`,
      `import type * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMessagingScope } from "./use-messaging-scope";
import { useMessagingSelection } from "./use-messaging-selection";
import { useMessagingCommandScope } from "./use-messaging-command-scope";
import { useMessagingReads } from "./queries";
import { MessagingWorkspaceView } from "./components/messaging-workspace-view";
import { StartConversationForm } from "./start-conversation-form";
import { MessageComposer } from "./message-composer";
import { MessagingAttachmentItem } from "./messaging-attachment";
${i18n.importLine}
export function MessagesScreen(): React.JSX.Element {
  const scope = useMessagingScope();
  return scope.available ? <MessagingSession key={scope.key} /> : <Skeleton className="h-32 w-full" />;
}
function MessagingSession(): React.JSX.Element {
${i18n.hookLine}
  const { selected, select } = useMessagingSelection();
  const commands = useMessagingCommandScope();
  const messaging = useMessagingReads(selected);
  return <MessagingWorkspaceView selected={selected} onSelect={select} messaging={messaging}
    startForm={<StartConversationForm key={selected ?? "none"} scope={commands} onStarted={select} />}
    composer={selected ? <MessageComposer key={selected} scope={commands} conversationId={selected} /> : null}
    renderAttachment={(attachment) => <MessagingAttachmentItem key={attachment.id} attachment={attachment} />}${tProp} />;
}
`,
    ),
  ];
}
