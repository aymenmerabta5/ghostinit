import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { nativeConvexMessagingDataFiles } from "../../src/templates/apps/fragments/messaging/native-convex-data.js";
import { deferred, flush, generatedFormHarness } from "../helpers/generated-form-harness.js";
import { queryMutationHarness } from "../helpers/query-mutation-harness.js";
import { messagingCommandHarness } from "../helpers/messaging-command-harness.js";

const api = {
  messaging: {
    listConversations: "conversations",
    listMessages: "messages",
    listTyping: "typing",
    getOrCreateConversation: "start",
    sendMessage: "send",
    sendTyping: "notify",
  },
};

function sources(target: "expo" | "desktop", mode: "single" | "monorepo") {
  const root =
    target === "expo"
      ? mode === "monorepo"
        ? "apps/mobile/src"
        : "src"
      : mode === "monorepo"
        ? "apps/desktop/src/renderer"
        : "src/renderer";
  const files = nativeConvexMessagingDataFiles(target, mode, `${root}/features/messaging`);
  return (name: string) => files.find((file) => file.path.endsWith(`/${name}.ts`))!.content;
}

describe("native Convex messaging extracted data adapters", () => {
  for (const target of ["expo", "desktop"] as const) {
    for (const mode of ["single", "monorepo"] as const) {
      test(`${mode}/${target} preserves live results, skipped selections and backend shape failures`, () => {
        const source = sources(target, mode);
        const values: Record<string, unknown> = {};
        const calls: unknown[] = [];
        const runtime = generatedFormHarness(
          `${source("model")}\n${source("queries")}`,
          ["useMessagingReads"],
          {
            z,
            api,
            useQuery: (name: string, input: unknown) => {
              calls.push([name, input]);
              return values[name];
            },
          },
        );
        const pending = runtime.render("useMessagingReads", "conversation") as Record<
          string,
          unknown
        >;
        expect(pending.conversationsPending).toBe(true);
        expect(pending.messagesPending).toBe(true);
        values.conversations = [{ _id: "conversation" }];
        values.messages = {
          messages: [
            {
              _id: "message",
              senderId: "sender",
              body: "Live message",
              createdAt: 1,
              attachments: [
                {
                  id: "attachment",
                  mimeType: "image/png",
                  originalName: "receipt.png",
                  url: "https://storage.example.test/receipt",
                },
              ],
            },
          ],
          nextCursor: null,
        };
        values.typing = [{ userId: "sender" }];
        const live = runtime.render("useMessagingReads", "conversation") as Record<string, unknown>;
        expect(live.conversations).toEqual([{ _id: "conversation", id: "conversation" }]);
        expect(live.messages).toMatchObject([
          { id: "message", body: "Live message", attachments: [{ originalName: "receipt.png" }] },
        ]);
        expect(live.typing).toBe(true);
        values.messages = { messages: [], nextCursor: null };
        expect(
          (runtime.render("useMessagingReads", "conversation") as Record<string, unknown>).messages,
        ).toEqual([]);
        runtime.render("useMessagingReads", null);
        expect(calls.slice(-2)).toEqual([
          ["messages", "skip"],
          ["typing", "skip"],
        ]);
        values.messages = { messages: [{ body: 42 }], nextCursor: null };
        expect(() => runtime.render("useMessagingReads", "conversation")).toThrow();
      });

      for (const changeOwner of [false, true]) {
        test(`${mode}/${target} upload completion ${changeOwner ? "cannot cross owners" : "sends once despite advisory typing failure"}`, async () => {
          const source = sources(target, mode);
          let generation = 0;
          const mutation = queryMutationHarness();
          const command = messagingCommandHarness();
          const upload = deferred<string>();
          const sends: unknown[] = [];
          const typing: unknown[] = [];
          const runtime = generatedFormHarness(
            [
              authOwnedMutationContent(),
              command.wrapperSource,
              source("model"),
              source("mutations"),
            ].join("\n"),
            ["useSendMessageMutation"],
            {
              z,
              api,
              useQueryClient: () => ({}),
              currentQueryAuthGeneration: () => generation,
              subscribeQueryAuthGeneration: () => () => {},
              useAuthOwnedEffect: () => () => {
                const owner = generation;
                return () => generation === owner;
              },
              useMutation: mutation.useMutation,
              useSyncExternalStore: command.useSyncExternalStore,
              useConvexMutation: (name: string) => async (input: unknown) => {
                if (name === "send") {
                  sends.push(input);
                  return null;
                }
                typing.push(input);
                throw new Error("Typing unavailable");
              },
              uploadNativeAttachment: () => upload.promise,
              uploadDesktopAttachment: () => upload.promise,
            },
          );
          const operation = runtime.render("useSendMessageMutation", command.scope) as {
            run(input: unknown): Promise<{ status: string }>;
          };
          const input = {
            conversationId: "conversation",
            body: "Delivered",
            clientMessageKey: "client-message-key",
            attachment: {},
          };
          const result = operation.run(input);
          const duplicate = operation.run(input);
          if (changeOwner) generation += 1;
          upload.resolve("attachment");
          await flush();
          expect((await result).status).toBe(changeOwner ? "ignored" : "success");
          expect((await duplicate).status).toBe(changeOwner ? "ignored" : "success");
          expect(sends).toEqual(
            changeOwner
              ? []
              : [
                  {
                    conversationId: "conversation",
                    body: "Delivered",
                    attachmentIds: ["attachment"],
                  },
                ],
          );
          expect(typing).toEqual(
            changeOwner ? [] : [{ conversationId: "conversation", isTyping: false }],
          );
        });
      }
    }
  }
});
