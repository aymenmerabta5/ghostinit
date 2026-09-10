import { describe, expect, test } from "bun:test";
import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { generatedUiOutput } from "../helpers/generated-ui-output.js";
import { deferred, flush, generatedFormHarness } from "../helpers/generated-form-harness.js";
import { queryMutationHarness } from "../helpers/query-mutation-harness.js";

function ownedBindings() {
  let generation = 0;
  const mutation = queryMutationHarness();
  return {
    changeOwner: () => {
      generation += 1;
    },
    bindings: {
      useQueryClient: () => ({}),
      currentQueryAuthGeneration: () => generation,
      subscribeQueryAuthGeneration: () => () => {},
      useMutation: mutation.useMutation,
      useAuthOwnedEffect: () => () => {
        const owner = generation;
        return () => owner === generation;
      },
    },
  };
}

describe("PostgreSQL web messaging workflow lifetimes", () => {
  test("typing expiry and unmount clean up the subscription and timers for their captured owner", () => {
    const output = generatedUiOutput("nextjs", "single");
    let current = true;
    let typing = new Set<string>();
    let writes = 0;
    let unsubscribed = 0;
    let listener: (event: unknown) => void = () => {};
    let effect: () => () => void = () => () => {};
    const timers: Array<{ callback(): void; delay: number }> = [];
    const cleared: unknown[] = [];
    const timeouts = { current: new Map() };
    const runtime = generatedFormHarness(
      output.read(`${output.root}/features/messaging/use-message-typing.ts`),
      ["useMessageTyping"],
      {
        useAuthOwnedEffect: () => () => () => current,
        useRef: () => timeouts,
        useState: () => [
          typing,
          (update: (value: Set<string>) => Set<string>) => {
            writes += 1;
            typing = update(typing);
          },
        ],
        useEffect: (next: () => () => void) => {
          effect = next;
        },
        subscribeConversation: (_id: string, next: (event: unknown) => void) => {
          listener = next;
          return () => {
            unsubscribed += 1;
          };
        },
        setTimeout: (callback: () => void, delay: number) => {
          const timer = { callback, delay };
          timers.push(timer);
          return timer;
        },
        clearTimeout: (timer: unknown) => {
          cleared.push(timer);
        },
      },
    );
    runtime.render("useMessageTyping", "conversation");
    const cleanup = effect();
    listener({ type: "typing", conversationId: "other", userId: "peer", isTyping: true });
    expect(writes).toBe(0);
    listener({ type: "typing", conversationId: "conversation", userId: "peer", isTyping: true });
    expect(typing.has("peer")).toBe(true);
    expect(timers[0]!.delay).toBe(3000);
    timers[0]!.callback();
    expect(typing.size).toBe(0);
    listener({ type: "typing", conversationId: "conversation", userId: "peer", isTyping: true });
    const beforeOwnerChange = writes;
    current = false;
    timers[1]!.callback();
    listener({ type: "typing", conversationId: "conversation", userId: "peer", isTyping: false });
    expect(writes).toBe(beforeOwnerChange);
    cleanup();
    expect(unsubscribed).toBe(1);
    expect(timeouts.current.size).toBe(0);
    // A mounted lifetime also cancels its still-pending expiration on unmount.
    current = true;
    const secondCleanup = effect();
    listener({ type: "typing", conversationId: "conversation", userId: "peer", isTyping: true });
    secondCleanup();
    expect(cleared).toContain(timers[2]);
    expect(unsubscribed).toBe(2);
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const mode of ["single", "monorepo"] as const) {
      const output = () => generatedUiOutput(framework, mode);
      test(`${mode}/${framework} retains its idempotency key until send and invalidation both succeed`, async () => {
        const generated = output();
        const read = (name: string) =>
          generated.read(`${generated.root}/features/messaging/${name}.ts`);
        const pending = { current: null };
        const calls: Array<{ clientMessageKey: string }> = [];
        let invalidations = 0;
        const runtime = generatedFormHarness(
          [authOwnedMutationContent(), read("model"), read("mutations")].join("\n"),
          ["useSendMessage"],
          {
            ...ownedBindings().bindings,
            useRef: () => pending,
            useInvalidateMessaging: () => async () => {
              if (++invalidations === 1) throw new Error("Refresh failed");
            },
            orpcClient: {
              messaging: {
                sendMessage: async (input: { clientMessageKey: string }) => {
                  calls.push(input);
                  return { id: "delivered" };
                },
              },
            },
          },
        );
        const sender = runtime.render("useSendMessage", "conversation") as {
          send(body: string, attachments?: string[]): Promise<unknown>;
        };
        await expect(sender.send("hello", ["receipt"])).rejects.toThrow("Refresh failed");
        await expect(sender.send("hello", ["receipt"])).resolves.toEqual({ id: "delivered" });
        expect(calls[0]!.clientMessageKey).toBe(calls[1]!.clientMessageKey);
        await sender.send("hello", ["receipt"]);
        expect(calls[2]!.clientMessageKey).not.toBe(calls[1]!.clientMessageKey);
        expect(invalidations).toBe(3);
      });

      test(`${mode}/${framework} reuses a completed upload on delivery retry and clears drafts only after success`, async () => {
        const generated = output();
        const read = (name: string) =>
          generated.read(`${generated.root}/features/messaging/${name}.ts`);
        const pending = { current: null };
        let uploads = 0;
        const sends: unknown[] = [];
        const runtime = generatedFormHarness(
          [authOwnedMutationContent(), read("model"), read("use-message-composer")].join("\n"),
          ["useMessageComposer"],
          {
            ...ownedBindings().bindings,
            useRef: () => pending,
            uploadMessageAttachment: async () => {
              uploads += 1;
              return "attachment";
            },
            useSendMessage: () => ({
              isPending: false,
              sendTyping: () => {},
              send: async (...input: unknown[]) => {
                sends.push(input);
                if (sends.length === 1) throw new Error("Delivery failed");
                return { id: "sent" };
              },
            }),
          },
        );
        const render = () =>
          runtime.render("useMessageComposer", "conversation") as {
            body: string;
            hasFile: boolean;
            error: boolean;
            changeBody(body: string): void;
            changeFile(file: File): void;
            submit(): void;
          };
        render().changeBody("keep me");
        render().changeFile(
          new File(["receipt"], "receipt.png", { type: "image/png", lastModified: 1 }),
        );
        const attempt = render();
        attempt.submit();
        attempt.submit();
        await flush();
        expect(uploads).toBe(1);
        expect(sends).toHaveLength(1);
        expect(render()).toMatchObject({ body: "keep me", hasFile: true, error: true });
        render().submit();
        await flush();
        expect(uploads).toBe(1);
        expect(sends).toEqual([
          ["keep me", ["attachment"]],
          ["keep me", ["attachment"]],
        ]);
        expect(render()).toMatchObject({ body: "", hasFile: false, error: false });
      });

      test(`${mode}/${framework} an old owner's uploaded attachment cannot trigger a send`, async () => {
        const generated = output();
        const read = (name: string) =>
          generated.read(`${generated.root}/features/messaging/${name}.ts`);
        const owner = ownedBindings();
        const pending = { current: null };
        const upload = deferred<string>();
        let sends = 0;
        const runtime = generatedFormHarness(
          [authOwnedMutationContent(), read("model"), read("use-message-composer")].join("\n"),
          ["useMessageComposer"],
          {
            ...owner.bindings,
            useRef: () => pending,
            uploadMessageAttachment: () => upload.promise,
            useSendMessage: () => ({
              isPending: false,
              sendTyping: () => {},
              send: async () => {
                sends += 1;
                return {};
              },
            }),
          },
        );
        const render = () =>
          runtime.render("useMessageComposer", "conversation") as {
            changeFile(file: File): void;
            submit(): void;
          };
        render().changeFile(new File(["receipt"], "receipt.png"));
        render().submit();
        owner.changeOwner();
        upload.resolve("attachment");
        await flush();
        expect(sends).toBe(0);
        expect(pending.current).toBeNull();
      });
    }
  }
});
