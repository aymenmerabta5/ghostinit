import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { nativeConvexMessagingDataFiles } from "../../src/templates/apps/fragments/messaging/native-convex-data.js";
import { deferred, generatedFormHarness } from "../helpers/generated-form-harness.js";
import { queryMutationHarness } from "../helpers/query-mutation-harness.js";
import { messagingCommandHarness } from "../helpers/messaging-command-harness.js";

type Outcome =
  | { status: "ignored" }
  | { status: "success"; data: unknown; isCurrent(): boolean }
  | { status: "error"; error: Error };
type Mutation = { isPending: boolean; error: Error | null; run(input: unknown): Promise<Outcome> };

function hookHarness(target: "expo" | "desktop") {
  const root = target === "expo" ? "apps/mobile/src" : "apps/desktop/src/renderer";
  const files = nativeConvexMessagingDataFiles(target, "monorepo", `${root}/features/messaging`);
  const read = (name: string) => files.find((file) => file.path.endsWith(`/${name}.ts`))!.content;
  const command = messagingCommandHarness();
  const source = [
    authOwnedMutationContent(),
    command.wrapperSource,
    read("model"),
    read("mutations"),
  ].join("\n");
  const calls: Array<{ operation: string; input: unknown }> = [];
  const sendQueue: ReturnType<typeof deferred<unknown>>[] = [];
  const startQueue: ReturnType<typeof deferred<unknown>>[] = [];
  let mounted = true;
  let typingFails = false;
  function runtime(name: string) {
    const mutation = queryMutationHarness();
    return generatedFormHarness(source, [name], {
      z,
      api: {
        messaging: {
          getOrCreateConversation: "start",
          sendMessage: "send",
          sendTyping: "sendTyping",
        },
      },
      useQueryClient: () => ({}),
      currentQueryAuthGeneration: () => 0,
      subscribeQueryAuthGeneration: () => () => {},
      useAuthOwnedEffect: () => () => () => mounted,
      useMutation: mutation.useMutation,
      useSyncExternalStore: command.useSyncExternalStore,
      useConvexMutation: (operation: string) => async (input: unknown) => {
        calls.push({ operation, input });
        if (operation === "sendTyping") {
          if (typingFails) throw new Error("Typing channel unavailable");
          return;
        }
        const next = (operation === "send" ? sendQueue : startQueue).shift();
        if (!next) throw new Error("Unexpected duplicate mutation");
        return next.promise;
      },
    });
  }
  const sender = runtime("useSendMessageMutation");
  const starter = runtime("useStartConversationMutation");
  return {
    calls,
    sendQueue,
    startQueue,
    retire: () => {
      mounted = false;
      command.retire();
    },
    setTypingFailure: () => {
      typingFails = true;
    },
    renderSend: () => sender.render("useSendMessageMutation", command.scope) as Mutation,
    renderStart: () => starter.render("useStartConversationMutation", command.scope) as Mutation,
    send(body: string) {
      return (sender.render("useSendMessageMutation", command.scope) as Mutation).run({
        conversationId: "owned-conversation",
        body,
        clientMessageKey: "stable-client-message-key",
      });
    },
  };
}

describe("native Convex messaging action state", () => {
  for (const target of ["expo", "desktop"] as const) {
    test(`${target} coalesces immediate duplicate sends and clears pending only after completion`, async () => {
      const hook = hookHarness(target);
      const gate = deferred<unknown>();
      hook.sendQueue.push(gate);
      expect(hook.renderSend().isPending).toBe(false);
      const first = hook.send("retained draft");
      const duplicate = hook.send("retained draft");
      expect(await hook.send("different body")).toMatchObject({
        status: "error",
        error: new Error("Another messaging action is in progress"),
      });
      expect(hook.renderSend().isPending).toBe(true);
      expect(hook.calls.filter((call) => call.operation === "send")).toHaveLength(1);
      let draftCleared = false;
      const completed = first.then((result) => {
        if (result.status === "success" && result.isCurrent()) draftCleared = true;
      });
      await Promise.resolve();
      expect(draftCleared).toBe(false);
      gate.resolve(undefined);
      await completed;
      expect((await duplicate).status).toBe("success");
      expect(hook.renderSend().isPending).toBe(false);
      expect(draftCleared).toBe(true);
    });

    test(`${target} surfaces failed sends, preserves the draft, and permits a retry`, async () => {
      const hook = hookHarness(target);
      const failed = deferred<unknown>();
      hook.sendQueue.push(failed);
      let draft = "keep this draft";
      const operation = hook.send(draft);
      failed.reject(new Error("Send denied"));
      const outcome = await operation;
      if (outcome.status === "success" && outcome.isCurrent()) draft = "";
      expect(outcome).toMatchObject({ status: "error", error: new Error("Send denied") });
      expect(draft).toBe("keep this draft");
      expect(hook.renderSend().isPending).toBe(false);
      expect(hook.renderSend().error?.message).toBe("Send denied");
      const retry = deferred<unknown>();
      hook.sendQueue.push(retry);
      const retried = hook.send(draft);
      retry.resolve(undefined);
      expect((await retried).status).toBe("success");
      expect(hook.calls.filter((call) => call.operation === "send")).toHaveLength(2);
      expect(hook.renderSend().isPending).toBe(false);
    });

    test(`${target} coalesces starts, rejects conflicting actions, and recovers after failure`, async () => {
      const hook = hookHarness(target);
      const failed = deferred<unknown>();
      hook.startQueue.push(failed);
      const one = hook.renderStart().run("peer");
      const duplicate = hook.renderStart().run("peer");
      expect(await hook.renderStart().run("other-peer")).toMatchObject({
        status: "error",
        error: new Error("Another messaging action is in progress"),
      });
      expect(hook.renderStart().isPending).toBe(true);
      expect(hook.calls.filter((call) => call.operation === "start")).toHaveLength(1);
      expect(await hook.send("conflicting send")).toMatchObject({
        status: "error",
        error: new Error("Another messaging action is in progress"),
      });
      expect(hook.calls.filter((call) => call.operation === "send")).toHaveLength(0);
      expect(hook.renderSend().isPending).toBe(true);
      failed.reject(new Error("Recipient unavailable"));
      expect(await one).toMatchObject({
        status: "error",
        error: new Error("Recipient unavailable"),
      });
      expect(await duplicate).toMatchObject({
        status: "error",
        error: new Error("Recipient unavailable"),
      });
      expect(hook.renderStart().isPending).toBe(false);
      const retry = deferred<unknown>();
      hook.startQueue.push(retry);
      const started = hook.renderStart().run("peer");
      retry.resolve({ _id: "created-conversation" });
      expect(await started).toMatchObject({ status: "success", data: "created-conversation" });
      expect(hook.renderStart().isPending).toBe(false);
    });

    test(`${target} retiring a conversation prevents its old send from clearing a replacement draft`, async () => {
      const previous = hookHarness(target);
      const gate = deferred<unknown>();
      previous.sendQueue.push(gate);
      const sent = previous.send("old draft");
      previous.retire();
      const replacement = hookHarness(target);
      let replacementDraft = "new conversation draft";
      gate.resolve(undefined);
      const result = await sent;
      if (result.status === "success" && result.isCurrent()) replacementDraft = "";
      expect(result).toEqual({ status: "ignored" });
      expect(replacementDraft).toBe("new conversation draft");
      expect(replacement.renderSend().isPending).toBe(false);
      expect(previous.calls.filter((call) => call.operation === "sendTyping")).toEqual([]);
    });

    test(`${target} does not misreport a delivered message when the advisory typing reset fails`, async () => {
      const hook = hookHarness(target);
      const gate = deferred<unknown>();
      hook.sendQueue.push(gate);
      hook.setTypingFailure();
      const sent = hook.send("delivered message");
      gate.resolve(undefined);
      expect((await sent).status).toBe("success");
      expect(hook.renderSend().isPending).toBe(false);
      expect(hook.renderSend().error).toBeNull();
    });
  }
});
