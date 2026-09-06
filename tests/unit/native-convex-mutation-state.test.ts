import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { expoConvexMessagingAdapterContent } from "../../src/templates/apps/fragments/messaging/native-expo.js";
import { desktopConvexAdapterContent } from "../../src/templates/apps/fragments/messaging/native-desktop.js";

interface Deferred {
  promise: Promise<unknown>;
  resolve(value?: unknown): void;
  reject(error: Error): void;
}

function deferred(): Deferred {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface MessagingState {
  readonly pending: boolean;
  startConversation(peerUserId: string): Promise<string>;
  sendMessage(body: string): Promise<void>;
}

function hookHarness(target: "expo" | "electron") {
  const source = (
    target === "expo" ? expoConvexMessagingAdapterContent : desktopConvexAdapterContent
  )("monorepo");
  const name = target === "expo" ? "useNativeMessaging" : "useDesktopMessaging";
  const fragment = source
    .slice(source.indexOf("const conversationIdSchema"))
    .replace(`export function ${name}`, `function ${name}`);
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(fragment);
  const slots: unknown[] = [];
  let cursor = 0;
  const calls: Array<{ operation: string; input: unknown }> = [];
  const sendQueue: Deferred[] = [];
  const startQueue: Deferred[] = [];
  let typingFails = false;
  const react = {
    useRef(initial: unknown) {
      const position = cursor++;
      slots[position] ??= { current: initial };
      return slots[position];
    },
    useState(initial: boolean) {
      const position = cursor++;
      if (!(position in slots)) slots[position] = initial;
      return [
        slots[position],
        (value: boolean) => {
          slots[position] = value;
        },
      ];
    },
  };
  const api = {
    messaging: {
      listConversations: "list",
      listMessages: "messages",
      listTyping: "typing",
      getOrCreateConversation: "start",
      sendMessage: "send",
      sendTyping: "sendTyping",
    },
  };
  const useQuery = (operation: string) =>
    operation === "messages" ? { messages: [], nextCursor: null } : [];
  const useMutation = (operation: string) => async (input: unknown) => {
    calls.push({ operation, input });
    if (operation === "sendTyping") {
      if (typingFails) throw new Error("Typing channel unavailable");
      return;
    }
    const next = (operation === "send" ? sendQueue : startQueue).shift();
    if (!next) throw new Error("Unexpected duplicate mutation");
    return await next.promise;
  };
  const useMessaging = new Function(
    "React",
    "z",
    "useQuery",
    "useMutation",
    "api",
    executable + `; return ${name};`,
  )(react, z, useQuery, useMutation, api) as (id: string) => MessagingState;
  return {
    calls,
    sendQueue,
    startQueue,
    setTypingFailure() {
      typingFails = true;
    },
    render() {
      cursor = 0;
      return useMessaging("owned-conversation");
    },
  };
}

describe("native Convex messaging action state", () => {
  for (const target of ["expo", "electron"] as const) {
    test(`${target} coalesces immediate duplicate sends and clears pending only after completion`, async () => {
      const hook = hookHarness(target);
      const gate = deferred();
      hook.sendQueue.push(gate);
      const initial = hook.render();
      expect(initial.pending).toBe(false);
      const first = initial.sendMessage("retained draft");
      const duplicate = initial.sendMessage("retained draft");
      expect(hook.render().pending).toBe(true);
      expect(hook.calls.filter((call) => call.operation === "send")).toHaveLength(1);
      let draftCleared = false;
      void first.then(() => {
        draftCleared = true;
      });
      await Promise.resolve();
      expect(draftCleared).toBe(false);
      gate.resolve();
      await Promise.all([first, duplicate]);
      expect(hook.render().pending).toBe(false);
      expect(draftCleared).toBe(true);
    });

    test(`${target} surfaces failed sends, preserves the draft, and permits a retry`, async () => {
      const hook = hookHarness(target);
      const failed = deferred();
      hook.sendQueue.push(failed);
      let draft = "keep this draft";
      const operation = hook.render().sendMessage(draft);
      const observed = operation.then(() => {
        draft = "";
      });
      failed.reject(new Error("Send denied"));
      await expect(observed).rejects.toThrow("Send denied");
      expect(draft).toBe("keep this draft");
      expect(hook.render().pending).toBe(false);
      const retry = deferred();
      hook.sendQueue.push(retry);
      const retried = hook.render().sendMessage(draft);
      retry.resolve();
      await retried;
      expect(hook.calls.filter((call) => call.operation === "send")).toHaveLength(2);
      expect(hook.render().pending).toBe(false);
    });

    test(`${target} coalesces starts, rejects a conflicting action, and recovers after start failure`, async () => {
      const hook = hookHarness(target);
      const failed = deferred();
      hook.startQueue.push(failed);
      const initial = hook.render();
      const one = initial.startConversation("peer");
      const two = initial.startConversation("peer");
      expect(hook.render().pending).toBe(true);
      expect(hook.calls.filter((call) => call.operation === "start")).toHaveLength(1);
      await expect(initial.sendMessage("conflicting send")).rejects.toThrow("in progress");
      const completion = Promise.allSettled([one, two]);
      failed.reject(new Error("Recipient unavailable"));
      expect((await completion).every((result) => result.status === "rejected")).toBe(true);
      expect(hook.render().pending).toBe(false);
      const retry = deferred();
      hook.startQueue.push(retry);
      const started = hook.render().startConversation("peer");
      retry.resolve({ _id: "created-conversation" });
      expect(await started).toBe("created-conversation");
      expect(hook.render().pending).toBe(false);
    });

    test(`${target} does not misreport a delivered message when the advisory typing reset fails`, async () => {
      const hook = hookHarness(target);
      const gate = deferred();
      hook.sendQueue.push(gate);
      hook.setTypingFailure();
      const sent = hook.render().sendMessage("delivered message");
      gate.resolve();
      await expect(sent).resolves.toBeUndefined();
      expect(hook.render().pending).toBe(false);
    });
  }
});
