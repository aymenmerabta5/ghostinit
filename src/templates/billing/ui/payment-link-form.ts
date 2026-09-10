export function billingPaymentLinkFormContent(_hookImport = ""): string {
  return `"use client";
import type * as React from "react";
import { usePaymentLinkForm } from "./use-payment-link-form";
import { BillingPaymentLinkView } from "./components/payment-link-form";

export function BillingPaymentLinkForm({ allowed }: { allowed: boolean }): React.JSX.Element {
  const state = usePaymentLinkForm(allowed);
  return <BillingPaymentLinkView state={state} />;
}
`;
}
export function billingPaymentLinkViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { FieldGroup } from "@/components/ui/field";
import { useSurfaceTranslations } from "@/lib/translations";
import type { PaymentLinkFormState } from "../types";

export function BillingPaymentLinkView({ state }: { state: PaymentLinkFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { form, allowed, error, url } = state;
  if (!allowed) return <p className="text-sm text-muted-foreground">{t("adminPaymentLinks")}</p>;
  return <form.AppForm><Form form={form} className="flex flex-col gap-3">
    <FieldGroup><form.AppField name="name">{(field) => <field.TextField label={t("paymentLinkName")} maxLength={120} required />}</form.AppField><form.AppField name="price">{(field) => <field.TextField label={t("providerPriceId")} maxLength={200} required />}</form.AppField></FieldGroup>
    <form.SubmitButton variant="outline">{t("createPaymentLink")}</form.SubmitButton>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {url ? <a className="break-all text-sm underline" href={url} target="_blank" rel="noreferrer">{url}</a> : null}
  </Form></form.AppForm>;
}
`;
}
export const billingProviderUrlContent = `export function safeBillingProviderUrl(value: string): string {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) throw new Error("Billing provider returned an unsafe URL");
  return url.toString();
}
`;
