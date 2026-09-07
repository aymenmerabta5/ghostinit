export function jobProcessLifecycleContent(): string {
  return `/** Sleep without retaining one abort listener for every completed polling interval. */
export function interruptibleSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    // Close the gap for custom AbortSignal-compatible implementations.
    if (signal.aborted) finish();
  });
}

/** Forward process shutdown into the active job and return deterministic cleanup. */
export function linkAbortSignal(source: AbortSignal, destination: AbortController): () => void {
  const abort = () => destination.abort(source.reason);
  if (source.aborted) {
    abort();
    return () => {};
  }
  source.addEventListener("abort", abort, { once: true });
  if (source.aborted) abort();
  return () => source.removeEventListener("abort", abort);
}
`;
}
