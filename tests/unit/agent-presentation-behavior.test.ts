import { describe, expect, test } from "bun:test";
import {
  agentPromptContent,
  agentTranscriptContent,
} from "../../src/templates/apps/fragments/agent/components.js";
import { elements, generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

describe("focused agent presentation", () => {
  test("prompt retains blank and busy guards, sends plain text, and clears accepted input", () => {
    const sent: string[] = [];
    const ui = generatedFormHarness(agentPromptContent(), ["AgentPrompt"], {
      Input: "Input",
      Field: "Field",
      FieldLabel: "FieldLabel",
    });
    const render = (busy = false) =>
      ui.render("AgentPrompt", { busy, onSend: (input: string) => sent.push(input) });
    const submit = (tree: unknown) => {
      (
        elements(tree).find((node) => node.type === "form")!.props.onSubmit as (event: {
          preventDefault(): void;
        }) => void
      )({ preventDefault() {} });
    };
    submit(render());
    expect(sent).toEqual([]);
    const input = elements(render()).find((node) => node.type === "Input")!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "Show the current conversation" },
    });
    const busy = render(true);
    expect(
      elements(busy)
        .filter((node) => node.type === "Button" || node.type === "Input")
        .every((node) => node.props.disabled),
    ).toBe(true);
    submit(busy);
    expect(sent).toEqual([]);
    submit(render());
    expect(sent).toEqual(["Show the current conversation"]);
    expect(elements(render()).find((node) => node.type === "Input")!.props.value).toBe("");
  });

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
