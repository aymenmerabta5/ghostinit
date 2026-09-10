import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { z } from "zod";
import {
  manualBillingUiFiles,
  manualDesktopUiFiles,
} from "../../src/templates/billing/ui/manual/index.js";
import { manualMobileFeatureFiles } from "../../src/templates/billing/ui/manual/mobile.js";
import { billingUiFiles } from "../../src/templates/billing/ui/components/composer.js";
import { billingFiles as tanstackBillingFiles } from "../../src/templates/apps/fragments/billing/index.js";
import { billingClientProviderOptions } from "../../src/templates/apps/fragments/billing/client-capabilities.js";
import { singleTanstackBillingFeatureFiles } from "../../src/templates/modes/single/tanstack/pages/dashboard.js";
import { expoBillingContent } from "../../src/templates/apps/fragments/expo/billing.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";
import { settingsFeatureHarness } from "../helpers/settings-feature-harness.js";
import { controlledManualFileReader } from "../helpers/manual-file-reader.js";

const files = manualBillingUiFiles("apps/web/src");
function source(...names: string[]): string {
  return names
    .map((name) => {
      const file = files.find(
        (entry) => entry.path === "apps/web/src/features/manual-payments/" + name,
      );
      if (!file) throw new Error("Missing manual feature " + name);
      return file.content;
    })
    .join("\n");
}
const summary = {
  enabled: true,
  balanceMinor: 0,
  currency: "DZD",
  receiverInstructions: "Transfer to the configured account",
  allowedMethods: ["BaridiMob"],
  canReview: false,
};
const payment = {
  id: "payment-one",
  ownerId: "account-one",
  amountMinor: 120050,
  currency: "DZD",
  status: "pending",
  method: "BaridiMob",
  reference: null,
  createdAt: "2026-09-08T12:00:00Z",
  reviewedAt: null,
  reviewerId: null,
  reason: null,
};
const keys = Object.fromEntries(
  ["summary", "list", "reviewQueue"].map((key) => [key, { key: () => [key] }]),
);
function mutationBindings(client: Record<string, unknown>) {
  return {
    z,
    Badge: "Badge",
    useSurfaceLocale: () => "en",
    orpc: { billing: { manual: keys } },
    orpcClient: { billing: { manual: client } },
    authScopedQueryKey: (_scope: unknown, key: unknown[]) => key,
    FileReader: controlledManualFileReader().FileReader,
  };
}

describe("manual billing generated UI", () => {
  test("parses DZD exactly and bounds private receipt bytes and types", () => {
    const helpers = generatedFormHarness(source("model.ts", "receipt-utils.ts"), [
      "manualAmountMinor",
      "manualReceiptAllowed",
      "manualReceiptBlob",
    ]).module;
    for (const [input, output] of [
      ["1200.50", 120050],
      ["0,01", 1],
      ["1000000", 100000000],
      ["-1", null],
      ["1.001", null],
      ["1e3", null],
      ["0", null],
      ["1000000.01", null],
    ] as const)
      expect(helpers.manualAmountMinor?.(input)).toBe(output);
    expect(helpers.manualReceiptAllowed?.({ size: 5 * 1024 * 1024, type: "image/png" })).toBe(true);
    expect(helpers.manualReceiptAllowed?.({ size: 5 * 1024 * 1024 + 1, type: "image/png" })).toBe(
      false,
    );
    expect(helpers.manualReceiptAllowed?.({ size: 100, type: "image/svg+xml" })).toBe(false);
    expect(() => helpers.manualReceiptBlob?.({ base64: "YQ==", mimeType: "text/html" })).toThrow();
    const blob = helpers.manualReceiptBlob?.({ base64: "YQ==", mimeType: "application/pdf" });
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("application/pdf");
  });

  test("preserves receipt and amount on failure, retries one request key, and blocks duplicate submissions", async () => {
    let response = deferred<typeof payment>();
    const submissions: Record<string, unknown>[] = [];
    const h = settingsFeatureHarness(
      source(
        "model.ts",
        "receipt-utils.ts",
        "schema.ts",
        "mutations.ts",
        "use-manual-payment-form.ts",
        "components/payment-form.tsx",
      ),
      ["useManualPaymentForm", "ManualPaymentFormView"],
      {
        ...mutationBindings({
          submit: (input: Record<string, unknown>) => {
            submissions.push(input);
            return response.promise;
          },
        }),
        ManualPaymentFields: "ManualPaymentFields",
      },
    );
    const render = () =>
      h.render("ManualPaymentFormView", { state: h.render("useManualPaymentForm", summary) });
    render();
    const form = h.forms[0]!;
    const receipt = new File(["proof"], "transfer.png", { type: "image/png" });
    form.values.amount = "1200.50";
    Reflect.set(form.values, "receipt", receipt);
    const first = form.handleSubmit();
    await form.handleSubmit();
    await flush();
    expect(submissions).toHaveLength(1);
    response.reject(new Error("private storage failure"));
    await first;
    await flush();
    expect(form.values.amount).toBe("1200.50");
    expect(Reflect.get(form.values, "receipt")).toBe(receipt);
    expect(textContent(render())).toContain("manualSubmitFailed");
    expect(textContent(render())).not.toContain("private storage failure");
    expect(h.invalidations).toEqual([]);
    response = deferred<typeof payment>();
    const retry = form.handleSubmit();
    await flush();
    expect(submissions).toHaveLength(2);
    expect(submissions[1]?.requestKey).toBe(submissions[0]?.requestKey);
    expect(submissions[1]?.receipt).toEqual({
      base64: "cHJvb2Y=",
      mimeType: "image/png",
      originalName: "transfer.png",
    });
    response.resolve(payment);
    await retry;
    await flush();
    expect(form.values.amount).toBe("");
    expect(Reflect.get(form.values, "receipt")).toBeNull();
    expect(textContent(render())).toContain("manualSubmitted");
    expect(h.invalidations).toHaveLength(3);
  });

  test("requires deliberate approval, preserves failed review notes, and guards rapid duplicate decisions", async () => {
    const response = deferred<typeof payment>();
    const reviews: unknown[] = [];
    const h = settingsFeatureHarness(
      source(
        "model.ts",
        "receipt-utils.ts",
        "schema.ts",
        "mutations.ts",
        "use-payment-review.ts",
        "components/review-row.tsx",
        "components/review-decision.tsx",
      ),
      [
        "usePaymentReview",
        "ManualReviewRowView",
        "ManualReviewDecision",
        "createManualReviewSchema",
      ],
      mutationBindings({
        review: (input: unknown) => {
          reviews.push(input);
          return response.promise;
        },
      }),
    );
    type State = {
      choose(value: string | null): void;
      decision: string | null;
      error: string | null;
    };
    const state = () => h.render("usePaymentReview", payment.id) as State;
    const render = () =>
      h.render("ManualReviewRowView", {
        item: payment,
        state: state(),
        receipt: "private receipt control",
      });
    const choose = elements(render()).find(
      (entry) => entry.type === "Button" && textContent(entry) === "manualApprove",
    )!;
    (choose.props.onClick as () => void)();
    expect(reviews).toHaveLength(0);
    expect(
      textContent(h.render("ManualReviewDecision", { state: state(), amount: "DZD 1,200.50" })),
    ).toContain("manualApproveConfirm");
    const form = h.forms[0]!;
    form.values.reason = "Incoming transfer matched";
    const first = form.handleSubmit();
    await form.handleSubmit();
    expect(reviews).toEqual([
      { id: payment.id, decision: "approved", reason: "Incoming transfer matched" },
    ]);
    response.reject(new Error("private repository details"));
    await first;
    await flush();
    expect(form.values.reason).toBe("Incoming transfer matched");
    expect(state().error).toBe("manualReviewFailed");
    expect(
      textContent(h.render("ManualReviewDecision", { state: state(), amount: "amount" })),
    ).not.toContain("private repository details");
    state().choose(null);
    state().choose("rejected");
    form.values.reason = " ";
    const schema = (
      h.module.createManualReviewSchema as unknown as (
        decision: string,
        message: string,
      ) => z.ZodType
    )("rejected", "manualReasonRequired");
    expect(schema.safeParse(form.values).success).toBe(false);
    expect(reviews).toHaveLength(1);
  });

  test("fetches private receipts only on demand and revokes closed and unmounted previews", async () => {
    const revoked: string[] = [];
    let calls = 0;
    let enabled = false;
    const query: { data?: unknown; error: null; isFetching: boolean } = {
      error: null,
      isFetching: false,
    };
    let latest: { enabled: boolean; queryFn(): Promise<unknown> };
    const fetchReceipt = async () => {
      query.isFetching = true;
      query.data = await latest.queryFn();
      query.isFetching = false;
    };
    const h = settingsFeatureHarness(
      source(
        "model.ts",
        "receipt-utils.ts",
        "queries.ts",
        "use-receipt-preview.ts",
        "components/receipt-preview.tsx",
      ),
      ["useReceiptPreview", "ManualReceiptView"],
      {
        orpcClient: {
          billing: {
            manual: {
              receipt: async () => {
                calls++;
                return { base64: "YQ==", mimeType: "image/png", originalName: "receipt.png" };
              },
            },
          },
        },
        authScopedQueryKey: (_scope: unknown, key: unknown[]) => key,
        window: {},
        useQuery: (options: typeof latest) => {
          latest = options;
          if (options.enabled && !enabled) void fetchReceipt();
          enabled = options.enabled;
          return { ...query, refetch: fetchReceipt };
        },
        URL: {
          createObjectURL: () => "blob:private-receipt",
          revokeObjectURL: (url: string) => revoked.push(url),
        },
      },
    );
    type State = { open(): void; close(): void };
    const state = () => h.render("useReceiptPreview", payment.id) as State;
    const render = () => h.render("ManualReceiptView", { state: state() });
    const first = state();
    h.flushEffects();
    expect(calls).toBe(0);
    first.open();
    first.open();
    state();
    await flush();
    state();
    h.flushEffects();
    expect(calls).toBe(1);
    expect(elements(render()).find(({ type }) => type === "img")?.props.src).toBe(
      "blob:private-receipt",
    );
    expect(textContent(render())).not.toContain("https://");
    state().close();
    state();
    h.flushEffects();
    expect(revoked).toEqual(["blob:private-receipt"]);
    expect(elements(render()).some(({ type }) => type === "img")).toBe(false);
    state().open();
    state();
    await flush();
    state();
    h.flushEffects();
    h.unmount();
    expect(revoked).toEqual(["blob:private-receipt", "blob:private-receipt"]);
  });

  test("emits manual separately in every web mode and never as provider checkout", () => {
    expect(
      billingClientProviderOptions(["manual", "chargily", "stripe"]).map((entry) => entry.id),
    ).toEqual(["chargily", "stripe"]);
    for (const mode of ["single", "monorepo"] as const) {
      const files = billingUiFiles({
        mode,
        addons: { manual: { inUse: true }, chargily: { inUse: true } },
      });
      expect(
        files.some((entry) => entry.path.includes("features/manual-payments/queries.ts")),
      ).toBe(true);
      const page = files.find((entry) => entry.path.endsWith("/billing/page.tsx"))?.content ?? "";
      expect(page).toContain("<ManualBillingPanel />");
      expect(page).toContain('const PROVIDERS: string[] = ["chargily"]');
      expect(
        files.some(
          (entry) => entry.path.endsWith("manual-panel.tsx") && entry.path.includes("providers/"),
        ),
      ).toBe(false);
    }
    for (const files of [
      tanstackBillingFiles("tanstack", false, ["manual"]),
      singleTanstackBillingFeatureFiles(false, ["manual"]),
    ]) {
      const page =
        files.find((entry) => entry.path.endsWith("features/billing/billing-page.tsx"))?.content ??
        "";
      expect(page).toContain("<ManualBillingPanel />");
      expect(page).not.toContain("BillingEmptyState");
    }
    expect(
      billingUiFiles({ mode: "single", addons: { stripe: { inUse: true } } }).some((entry) =>
        entry.path.includes("manual-payments"),
      ),
    ).toBe(false);
  });

  test("all emitted manual UI parses, translations match, and mobile keeps an honest web handoff", () => {
    for (const entry of [
      ...manualBillingUiFiles("apps/web/src"),
      ...manualDesktopUiFiles("apps/desktop/src/renderer", true),
    ]) {
      if (entry.path.endsWith(".json")) continue;
      expect(parseSync(entry.path, entry.content).errors).toEqual([]);
      for (const [, key] of entry.content.matchAll(/\bt\("([^"]+)"/g)) {
        expect(typeof EN_MESSAGES.billing[key as keyof typeof EN_MESSAGES.billing]).toBe("string");
        expect(typeof FR_MESSAGES.billing[key as keyof typeof FR_MESSAGES.billing]).toBe("string");
        expect(typeof AR_MESSAGES.billing[key as keyof typeof AR_MESSAGES.billing]).toBe("string");
      }
    }
    const mobile = expoBillingContent("monorepo", ["manual"], true);
    expect(parseSync("billing.tsx", mobile).errors).toEqual([]);
    const mobileFeature = manualMobileFeatureFiles("monorepo", true)
      .map(({ content }) => content)
      .join("\n");
    expect(mobile).toContain("ManualMobilePayments");
    expect(mobileFeature).toContain("orpc.billing.manual.summary.queryOptions");
    expect(mobileFeature).toContain("orpc.billing.manual.list.queryOptions");
    expect(mobileFeature).toContain("env.EXPO_PUBLIC_API_URL");
    expect(mobileFeature).toContain('new URL("/billing", configured)');
    expect(mobileFeature).not.toContain("document-picker");
  });
});
