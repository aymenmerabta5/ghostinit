import { describe, expect, test } from "bun:test";
import {
  manualBillingUiFiles,
  manualDesktopUiFiles,
} from "../../src/templates/billing/ui/manual/index.js";
import { manualMobileFeatureFiles } from "../../src/templates/billing/ui/manual/mobile.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import {
  elements,
  generatedFormHarness,
  type TestElement,
} from "../helpers/generated-form-harness.js";

type OutputFile = { path: string; content: string };
const locales = [
  ["en", EN_MESSAGES.billing],
  ["fr", FR_MESSAGES.billing],
  ["ar", AR_MESSAGES.billing],
] as const;
const inputs = [
  { method: "BaridiMob", reference: null },
  { method: "42 / بريدي موب CCP", reference: "082946 / تحويل CCP" },
  { method: "BaridiMob-".repeat(20), reference: "TRANSFER-082946" },
] as const;
const statuses = ["pending", "approved", "rejected"] as const;
const createdAt = "2026-09-10T08:00:00.000Z";
const badgeVariants = { pending: "outline", approved: "secondary", rejected: "destructive" };

function source(files: readonly OutputFile[], ...names: string[]): string {
  return names
    .map((name) => {
      const entry = files.find((file) => file.path.endsWith(`/features/manual-payments/${name}`));
      if (!entry) throw new Error(`Missing emitted manual presenter: ${name}`);
      return entry.content;
    })
    .join("\n");
}

function literalText(value: unknown): string {
  if (Array.isArray(value)) return value.map(literalText).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  const node = elements(value)[0];
  return node ? node.children.map(literalText).join("") : "";
}

function one(nodes: TestElement[], label: string): TestElement {
  expect(nodes, label).toHaveLength(1);
  const node = nodes[0];
  if (!node) throw new Error(label);
  return node;
}

function only(tree: unknown, type: string): TestElement {
  return one(
    elements(tree).filter((node) => node.type === type),
    `Expected one ${type}`,
  );
}

function amount(locale: string, minor: number): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "DZD" }).format(minor / 100);
}

function isolated(tree: unknown, value: string): TestElement {
  const node = one(
    elements(tree).filter((entry) => entry.type === "bdi" && literalText(entry) === value),
    `Independent bidi boundary for ${value}`,
  );
  expect(node.props.dir ?? "auto").toBe("auto");
  expect(node.props.style ?? {}).not.toHaveProperty("direction");
  expect(node.props.style ?? {}).not.toHaveProperty("unicodeBidi");
  return node;
}

function invoke(node: TestElement, key: "onClick" | "onPress"): void {
  const action = node.props[key];
  if (typeof action !== "function") throw new Error(`Missing ${key} action`);
  Reflect.apply(action, undefined, []);
}

function assertDomMetadata(
  tree: unknown,
  item: (typeof inputs)[number],
  locale: string,
  referenceLabel: string,
): void {
  const method = isolated(tree, item.method);
  const time = only(tree, "time");
  expect(time.props.dateTime).toBe(createdAt);
  const expectedTime = new Date(createdAt).toLocaleString(locale);
  expect(literalText(time)).toBe(expectedTime);
  isolated(time, expectedTime);
  expect(elements(time)).not.toContain(method);
  if (item.reference === null) {
    expect(literalText(tree)).not.toContain(`${referenceLabel}:`);
  } else {
    isolated(tree, item.reference);
    expect(literalText(tree)).toContain(`${referenceLabel}: ${item.reference}`);
  }
}

// These tests execute emitted JSX and check semantic boundaries and values.
// Actual bidi ordering, glyph wrapping and native accessibility require renderer evidence.
describe("manual-payment metadata direction boundaries", () => {
  const domOutputs = [
    ["web single", manualBillingUiFiles("src")],
    ["web monorepo", manualBillingUiFiles("apps/web/src")],
    ["desktop renderer", manualDesktopUiFiles("apps/desktop/src/renderer", true)],
  ] as const;

  for (const [family, files] of domOutputs)
    for (const [locale, messages] of locales) {
      test(`${family}: independent method/date/reference runs retain ${locale} values and actions`, () => {
        const harness = generatedFormHarness(
          source(files, "model.ts", "components/payment-history.tsx", "components/review-row.tsx"),
          ["ManualPaymentHistory", "ManualReviewRowView"],
          {
            Badge: "Badge",
            ManualReviewDecision: "ManualReviewDecision",
            useSurfaceLocale: () => locale,
            useSurfaceTranslations: () => (key: keyof typeof EN_MESSAGES.billing) => messages[key],
          },
        );
        const labels = {
          pending: messages.manualPending,
          approved: messages.manualApproved,
          rejected: messages.manualRejected,
        };
        for (const input of inputs)
          for (const status of statuses) {
            const item = Object.freeze({
              ...input,
              id: "payment-one",
              ownerId: "member-account",
              amountMinor: 120050,
              currency: "DZD",
              status,
              createdAt,
              reviewedAt: null,
              reviewerId: null,
              reason: status === "rejected" ? "Keep this supplied review note." : null,
            });
            const receiptCalls: unknown[] = [];
            const history = harness.render("ManualPaymentHistory", {
              items: [item],
              renderReceipt: (id: unknown) => {
                receiptCalls.push(id);
                return "PRIVATE-RECEIPT";
              },
            });
            assertDomMetadata(history, input, locale, messages.manualReference);
            expect(receiptCalls).toEqual([item.id]);
            expect(literalText(history)).toContain("PRIVATE-RECEIPT");
            expect(literalText(history)).toContain(amount(locale, item.amountMinor));
            const badge = only(history, "Badge");
            expect(literalText(badge)).toBe(labels[status]);
            expect(badge.props.variant).toBe(badgeVariants[status]);
            if (item.reason)
              expect(literalText(history)).toContain(
                `${messages.manualReviewNote}: ${item.reason}`,
              );

            const choices: unknown[] = [];
            const review = harness.render("ManualReviewRowView", {
              item,
              receipt: "PRIVATE-RECEIPT",
              state: {
                resolved: status === "pending" ? null : status,
                decision: null,
                choose: (value: unknown) => choices.push(value),
              },
            });
            assertDomMetadata(review, input, locale, messages.manualReference);
            expect(literalText(review)).toContain(item.ownerId);
            expect(literalText(review)).toContain(amount(locale, item.amountMinor));
            expect(literalText(review)).toContain("PRIVATE-RECEIPT");
            expect(literalText(only(review, "Badge"))).toBe(labels[status]);
            const buttons = elements(review).filter((node) => node.type === "Button");
            if (status === "pending") {
              expect(buttons.map(literalText)).toEqual([
                messages.manualApprove,
                messages.manualReject,
              ]);
              for (const button of buttons) invoke(button, "onClick");
              expect(choices).toEqual(["approved", "rejected"]);
            } else {
              expect(buttons).toHaveLength(0);
              expect(literalText(review)).toContain(messages.manualReviewSaved);
            }
          }
      });
    }

  for (const mode of ["single", "monorepo"] as const)
    for (const [locale, messages] of locales) {
      test(`native ${mode}: sibling Text layouts retain ${locale} history values and handoff actions`, () => {
        const harness = generatedFormHarness(
          source(manualMobileFeatureFiles(mode, true), "components/manual-payment-card.tsx"),
          ["ManualPaymentCard"],
          { Text: "Text", View: "View", Badge: "Badge", ActivityIndicator: "ActivityIndicator" },
        );
        const copy = {
          title: messages.manualTitle,
          description: messages.manualDescription,
          readFailed: messages.manualReadFailed,
          loading: messages.manualLoading,
          balance: messages.manualBalance,
          balanceHelp: messages.manualBalanceHelp,
          webHelp: messages.manualWebHelp,
          openWeb: messages.manualOpenWeb,
          unavailable: messages.manualUnavailable,
          webUnavailable: messages.manualWebUnavailable,
          history: messages.manualHistory,
          empty: messages.manualHistoryEmpty,
          approved: messages.manualApproved,
          rejected: messages.manualRejected,
          pending: messages.manualPending,
          refresh: messages.refresh,
        };
        for (const input of inputs)
          for (const status of statuses) {
            const item = Object.freeze({
              ...input,
              id: "payment-one",
              amountMinor: 120050,
              status,
              createdAt,
              reason: status === "rejected" ? "Keep this supplied review note." : null,
            });
            const calls: string[] = [];
            const tree = harness.render("ManualPaymentCard", {
              copy,
              locale,
              items: [item],
              summary: {
                enabled: true,
                balanceMinor: 250000,
                receiverInstructions: "Configured receiving instructions",
              },
              summaryPending: false,
              historyPending: false,
              readError: false,
              historyError: false,
              refreshDisabled: false,
              opening: false,
              openError: false,
              onRefresh: () => calls.push("refresh"),
              onOpen: async () => {
                calls.push("open");
              },
            });
            const date = new Date(createdAt).toLocaleDateString(locale);
            const combined = `${input.method} · ${date}`;
            const row = one(
              elements(tree).filter(
                (node) => node.type === "View" && literalText(node) === combined,
              ),
              "Native metadata layout boundary",
            );
            expect(row.props.accessible).toBe(true);
            expect(row.props.accessibilityLabel).toBe(combined);
            expect(row.props.style).toMatchObject({
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "baseline",
            });
            const children = row.children.map((child) =>
              one(
                elements(child).filter((node) => node.type === "Text"),
                "Independent native Text subtree",
              ),
            );
            expect(children.map(literalText)).toEqual([input.method, " · ", date]);
            for (const child of children) {
              expect(child.props.className).toBe("text-sm text-muted-foreground");
              expect(child.props.accessible).toBe(false);
            }
            for (const child of [children[0], children[2]]) {
              if (!child) throw new Error("Missing native metadata field");
              expect(child.props.style).toMatchObject({ flexShrink: 1, maxWidth: "100%" });
              expect(child.props.dir).toBeUndefined();
              expect(child.props.style ?? {}).not.toHaveProperty("direction");
              expect(child.props.style ?? {}).not.toHaveProperty("writingDirection");
            }
            expect(
              elements(row).filter(
                (node) => node.type === "Text" && literalText(node) === combined,
              ),
            ).toHaveLength(0);
            expect(
              elements(row).some(
                (node) => node.type === "bdi" || node.type === "span" || node.type === "time",
              ),
            ).toBe(false);
            expect(literalText(tree)).toContain(amount(locale, item.amountMinor));
            expect(literalText(only(tree, "Badge"))).toBe(copy[status]);
            if (item.reason) expect(literalText(tree)).toContain(item.reason);
            const buttons = elements(tree).filter((node) => node.type === "Button");
            expect(buttons.map(literalText)).toEqual([copy.openWeb, copy.refresh]);
            for (const button of buttons) invoke(button, "onPress");
            expect(calls).toEqual(["open", "refresh"]);
          }
      });
    }
});
