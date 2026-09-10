import { describe, expect, test } from "bun:test";
import {
  manualBillingUiFiles,
  manualDesktopUiFiles,
} from "../../src/templates/billing/ui/manual/index.js";
import { notificationWorkspaceContent } from "../../src/templates/apps/capability-clients/notification-workspace.js";
import type { CapabilityClientOptions } from "../../src/templates/apps/capability-clients/shared.js";
import { notificationsLibFiles } from "../../src/templates/apps/fragments/lib/notifications.js";
import { agentComponentFiles } from "../../src/templates/apps/fragments/agent/components.js";
import { desktopEveFiles } from "../../src/templates/apps/fragments/eve/desktop.js";
import { expoEveFiles } from "../../src/templates/apps/fragments/eve/expo.js";
import {
  elements,
  generatedFormHarness,
  type TestElement,
} from "../helpers/generated-form-harness.js";

const samples = [
  "The transfer reference does not match this receipt.",
  "Veuillez v\u00E9rifier le re\u00E7u.",
  "\u064A\u0631\u062C\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0647\u0630\u0627 \u0627\u0644\u0625\u064A\u0635\u0627\u0644.",
  "42 / \u0628\u0631\u064A\u062F\u064A \u0645\u0648\u0628 CCP.",
  '<img src=x onerror="alert(1)"> & first line.\nSecond line.',
];
const primitives = Object.fromEntries(
  [
    "Badge",
    "Bell",
    "Empty",
    "EmptyHeader",
    "EmptyTitle",
    "EmptyDescription",
    "Input",
    "Link",
    "NotificationComposer",
    "Popover",
    "PopoverContent",
    "PopoverDescription",
    "PopoverTitle",
    "PopoverTrigger",
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
    "ScrollView",
    "View",
    "Text",
    "ActivityIndicator",
  ].map((name) => [name, name]),
);
function emitted(files: readonly { path: string; content: string }[], suffix: string): string {
  const found = files.find((entry) => entry.path.endsWith(suffix));
  if (!found) throw new Error("Missing emitted presenter: " + suffix);
  return found.content;
}
function literal(value: unknown): string {
  if (Array.isArray(value)) return value.map(literal).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("children" in value)) return "";
  return literal((value as TestElement).children);
}
function exact(tree: unknown, type: string, value: string): TestElement {
  const found = elements(tree).filter((node) => node.type === type && literal(node) === value);
  expect(found).toHaveLength(1);
  if (!found[0]) throw new Error("Missing isolated text boundary");
  return found[0];
}
function assertAutomatic(tree: unknown, type: string, value: string): void {
  expect(exact(tree, type, value).props.dir).toBe("auto");
}
function assertPlainText(tree: unknown, value: string): void {
  expect(literal(tree)).toContain(value);
  for (const node of elements(tree)) {
    expect(node.props).not.toHaveProperty("dangerouslySetInnerHTML");
    expect(node.type).not.toBe("img");
    expect(node.type).not.toBe("script");
  }
}
function render(source: string, name: string, props: unknown): unknown {
  return generatedFormHarness(source, [name], {
    ...primitives,
    useSurfaceLocale: () => "ar",
    useTranslations: () => (key: string) => key,
    formatManualAmount: (minor: number) => "DZD " + String(minor),
    resolveNotificationDestination: () => "/notifications",
  }).render(name, props);
}
function stripAuto(source: string): string {
  expect(source).toContain('dir="auto"');
  return source.replaceAll(' dir="auto"', "");
}
function options(
  mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start",
  i18n: boolean,
): CapabilityClientOptions {
  return {
    mode,
    framework,
    i18n,
    apps: ["web", "mobile", "desktop"],
    notifications: true,
    storage: false,
    featureFlags: false,
    jobs: false,
    requestApplication: true,
  };
}
function notificationProps(body: string) {
  const item = Object.freeze({
    id: "note-a",
    title: body + " Title!",
    body,
    readAt: null,
    href: "/notifications",
  });
  const events: unknown[] = [];
  return {
    item,
    events,
    props: {
      title: "Composer title",
      setTitle() {},
      body: "Composer body",
      setBody() {},
      items: [item],
      pending: false,
      loading: false,
      refreshing: false,
      loadError: false,
      displayedError: null,
      refresh() {},
      publish() {},
      open(value: unknown) {
        events.push(value);
      },
      markRead(id: string) {
        events.push(id);
      },
    },
  };
}

// These controls inspect emitted JSX semantics. Browser captures separately prove glyph order.
describe("user-authored free-text direction boundaries", () => {
  const manual = [
    manualBillingUiFiles("src"),
    manualBillingUiFiles("apps/web/src"),
    manualDesktopUiFiles("apps/desktop/src/renderer", true),
  ];
  for (const [index, files] of manual.entries())
    test("manual note isolation " + index, () => {
      const source = emitted(files, "/components/payment-history.tsx");
      for (const reason of samples) {
        const item = Object.freeze({
          id: "payment-a",
          amountMinor: 120000,
          method: "BaridiMob",
          status: "rejected",
          reason,
          createdAt: "2026-09-10T08:00:00.000Z",
        });
        const receipts: unknown[] = [];
        const props = {
          items: [item],
          renderReceipt(id: unknown) {
            receipts.push(id);
            return "RECEIPT";
          },
        };
        const tree = render(source, "ManualPaymentHistory", props);
        const note = exact(tree, "p", "manualReviewNote: " + reason);
        expect(exact(note, "bdi", reason).props.dir).toBeUndefined();
        expect(note.props.className).toBe("break-words text-sm");
        expect(note.props.dir).toBeUndefined();
        expect(receipts).toEqual([item.id]);
        assertPlainText(note, reason);
        expect(literal(tree)).toContain("DZD 120000");
        const legacy = source.replace("<bdi>{item.reason}</bdi>", "{item.reason}");
        expect(legacy).not.toBe(source);
        expect(() => exact(render(legacy, "ManualPaymentHistory", props), "bdi", reason)).toThrow();
      }
      const emptyReason = render(source, "ManualPaymentHistory", {
        items: [
          {
            id: "p",
            amountMinor: 100,
            method: "CCP",
            status: "pending",
            reason: null,
            createdAt: "2026-09-10",
          },
        ],
        renderReceipt: () => null,
      });
      expect(elements(emptyReason).some((node) => node.type === "p")).toBe(false);
    });

  for (const mode of ["single", "monorepo"] as const)
    for (const framework of ["nextjs", "tanstack-start"] as const)
      for (const i18n of [false, true]) {
        for (const target of ["web", "desktop"] as const)
          test("notification " + mode + framework + target + i18n, () => {
            const source = notificationWorkspaceContent(options(mode, framework, i18n), target);
            for (const body of samples) {
              const { item, props, events } = notificationProps(body);
              const tree = render(source, "NotificationsWorkspace", props);
              assertAutomatic(tree, "CardTitle", item.title);
              assertAutomatic(tree, "CardDescription", item.body);
              expect(exact(tree, "CardDescription", body).props.className).toBe(
                "whitespace-pre-wrap break-words",
              );
              assertPlainText(tree, body);
              const actions = elements(tree).filter(
                (node) => node.type === "Button" && typeof node.props.onClick === "function",
              );
              expect(actions).toHaveLength(2);
              for (const action of actions) (action.props.onClick as () => void)();
              expect(events).toEqual([item, item.id]);
              expect(() =>
                assertAutomatic(
                  render(stripAuto(source), "NotificationsWorkspace", props),
                  "CardDescription",
                  body,
                ),
              ).toThrow();
            }
            const pending = notificationProps("Pending body.");
            const tree = render(source, "NotificationsWorkspace", {
              ...pending.props,
              pending: true,
            });
            expect(
              elements(tree)
                .filter((node) => node.type === "Button")
                .every((node) => node.props.disabled),
            ).toBe(true);
          });
      }

  for (const base of ["src", "apps/web/src"])
    test("notification bell shares free-text boundaries " + base, () => {
      const files = notificationsLibFiles(base);
      const source =
        emitted(files, "/lib/notifications.ts") +
        "\n" +
        emitted(files, "/components/NotificationBell.tsx");
      for (const body of samples) {
        const item = Object.freeze({
          id: "bell-note",
          type: "user.note",
          payload: { title: body + " Title!", message: body, href: "/notifications" },
          readAt: null,
          createdAt: "2026-09-10T08:00:00.000Z",
        });
        const activated: unknown[] = [];
        const props = {
          notifications: [item],
          onActivate(value: unknown) {
            activated.push(value);
          },
        };
        const tree = render(source, "NotificationBell", props);
        assertAutomatic(tree, "span", "User.Note");
        assertAutomatic(tree, "span", body);
        assertPlainText(tree, body);
        const button = elements(tree).find(
          (node) => node.type === "Button" && typeof node.props.onClick === "function",
        );
        if (!button) throw new Error("Missing notification action");
        (button.props.onClick as () => void)();
        expect(activated).toEqual([item]);
        expect(() =>
          assertAutomatic(render(stripAuto(source), "NotificationBell", props), "span", body),
        ).toThrow();
      }
    });

  for (const mode of ["single", "monorepo"] as const)
    test("web Eve message paragraphs " + mode, () => {
      const source = emitted(agentComponentFiles(mode), "/components/agent-transcript.tsx");
      for (const text of samples)
        for (const role of ["user", "assistant"]) {
          const message = Object.freeze({
            id: "message-a",
            role,
            parts: [
              { type: "text", text },
              { type: "tool", text: "PRIVATE TOOL PAYLOAD" },
            ],
          });
          const props = { messages: [message], streaming: true };
          const tree = render(source, "AgentTranscript", props);
          assertAutomatic(tree, "p", text);
          assertPlainText(tree, text);
          expect(literal(tree)).not.toContain("PRIVATE TOOL PAYLOAD");
          expect(exact(tree, "MessageHeader", role).props.dir).toBeUndefined();
          const item = elements(tree).find(
            (node) => node.type === "MessageScrollerItem" && node.props.messageId === message.id,
          )!;
          expect(item.props.scrollAnchor).toBe(role === "user");
          expect(elements(tree).some((node) => node.type === "Marker")).toBe(true);
          const log = elements(tree).find((node) => node.type === "MessageScrollerContent")!;
          expect(log.props).toMatchObject({ role: "log", "aria-live": "polite" });
          expect(() =>
            assertAutomatic(render(stripAuto(source), "AgentTranscript", props), "p", text),
          ).toThrow();
        }
    });

  for (const mode of ["single", "monorepo"] as const)
    for (const i18n of [false, true])
      test("desktop Eve message boundary " + mode + i18n, () => {
        const source = emitted(desktopEveFiles(mode, i18n), "/components/agent-view.tsx");
        for (const text of samples)
          for (const role of ["user", "assistant"]) {
            const props = {
              isPending: false,
              isAuthenticated: true,
              messages: [{ id: 1, role, text }],
              pending: true,
              error: null,
              composer: "COMPOSER",
              t: (key: string) => key,
            };
            const tree = render(source, "AgentView", props);
            assertAutomatic(tree, "BubbleContent", text);
            assertPlainText(tree, text);
            expect(literal(tree)).toContain("COMPOSER");
            expect(elements(tree).some((node) => node.type === "Marker")).toBe(true);
            expect(() =>
              assertAutomatic(render(stripAuto(source), "AgentView", props), "BubbleContent", text),
            ).toThrow();
          }
      });

  for (const mode of ["single", "monorepo"] as const)
    test("native text preserves platform ownership " + mode, () => {
      const source = notificationWorkspaceContent(options(mode, "nextjs", true), "mobile");
      const note = notificationProps("Native notification.");
      const notification = render(source, "NotificationsWorkspace", note.props);
      expect(exact(notification, "CardDescription", note.item.body).props.dir).toBeUndefined();
      const eve = emitted(expoEveFiles(mode, true), "/components/agent-view.tsx");
      const transcript = render(eve, "AgentView", {
        isPending: false,
        isAuthenticated: true,
        messages: [{ id: 1, role: "assistant", text: "Native message." }],
        error: null,
        composer: null,
        t: (key: string) => key,
      });
      expect(exact(transcript, "Text", "Native message.").props.dir).toBeUndefined();
      for (const tree of [notification, transcript])
        for (const node of elements(tree)) {
          expect(node.type).not.toBe("bdi");
          expect(node.props.dir).toBeUndefined();
          expect(node.props.style ?? {}).not.toHaveProperty("writingDirection");
        }
    });
});
