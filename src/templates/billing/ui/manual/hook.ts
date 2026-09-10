export function manualHookContent(): string {
  return `"use client";
import { useManualHistory, useManualQueryScope, useManualReviewQueue, useManualSummary } from "./queries";

export function useManualOwnerGeneration(): number {
  return useManualQueryScope().generation;
}
export function useManualPayments() {
  const summary = useManualSummary();
  const history = useManualHistory();
  const queue = useManualReviewQueue(summary.data?.canReview === true);
  async function refresh(): Promise<void> {
    await Promise.all([summary.refetch(), history.refetch(), ...(summary.data?.canReview ? [queue.refetch()] : [])]);
  }
  return { summary, history, queue, refresh };
}
`;
}
