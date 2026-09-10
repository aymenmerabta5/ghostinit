import { describe, expect, test } from "bun:test";
import {
  generatedMessaging,
  postgresReadWorkflows,
  nodes,
  readState,
  renderer,
  retryButton,
} from "./messaging-read-state-harness.js";

function expectNoEmptyClaims(tree: unknown): void {
  expect(JSON.stringify(tree)).not.toMatch(
    /noConversations|noMessages|No conversations yet|No messages yet/,
  );
}

function nativeWorkspaceRenderer(read: (path: string) => string, root: string) {
  const conversations = renderer(
    read(root + "/components/messaging-conversations-view.tsx"),
    "MessagingConversationsView",
  );
  const thread = renderer(
    read(root + "/components/messaging-thread-view.tsx"),
    "MessagingThreadView",
  );
  return renderer(
    read(root + "/components/messaging-workspace-view.tsx"),
    "MessagingWorkspaceView",
    {
      MessagingConversationsView: (props: unknown) => conversations.render(props),
      MessagingThreadView: (props: unknown) => thread.render(props),
    },
  );
}

describe("generated messaging read states", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} Postgres read failures remain recoverable without clearing selected data`, async () => {
        const read = generatedMessaging(mode, framework, "postgres");
        const query = readState();
        const workflows = postgresReadWorkflows(read, query);
        let selected = "conversation-a";
        const list = renderer(
          read("/features/messaging/components/messaging-workspace-view.tsx"),
          "MessagingWorkspaceView",
          {
            Field: "Field",
            FieldLabel: "FieldLabel",
            FieldDescription: "FieldDescription",
          },
        );
        const listProps = () => ({
          ...workflows.workspace(),
          selected,
          setSelected: (id: string) => {
            selected = id;
          },
        });
        const messageList = renderer(
          read("/features/messaging/components/message-list.tsx"),
          "MessageList",
        );
        const thread = renderer(
          read("/features/messaging/components/message-thread-view.tsx"),
          "MessageThreadView",
          {
            MessageList: (props: unknown) => messageList.render(props),
          },
        );
        const threadProps = () => ({
          ...workflows.thread(selected),
          children: { type: "MessageComposer", props: {}, children: [] },
        });
        const views = [() => list.render(listProps()), () => thread.render(threadProps())];
        query.isLoading = true;
        query.isPending = true;
        for (const view of views) {
          expectNoEmptyClaims(view());
          expect(nodes(view()).some((node) => node.type === "Skeleton")).toBe(true);
        }
        // An offline first read is pending but paused, so TanStack isLoading is false.
        query.isLoading = false;
        for (const view of views) {
          expectNoEmptyClaims(view());
          expect(nodes(view()).some((node) => node.type === "Skeleton")).toBe(true);
        }
        expect(workflows.queryEnabledFor("")).toBe(false);
        expect(workflows.queryEnabledFor(selected)).toBe(true);
        query.isPending = false;
        query.error = new Error("Read unavailable");
        for (const view of views) {
          expectNoEmptyClaims(view());
          expect(
            nodes(view()).some(
              (node) => node.type === "Alert" && node.props.variant === "destructive",
            ),
          ).toBe(true);
          expect(
            nodes(view()).some(
              (node) =>
                node.type === "AlertTitle" &&
                JSON.stringify(node.children).includes("operationError"),
            ),
          ).toBe(true);
          (retryButton(view()).props.onClick as () => void)();
        }
        expect(query.retries()).toBe(2);
        expect(selected).toBe("conversation-a");
        expect(
          nodes(thread.render(threadProps())).some((node) => node.type === "MessageComposer"),
        ).toBe(true);
        query.error = null;
        query.data = [];
        expect(JSON.stringify(list.render(listProps()))).not.toContain("operationError");
        expect(JSON.stringify(list.render(listProps()))).toContain("noConversations");
        expect(JSON.stringify(thread.render(threadProps()))).toContain("noMessages");
        query.error = new Error("Background refresh failed");
        query.data = [{ id: "conversation-a" }];
        const cachedList = list.render(listProps());
        expectNoEmptyClaims(cachedList);
        expect(JSON.stringify(cachedList)).toContain("operationError");
        const selectedButton = nodes(cachedList).find(
          (node) => node.type === "Button" && node.props["aria-pressed"] === true,
        );
        expect(selectedButton).toBeDefined();
        query.data = [
          {
            id: "message-a",
            senderId: "sender",
            createdAt: "2026-01-01T00:00:00Z",
            body: "Retain this message",
          },
        ];
        expect(JSON.stringify(thread.render(threadProps()))).toContain("Retain this message");
        expectNoEmptyClaims(thread.render(threadProps()));
      });

      test(`${mode}/${framework} Convex separates pending thread data from a verified empty thread`, () => {
        const read = generatedMessaging(mode, framework, "convex");
        let messages: unknown = undefined;
        const thread = renderer(
          read("/features/messaging/components/message-thread.tsx"),
          "ConvexMessageThreadView",
        );
        const render = () => thread.render({ messages, typing: false, children: null });
        expectNoEmptyClaims(render());
        expect(nodes(render()).some((node) => node.type === "Skeleton")).toBe(true);
        messages = { messages: [], nextCursor: null };
        expect(JSON.stringify(render())).toContain("noMessages");
        messages = {
          messages: [{ _id: "message-a", body: "Retained live message", attachments: [] }],
          nextCursor: null,
        };
        expect(JSON.stringify(render())).toContain("Retained live message");
      });
    }
  }

  for (const i18n of [false, true]) {
    test(`native Postgres i18n=${i18n} preserves separate conversation and message read states`, async () => {
      const read = generatedMessaging("monorepo", "nextjs", "postgres", i18n);
      for (const [root, event] of [
        ["apps/mobile/src/features/messaging", "onPress"],
        ["apps/desktop/src/renderer/features/messaging", "onClick"],
      ] as const) {
        const conversations = readState();
        const messages = readState();
        const adapter = renderer(read(root + "/queries.ts"), "useMessagingReads", {
          useQuery: ({ queryKey }: { queryKey: string[] }) =>
            queryKey[1] === "conversations" ? conversations : messages,
          useState: () => [{ id: null, transport: "polling", typing: new Set() }, () => undefined],
          useEffect: () => undefined,
          useAuthOwnedEffect: () => () => () => true,
        });
        const screen = nativeWorkspaceRenderer(read, root);
        let selected: string | null = "conversation-a";
        const render = () =>
          screen.render({
            selected,
            onSelect: (id: string) => {
              selected = id;
            },
            messaging: adapter.render(selected),
            startForm: null,
            composer: { type: "Input", props: { value: "Keep this draft" }, children: [] },
            renderAttachment: () => null,
            t: (key: string) => key,
          });
        conversations.isPending = true;
        messages.isPending = true;
        expectNoEmptyClaims(render());
        expect(
          nodes(render()).filter((node) => node.type === "Skeleton").length,
        ).toBeGreaterThanOrEqual(2);
        conversations.isPending = false;
        messages.isPending = false;
        conversations.error = new Error("Conversation read failed");
        messages.error = new Error("Message read failed");
        const failed = render();
        expectNoEmptyClaims(failed);
        const alerts = nodes(failed).filter(
          (node) => node.type === "Alert" && node.props.variant === "destructive",
        );
        expect(alerts).toHaveLength(2);
        for (const alert of alerts) {
          const retry = nodes(alert).find((node) => node.type === "Button");
          if (!retry) throw new Error("Missing native read retry");
          (retry.props[event] as () => void)();
        }
        expect(conversations.retries()).toBe(1);
        expect(messages.retries()).toBe(1);
        expect(
          nodes(render()).some(
            (node) => node.type === "Input" && node.props.value === "Keep this draft",
          ),
        ).toBe(true);
        conversations.error = null;
        messages.error = null;
        conversations.data = [];
        messages.data = [];
        expect(JSON.stringify(render())).toMatch(/noConversations|No conversations yet/);
        expect(JSON.stringify(render())).toMatch(/noMessages|No messages yet/);
        conversations.error = new Error("Background conversations refresh failed");
        messages.error = new Error("Background messages refresh failed");
        conversations.data = [{ id: "conversation-a" }];
        messages.data = [
          { id: "message-a", senderId: "sender", body: "Keep this message", attachments: [] },
        ];
        expectNoEmptyClaims(render());
        expect(JSON.stringify(render())).toContain("Keep this message");
        selected = null;
        expect(JSON.stringify(render())).not.toContain("Keep this message");
        expectNoEmptyClaims(render());
      }
    });
  }

  test("native Convex loading preserves selection without claiming an empty thread", () => {
    const read = generatedMessaging("monorepo", "nextjs", "convex");
    for (const root of [
      "apps/mobile/src/features/messaging",
      "apps/desktop/src/renderer/features/messaging",
    ]) {
      const messaging = {
        conversations: [],
        conversationsPending: true,
        messages: [],
        messagesPending: true,
        typing: false,
        transport: "native",
      };
      const screen = nativeWorkspaceRenderer(read, root);
      const render = () =>
        screen.render({
          selected: "conversation-a",
          onSelect: () => undefined,
          messaging,
          startForm: null,
          composer: null,
          renderAttachment: () => null,
        });
      expectNoEmptyClaims(render());
      expect(
        nodes(render()).filter((node) => node.type === "Skeleton").length,
      ).toBeGreaterThanOrEqual(2);
      messaging.conversationsPending = false;
      messaging.messagesPending = false;
      expect(JSON.stringify(render())).toContain("No messages yet");
    }
  });
});
