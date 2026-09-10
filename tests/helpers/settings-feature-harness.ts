import { webSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/feature.js";
import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { generatedFormHarness } from "./generated-form-harness.js";

export function settingsSource(
  mode: "monorepo" | "single",
  router: "next" | "tanstack",
  ...paths: string[]
): string {
  const root = mode === "single" ? "src" : "apps/web/src";
  const files = webSettingsFeatureFiles(root, router, true, true, true);
  return paths
    .map((path) => {
      const file = files.find((entry) => entry.path === `${root}/features/${path}`);
      if (!file) throw new Error(`Missing emitted settings feature: ${path}`);
      return file.content;
    })
    .join("\n");
}

interface MutationOptions {
  mutationFn(input: unknown): Promise<unknown>;
  onSuccess?(data: unknown, input: unknown): Promise<void>;
  onError?(error: Error, input: unknown): Promise<void>;
}
interface MutationState {
  options: MutationOptions;
  variables?: unknown;
  data?: unknown;
  error: Error | null;
  isPending: boolean;
  isSuccess: boolean;
  request: number;
}

/** Runs emitted adapters/workflows with the real generated ownership primitive. */
export function settingsFeatureHarness(
  source: string,
  names: string[],
  bindings: Record<string, unknown> = {},
) {
  let generation = 0;
  let mounted = true;
  let cursor = 0;
  let layoutCursor = 0;
  const mutations: MutationState[] = [];
  const cleanups: Array<(() => void) | undefined> = [];
  const invalidations: unknown[] = [];
  const queryClient = {
    invalidateQueries: async (input: unknown) => {
      invalidations.push(input);
    },
  };
  const ui = generatedFormHarness(
    authOwnedMutationContent() +
      "\n" +
      source +
      "\nconst useRef = React.useRef; const useCallback = React.useCallback;",
    names,
    {
      useQueryClient: () => queryClient,
      getQueryClient: () => queryClient,
      currentQueryAuthGeneration: () => generation,
      currentQueryAuthScope: () => ({
        userId: "owner",
        sessionId: "session",
        tenantId: null,
        teamId: null,
      }),
      currentQueryAuthIdentity: () => ({ userId: "owner", sessionId: "session" }),
      subscribeQueryAuthGeneration: () => () => {},
      useAuthOwnedEffect: () => () => {
        const captured = generation;
        return () => mounted && generation === captured;
      },
      useLayoutEffect: (effect: () => (() => void) | undefined) => {
        const index = layoutCursor++;
        if (!(index in cleanups)) cleanups[index] = effect();
      },
      useMutation: (options: MutationOptions) => {
        const index = cursor++;
        const state = (mutations[index] ??= {
          options,
          error: null,
          isPending: false,
          isSuccess: false,
          request: 0,
        });
        state.options = options;
        return {
          ...state,
          reset: () =>
            Object.assign(state, {
              variables: undefined,
              data: undefined,
              error: null,
              isPending: false,
              isSuccess: false,
            }),
          mutateAsync: async (input: unknown) => {
            const request = ++state.request;
            const selected = state.options;
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
              if (state.request === request)
                Object.assign(state, { data, isPending: false, isSuccess: true });
              return data;
            } catch (cause) {
              const error = cause instanceof Error ? cause : new Error(String(cause));
              await selected.onError?.(error, input);
              if (state.request === request)
                Object.assign(state, { error, isPending: false, isSuccess: false });
              throw error;
            }
          },
        };
      },
      ...bindings,
    },
  );
  return {
    ...ui,
    invalidations,
    queryClient,
    render(name: string, props?: unknown) {
      cursor = 0;
      layoutCursor = 0;
      return ui.render(name, props);
    },
    changeOwner() {
      generation++;
    },
    unmount() {
      mounted = false;
      for (const cleanup of cleanups) cleanup?.();
      ui.unmount();
    },
  };
}
