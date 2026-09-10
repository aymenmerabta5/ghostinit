import { describe, expect, test } from "bun:test";
import {
  agentComponentFiles,
  agentTranscriptContent,
} from "../../src/templates/apps/fragments/agent/components.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

interface AgentWorkflow {
  input: string;
  setInput(value: string): void;
  submit(): void;
  busy: boolean;
  messages: unknown;
  streaming: boolean;
  error: unknown;
}

function agentHarness(mode: "single" | "monorepo", session: unknown) {
  const files = agentComponentFiles(mode);
  const root = mode === "single" ? "src" : "apps/web/src";
  const read = (name: string) => {
    const file = files.find((entry) => entry.path === `${root}/features/agent/${name}`);
    if (!file) throw new Error(`Missing emitted agent ${name}`);
    return file.content;
  };
  const requests: unknown[] = [];
  const ui = generatedFormHarness(
    [
      "queries.ts",
      "mutations.ts",
      "use-agent-conversation.ts",
      "components/agent-workspace.tsx",
      "components/agent-prompt.tsx",
    ]
      .map(read)
      .join("\n"),
    ["useAgentConversation", "AgentWorkspace", "AgentPrompt"],
    {
      Input: "Input",
      Field: "Field",
      FieldLabel: "FieldLabel",
      AgentHeader: "AgentHeader",
      AgentTranscript: "AgentTranscript",
      useEveAgent: (options: unknown) => {
        requests.push(options);
        return session;
      },
    },
  );
  const workflow = () => ui.render("useAgentConversation") as AgentWorkflow;
  return {
    ui,
    requests,
    workflow,
    render() {
      const workspace = ui.render("AgentWorkspace", workflow());
      const prompt = elements(workspace).find((node) => node.type === ui.module.AgentPrompt);
      if (!prompt) throw new Error("Emitted workspace did not compose its prompt");
      return ui.render("AgentPrompt", prompt.props);
    },
  };
}

describe("focused agent presentation", () => {
  for (const mode of ["single", "monorepo"] as const) {
    test(`${mode} prompt retains blank and busy guards, sends plain text, and clears accepted input`, async () => {
      const sent: string[] = [];
      const accepted = deferred<void>();
      const session = {
        status: "ready",
        data: { messages: [] },
        error: null,
        send(input: string) {
          sent.push(input);
          session.status = "submitted";
          return accepted.promise;
        },
      };
      const { render, requests } = agentHarness(mode, session);
      const submit = (tree: unknown) => {
        (
          elements(tree).find((node) => node.type === "form")!.props.onSubmit as (event: {
            preventDefault(): void;
          }) => void
        )({ preventDefault() {} });
      };
      submit(render());
      await flush();
      expect(sent).toEqual([]);
      const input = elements(render()).find((node) => node.type === "Input")!;
      (input.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: "   " },
      });
      submit(render());
      await flush();
      expect(sent).toEqual([]);
      (
        elements(render()).find((node) => node.type === "Input")!.props.onChange as (event: {
          target: { value: string };
        }) => void
      )({ target: { value: "Show the current conversation" } });
      for (const status of ["submitted", "streaming"]) {
        session.status = status;
        const busy = render();
        expect(
          elements(busy)
            .filter((node) => node.type === "Button" || node.type === "Input")
            .every((node) => node.props.disabled),
        ).toBe(true);
        submit(busy);
        await flush();
        expect(sent).toEqual([]);
        expect(elements(render()).find((node) => node.type === "Input")!.props.value).toBe(
          "Show the current conversation",
        );
      }
      session.status = "ready";
      submit(render());
      expect(sent).toEqual(["Show the current conversation"]);
      expect(elements(render()).find((node) => node.type === "Input")!.props.value).toBe("");
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every((request) => JSON.stringify(request) === '{"host":"/api/agent"}')).toBe(
        true,
      );
      accepted.resolve();
      await flush();
    });

    test(`${mode} workflow leaves messages, stream status and errors owned by the Eve SDK`, async () => {
      const originalMessages = Object.freeze([
        { id: "original", role: "assistant", parts: [{ type: "text", text: "Original" }] },
      ]);
      const failure = new Error("SDK stream failed");
      const session = {
        status: "ready",
        data: { messages: originalMessages },
        error: null as Error | null,
        async send() {
          session.status = "error";
          session.error = failure;
          throw failure;
        },
      };
      const { workflow } = agentHarness(mode, session);
      expect(workflow().messages).toBe(originalMessages);
      session.status = "streaming";
      expect(workflow()).toMatchObject({ busy: true, streaming: true });
      const streamedMessages = Object.freeze([
        { id: "streamed", role: "assistant", parts: [{ type: "text", text: "Streamed" }] },
      ]);
      session.data.messages = streamedMessages;
      expect(workflow().messages).toBe(streamedMessages);
      session.status = "ready";
      const model = workflow();
      model.setInput("Next prompt");
      model.submit();
      await flush();
      expect(workflow().error).toBe(failure);
      expect(workflow().messages).toBe(streamedMessages);
      expect(workflow().input).toBe("");
    });
  }

  test("transcript preserves empty, text-only message rendering, direction, and streaming announcements", () => {
    const primitives = [
      "Bubble",
      "BubbleContent",
      "Marker",
      "MarkerContent",
      "Message",
      "MessageContent",
      "MessageHeader",
      "MessageScroller",
      "MessageScrollerButton",
      "MessageScrollerContent",
      "MessageScrollerItem",
      "MessageScrollerProvider",
      "MessageScrollerViewport",
      "Empty",
      "EmptyHeader",
      "EmptyTitle",
      "EmptyDescription",
    ];
    const ui = generatedFormHarness(
      agentTranscriptContent(),
      ["AgentTranscript"],
      Object.fromEntries(primitives.map((name) => [name, name])),
    );
    expect(textContent(ui.render("AgentTranscript", { messages: [], streaming: false }))).toContain(
      "empty",
    );
    const tree = ui.render("AgentTranscript", {
      messages: [
        {
          id: "user-message",
          role: "user",
          parts: [
            { type: "text", text: "Visible user message" },
            { type: "tool-result", result: "Private tool payload" },
          ],
        },
        {
          id: "assistant-message",
          role: "assistant",
          parts: [{ type: "text", text: "Visible assistant response" }],
        },
      ],
      streaming: true,
    });
    expect(textContent(tree)).toContain("Visible user message");
    expect(textContent(tree)).toContain("Visible assistant response");
    expect(textContent(tree)).not.toContain("Private tool payload");
    expect(textContent(tree)).toContain("streaming");
    expect(
      elements(tree)
        .filter((node) => node.type === "Message")
        .map((node) => node.props.align),
    ).toEqual(["end", "start"]);
    expect(
      elements(tree).find((node) => node.type === "MessageScrollerContent")!.props,
    ).toMatchObject({ role: "log", "aria-live": "polite", "aria-label": "conversationLabel" });
  });
});
