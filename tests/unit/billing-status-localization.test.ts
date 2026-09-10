import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { billingStatusContent } from "../../src/templates/billing/ui/status.js";
import {
  EN_BILLING_STATUS_MESSAGES,
  FR_BILLING_STATUS_MESSAGES,
  AR_BILLING_STATUS_MESSAGES,
} from "../../src/templates/i18n/messages/billing-status.js";
import {
  SUBSCRIPTION_CASES,
  INVOICE_CASES,
  UNKNOWN_STATUSES,
  billingTranslate,
  statusFunctions,
} from "../helpers/billing-status-harness.js";

const catalogs = {
  en: EN_BILLING_STATUS_MESSAGES,
  fr: FR_BILLING_STATUS_MESSAGES,
  ar: AR_BILLING_STATUS_MESSAGES,
};
const unknownKeys = ["subscriptionStatusUnknown", "invoiceStatusUnknown"];
const allKeys: string[] = [...SUBSCRIPTION_CASES, ...INVOICE_CASES].map(([, key]) => key);
allKeys.push(...unknownKeys);
const source = billingStatusContent();
const runtime = statusFunctions(source);

describe("emitted billing status labels", () => {
  test("covers the complete authoritative domain status sets", () => {
    const domain = readFileSync(
      new URL("../../src/templates/billing/domain/model.ts", import.meta.url),
      "utf8",
    );
    function members(name: string): string[] {
      const body = domain.match(new RegExp("export type " + name + "\\s*=([\\s\\S]*?);"))?.[1];
      if (!body) throw new Error("Missing authoritative domain union: " + name);
      return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]!).sort();
    }
    expect(SUBSCRIPTION_CASES).toHaveLength(11);
    expect(INVOICE_CASES).toHaveLength(5);
    expect(SUBSCRIPTION_CASES.map(([status]) => status).sort()).toEqual(
      members("SubscriptionStatus"),
    );
    expect(INVOICE_CASES.map(([status]) => status).sort()).toEqual(members("InvoiceStatus"));
  });

  for (const locale of ["en", "fr", "ar"] as const) {
    test(locale + " catalogs expose every status through the public billing namespace", () => {
      const catalog: Record<string, unknown> = catalogs[locale];
      expect(Object.keys(catalog).sort()).toEqual([...allKeys].sort());
      const translate = billingTranslate(locale);
      for (const key of allKeys) {
        expect(typeof catalog[key]).toBe("string");
        expect(String(catalog[key]).trim().length).toBeGreaterThan(0);
        expect(translate(key)).toBe(catalog[key]);
        expect(translate(key)).not.toBe(key);
      }
    });
    test(locale + " translates every subscription and invoice status without coercion", () => {
      const translate = billingTranslate(locale);
      for (const [cases, formatter] of [
        [SUBSCRIPTION_CASES, runtime.formatBillingSubscriptionStatus],
        [INVOICE_CASES, runtime.formatBillingInvoiceStatus],
      ] as const) {
        for (const [status, expectedKey] of cases) {
          const calls: string[] = [];
          const result = formatter(status, (key) => {
            calls.push(key);
            return translate(key);
          });
          expect(calls).toEqual([expectedKey]);
          expect(result).toBe(translate(expectedKey));
        }
      }
    });
    test(locale + " maps future, absent and prototype names to explicit unknown labels", () => {
      let coerced = false;
      const hostile = {
        toString() {
          coerced = true;
          throw new Error("Status was coerced");
        },
      };
      const inputs: readonly unknown[] = [
        ...UNKNOWN_STATUSES,
        undefined,
        null,
        false,
        0,
        Number.NaN,
        {},
        [],
        Symbol("status"),
        hostile,
      ];
      for (const [formatter, expectedKey] of [
        [runtime.formatBillingSubscriptionStatus, "subscriptionStatusUnknown"],
        [runtime.formatBillingInvoiceStatus, "invoiceStatusUnknown"],
      ] as const)
        for (const value of inputs) {
          const calls: string[] = [];
          const result = formatter(value, (key) => {
            calls.push(key);
            return billingTranslate(locale)(key);
          });
          expect(result).toBe(billingTranslate(locale)(expectedKey));
          expect(calls).toEqual([expectedKey]);
        }
      expect(coerced).toBe(false);
    });
  }

  test("uses the canonical English labels when no translator is supplied", () => {
    for (const [cases, formatter, unknownKey] of [
      [SUBSCRIPTION_CASES, runtime.formatBillingSubscriptionStatus, "subscriptionStatusUnknown"],
      [INVOICE_CASES, runtime.formatBillingInvoiceStatus, "invoiceStatusUnknown"],
    ] as const) {
      for (const [status, key] of cases)
        expect(formatter(status)).toBe(EN_BILLING_STATUS_MESSAGES[key]);
      for (const status of UNKNOWN_STATUSES)
        expect(formatter(status)).toBe(EN_BILLING_STATUS_MESSAGES[unknownKey]);
    }
  });

  test("keeps subscription and invoice semantics separate", () => {
    expect(runtime.formatBillingSubscriptionStatus("paid")).toBe(
      EN_BILLING_STATUS_MESSAGES.subscriptionStatusUnknown,
    );
    expect(runtime.formatBillingInvoiceStatus("active")).toBe(
      EN_BILLING_STATUS_MESSAGES.invoiceStatusUnknown,
    );
    expect(runtime.formatBillingSubscriptionStatus("ACTIVE")).toBe(
      EN_BILLING_STATUS_MESSAGES.subscriptionStatusUnknown,
    );
    expect(runtime.formatBillingInvoiceStatus(" paid ")).toBe(
      EN_BILLING_STATUS_MESSAGES.invoiceStatusUnknown,
    );
  });
});
