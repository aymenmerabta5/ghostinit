import { expect, test } from "bun:test";
import { z } from "zod";
import {
  convexWebModelContent,
  convexWebMutationsContent,
  convexWebQueriesContent,
} from "../../src/templates/apps/fragments/messaging/web-convex-data.js";
import {
  convexComposerHookContent,
  convexStartFormHookContent,
} from "../../src/templates/apps/fragments/messaging/web-convex-workflows.js";
import { deferred, generatedFormHarness, flush } from "../helpers/generated-form-harness.js";
import { settingsFeatureHarness } from "../helpers/settings-feature-harness.js";

function composerHarness(
  send: (input: unknown) => Promise<unknown>,
  upload: () => Promise<Response>,
) {
  const source =
    convexWebModelContent("generated") +
    convexWebMutationsContent("generated", true) +
    convexComposerHookContent(true);
  return settingsFeatureHarness(source, ["useConvexMessageForm"], {
    z,
    api: { messaging: { sendMessage: "send", sendTyping: "typing" } },
    useConvexMutation: (operation: string) =>
      operation === "send"
        ? send
        : async () => {
            throw new Error("Typing unavailable");
          },
    useMessagingOwner: () => ({ generation: 0 }),
    fetch: upload,
  });
}

test("Convex composer preserves a failed send and reuses its successful upload for one deliberate retry", async () => {
  let uploads = 0;
  const first = deferred<void>();
  const sent: unknown[] = [];
  const ui = composerHarness(
    async (input) => {
      sent.push(input);
      if (sent.length === 1) await first.promise;
    },
    async () => {
      uploads++;
      return Response.json({ attachmentId: "attachment-one" });
    },
  );
  ui.render("useConvexMessageForm", "conversation-one");
  const form = ui.forms[0]!;
  const file = new File(["receipt"], "transfer.png", { type: "image/png" });
  Object.assign(form.values, { body: "Keep this message", file });
  const pending = form.handleSubmit();
  await form.handleSubmit();
  await flush();
  expect(uploads).toBe(1);
  expect(sent).toHaveLength(1);
  first.reject(new Error("Send connection lost"));
  await pending;
  expect(ui.render("useConvexMessageForm", "conversation-one")).toMatchObject({
    error: "sendError",
  });
  expect(form.values.body).toBe("Keep this message");
  expect(Reflect.get(form.values, "file")).toBe(file);
  expect(form.resets).toBe(0);
  await form.handleSubmit();
  await flush();
  expect(uploads).toBe(1);
  expect(sent).toEqual([
    {
      conversationId: "conversation-one",
      body: "Keep this message",
      attachmentIds: ["attachment-one"],
    },
    {
      conversationId: "conversation-one",
      body: "Keep this message",
      attachmentIds: ["attachment-one"],
    },
  ]);
  expect(form.resets).toBe(1);
  expect(form.values.body).toBe("");
  expect(Reflect.get(form.values, "file")).toBeNull();
  expect(ui.render("useConvexMessageForm", "conversation-one")).toMatchObject({ error: null });
});

test("an upload completed after account ownership changes cannot send or clear the new owner's form", async () => {
  const upload = deferred<Response>();
  const sent: unknown[] = [];
  const ui = composerHarness(
    async (input) => {
      sent.push(input);
    },
    () => upload.promise,
  );
  ui.render("useConvexMessageForm", "conversation-one");
  const form = ui.forms[0]!;
  Object.assign(form.values, {
    body: "Retain",
    file: new File(["proof"], "proof.png", { type: "image/png" }),
  });
  const pending = form.handleSubmit();
  ui.changeOwner();
  upload.resolve(Response.json({ attachmentId: "attachment-one" }));
  await pending;
  expect(sent).toEqual([]);
  expect(form.resets).toBe(0);
  expect(form.values.body).toBe("Retain");
});

test("protected conversation start settles errors without clearing the peer and ignores duplicate admission", async () => {
  let calls = 0;
  const operation = deferred<unknown>();
  const selected: unknown[] = [];
  const ui = settingsFeatureHarness(
    convexWebModelContent("generated") +
      convexWebMutationsContent("generated", false) +
      convexStartFormHookContent(),
    ["useStartConversationForm"],
    {
      z,
      api: { messaging: { getOrCreateConversation: "start" } },
      useConvexMutation: () => () => {
        calls++;
        return operation.promise;
      },
    },
  );
  ui.render("useStartConversationForm", (id: unknown) => selected.push(id));
  const form = ui.forms[0]!;
  form.values.peerUserId = " peer-one ";
  const pending = form.handleSubmit();
  await form.handleSubmit();
  expect(calls).toBe(1);
  operation.reject(new Error("Private backend error"));
  await pending;
  expect(form.values.peerUserId).toBe(" peer-one ");
  expect(form.resets).toBe(0);
  expect(selected).toEqual([]);
  expect(ui.render("useStartConversationForm", (id: unknown) => selected.push(id))).toMatchObject({
    error: "operationError",
  });
});

test("Convex live conversations replace the scoped TanStack loader snapshot without copying remote data into state", () => {
  let live: unknown = undefined;
  const keys: unknown[] = [];
  const scope = { userId: "owner", sessionId: "session" };
  const ui = generatedFormHarness(
    convexWebModelContent("generated") + convexWebQueriesContent("generated", false),
    ["useConvexConversations"],
    {
      z,
      api: { messaging: { listConversations: "list" } },
      useConvexQuery: () => live,
      useQueryClient: () => ({}),
      currentQueryAuthScope: () => scope,
      currentQueryAuthGeneration: () => 0,
      subscribeQueryAuthGeneration: () => () => {},
      messagingConversationsQueryKey: (value: unknown) => ["conversations", value],
      useSnapshotQuery: (options: { queryKey: unknown; enabled: boolean }) => {
        keys.push(options.queryKey);
        expect(options.enabled).toBe(false);
        return { data: { conversations: [{ id: "ssr-conversation" }] } };
      },
    },
  );
  expect(ui.render("useConvexConversations")).toMatchObject({
    items: [{ key: "ssr-conversation", liveId: null }],
  });
  live = [{ _id: "live-conversation", internal: "removed" }];
  expect(ui.render("useConvexConversations")).toMatchObject({
    items: [{ key: "live-conversation", liveId: "live-conversation" }],
  });
  expect(keys).toEqual([
    ["conversations", scope],
    ["conversations", scope],
  ]);
});
