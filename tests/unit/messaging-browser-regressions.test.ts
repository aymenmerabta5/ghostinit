import { describe, expect, test } from "bun:test";
import { generatedUiOutput } from "../helpers/generated-ui-output.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

describe("messaging browser regressions", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const mode of ["single", "monorepo"] as const) {
      test(`${mode}/${framework} retains real oRPC Date values and invalidates a newly created conversation`, async () => {
        const output = generatedUiOutput(framework, mode);
        const hooks = output.read(
          framework === "nextjs"
            ? `${output.root}/app/(app)/messages/hooks/use-messaging.ts`
            : `${output.root}/routes/-hooks/use-messaging.ts`,
        );
        const invalidations: unknown[] = [];
        const runtime = generatedFormHarness(hooks, ["toMessage", "useStartConversation"], {
          useQueryClient: () => ({
            async invalidateQueries(options: unknown) {
              invalidations.push(options);
            },
          }),
          currentQueryAuthScope: () => ({ userId: "fixture-member", sessionId: "fixture-session" }),
          messagingConversationsQueryKey: () => ["scoped-conversations"],
          useMutation: (options: { onSuccess(): Promise<void> }) => ({
            isPending: false,
            async mutateAsync() {
              await options.onSuccess();
              return { id: "new-conversation" };
            },
          }),
          orpc: {
            messaging: {
              listConversations: { key: () => ["conversations"] },
              getOrCreateConversation: { mutationOptions: (options: unknown) => options },
            },
          },
        });
        const normalizer = runtime.module.toMessage!;
        const record = {
          id: "message",
          senderId: "sender",
          body: "Visible after a real send",
          createdAt: new Date("2026-09-07T00:00:00Z"),
        };
        expect(normalizer(record)).toMatchObject({
          body: record.body,
          createdAt: "2026-09-07T00:00:00.000Z",
        });
        expect(normalizer({ ...record, createdAt: "2026-09-07T00:00:00Z" })).toMatchObject({
          body: record.body,
        });
        expect(normalizer({ ...record, createdAt: new Date(Number.NaN) })).toBeUndefined();
        expect(normalizer({ ...record, createdAt: "not-a-date" })).toBeUndefined();
        const start = runtime.render("useStartConversation") as {
          start(id: string): Promise<string>;
        };
        await expect(start.start("spare")).resolves.toBe("new-conversation");
        expect(invalidations).toEqual([
          { queryKey: framework === "nextjs" ? ["conversations"] : ["scoped-conversations"] },
        ]);
      });

      test(`${mode}/${framework} send errors retain the draft, settle the UI event and permit one retry`, async () => {
        const output = generatedUiOutput(framework, mode);
        const source = output.read(
          framework === "nextjs"
            ? `${output.root}/app/(app)/messages/_components/message-composer.tsx`
            : `${output.root}/routes/-components/messages/message-composer.tsx`,
        );
        const first = deferred<void>();
        const second = deferred<void>();
        const queue = [first, second];
        let sends = 0;
        const ui = generatedFormHarness(source, ["MessageComposer"], {
          Input: "Input",
          useSendMessage: () => ({
            isPending: false,
            async send() {
              sends += 1;
              const next = queue.shift();
              if (!next) throw new Error("Duplicate send");
              await next.promise;
            },
            sendTyping(value: boolean) {
              if (!value) throw new Error("Advisory typing unavailable");
            },
          }),
        });
        const render = () => ui.render("MessageComposer", { conversationId: "owned-conversation" });
        const input = elements(render()).find(
          (node) => node.type === "Input" && node.props.type !== "file",
        )!;
        (input.props.onChange as (event: unknown) => void)({
          target: { value: "Keep this draft" },
        });
        const button = elements(render()).find((node) => node.type === "Button")!;
        (button.props.onClick as () => void)();
        (button.props.onClick as () => void)();
        expect(sends).toBe(1);
        expect(elements(render()).find((node) => node.type === "Button")?.props.disabled).toBe(
          true,
        );
        first.reject(new Error("Network request failed"));
        await flush();
        expect(textContent(render())).toContain("sendError");
        expect(elements(render()).find((node) => node.type === "Input")?.props.value).toBe(
          "Keep this draft",
        );
        const retry = elements(render()).find((node) => node.type === "Button")!;
        expect(retry.props.disabled).toBe(false);
        (retry.props.onClick as () => void)();
        second.resolve();
        await flush();
        expect(sends).toBe(2);
        expect(textContent(render())).not.toContain("sendError");
        expect(elements(render()).find((node) => node.type === "Input")?.props.value).toBe("");
      });

      test(`${mode}/${framework} start failures keep the peer ID and expose a retryable error beneath the page heading`, async () => {
        const output = generatedUiOutput(framework, mode);
        const source = output.read(
          framework === "nextjs"
            ? `${output.root}/app/(app)/messages/client.tsx`
            : `${output.root}/routes/messages.tsx`,
        );
        const gate = deferred<string>();
        let calls = 0;
        const ui = generatedFormHarness(source, ["MessagesPage"], {
          createFileRoute: () => (options: unknown) => options,
          Input: "Input",
          Field: "Field",
          FieldLabel: "FieldLabel",
          FieldDescription: "FieldDescription",
          ConversationList: "ConversationList",
          MessageThread: "MessageThread",
          Empty: "Empty",
          EmptyHeader: "EmptyHeader",
          EmptyTitle: "EmptyTitle",
          useStartConversation: () => ({
            isPending: false,
            start: () => {
              calls += 1;
              return gate.promise;
            },
          }),
        });
        const render = () => ui.render("MessagesPage", { initialConversations: [] });
        expect(elements(render()).filter((node) => node.type === "h1")).toHaveLength(1);
        const pageElements = elements(render());
        const input = pageElements.find((node) => node.type === "Input")!;
        expect(input.props.id).toBeTruthy();
        const label = pageElements.find(
          (node) => node.type === "FieldLabel" && node.props.htmlFor === input.props.id,
        );
        expect(textContent(label)).toBe("peerUserId");
        expect(input.props["aria-describedby"]).toBeTruthy();
        const description = pageElements.find(
          (node) =>
            node.type === "FieldDescription" && node.props.id === input.props["aria-describedby"],
        );
        expect(textContent(description)).toBe("peerUserIdHelp");
        (input.props.onChange as (event: unknown) => void)({ target: { value: "spare" } });
        const button = elements(render()).find((node) => node.type === "Button")!;
        (button.props.onClick as () => void)();
        (button.props.onClick as () => void)();
        expect(calls).toBe(1);
        gate.reject(new Error("Start failed"));
        await flush();
        expect(textContent(render())).toContain("operationError");
        expect(elements(render()).find((node) => node.type === "Input")?.props.value).toBe("spare");
      });
    }
  }
});
