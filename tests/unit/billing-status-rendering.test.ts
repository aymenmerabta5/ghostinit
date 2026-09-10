import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { elements, textContent } from "../helpers/generated-form-harness.js";
import {
  SUBSCRIPTION_CASES,
  INVOICE_CASES,
  UNKNOWN_STATUSES,
  billingTranslate,
  checkStatusImportClosure,
  emittedSource,
  renderBillingStatusView,
  type EmittedSources,
  type BillingTestLocale,
} from "../helpers/billing-status-harness.js";

type Provider = "stripe" | "paddle" | "polar";
type Corner = {
  mode: "single" | "monorepo";
  framework: "nextjs" | "tanstack-start";
  database: "postgres" | "convex";
  provider: Provider;
  native: boolean;
  i18n: boolean;
};
const CORNERS: readonly Corner[] = [
  {
    mode: "single",
    framework: "nextjs",
    database: "postgres",
    provider: "stripe",
    native: false,
    i18n: true,
  },
  {
    mode: "monorepo",
    framework: "nextjs",
    database: "convex",
    provider: "polar",
    native: true,
    i18n: true,
  },
  {
    mode: "monorepo",
    framework: "nextjs",
    database: "postgres",
    provider: "paddle",
    native: true,
    i18n: false,
  },
  {
    mode: "single",
    framework: "tanstack-start",
    database: "convex",
    provider: "stripe",
    native: false,
    i18n: true,
  },
  {
    mode: "monorepo",
    framework: "tanstack-start",
    database: "postgres",
    provider: "paddle",
    native: true,
    i18n: true,
  },
  {
    mode: "monorepo",
    framework: "tanstack-start",
    database: "convex",
    provider: "polar",
    native: true,
    i18n: false,
  },
];
function generate(corner: Corner): EmittedSources {
  const config = resolveCreateConfig({
    name: "billing-status",
    runtime: "bun",
    mode: corner.mode,
    framework: corner.framework,
    database: corner.database,
    databaseWasExplicit: true,
    preset: "saas",
    billing: [corner.provider, "chargily"],
    features: [],
    apps: corner.native ? ["web", "mobile", "desktop"] : ["web"],
    cache: "none",
    deploy: "none",
    withI18n: corner.i18n,
  });
  if (!config.ok) throw new Error(config.message);
  const plan = buildProjectGenerationPlan(config.resolvedConfig, {
    desiredConfig: config.desiredConfig,
  });
  return new Map(plan.files.map((file) => [file.physicalPath, file.content]));
}
type View = {
  path: string;
  component: string;
  kind: "subscriptions" | "invoices";
  provider: string;
};
function expectedViews(corner: Corner): View[] {
  const root = (corner.mode === "single" ? "src" : "apps/web/src") + "/features/billing";
  const views: View[] = [
    {
      path: root + "/components/billing-invoices.tsx",
      component: "BillingInvoices",
      kind: "invoices",
      provider: corner.provider,
    },
  ];
  if (corner.framework === "tanstack-start") {
    views.push({
      path: root + "/billing-page.tsx",
      component: "BillingPage",
      kind: "subscriptions",
      provider: corner.provider,
    });
  } else {
    views.push({
      path: root + "/components/providers/chargily-panel.tsx",
      component: "ChargilyPanel",
      kind: "subscriptions",
      provider: "chargily",
    });
    if (corner.provider === "paddle") {
      views.push({
        path: root + "/components/providers/paddle-panel.tsx",
        component: "PaddlePanel",
        kind: "subscriptions",
        provider: "paddle",
      });
    } else {
      const name = corner.provider === "stripe" ? "Stripe" : "Polar";
      views.push({
        path: root + "/components/providers/" + corner.provider + "-subscriptions.tsx",
        component: name + "Subscriptions",
        kind: "subscriptions",
        provider: corner.provider,
      });
      if (corner.provider === "stripe")
        views.push({
          path: root + "/components/providers/stripe-invoices.tsx",
          component: "StripeInvoices",
          kind: "invoices",
          provider: "stripe",
        });
    }
  }
  if (corner.native)
    for (const nativeRoot of ["apps/mobile/src", "apps/desktop/src/renderer"]) {
      views.push({
        path: nativeRoot + "/features/billing/components/subscriptions-card.tsx",
        component: "SubscriptionsCard",
        kind: "subscriptions",
        provider: corner.provider,
      });
      views.push({
        path: nativeRoot + "/features/billing/components/invoices-card.tsx",
        component: "InvoicesCard",
        kind: "invoices",
        provider: corner.provider,
      });
    }
  return views;
}
function records(provider: string) {
  const subscriptions = [...SUBSCRIPTION_CASES.map(([status]) => status), ...UNKNOWN_STATUSES].map(
    (status, index) =>
      Object.freeze({
        id: "subscription-" + index,
        provider,
        status,
        currentPeriodEnd: null,
        customerId: "customer-unchanged",
        metadata: null,
      }),
  );
  const invoices = [...INVOICE_CASES.map(([status]) => status), ...UNKNOWN_STATUSES].map(
    (status, index) =>
      Object.freeze({
        id: "invoice-" + index,
        provider,
        status,
        amount: 120050,
        currency: "DZD",
        paid: status === "paid",
        hostedUrl: null,
      }),
  );
  return { subscriptions: Object.freeze(subscriptions), invoices: Object.freeze(invoices) };
}
function assertLabels(rendered: unknown, kind: View["kind"], locale: BillingTestLocale) {
  const translate = billingTranslate(locale);
  const cases = kind === "subscriptions" ? SUBSCRIPTION_CASES : INVOICE_CASES;
  const labels = new Set(elements(rendered).map((node) => textContent(node).trim()));
  for (const [, key] of cases) expect(labels.has(translate(key)), key).toBe(true);
  const unknown = kind === "subscriptions" ? "subscriptionStatusUnknown" : "invoiceStatusUnknown";
  expect(labels.has(translate(unknown))).toBe(true);
  const text = textContent(rendered);
  for (const token of UNKNOWN_STATUSES.filter(Boolean)) expect(text).not.toContain(token);
  for (const [status] of cases) if (status.includes("_")) expect(text).not.toContain(status);
}
function assertEmittedCatalogs(files: EmittedSources, locale: BillingTestLocale) {
  const found = [...files].filter(
    ([path, content]) =>
      path.endsWith(".json") &&
      new RegExp("(?:/|\\.)" + locale + "\\.json$").test(path) &&
      content.includes('"billing"'),
  );
  expect(found.length, "No emitted catalog for " + locale).toBeGreaterThan(0);
  for (const [path, source] of found) {
    const catalog = JSON.parse(source) as { billing: Record<string, unknown> };
    const keys: string[] = [...SUBSCRIPTION_CASES, ...INVOICE_CASES].map(([, key]) => key);
    keys.push("subscriptionStatusUnknown", "invoiceStatusUnknown");
    for (const key of keys) {
      expect(catalog.billing[key], path + "#" + key).toBe(billingTranslate(locale)(key));
    }
  }
}

describe("billing status labels in actual generated views", () => {
  for (const corner of CORNERS) {
    const label = [
      corner.mode,
      corner.framework,
      corner.database,
      corner.provider,
      "i18n=" + corner.i18n,
    ].join("/");
    test(label + " closes imports and renders all known and unknown status labels", () => {
      const files = generate(corner),
        views = expectedViews(corner);
      expect(checkStatusImportClosure(files)).toEqual(views.map((view) => view.path).sort());
      const locales: readonly BillingTestLocale[] = corner.i18n ? ["en", "fr", "ar"] : ["en"];
      for (const locale of locales) {
        assertEmittedCatalogs(files, locale);
        for (const view of views) {
          const data = records(view.provider),
            before = JSON.stringify(data);
          const billing = {
            ...data,
            subsLoading: false,
            isCheckoutLoading: false,
            pastDue: false,
            snapshotError: null,
            refreshing: false,
            canCreatePaymentLinks: false,
            handleCheckout() {},
            handlePortal() {},
            refresh() {},
          };
          const props = {
            ...data,
            billing,
            loading: false,
            isPending: false,
            readError: null,
            locale,
            paymentLink: null,
            t: billingTranslate(locale),
          };
          const rendered = renderBillingStatusView(
            files,
            view.path,
            view.component,
            props,
            locale,
            billing,
          );
          assertLabels(rendered, view.kind, locale);
          expect(JSON.stringify(data), view.path + " mutated the provider records").toBe(before);
        }
      }
    });
  }

  test("import closure independently rejects absent modules and absent runtime exports", () => {
    const files = generate(CORNERS[0]!);
    const helper = "src/features/billing/status-labels.ts";
    const missingModule = new Map(files);
    missingModule.delete(helper);
    expect(() => checkStatusImportClosure(missingModule)).toThrow("Unresolved emitted import");
    const missingExport = new Map(files);
    missingExport.set(
      helper,
      emittedSource(files, helper).replace(
        "export function formatBillingInvoiceStatus",
        "function formatBillingInvoiceStatus",
      ),
    );
    expect(() => checkStatusImportClosure(missingExport)).toThrow("Missing emitted status export");
  });
});
