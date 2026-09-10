import { file, type TemplateFile } from "../../shared.js";

export function authOwnedMutationContent(queryImport = "@/lib/query-client"): string {
  return `"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { currentQueryAuthGeneration, subscribeQueryAuthGeneration } from "${queryImport}";
import { useAuthOwnedEffect } from "./use-auth-owned-effect";

export type AuthOwnedMutationOutcome<T> =
  | { status: "success"; data: T; isCurrent(): boolean }
  | { status: "error"; error: Error; isCurrent(): boolean }
  | { status: "ignored" };

export interface AuthOwnedMutationEffects<Input, Output> {
  onSuccess?(data: Output, input: Input, isCurrent: () => boolean): void | Promise<void>;
  onError?(error: Error, input: Input, isCurrent: () => boolean): void | Promise<void>;
}

interface OwnedInvocation<Input> { input: Input; isCurrent(): boolean }
class ObsoleteMutation extends Error { constructor() { super("The action owner changed"); } }
function mutationError(error: unknown): Error { return error instanceof Error ? error : new Error("Request failed"); }

/**
 * Protected-owner operations. Public sign-in flows intentionally change identity
 * and should keep their SDK/intent lifetime instead of weakening this boundary.
 * Recheck isCurrent after awaits before navigation, downloads or other UI effects.
 */
export function useAuthOwnedMutation<Input, Output>(
  operation: (input: Input, isCurrent: () => boolean) => Promise<Output>,
  effects: AuthOwnedMutationEffects<Input, Output> = {},
) {
  const queryClient = useQueryClient();
  const captureOwner = useAuthOwnedEffect();
  const admission = React.useRef<OwnedInvocation<Input> | null>(null);
  const subscribe = React.useCallback((changed: () => void) => subscribeQueryAuthGeneration(queryClient, changed), [queryClient]);
  const snapshot = React.useCallback(() => currentQueryAuthGeneration(queryClient), [queryClient]);
  React.useSyncExternalStore(subscribe, snapshot, () => 0);
  const mutation = useMutation<Output, Error, OwnedInvocation<Input>>({
    // Previous owned actions attempted immediately; do not enqueue an offline write
    // that could resume after its account/session/workspace owner has changed.
    networkMode: "always",
    retry: false,
    mutationFn: async (call) => {
      if (!call.isCurrent()) throw new ObsoleteMutation();
      try {
        const data = await operation(call.input, call.isCurrent);
        if (!call.isCurrent()) throw new ObsoleteMutation();
        return data;
      } catch (error) {
        if (!call.isCurrent()) throw new ObsoleteMutation();
        throw mutationError(error);
      }
    },
    onSuccess: async (data, call) => {
      if (call.isCurrent()) await effects.onSuccess?.(data, call.input, call.isCurrent);
    },
    onError: async (error, call) => {
      if (call.isCurrent() && !(error instanceof ObsoleteMutation)) await effects.onError?.(error, call.input, call.isCurrent);
    },
  });

  const run = React.useCallback(async (input: Input): Promise<AuthOwnedMutationOutcome<Output>> => {
    // React's pending render is asynchronous, so admission itself must be synchronous.
    if (admission.current?.isCurrent()) return { status: "ignored" };
    const call: OwnedInvocation<Input> = { input, isCurrent: captureOwner() };
    if (!call.isCurrent()) return { status: "ignored" };
    admission.current = call;
    try {
      const data = await mutation.mutateAsync(call);
      return call.isCurrent() ? { status: "success", data, isCurrent: call.isCurrent } : { status: "ignored" };
    } catch (error) {
      return call.isCurrent() && !(error instanceof ObsoleteMutation)
        ? { status: "error", error: mutationError(error), isCurrent: call.isCurrent }
        : { status: "ignored" };
    } finally {
      // An old owner's completion cannot release a newer owner's admitted write.
      if (admission.current === call) admission.current = null;
    }
  }, [captureOwner, mutation.mutateAsync]);

  const ownsState = mutation.variables?.isCurrent() ?? true;
  return {
    run,
    variables: ownsState ? mutation.variables?.input : undefined,
    data: ownsState ? mutation.data : undefined,
    error: ownsState && !(mutation.error instanceof ObsoleteMutation) ? mutation.error : null,
    isPending: ownsState && mutation.isPending,
    isSuccess: ownsState && mutation.isSuccess,
    reset: mutation.reset,
  };
}
`;
}

export function authOwnedMutationFile(sourceRoot: string, queryImport?: string): TemplateFile {
  return file(
    `${sourceRoot}/hooks/use-auth-owned-mutation.ts`,
    authOwnedMutationContent(queryImport),
  );
}
