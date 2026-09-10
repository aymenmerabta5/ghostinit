import { describe, expect, test } from "bun:test";
import {
  accountDeletionMutationContent,
  accountDeletionOwnerContent,
} from "../../src/templates/apps/fragments/settings/deletion.js";
import { deferred } from "../helpers/generated-form-harness.js";

interface Owner {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  teamId: string | null;
}
interface Call {
  isCurrent(): boolean;
}
interface Hook {
  run(password?: string): Promise<void>;
  pending: boolean;
  error: unknown;
}
const owner = (userId = "a", sessionId = "s-a"): Owner => ({
  userId,
  sessionId,
  tenantId: null,
  teamId: null,
});

function harness() {
  let identity: Owner | null = owner();
  let scope: Owner | null = owner();
  let generation = 0;
  let cursor = 0;
  const refs: Array<{ current: unknown }> = [];
  let cleanup: (() => void) | undefined;
  let layoutInitialized = false;
  let operation: ((call: Call) => Promise<void>) | undefined;
  const subscribers = new Set<() => void>();
  const request = deferred<{ error?: { message: string } }>();
  const events: string[] = [];
  let afterRetire: (() => void) | undefined;
  const mutation: { variables?: Call; isPending: boolean; error: unknown } = {
    isPending: false,
    error: null,
  };
  const notify = () => {
    generation++;
    // A notification observes the listener cohort present before reentrant changes.
    const callbacks = Array.from(subscribers);
    for (const callback of callbacks) callback();
  };
  const bindings = {
    useQueryClient: () => ({}),
    useRef: (initial: unknown) => refs[cursor++] ?? (refs[cursor - 1] = { current: initial }),
    useLayoutEffect: (effect: () => () => void) => {
      if (!layoutInitialized) {
        cleanup = effect();
        layoutInitialized = true;
      }
    },
    useCallback: (callback: unknown) => callback,
    useSyncExternalStore: () => generation,
    currentQueryAuthGeneration: () => generation,
    currentQueryAuthIdentity: () => identity,
    currentQueryAuthScope: () => scope,
    subscribeQueryAuthGeneration: (_client: unknown, callback: () => void) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    transitionQueryAuthScope: () => {
      events.push("retire");
      scope = null;
      notify();
      afterRetire?.();
    },
    identityFailure: (error: { message: string }) => new Error(error.message),
    identityClient: {
      deleteAccount: () => {
        events.push("request");
        return request.promise;
      },
    },
    useMutation: (options: { mutationFn(call: Call): Promise<void> }) => {
      operation = options.mutationFn;
      return {
        ...mutation,
        reset: () => {
          mutation.error = null;
        },
        mutateAsync: async (call: Call) => {
          mutation.variables = call;
          mutation.isPending = true;
          try {
            await operation!(call);
          } catch (error) {
            mutation.error = error;
            throw error;
          } finally {
            mutation.isPending = false;
          }
        },
      };
    },
  };
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
    (accountDeletionOwnerContent() + accountDeletionMutationContent()).replace(/^export /gm, ""),
  );
  const useHook = new Function(
    ...Object.keys(bindings),
    `${executable}\nreturn useDeleteAccountMutation;`,
  )(...Object.values(bindings)) as (onDeleted: () => void) => Hook;
  return {
    events,
    request,
    render: () => {
      cursor = 0;
      return useHook(() => events.push("redirect"));
    },
    change(next: Owner | null) {
      identity = next;
      scope = next;
      notify();
    },
    unmount: () => cleanup?.(),
    afterRetire(callback: () => void) {
      afterRetire = callback;
    },
    subscribers: () => subscribers.size,
  };
}

describe("account deletion ownership lifecycle", () => {
  test("admits one synchronous request and retires only its successful owner", async () => {
    const h = harness();
    const hook = h.render();
    const first = hook.run("password");
    await hook.run("duplicate");
    expect(h.events).toEqual(["request"]);
    h.request.resolve({});
    await first;
    expect(h.events).toEqual(["request", "retire", "redirect"]);
    expect(h.subscribers()).toBe(0);
  });
  for (const transition of ["account", "session", "workspace", "ABA", "unmount"] as const) {
    test(`suppresses a late deletion completion after ${transition}`, async () => {
      const h = harness();
      const completion = h.render().run();
      if (transition === "account") h.change(owner("b"));
      if (transition === "session") h.change(owner("a", "s-b"));
      if (transition === "workspace") h.change({ ...owner(), tenantId: "new-tenant" });
      if (transition === "ABA") {
        h.change(owner("b"));
        h.change(owner());
      }
      if (transition === "unmount") h.unmount();
      h.request.resolve({});
      await completion;
      expect(h.events).toEqual(["request"]);
      expect(h.subscribers()).toBe(0);
    });
  }
  test("a replacement during retirement notification cannot receive the old redirect", async () => {
    const h = harness();
    const completion = h.render().run();
    h.afterRetire(() => h.change(owner("replacement")));
    h.request.resolve({});
    await completion;
    expect(h.events).toEqual(["request", "retire"]);
  });
});
