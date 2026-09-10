import { describe, expect, test } from "bun:test";
import { deferred } from "../helpers/generated-form-harness.js";
import { messagingCommandHarness } from "../helpers/messaging-command-harness.js";

type Outcome =
  | { status: "ignored" }
  | { status: "success"; data: unknown; isCurrent(): boolean }
  | { status: "error"; error: Error; isCurrent(): boolean };
type Scope = ReturnType<typeof messagingCommandHarness>["scope"] & {
  run(
    kind: "start" | "send",
    signature: string | readonly unknown[],
    current: () => boolean,
    execute: () => Promise<Outcome>,
  ): Promise<Outcome>;
};
const success = (data: unknown): Outcome => ({ status: "success", data, isCurrent: () => true });

describe("native messaging shared command admission", () => {
  test("send signatures distinguish changed body, attachment identity and mutated native metadata", async () => {
    const harness = messagingCommandHarness();
    const scope = harness.scope as Scope;
    const attachment = { uri: "file:///receipt.png", name: "receipt.png", mimeType: "image/png" };
    const input = {
      conversationId: "conversation",
      body: "first",
      clientMessageKey: "key",
      attachment,
    };
    const gate = deferred<Outcome>();
    let executions = 0;
    const execute = () => {
      executions += 1;
      return gate.promise;
    };
    const first = scope.run("send", harness.signature(input), () => true, execute);
    const duplicate = scope.run("send", harness.signature(input), () => true, execute);
    expect(duplicate).toBe(first);
    expect(
      await scope.run(
        "send",
        harness.signature({ ...input, body: "changed" }),
        () => true,
        execute,
      ),
    ).toMatchObject({ status: "error" });
    expect(
      await scope.run(
        "send",
        harness.signature({ ...input, attachment: { ...attachment } }),
        () => true,
        execute,
      ),
    ).toMatchObject({ status: "error" });
    attachment.name = "changed.png";
    expect(await scope.run("send", harness.signature(input), () => true, execute)).toMatchObject({
      status: "error",
    });
    expect(executions).toBe(1);
    gate.resolve(success(undefined));
    await first;
  });

  test("identical commands coalesce while conflicting commands preserve the original pending execution", async () => {
    const harness = messagingCommandHarness();
    const scope = harness.scope as Scope;
    const gate = deferred<Outcome>();
    let executions = 0;
    const execute = () => {
      executions += 1;
      return gate.promise;
    };
    const first = scope.run("send", "same", () => true, execute);
    const duplicate = scope.run("send", "same", () => true, execute);
    expect(duplicate).toBe(first);
    expect(await scope.run("start", "same", () => true, execute)).toMatchObject({
      status: "error",
      error: new Error("Another messaging action is in progress"),
    });
    expect(await scope.run("send", "different", () => true, execute)).toMatchObject({
      status: "error",
    });
    expect(scope.getSnapshot().isPending).toBe(true);
    expect(executions).toBe(1);
    gate.resolve(success("delivered"));
    expect(await first).toMatchObject({ status: "success", data: "delivered" });
    expect(await duplicate).toMatchObject({ status: "success", data: "delivered" });
    expect(scope.getSnapshot().isPending).toBe(false);
  });

  test("retired owner completion and stale cleanup cannot release a replacement scope", async () => {
    const harness = messagingCommandHarness();
    const scope = harness.scope as Scope;
    const oldGate = deferred<Outcome>();
    const old = scope.run(
      "send",
      "old",
      () => true,
      () => oldGate.promise,
    );
    harness.retire();
    const retireReplacement = scope.activate();
    const nextGate = deferred<Outcome>();
    const next = scope.run(
      "send",
      "new",
      () => true,
      () => nextGate.promise,
    );
    oldGate.resolve(success("old"));
    expect(await old).toEqual({ status: "ignored" });
    harness.retire();
    expect(scope.getSnapshot().isPending).toBe(true);
    nextGate.resolve(success("new"));
    expect(await next).toMatchObject({ status: "success", data: "new" });
    retireReplacement();
    expect(scope.getSnapshot()).toMatchObject({ isPending: false, error: null });
  });

  test("an obsolete command cannot release a new owner admitted in the same mounted scope", async () => {
    const scope = messagingCommandHarness().scope as Scope;
    let owner = 0;
    const oldGate = deferred<Outcome>();
    const old = scope.run(
      "send",
      "same",
      () => owner === 0,
      () => oldGate.promise,
    );
    owner = 1;
    const nextGate = deferred<Outcome>();
    const next = scope.run(
      "send",
      "same",
      () => owner === 1,
      () => nextGate.promise,
    );
    oldGate.resolve(success("old"));
    expect(await old).toEqual({ status: "ignored" });
    expect(scope.getSnapshot().isPending).toBe(true);
    nextGate.resolve(success("new"));
    expect(await next).toMatchObject({ status: "success", data: "new" });
  });

  test("synchronous and asynchronous failures settle pending state and permit a retry", async () => {
    const scope = messagingCommandHarness().scope as Scope;
    const thrown = () => {
      throw new Error("Immediate failure");
    };
    expect(await scope.run("start", "peer", () => true, thrown)).toMatchObject({
      status: "error",
      error: new Error("Immediate failure"),
    });
    expect(scope.getSnapshot().isPending).toBe(false);
    expect(
      await scope.run(
        "start",
        "peer",
        () => true,
        async () => {
          throw new Error("Deferred failure");
        },
      ),
    ).toMatchObject({ status: "error", error: new Error("Deferred failure") });
    expect(scope.getSnapshot().isPending).toBe(false);
    expect(
      await scope.run(
        "start",
        "peer",
        () => true,
        async () => success("created"),
      ),
    ).toMatchObject({ status: "success", data: "created" });
  });
});
