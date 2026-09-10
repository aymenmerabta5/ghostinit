interface QueryOptions {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<unknown>;
}

interface QueryState {
  data: unknown;
  error: Error | null;
  isFetching: boolean;
  promise: Promise<unknown> | null;
}

/** Model query-cache observation and same-key fetch deduplication, not feature admission. */
export function capabilityOperationQueryHarness() {
  const records = new Map<string, QueryState>();
  const record = (queryKey: readonly unknown[]): QueryState => {
    const key = JSON.stringify(queryKey);
    let state = records.get(key);
    if (!state) {
      state = { data: undefined, error: null, isFetching: false, promise: null };
      records.set(key, state);
    }
    return state;
  };
  const client = {
    fetchQuery(options: QueryOptions): Promise<unknown> {
      const state = record(options.queryKey);
      if (state.promise) return state.promise;
      state.isFetching = true;
      state.error = null;
      const pending = options.queryFn().then(
        (data) => {
          state.data = data;
          state.isFetching = false;
          state.promise = null;
          return data;
        },
        (error: unknown) => {
          state.error = error instanceof Error ? error : new Error(String(error));
          state.isFetching = false;
          state.promise = null;
          throw error;
        },
      );
      state.promise = pending;
      return pending;
    },
    setQueryData(queryKey: readonly unknown[], data: unknown) {
      Object.assign(record(queryKey), { data, error: null });
    },
  };
  return {
    client,
    // These action tests model explicit fetchQuery calls. Effect-driven initial
    // fetching and route hydration have separate integration coverage.
    useQuery(options: QueryOptions) {
      const state = record(options.queryKey);
      return { data: state.data, error: state.error, isFetching: state.isFetching };
    },
  };
}
