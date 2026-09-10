import { file, type TemplateFile } from "../../../shared.js";

export function nativeMessagingCommandFiles(root: string, alias: string): TemplateFile[] {
  return [
    file(
      `${root}/command-types.ts`,
      `import type { AuthOwnedMutationOutcome } from "${alias}/hooks/use-auth-owned-mutation";
export interface MessagingCommandResults { start: string; send: void; }
export type MessagingCommandKind = keyof MessagingCommandResults;
export type MessagingCommandSignature = string | readonly unknown[];
export type MessagingCommandOutcome<K extends MessagingCommandKind> = AuthOwnedMutationOutcome<MessagingCommandResults[K]>;
export interface MessagingCommandSnapshot { readonly isPending: boolean; readonly error: Error | null; }
export interface MessagingCommandScope {
  activate(): () => void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): MessagingCommandSnapshot;
  resetError(): void;
  run<K extends MessagingCommandKind>(kind: K, signature: MessagingCommandSignature, isCurrent: () => boolean, execute: () => Promise<MessagingCommandOutcome<K>>): Promise<MessagingCommandOutcome<K>>;
}
export function messagingSendSignature(input: { conversationId: string; body: string; clientMessageKey: string; attachment?: unknown }): MessagingCommandSignature {
  const attachment = input.attachment;
  const metadata = attachment && typeof attachment === "object"
    ? ["uri", "name", "mimeType", "size", "type", "lastModified"].map((key) => Reflect.get(attachment, key)) : [];
  return [input.conversationId, input.body, input.clientMessageKey, attachment ?? null, ...metadata];
}
`,
    ),
    file(
      `${root}/use-messaging-command-scope.ts`,
      `"use client";
import { useLayoutEffect, useRef } from "react";
import type { MessagingCommandKind, MessagingCommandOutcome, MessagingCommandScope, MessagingCommandSignature, MessagingCommandSnapshot } from "./command-types";
const IDLE: MessagingCommandSnapshot = Object.freeze({ isPending: false, error: null });
const PENDING: MessagingCommandSnapshot = Object.freeze({ isPending: true, error: null });
interface PendingCommand { kind: MessagingCommandKind; signature: MessagingCommandSignature; isCurrent(): boolean; promise: Promise<MessagingCommandOutcome<MessagingCommandKind>>; }
interface Conflict { isCurrent(): boolean; pending: MessagingCommandSnapshot; idle: MessagingCommandSnapshot; }
function sameSignature(left: MessagingCommandSignature, right: MessagingCommandSignature): boolean {
  return typeof left === "string" || typeof right === "string" ? left === right : left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

export function createMessagingCommandScope(): MessagingCommandScope {
  let mounted = false;
  let epoch = 0;
  let active: PendingCommand | null = null;
  let conflict: Conflict | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { const current = Array.from(listeners); for (const listener of current) listener(); };
  function getSnapshot(): MessagingCommandSnapshot {
    const pending = Boolean(mounted && active?.isCurrent());
    if (mounted && conflict?.isCurrent()) return pending ? conflict.pending : conflict.idle;
    return pending ? PENDING : IDLE;
  }
  function run<K extends MessagingCommandKind>(kind: K, signature: MessagingCommandSignature, isCurrent: () => boolean, execute: () => Promise<MessagingCommandOutcome<K>>): Promise<MessagingCommandOutcome<K>> {
    const capturedEpoch = epoch;
    const owns = () => mounted && epoch === capturedEpoch && isCurrent();
    if (!owns()) return Promise.resolve({ status: "ignored" });
    if (active?.isCurrent()) {
      // Same command kind fixes the output type; matching signatures share its execution.
      if (active.kind === kind && sameSignature(active.signature, signature)) return active.promise as Promise<MessagingCommandOutcome<K>>;
      const error = new Error("Another messaging action is in progress");
      conflict = { isCurrent: owns, pending: { isPending: true, error }, idle: { isPending: false, error } };
      notify(); return Promise.resolve({ status: "error", error, isCurrent: owns });
    }
    conflict = null;
    let settle!: (result: MessagingCommandOutcome<K>) => void;
    const promise = new Promise<MessagingCommandOutcome<K>>((resolve) => { settle = resolve; });
    const command: PendingCommand = { kind, signature, isCurrent: owns, promise };
    active = command;
    notify();
    function finish(result: MessagingCommandOutcome<K>): void {
      const current = owns() && (result.status === "ignored" || result.isCurrent());
      if (active === command) { active = null; notify(); }
      settle(current && result.status !== "ignored" ? { ...result, isCurrent: () => owns() && result.isCurrent() } : { status: "ignored" });
    }
    try {
      if (!owns()) finish({ status: "ignored" });
      else void execute().then(finish, (cause: unknown) => finish({ status: "error", error: cause instanceof Error ? cause : new Error("Messaging action failed"), isCurrent: owns }));
    } catch (cause) { finish({ status: "error", error: cause instanceof Error ? cause : new Error("Messaging action failed"), isCurrent: owns }); }
    return promise;
  }
  return {
    run, getSnapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    resetError() { conflict = null; notify(); },
    activate() {
      mounted = true; const current = ++epoch; active = null; conflict = null; notify();
      return () => { if (epoch === current) { mounted = false; epoch++; active = null; conflict = null; notify(); } };
    },
  };
}

export function useMessagingCommandScope(): MessagingCommandScope {
  const scope = useRef<MessagingCommandScope | null>(null);
  scope.current ??= createMessagingCommandScope();
  const current = scope.current;
  useLayoutEffect(() => current.activate(), [current]);
  return current;
}
`,
    ),
    file(
      `${root}/use-messaging-command-mutation.ts`,
      `"use client";
import { useSyncExternalStore } from "react";
import { useAuthOwnedEffect } from "${alias}/hooks/use-auth-owned-effect";
import { useAuthOwnedMutation, type AuthOwnedMutationEffects } from "${alias}/hooks/use-auth-owned-mutation";
import type { MessagingCommandKind, MessagingCommandResults, MessagingCommandScope, MessagingCommandSignature } from "./command-types";

export function useMessagingCommandMutation<K extends MessagingCommandKind, Input>(
  scope: MessagingCommandScope,
  kind: K,
  operation: (input: Input, isCurrent: () => boolean) => Promise<MessagingCommandResults[K]>,
  signature: (input: Input) => MessagingCommandSignature,
  effects: AuthOwnedMutationEffects<Input, MessagingCommandResults[K]> = {},
) {
  const captureOwner = useAuthOwnedEffect();
  const mutation = useAuthOwnedMutation(operation, effects);
  const shared = useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot);
  const run = (input: Input) => scope.run(kind, signature(input), captureOwner(), () => mutation.run(input));
  return { ...mutation, run, error: shared.error ?? mutation.error, isPending: shared.isPending,
    reset: () => { scope.resetError(); mutation.reset(); } };
}
`,
    ),
  ];
}
