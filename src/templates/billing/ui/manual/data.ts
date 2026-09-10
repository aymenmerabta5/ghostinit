export function manualQueriesContent(): string {
  return `"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc, orpcClient } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthGeneration, currentQueryAuthScope, subscribeQueryAuthGeneration } from "@/lib/query-client";

export function useManualQueryScope() {
  const queryClient = useQueryClient();
  const subscribe = React.useCallback((changed: () => void) => subscribeQueryAuthGeneration(queryClient, changed), [queryClient]);
  const read = React.useCallback(() => currentQueryAuthGeneration(queryClient), [queryClient]);
  const generation = React.useSyncExternalStore(subscribe, read, () => 0);
  return { queryClient, generation, scope: currentQueryAuthScope(queryClient) };
}
export function useManualSummary() {
  const { scope } = useManualQueryScope();
  const options = orpc.billing.manual.summary.queryOptions();
  return useQuery({ ...options, queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "manual-summary"], enabled: Boolean(scope) && typeof window !== "undefined", staleTime: 30_000 });
}
export function useManualHistory() {
  const { scope } = useManualQueryScope();
  const options = orpc.billing.manual.list.queryOptions();
  return useQuery({ ...options, queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "manual-history"], enabled: Boolean(scope) && typeof window !== "undefined", staleTime: 30_000 });
}
export function useManualReviewQueue(canReview: boolean) {
  const { scope } = useManualQueryScope();
  const options = orpc.billing.manual.reviewQueue.queryOptions();
  return useQuery({ ...options, queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "manual-review"], enabled: Boolean(scope) && canReview && typeof window !== "undefined", staleTime: 15_000 });
}
export function useManualReceipt(id: string, instanceId: string, requested: boolean) {
  const { scope } = useManualQueryScope();
  return useQuery({
    queryKey: scope ? authScopedQueryKey(scope, ["manual-receipt", id, instanceId]) : ["auth", "anonymous", "manual-receipt", instanceId],
    queryFn: () => orpcClient.billing.manual.receipt({ id }),
    enabled: Boolean(scope) && requested && typeof window !== "undefined",
    gcTime: 0, staleTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
}
`;
}

export function manualMutationsContent(): string {
  return `"use client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { orpc, orpcClient } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, type QueryAuthScope } from "@/lib/query-client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { manualReceiptAllowed } from "./receipt-utils";
import { MANUAL_RECEIPT_TYPES, type ManualReceipt, type ManualSubmitDraft, type ManualReviewInput } from "./model";

async function readManualReceipt(file: File): Promise<ManualReceipt> {
  const mimeType = MANUAL_RECEIPT_TYPES.find((candidate) => candidate === file.type);
  if (!manualReceiptAllowed(file) || !mimeType) throw new Error("MANUAL_RECEIPT_INVALID");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("MANUAL_RECEIPT_READ_FAILED"));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
      : reject(new Error("MANUAL_RECEIPT_READ_FAILED"));
    reader.readAsDataURL(file);
  });
  return { base64, mimeType, originalName: file.name };
}
async function refreshManualQueries(queryClient: QueryClient, scope: QueryAuthScope | null, isCurrent: () => boolean): Promise<void> {
  if (!scope || !isCurrent()) return;
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.billing.manual.summary.key({ type: "query" })) }),
    queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.billing.manual.list.key({ type: "query" })) }),
    queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.billing.manual.reviewQueue.key({ type: "query" })) }),
  ]);
}
export function useSubmitManualPayment() {
  const queryClient = useQueryClient();
  const mutation = useAuthOwnedMutation(async (draft: ManualSubmitDraft, isCurrent: () => boolean) => {
    const scope = currentQueryAuthScope(queryClient);
    const receipt = await readManualReceipt(draft.receipt);
    if (!isCurrent()) throw new Error("Payment request owner changed");
    const result = await orpcClient.billing.manual.submit({ ...draft, receipt });
    void refreshManualQueries(queryClient, scope, isCurrent);
    return result;
  });
  return { submit: mutation.run, error: mutation.error, isPending: mutation.isPending, isSuccess: mutation.isSuccess, reset: mutation.reset };
}
export function useReviewManualPayment() {
  const queryClient = useQueryClient();
  const mutation = useAuthOwnedMutation(async (input: ManualReviewInput, isCurrent: () => boolean) => {
    const scope = currentQueryAuthScope(queryClient);
    const result = await orpcClient.billing.manual.review(input);
    void refreshManualQueries(queryClient, scope, isCurrent);
    return result;
  });
  return { review: mutation.run, data: mutation.data, error: mutation.error, isPending: mutation.isPending, reset: mutation.reset };
}
`;
}
