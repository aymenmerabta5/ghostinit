import { describe, expect, test } from "bun:test";
import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { deferred, generatedFormHarness } from "../helpers/generated-form-harness.js";

interface Call {
  input: string;
  isCurrent(): boolean;
}
interface Options {
  mutationFn(call: Call): Promise<string>;
  onSuccess(data: string, call: Call): Promise<void>;
  onError(error: Error, call: Call): Promise<void>;
  retry: boolean;
  networkMode: string;
}
type Outcome =
  | { status: "success"; data: string; isCurrent(): boolean }
  | { status: "error"; error: Error; isCurrent(): boolean }
  | { status: "ignored" };
interface Hook {
  run(input: string): Promise<Outcome>;
  data?: string;
  error: Error | null;
  isPending: boolean;
  isSuccess: boolean;
}

function harness(operation: (input: string, isCurrent: () => boolean) => Promise<string>) {
  let generation = 0;
  let mounted = true;
  let latest = 0;
  let options: Options;
  const effects: string[] = [];
  const state: {
    variables?: Call;
    data?: string;
    error: Error | null;
    isPending: boolean;
    isSuccess: boolean;
  } = { error: null, isPending: false, isSuccess: false };
  const mutateAsync = async (call: Call) => {
    const request = ++latest;
    const selected = options;
    Object.assign(state, {
      variables: call,
      data: undefined,
      error: null,
      isPending: true,
      isSuccess: false,
    });
    try {
      const data = await selected.mutationFn(call);
      await selected.onSuccess(data, call);
      if (latest === request) Object.assign(state, { data, isPending: false, isSuccess: true });
      return data;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      await selected.onError(failure, call);
      if (latest === request) Object.assign(state, { error: failure, isPending: false });
      throw failure;
    }
  };
  const generated = generatedFormHarness(
    authOwnedMutationContent() +
      "\nexport function Probe() { return useAuthOwnedMutation(operation, effects); }",
    ["Probe"],
    {
      operation,
      effects: {
        onSuccess: (data: string) => {
          effects.push("success:" + data);
        },
        onError: (error: Error) => {
          effects.push("error:" + error.message);
        },
      },
      useQueryClient: () => ({}),
      currentQueryAuthGeneration: () => generation,
      subscribeQueryAuthGeneration: () => () => {},
      useAuthOwnedEffect: () => () => {
        const captured = generation;
        return () => mounted && captured === generation;
      },
      useMutation: (next: Options) => {
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
    },
  );
  return {
    render: () => generated.render("Probe") as Hook,
    effects,
    changeOwner: () => {
      generation += 1;
    },
    unmount: () => {
      mounted = false;
    },
    options: () => options,
  };
}

describe("generated auth-owned mutation workflow", () => {
  test("admits a single write synchronously and exposes library-owned state", async () => {
    const request = deferred<string>();
    let calls = 0;
    const h = harness(async () => {
      calls += 1;
      return request.promise;
    });
    const hook = h.render();
    const first = hook.run("first");
    expect(await hook.run("duplicate")).toEqual({ status: "ignored" });
    expect(calls).toBe(1);
    expect(h.render().isPending).toBe(true);
    request.resolve("accepted");
    expect((await first).status).toBe("success");
    expect(h.render()).toMatchObject({ data: "accepted", isSuccess: true, isPending: false });
    expect(h.effects).toEqual(["success:accepted"]);
    expect(h.options()).toMatchObject({ retry: false, networkMode: "always" });
    expect(authOwnedMutationContent()).not.toContain("useState");
  });

  for (const transition of ["account/session/workspace", "unmount"] as const) {
    test(`suppresses completion and effects after ${transition}`, async () => {
      const request = deferred<string>();
      const h = harness(() => request.promise);
      const completion = h.render().run("owner-a");
      if (transition === "unmount") h.unmount();
      else h.changeOwner();
      expect(h.render()).toMatchObject({ data: undefined, error: null, isPending: false });
      request.resolve("private old-owner result");
      expect(await completion).toEqual({ status: "ignored" });
      expect(h.render().data).toBeUndefined();
      expect(h.effects).toEqual([]);
    });
  }

  test("an obsolete completion cannot release a newer owner's admitted request", async () => {
    const previous = deferred<string>();
    const current = deferred<string>();
    const calls: string[] = [];
    const h = harness((input) => {
      calls.push(input);
      return input === "old" ? previous.promise : current.promise;
    });
    const old = h.render().run("old");
    h.changeOwner();
    const latest = h.render().run("current");
    previous.resolve("obsolete");
    expect(await old).toEqual({ status: "ignored" });
    expect(await h.render().run("duplicate-current")).toEqual({ status: "ignored" });
    current.resolve("current result");
    expect((await latest).status).toBe("success");
    expect(calls).toEqual(["old", "current"]);
    expect(h.effects).toEqual(["success:current result"]);
  });

  test("returns typed failure outcomes and hides old-owner errors without callbacks", async () => {
    const request = deferred<string>();
    const h = harness(() => request.promise);
    const completion = h.render().run("current");
    request.reject(new Error("Rejected by server"));
    expect(await completion).toMatchObject({
      status: "error",
      error: { message: "Rejected by server" },
    });
    expect(h.render().error?.message).toBe("Rejected by server");
    h.changeOwner();
    expect(h.render().error).toBeNull();
    expect(h.effects).toEqual(["error:Rejected by server"]);
  });

  test("exposes invocation ownership to operations with async platform effects", async () => {
    const available = deferred<string>();
    const opened: string[] = [];
    const h = harness(async (input, isCurrent) => {
      await available.promise;
      if (isCurrent()) opened.push(input);
      return input;
    });
    const completion = h.render().run("owned-url");
    h.changeOwner();
    available.resolve("ready");
    expect(await completion).toEqual({ status: "ignored" });
    expect(opened).toEqual([]);
  });
});
