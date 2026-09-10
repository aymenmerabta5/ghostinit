export function convexInboxHookContent(): string {
  return `"use client";
import * as React from "react";
import { useConvexConversations, useConvexMessages, useConvexTyping } from "./queries";
import type { ConversationId, InitialConversation } from "./model";
export function useConvexInbox(initialConversations: InitialConversation[] = []) {
  const { items, generation } = useConvexConversations(initialConversations);
  const [selection, setSelection] = React.useState<{ id: ConversationId; generation: number } | null>(null);
  return { items, generation, selected: selection?.generation === generation ? selection.id : null, select: (id: ConversationId) => setSelection({ id, generation }) };
}
export function useConvexThread(conversationId: ConversationId) {
  const messages = useConvexMessages(conversationId);
  const typing = useConvexTyping(conversationId);
  return { messages, typing: (typing?.length ?? 0) > 0 };
}
`;
}

export function convexStartFormHookContent(): string {
  return `"use client";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useStartConvexConversation } from "./mutations";
import type { ConversationId } from "./model";
export function useStartConversationForm(onStarted: (id: ConversationId) => void) {
  const t = useSurfaceTranslations("messaging");
  const mutation = useStartConvexConversation();
  const form = useAppForm({
    defaultValues: { peerUserId: "" },
    onSubmit: async ({ value }) => {
      const peerUserId = value.peerUserId.trim(); if (!peerUserId) return;
      const result = await mutation.run(peerUserId);
      if (result.status !== "success" || !result.isCurrent()) return;
      onStarted(result.data._id); form.reset();
    },
  });
  return { form, error: mutation.error ? t("operationError") : null };
}
`;
}

export function convexComposerHookContent(attachments: boolean): string {
  return `"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useSendConvexMessage, useConvexTypingMutation${attachments ? ", useUploadConvexAttachment" : ""} } from "./mutations";
${attachments ? 'import { useMessagingOwner } from "./queries";\nimport { convexAttachmentFingerprint, reusableConvexAttachmentId, type PendingConvexAttachmentUpload, type AttachmentId } from "./model";' : ""}
import type { ConversationId } from "./model";
export function useConvexMessageForm(conversationId: ConversationId) {
  const t = useSurfaceTranslations("messaging");
  const send = useSendConvexMessage();
  const typing = useConvexTypingMutation();
  const captureOwner = useAuthOwnedEffect();
  const admission = React.useRef<(() => boolean) | null>(null);
${
  attachments
    ? `  const upload = useUploadConvexAttachment();
  const { generation } = useMessagingOwner();
  const pendingUpload = React.useRef<PendingConvexAttachmentUpload | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);`
    : ""
}
  const form = useAppForm({
    defaultValues: { body: ""${attachments ? ", file: null as File | null" : ""} },
    onSubmit: async ({ value }) => {
      const body = value.body.trim();
      if (${attachments ? "!body && !value.file" : "!body"}) return;
      if (admission.current?.()) return;
      const isCurrent = captureOwner(); if (!isCurrent()) return;
      admission.current = isCurrent;
      send.reset();${attachments ? " upload.reset();" : ""}
      try {
${
  attachments
    ? `        let attachmentIds: AttachmentId[] | undefined;
        if (value.file) {
          const fileFingerprint = convexAttachmentFingerprint(value.file);
          let attachmentId = reusableConvexAttachmentId(pendingUpload.current, String(conversationId), fileFingerprint, generation);
          if (!attachmentId) {
            const uploaded = await upload.run({ conversationId, file: value.file });
            if (uploaded.status !== "success" || !isCurrent() || !uploaded.isCurrent()) return;
            attachmentId = uploaded.data;
            pendingUpload.current = { conversationId: String(conversationId), fileFingerprint, generation, attachmentId };
          }
          attachmentIds = [attachmentId];
        }
        if (!isCurrent()) return;`
    : ""
}
        const result = await send.run({ conversationId, ...(body ? { body } : {})${attachments ? ", ...(attachmentIds ? { attachmentIds } : {})" : ""} });
        if (result.status !== "success" || !isCurrent() || !result.isCurrent()) return;
${
  attachments
    ? `        pendingUpload.current = null;
        if (fileInput.current) fileInput.current.value = "";`
    : ""
}
        form.reset();
        // Delivery succeeded; typing cleanup is advisory and cannot turn it into a failed send.
        void typing.run({ conversationId, isTyping: false });
      } finally { if (admission.current === isCurrent) admission.current = null; }
    },
  });
  function onBodyChanged(body: string): void { void typing.run({ conversationId, isTyping: body.length > 0 }); }
${
  attachments
    ? `  function onFileChanged(file: File | null): void {
    if (!file || !reusableConvexAttachmentId(pendingUpload.current, String(conversationId), convexAttachmentFingerprint(file), generation)) pendingUpload.current = null;
  }`
    : ""
}
  return { form, onBodyChanged, ${attachments ? "fileInput, onFileChanged, " : ""}error: ${attachments ? "upload.error || " : ""}send.error ? t("sendError") : null };
}
`;
}
