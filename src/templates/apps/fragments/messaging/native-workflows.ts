import { file, type TemplateFile } from "../../../shared.js";

type Target = "expo" | "desktop";

export function nativeMessagingWorkflowFiles(target: Target, root: string): TemplateFile[] {
  const formImport =
    target === "expo"
      ? 'import { useForm } from "@tanstack/react-form";'
      : 'import { useAppForm } from "@/components/ui/form";';
  const useForm = target === "expo" ? "useForm" : "useAppForm";
  return [
    file(
      `${root}/types.ts`,
      `export type ConversationId = string;
export type AttachmentDraft = ${target === "expo" ? "{ uri: string; name: string; mimeType: string }" : "File"};
export interface MessagingAttachment { id: string; url: string; mimeType?: string; originalName?: string }
export interface MessagingMessage { id: string; senderId: string; body?: string; attachments?: readonly MessagingAttachment[] }
export interface SendMessageInput { conversationId: string; body: string; clientMessageKey: string; attachment?: AttachmentDraft | null }
export interface MessagingSnapshot {
  conversations: readonly { id: string }[]; messages: readonly MessagingMessage[];
  conversationsPending: boolean; conversationsError: Error | null; conversationsFetching: boolean; retryConversations(): Promise<void>;
  messagesPending: boolean; messagesError: Error | null; messagesFetching: boolean; retryMessages(): Promise<void>;
  transport: "native" | "realtime" | "polling"; typing: boolean; refresh(): Promise<void>;
}
`,
    ),
    file(
      `${root}/send-model.ts`,
      `import type { AttachmentDraft, SendMessageInput } from "./types";
export interface SendAttempt extends SendMessageInput { signature: string }
export function createClientMessageKey(): string {
  const source: unknown = Reflect.get(globalThis, "crypto");
  const randomUUID = typeof source === "object" && source !== null ? Reflect.get(source, "randomUUID") : null;
  if (typeof randomUUID === "function") { const value: unknown = Reflect.apply(randomUUID, source, []); if (typeof value === "string") return value; }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}
export function nextSendAttempt(previous: SendAttempt | null, conversationId: string, body: string, attachment: AttachmentDraft | null): SendAttempt {
  const signature = JSON.stringify([conversationId, body, attachment ? ${target === "expo" ? "[attachment.uri, attachment.name, attachment.mimeType]" : "[attachment.name, attachment.size, attachment.type, attachment.lastModified]"} : null]);
  if (previous?.signature === signature && previous.attachment === attachment) return previous;
  return { signature, conversationId, body, attachment, clientMessageKey: createClientMessageKey() };
}
`,
    ),
    file(
      `${root}/use-messaging-selection.ts`,
      `import { useState } from "react";
export function useMessagingSelection() {
  const [selected, select] = useState<string | null>(null);
  return { selected, select };
}
`,
    ),
    file(
      `${root}/use-messaging-scope.ts`,
      `import { useMessagingOwnership } from "./queries";
export function useMessagingScope() {
  const owner = useMessagingOwnership();
  return { key: owner.generation, available: !owner.isPending && owner.isAuthenticated };
}
`,
    ),
    file(
      `${root}/use-start-conversation-form.ts`,
      `${formImport}
import { useStartConversationMutation } from "./mutations";
import type { MessagingCommandScope } from "./command-types";
export function useStartConversationForm(scope: MessagingCommandScope, onStarted: (id: string) => void, required: string) {
  const start = useStartConversationMutation(scope);
  const form = ${useForm}({ defaultValues: { peerId: "" },
    validators: { onSubmit: ({ value }) => value.peerId.trim() ? undefined : { fields: { peerId: required } } },
    onSubmit: async ({ value }) => { const result = await start.run(value.peerId.trim()); if (result.status === "success" && result.isCurrent()) { form.reset(); onStarted(result.data); } },
  });
  return { form, pending: start.isPending, error: start.error };
}
export type StartConversationWorkflow = ReturnType<typeof useStartConversationForm>;
`,
    ),
    file(
      `${root}/use-message-composer.ts`,
      `import { useRef } from "react";
${formImport}
import { useSendMessageMutation, useTypingNotifier${target === "expo" ? ", useAttachmentPickerMutation" : ""} } from "./mutations";
import { nextSendAttempt, type SendAttempt } from "./send-model";
import type { AttachmentDraft } from "./types";
import type { MessagingCommandScope } from "./command-types";
export function useMessageComposer(scope: MessagingCommandScope, conversationId: string, invalid: string) {
  const send = useSendMessageMutation(scope);
  const notifyTyping = useTypingNotifier(conversationId);
  const attempt = useRef<SendAttempt | null>(null);
  ${target === "expo" ? "const picker = useAttachmentPickerMutation();" : ""}
  const form = ${useForm}({ defaultValues: { body: "", attachment: null as AttachmentDraft | null },
    validators: { onSubmit: ({ value }) => (value.body.trim() || value.attachment) && value.body.length <= 4000 ? undefined : { fields: { body: invalid } } },
    onSubmit: async ({ value }) => {
      const request = nextSendAttempt(attempt.current, conversationId, value.body.trim(), value.attachment);
      attempt.current = request;
      const result = await send.run(request);
      if (result.status === "success" && result.isCurrent()) {
        if (attempt.current === request) attempt.current = null;
        form.reset();
      }
    },
  });
  const setAttachment = (attachment: AttachmentDraft | null): void => { form.setFieldValue("attachment", attachment); };
  ${target === "expo" ? `const pickAttachment = async (): Promise<void> => { const result = await picker.run(undefined); if (result.status === "success" && result.isCurrent() && result.data) setAttachment(result.data); };` : ""}
  return { form, pending: send.isPending${target === "expo" ? " || picker.isPending" : ""}, error: send.error${target === "expo" ? " ?? picker.error" : ""}, notifyTyping, setAttachment${target === "expo" ? ", pickAttachment" : ""} };
}
export type MessageComposerWorkflow = ReturnType<typeof useMessageComposer>;
`,
    ),
    file(
      `${root}/use-messaging-attachment.ts`,
      `${target === "expo" ? 'import { useAttachmentPreviewQuery } from "./queries";' : ""}
import { useAttachmentDownloadMutation } from "./mutations";
import type { MessagingAttachment } from "./types";
export function useMessagingAttachment(attachment: MessagingAttachment) {
  const download = useAttachmentDownloadMutation();
  ${target === "expo" ? 'const preview = useAttachmentPreviewQuery(attachment.url, Boolean(attachment.mimeType?.startsWith("image/")));' : ""}
  return { pending: download.isPending, error: download.error, download: () => { void download.run(attachment); }${target === "expo" ? ", preview: preview.data, previewError: preview.error, previewPending: preview.isPending" : ""} };
}
`,
    ),
  ];
}

export function nativeMessagingQueryExtras(
  target: Target,
  alias: string,
  database: string,
): string {
  return `
import { useCallback as useOwnershipCallback, useSyncExternalStore } from "react";
import { useQueryClient as useOwnershipClient${target === "expo" ? ", useQuery as useAttachmentQuery" : ""} } from "@tanstack/react-query";
import { currentQueryAuthGeneration, subscribeQueryAuthGeneration } from "${alias}/lib/query-client";
import { useAuth } from "${alias}/hooks/${target === "expo" ? "use-auth" : "useAuth"}";
${target === "expo" ? `import { loadNativeAttachmentPreview } from "${alias}/adapters/messaging/${database}";` : ""}
export function useMessagingOwnership() {
  const client = useOwnershipClient();
  const subscribe = useOwnershipCallback((changed: () => void) => subscribeQueryAuthGeneration(client, changed), [client]);
  const read = useOwnershipCallback(() => currentQueryAuthGeneration(client), [client]);
  const generation = useSyncExternalStore(subscribe, read, () => 0);
  const identity = useAuth();
  return { generation, isPending: identity.isPending, isAuthenticated: identity.isAuthenticated };
}
${
  target === "expo"
    ? `export function useAttachmentPreviewQuery(url: string, enabled: boolean) {
  return useAttachmentQuery({ queryKey: ["messaging", "attachment-preview", url], enabled,
    queryFn: ({ signal }) => loadNativeAttachmentPreview(url, signal), staleTime: 60_000,
  });
}`
    : ""
}
`;
}

export function nativeMessagingMutationExtras(
  target: Target,
  alias: string,
  database: string,
): string {
  const download = target === "expo" ? "downloadNativeAttachment" : "downloadDesktopAttachment";
  return `
import { ${download}${target === "expo" ? ", pickNativeAttachment" : ""} } from "${alias}/adapters/messaging/${database}";
import { useAuthOwnedMutation } from "${alias}/hooks/use-auth-owned-mutation";
import type { MessagingAttachment } from "./types";
export function useAttachmentDownloadMutation() {
  return useAuthOwnedMutation(async (attachment: MessagingAttachment, isCurrent) => { await ${download}(attachment.url, attachment.originalName ?? "attachment", isCurrent); });
}
${
  target === "expo"
    ? `export function useAttachmentPickerMutation() {
  return useAuthOwnedMutation(async (_input: undefined, isCurrent) => await pickNativeAttachment(isCurrent));
}`
    : ""
}
`;
}
