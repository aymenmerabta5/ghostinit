export function messagingWorkspaceWorkflowContent(next: boolean): string {
  return `"use client";
import { useState } from "react";
import { useAppForm, useStore } from "@/components/ui/form";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useConversations } from "./queries";
import { useStartConversation } from "./mutations";
import type { ConversationSummary } from "./model";

export function useMessagingWorkspace(initialConversations: ConversationSummary[] = []) {
  const captureOwner = useAuthOwnedEffect();
  const [selected, setSelected] = useState<string | null>(null);
  const form = useAppForm({ defaultValues: { peerId: "" }, onSubmit: async ({ value }): Promise<void> => { await startConversation(value.peerId); } });
  const peerId = useStore(form.store, state => state.values.peerId);
  const setPeerId = (value: string): void => { form.setFieldValue("peerId", value); };
  const inbox = useConversations();
  const starter = useStartConversation();
  const conversations = inbox.data ?? ${next ? "initialConversations" : "[]"};
  ${next ? "" : "void initialConversations;"}
  async function startConversation(requestedPeerId: string): Promise<void> {
    if (!requestedPeerId.trim()) return;
    const isCurrent = captureOwner();
    if (!isCurrent()) return;
    try {
      const id = await starter.start(requestedPeerId.trim());
      if (isCurrent() && id !== null) { setSelected(id); setPeerId(""); }
    } catch { /* Mutation owns the current request error. */ }
  }
  return {
    selected, setSelected, peerId, setPeerId, conversations,
    conversationsLoading: inbox.isPending${next ? " && conversations.length === 0" : ""},
    conversationsError: Boolean(inbox.error), conversationsFetching: inbox.isFetching,
    refreshConversations: () => { void inbox.refetch(); },
    starting: starter.isPending, startError: Boolean(starter.error),
    startConversation: () => { void form.handleSubmit(); },
  };
}
`;
}

export function messageTypingWorkflowContent(): string {
  return `"use client";
import { useEffect, useRef, useState } from "react";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { subscribeConversation } from "./queries";

export function useMessageTyping(conversationId: string) {
  const captureOwner = useAuthOwnedEffect();
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const timeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (!conversationId) return;
    const isCurrent = captureOwner();
    const unsubscribe = subscribeConversation(conversationId, (event) => {
      if (!isCurrent() || event.type !== "typing" || event.conversationId !== conversationId) return;
      const userId = event.userId;
      setTypingUsers(previous => { const next = new Set(previous); if (event.isTyping) next.add(userId); else next.delete(userId); return next; });
      const existing = timeouts.current.get(userId);
      if (existing) clearTimeout(existing);
      if (event.isTyping) {
        timeouts.current.set(userId, setTimeout(() => {
          if (isCurrent()) setTypingUsers(previous => { const next = new Set(previous); next.delete(userId); return next; });
          timeouts.current.delete(userId);
        }, 3000));
      }
    });
    return () => { unsubscribe(); for (const timeout of timeouts.current.values()) clearTimeout(timeout); timeouts.current.clear(); };
  }, [conversationId, captureOwner]);
  return typingUsers;
}
`;
}

export function messageThreadWorkflowContent(): string {
  return `"use client";
import { useEffect } from "react";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useMessageQuery, useInvalidateMessaging, subscribeConversation } from "./queries";
import { useMessageTyping } from "./use-message-typing";

export function useMessageThread(conversationId: string) {
  const captureOwner = useAuthOwnedEffect();
  const query = useMessageQuery(conversationId);
  const invalidate = useInvalidateMessaging();
  const typing = useMessageTyping(conversationId);
  const canSubscribe = query.canSubscribe;
  useEffect(() => {
    if (!conversationId || !canSubscribe) return;
    const isCurrent = captureOwner();
    return subscribeConversation(conversationId, event => {
      if (isCurrent() && event.type === "message" && event.conversationId === conversationId) void invalidate();
    });
  }, [conversationId, canSubscribe, invalidate, captureOwner]);
  return { conversationId, messages: query.data, loading: query.isPending, error: Boolean(query.error), refreshing: query.isFetching, refresh: () => { void query.refetch(); }, typing: typing.size > 0 };
}
`;
}

export function messageComposerWorkflowContent(): string {
  return `"use client";
import { useRef } from "react";
import { useAppForm, useStore } from "@/components/ui/form";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { useSendMessage, uploadMessageAttachment } from "./mutations";
import { messageAttachmentFingerprint, reusablePendingAttachmentId, type PendingMessageAttachmentUpload } from "./model";

export function useMessageComposer(conversationId: string) {
  const sender = useSendMessage(conversationId);
  const form = useAppForm({ defaultValues: { body: "", file: null as File | null }, onSubmit: async ({ value }): Promise<void> => { if (value.body.trim() || value.file) await submission.run(value); } });
  const { body, file } = useStore(form.store, state => state.values);
  const setBody = (value: string): void => { form.setFieldValue("body", value); };
  const setFile = (value: File | null): void => { form.setFieldValue("file", value); };
  const pendingUpload = useRef<PendingMessageAttachmentUpload | null>(null);
  const submission = useAuthOwnedMutation(async (input: { body: string; file: File | null }, isCurrent) => {
    let attachmentIds: string[] | undefined;
    if (input.file) {
      const fileFingerprint = messageAttachmentFingerprint(input.file);
      let attachmentId = reusablePendingAttachmentId(pendingUpload.current, conversationId, fileFingerprint);
      if (!attachmentId) {
        attachmentId = await uploadMessageAttachment(conversationId, input.file);
        if (!isCurrent()) return null;
        pendingUpload.current = { conversationId, fileFingerprint, attachmentId };
      }
      attachmentIds = [attachmentId];
    }
    if (!isCurrent()) return null;
    return sender.send(input.body.trim(), attachmentIds);
  }, { onSuccess: (result) => {
    if (result === null) return;
    pendingUpload.current = null;
    setBody(""); setFile(null);
    try { sender.sendTyping(false); } catch { /* Delivery succeeded; typing cleanup is advisory. */ }
  } });
  function changeFile(nextFile: File | null): void {
    const reusable = nextFile ? reusablePendingAttachmentId(pendingUpload.current, conversationId, messageAttachmentFingerprint(nextFile)) : undefined;
    if (!reusable) pendingUpload.current = null;
    setFile(nextFile);
  }
  return {
    body, hasFile: file !== null, pending: submission.isPending || sender.isPending, error: Boolean(submission.error),
    changeBody: (value: string) => { setBody(value); sender.sendTyping(value.length > 0); },
    changeFile,
    submit: () => { void form.handleSubmit(); },
  };
}
`;
}
