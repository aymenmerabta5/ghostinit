import { describe, expect, test } from "bun:test";
import {
  generatedMessaging,
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

describe("generated messaging read states", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} Postgres read failures remain recoverable without clearing selected data`, async () => {
        const read = generatedMessaging(mode, framework, "postgres");
        const query = readState();
        let selected = "conversation-a";
        const list = renderer(read("/conversation-list.tsx"), "ConversationList", {
          useConversations: () => query,
        });
        const listProps = {
          initialConversations: [],
          selectedId: selected,
          onSelect: (id: string) => {
            selected = id;
          },
        };
        const messageList = renderer(read("/message-list.tsx"), "MessageList");
        const thread = renderer(read("/message-thread.tsx"), "MessageThread", {
          useMessages: () => query,
          MessageList: (props: unknown) => messageList.render(props),
        });
        const views = [
          () => list.render(listProps),
          () => thread.render({ conversationId: selected }),
        ];
        query.isLoading = true;
        for (const view of views) {
          expectNoEmptyClaims(view());
          expect(nodes(view()).some((node) => node.type === "Skeleton")).toBe(true);
        }
        query.isLoading = false;
        query.error = new Error("Read unavailable");
        for (const view of views) {
          expectNoEmptyClaims(view());
          expect(
            nodes(view()).some((node) => node.type === "Alert" && node.props.role === "alert"),
          ).toBe(true);
          (retryButton(view()).props.onClick as () => void)();
        }
        expect(query.retries()).toBe(2);
        expect(selected).toBe("conversation-a");
        expect(
          nodes(thread.render({ conversationId: selected })).some(
            (node) => node.type === "MessageComposer",
          ),
        ).toBe(true);
        query.error = null;
        query.data = [];
        expect(JSON.stringify(list.render(listProps))).toContain("noConversations");
        expect(JSON.stringify(thread.render({ conversationId: selected }))).toContain("noMessages");
        query.error = new Error("Background refresh failed");
        query.data = [{ id: "conversation-a" }];
        const cachedList = list.render(listProps);
        expectNoEmptyClaims(cachedList);
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
        expect(JSON.stringify(thread.render({ conversationId: selected }))).toContain(
          "Retain this message",
        );
        expectNoEmptyClaims(thread.render({ conversationId: selected }));
      });

      test(`${mode}/${framework} Convex separates pending thread data from a verified empty thread`, () => {
        const read = generatedMessaging(mode, framework, "convex");
        let messages: unknown = undefined;
        const messageViews =
          framework === "nextjs"
            ? renderer(read("/convex-message-views.ts"), "messageViews").render
            : undefined;
        const thread = renderer(read("/convex-message-thread.tsx"), "ConvexMessageThread", {
          useQuery: (query: string) => (query === "messages" ? messages : []),
          useConvexMessages: () => messages,
          ...(messageViews ? { messageViews } : {}),
        });
        const props = { conversationId: "conversation-a" };
        expectNoEmptyClaims(thread.render(props));
        expect(nodes(thread.render(props)).some((node) => node.type === "Skeleton")).toBe(true);
        messages = { messages: [], nextCursor: null };
        expect(JSON.stringify(thread.render(props))).toContain("noMessages");
        messages = {
          messages: [{ _id: "message-a", body: "Retained live message", attachments: [] }],
          nextCursor: null,
        };
        expect(JSON.stringify(thread.render(props))).toContain("Retained live message");
      });
    }
  }

  for (const i18n of [false, true]) {
    test(`native Postgres i18n=${i18n} preserves separate conversation and message read states`, async () => {
      const read = generatedMessaging("monorepo", "nextjs", "postgres", i18n);
      for (const [adapterPath, screenPath, hookName, screenName, event] of [
        [
          "apps/mobile/src/adapters/messaging/postgres.ts",
          "apps/mobile/app/(app)/messages.tsx",
          "useNativeMessaging",
          "MessagesScreen",
          "onPress",
        ],
        [
          "apps/desktop/src/renderer/adapters/messaging/postgres.ts",
          "apps/desktop/src/renderer/routes/messages.tsx",
          "useDesktopMessaging",
          "MessagesPage",
          "onClick",
        ],
      ] as const) {
        const conversations = readState();
        const messages = readState();
        const adapter = renderer(read(adapterPath), hookName, {
          useQuery: ({ queryKey }: { queryKey: string[] }) =>
            queryKey[1] === "conversations" ? conversations : messages,
        });
        const screen = renderer(read(screenPath), screenName, {
          [hookName]: (id: string) => adapter.render(id),
        });
        screen.setState(0, "conversation-a");
        screen.setState(2, "Keep this draft");
        conversations.isPending = true;
        messages.isPending = true;
        expectNoEmptyClaims(screen.render());
        expect(
          nodes(screen.render()).filter((node) => node.type === "Skeleton").length,
        ).toBeGreaterThanOrEqual(2);
        conversations.isPending = false;
        messages.isPending = false;
        conversations.error = new Error("Conversation read failed");
        messages.error = new Error("Message read failed");
        const failed = screen.render();
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
          nodes(screen.render()).some(
            (node) => node.type === "Input" && node.props.value === "Keep this draft",
          ),
        ).toBe(true);
        conversations.error = null;
        messages.error = null;
        conversations.data = [];
        messages.data = [];
        expect(JSON.stringify(screen.render())).toMatch(/noConversations|No conversations yet/);
        expect(JSON.stringify(screen.render())).toMatch(/noMessages|No messages yet/);
        conversations.error = new Error("Background conversations refresh failed");
        messages.error = new Error("Background messages refresh failed");
        conversations.data = [{ id: "conversation-a" }];
        messages.data = [
          { id: "message-a", senderId: "sender", body: "Keep this message", attachments: [] },
        ];
        expectNoEmptyClaims(screen.render());
        expect(JSON.stringify(screen.render())).toContain("Keep this message");
        screen.setState(0, null);
        expect(JSON.stringify(screen.render())).not.toContain("Keep this message");
        expectNoEmptyClaims(screen.render());
      }
    });
  }

  test("native Convex loading preserves selection without claiming an empty thread", () => {
    const read = generatedMessaging("monorepo", "nextjs", "convex");
    for (const [path, name, hook] of [
      ["apps/mobile/app/(app)/messages.tsx", "MessagesScreen", "useNativeMessaging"],
      ["apps/desktop/src/renderer/routes/messages.tsx", "MessagesPage", "useDesktopMessaging"],
    ] as const) {
      const state = {
        conversations: [],
        conversationsPending: true,
        messages: [],
        messagesPending: true,
        pending: false,
        typing: false,
      };
      const screen = renderer(read(path), name, { [hook]: () => state });
      screen.setState(0, "conversation-a");
      expectNoEmptyClaims(screen.render());
      expect(
        nodes(screen.render()).filter((node) => node.type === "Skeleton").length,
      ).toBeGreaterThanOrEqual(2);
      state.conversationsPending = false;
      state.messagesPending = false;
      expect(JSON.stringify(screen.render())).toContain("No messages yet");
    }
  });
});
