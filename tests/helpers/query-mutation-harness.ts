interface MutationOptions {
  mutationFn(input: unknown): Promise<unknown>;
  onSuccess?(data: unknown, input: unknown): Promise<void> | void;
  onError?(error: Error, input: unknown): Promise<void> | void;
}

/** Model the library's latest-observer state; ownership remains executed template code. */
export function queryMutationHarness() {
  let latest = 0;
  let options: MutationOptions;
  const state: {
    variables?: unknown;
    data?: unknown;
    error: Error | null;
    isPending: boolean;
    isSuccess: boolean;
  } = { error: null, isPending: false, isSuccess: false };
  const mutateAsync = async (input: unknown): Promise<unknown> => {
    const request = ++latest;
    const selected = options;
    Object.assign(state, {
      variables: input,
      data: undefined,
      error: null,
      isPending: true,
      isSuccess: false,
    });
    try {
      const data = await selected.mutationFn(input);
      await selected.onSuccess?.(data, input);
      if (request === latest) Object.assign(state, { data, isPending: false, isSuccess: true });
      return data;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      await selected.onError?.(error, input);
      if (request === latest) Object.assign(state, { error, isPending: false });
      throw error;
    }
  };
  return {
    useMutation(next: MutationOptions) {
      options = next;
      return {
        ...state,
        mutateAsync,
        reset: () =>
          Object.assign(state, {
            variables: undefined,
            data: undefined,
            error: null,
            isPending: false,
            isSuccess: false,
          }),
      };
    },
    state,
  };
}
