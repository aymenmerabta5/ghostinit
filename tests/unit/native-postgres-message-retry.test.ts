import { describe, expect, test } from "bun:test";
import { nativePostgresMessagingDataFiles } from "../../src/templates/apps/fragments/messaging/native-postgres-data.js";
import { nativeMessagingWorkflowFiles } from "../../src/templates/apps/fragments/messaging/native-workflows.js";

interface Input {
  conversationId: string;
  body: string;
  clientMessageKey: string;
  attachment?: unknown;
}
function executable(source: string): string {
  return new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
  );
}
function fixture(target: "expo" | "desktop") {
  const source = nativePostgresMessagingDataFiles(
    target,
    "monorepo",
    "src/features/messaging",
  ).find(({ path }) => path.endsWith("/mutations.ts"))!.content;
  const requests: Input[] = [];
  const uploads: unknown[] = [];
  let current = true;
  let failSend = true;
  let typingCalls = 0;
  let afterUpload: (() => void) | undefined;
  const bindings = {
    useRef: (value: unknown) => ({ current: value }),
    useQueryClient: () => ({ invalidateQueries: async () => undefined }),
    useCallback: (value: unknown) => value,
    messagingSendSignature: (input: Input) => input.clientMessageKey,
    useAuthOwnedEffect: () => () => () => current,
    useMessagingCommandMutation: (
      _scope: unknown,
      _kind: string,
      operation: (input: Input, isCurrent: () => boolean) => Promise<void>,
    ) => ({ run: (input: Input) => operation(input, () => current) }),
    orpcClient: {
      messaging: {
        sendMessage: async (input: Input) => {
          requests.push(input);
          if (failSend) throw new Error("response lost");
        },
      },
    },
    sendTypingRealtime: () => {
      typingCalls += 1;
      throw new Error("typing disconnected");
    },
    [target === "expo" ? "uploadNativeAttachment" : "uploadDesktopAttachment"]: async (
      _conversation: string,
      attachment: unknown,
    ) => {
      uploads.push(attachment);
      afterUpload?.();
      return "attachment-" + uploads.length;
    },
  };
  const factory = new Function(
    ...Object.keys(bindings),
    executable(source) + "\nreturn useSendMessageMutation;",
  )(...Object.values(bindings)) as () => { run(input: Input): Promise<void> };
  const mutation = factory();
  return {
    mutation,
    requests,
    uploads,
    allowSuccess: () => {
      failSend = false;
    },
    retireDuringUpload: () => {
      afterUpload = () => {
        current = false;
      };
    },
    typingCalls: () => typingCalls,
  };
}

describe("native Postgres attachment send retry", () => {
  for (const target of ["expo", "desktop"] as const) {
    test(`${target} retries one prepared attachment with the original key and ignores typing failure after success`, async () => {
      const subject = fixture(target);
      const attachment = { name: "receipt.png" };
      const input = {
        conversationId: "thread-a",
        body: "proof",
        clientMessageKey: "request-key-00001",
        attachment,
      };
      await expect(subject.mutation.run(input)).rejects.toThrow("response lost");
      subject.allowSuccess();
      await subject.mutation.run(input);
      expect(subject.uploads).toHaveLength(1);
      expect(subject.requests).toEqual([
        {
          conversationId: "thread-a",
          body: "proof",
          clientMessageKey: "request-key-00001",
          attachmentIds: ["attachment-1"],
        },
        {
          conversationId: "thread-a",
          body: "proof",
          clientMessageKey: "request-key-00001",
          attachmentIds: ["attachment-1"],
        },
      ]);
      expect(subject.typingCalls()).toBe(1);
      await subject.mutation.run({ ...input, clientMessageKey: "request-key-00002" });
      expect(subject.uploads).toHaveLength(2);
    });

    test(`${target} changed attachment or conversation cannot reuse a prepared upload`, async () => {
      const subject = fixture(target);
      const input = {
        conversationId: "thread-a",
        body: "proof",
        clientMessageKey: "request-key-00001",
        attachment: { name: "a.png" },
      };
      await expect(subject.mutation.run(input)).rejects.toThrow();
      await expect(
        subject.mutation.run({ ...input, attachment: { name: "a.png" } }),
      ).rejects.toThrow();
      await expect(
        subject.mutation.run({ ...input, conversationId: "thread-b" }),
      ).rejects.toThrow();
      expect(subject.uploads).toHaveLength(3);
    });

    test(`${target} retires the send when attachment preparation changes the action owner`, async () => {
      const subject = fixture(target);
      subject.retireDuringUpload();
      await subject.mutation.run({
        conversationId: "thread-a",
        body: "proof",
        clientMessageKey: "request-key-00001",
        attachment: {},
      });
      expect(subject.uploads).toHaveLength(1);
      expect(subject.requests).toHaveLength(0);
      expect(subject.typingCalls()).toBe(0);
    });

    test(`${target} keeps exact draft retries stable and assigns fresh keys to changed intent`, () => {
      const model = nativeMessagingWorkflowFiles(target, "src/features/messaging").find(
        ({ path }) => path.endsWith("/send-model.ts"),
      )!.content;
      const next = new Function(executable(model) + "\nreturn nextSendAttempt;")() as (
        previous: Input | null,
        id: string,
        body: string,
        attachment: unknown,
      ) => Input;
      const attachment =
        target === "expo"
          ? { uri: "file://one", name: "one.png", mimeType: "image/png" }
          : new File(["one"], "one.png", { type: "image/png" });
      const first = next(null, "thread-a", "proof", attachment);
      expect(next(first, "thread-a", "proof", attachment)).toBe(first);
      expect(next(first, "thread-a", "changed", attachment).clientMessageKey).not.toBe(
        first.clientMessageKey,
      );
      expect(next(first, "thread-b", "proof", attachment).clientMessageKey).not.toBe(
        first.clientMessageKey,
      );
      expect(next(first, "thread-a", "proof", null).clientMessageKey).not.toBe(
        first.clientMessageKey,
      );
    });
  }
});
