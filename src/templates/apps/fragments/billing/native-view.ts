import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import { type NativeBillingMode, type NativeBillingPlatform } from "./native-platform.js";
import { billingHistoryCard } from "./native-history.js";

export function nativeBillingViewContent(
  platform: NativeBillingPlatform,
  mode: NativeBillingMode,
  source: string,
  hasI18n: boolean,
  manual: boolean,
): string {
  const start = source.lastIndexOf("\n  return (");
  const end = source.lastIndexOf("\n}");
  if (start < 0 || end < start) throw new Error("Native billing view boundary is missing");
  let body = source.slice(start, end);
  const providersStart = body.indexOf("{SELECTED_PROVIDERS.map(");
  const providersEnd = body.indexOf("</CardContent></Card>)}", providersStart);
  if (providersStart < 0 || providersEnd < providersStart)
    throw new Error("Native provider panel boundary is missing");
  body =
    body.slice(0, providersStart) +
    "{providerControls}" +
    body.slice(providersEnd + "</CardContent></Card>)}".length);
  body = body
    .replaceAll("snapshot.error", "readError")
    .replaceAll("snapshot.isPending", "isPending")
    .replaceAll("snapshot.isFetching", "isRefreshing")
    .replaceAll("snapshot.refetch()", "onRefresh()")
    .replaceAll("<ManualMobilePayments />", "{manualPayments}")
    .replaceAll("<ManualBillingPanel />", "{manualPayments}");
  for (const kind of ["subscriptions", "invoices"] as const) {
    const name = kind === "subscriptions" ? "SubscriptionsCard" : "InvoicesCard";
    body = body.replace(
      billingHistoryCard(source, kind),
      `<${name} ${kind}={${kind}} isPending={isPending} readError={readError}${kind === "invoices" ? " locale={locale}" : ""}${hasI18n ? " t={t}" : ""} />`,
    );
  }
  const ui =
    platform === "expo"
      ? `import { ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Alert, AlertDescription } from "@/components/ui/alert";`
      : `import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
`;
  return `import * as React from "react";
${ui}
import { Button } from "@/components/ui/button";
${platform === "expo" ? 'import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";' : ""}
import { SubscriptionsCard } from "./subscriptions-card";
import { InvoicesCard } from "./invoices-card";
import type { InvoiceView, SubscriptionView } from "../model";
${hasI18n ? `import type { NamespaceTranslate } from "${nativeI18nImportPath(platform === "expo" ? "mobile" : "desktop", mode)}";` : ""}
export interface BillingViewProps {
  readonly subscriptions: readonly SubscriptionView[]; readonly invoices: readonly InvoiceView[];
  readonly locale: string; readonly isAuthenticated: boolean; readonly isPending: boolean; readonly isRefreshing: boolean;
  readonly readError: Error | null; readonly actionError: string | null;
  readonly onRefresh: () => void; readonly providerControls: React.ReactNode;
  ${manual ? "readonly manualPayments: React.ReactNode;" : ""}
  ${hasI18n ? 'readonly t: NamespaceTranslate<"billing">;' : ""}
}
export function BillingView({ subscriptions, invoices, locale, isAuthenticated, isPending, isRefreshing, readError, actionError, onRefresh, providerControls${manual ? ", manualPayments" : ""}${hasI18n ? ", t" : ""} }: BillingViewProps): React.JSX.Element {${body}
}
`;
}

export function nativeProviderCardContent(platform: NativeBillingPlatform): string {
  const native = platform === "expo";
  return `import * as React from "react";
${native ? 'import { View } from "react-native";\nimport { Text } from "@/components/ui/text";' : ""}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProviderOption } from "../model";
export interface ProviderCardProps {
  readonly provider: ProviderOption; readonly disabled: boolean;
  readonly description: string; readonly checkoutLabel: string; readonly portalLabel: string;
  readonly onCheckout: () => void; readonly onPortal: () => void; readonly paymentLink: React.ReactNode;
}
export function ProviderCard({ provider, disabled, description, checkoutLabel, portalLabel, onCheckout, onPortal, paymentLink }: ProviderCardProps): React.JSX.Element {
  return <Card><CardHeader><CardTitle>{provider.label}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="${native ? "gap-3" : "flex flex-col gap-4"}"><${native ? "View" : "div"} className="${native ? "flex-row flex-wrap gap-2" : "flex flex-wrap gap-2"}"><Button ${native ? "onPress" : 'type="button" onClick'}={onCheckout} disabled={disabled}>${native ? "<Text>{checkoutLabel}</Text>" : "{checkoutLabel}"}</Button>{provider.portal ? <Button ${native ? "onPress" : 'type="button" onClick'}={onPortal} disabled={disabled} variant="outline">${native ? "<Text>{portalLabel}</Text>" : "{portalLabel}"}</Button> : null}</${native ? "View" : "div"}>{paymentLink}</CardContent></Card>;
}
`;
}

export function nativePaymentLinkViewContent(platform: NativeBillingPlatform): string {
  const native = platform === "expo";
  return `import * as React from "react";
${native ? 'import { View } from "react-native";\nimport { Text } from "@/components/ui/text";' : 'import { Field, FieldLabel, FieldError } from "@/components/ui/field";'}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PaymentLinkFormController } from "../types";
export interface PaymentLinkFormViewProps {
  readonly form: PaymentLinkFormController; readonly disabled: boolean;
  readonly nameLabel: string; readonly priceLabel: string; readonly submitLabel: string;
}
export function PaymentLinkFormView({ form, disabled, nameLabel, priceLabel, submitLabel }: PaymentLinkFormViewProps): React.JSX.Element {
  return <${native ? 'View className="gap-2"' : 'form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}'}>
    <form.Field name="name">{(field) => <${native ? "View" : "Field"}>${native ? '<Text className="text-sm font-medium">{nameLabel}</Text><Input accessibilityLabel={nameLabel} value={field.state.value} onChangeText={field.handleChange} onBlur={field.handleBlur} />' : "<FieldLabel htmlFor={field.name}>{nameLabel}</FieldLabel><Input id={field.name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />"}</${native ? "View" : "Field"}>}</form.Field>
    <form.Field name="price">{(field) => <${native ? "View" : "Field"}>${native ? '<Text className="text-sm font-medium">{priceLabel}</Text><Input accessibilityLabel={priceLabel} value={field.state.value} onChangeText={field.handleChange} onBlur={field.handleBlur} autoCapitalize="none" />' : "<FieldLabel htmlFor={field.name}>{priceLabel}</FieldLabel><Input id={field.name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />"}</${native ? "View" : "Field"}>}</form.Field>
    <form.Subscribe selector={(state) => state.errors}>{(errors) => errors.length ? <${native ? 'Text accessibilityRole="alert" className="text-sm text-destructive"' : 'FieldError role="alert"'}>{String(errors[0])}</${native ? "Text" : "FieldError"}> : null}</form.Subscribe>
    <Button variant="outline" disabled={disabled} ${native ? "onPress={() => void form.handleSubmit()}" : 'type="submit"'}>${native ? "<Text>{submitLabel}</Text>" : "{submitLabel}"}</Button>
  </${native ? "View" : "form"}>;
}
`;
}

export function nativePaymentLinkSectionContent(
  platform: NativeBillingPlatform,
  mode: NativeBillingMode,
  hasI18n: boolean,
): string {
  const i18n = nativeI18nTemplate(
    hasI18n,
    "billing",
    nativeI18nImportPath(platform === "expo" ? "mobile" : "desktop", mode),
  );
  return `import * as React from "react";
import { PaymentLinkFormView } from "./components/payment-link-form";
import { usePaymentLinkForm } from "./use-payment-link-form";
import type { ProviderName } from "./model";
import type { BillingAction } from "./mutations";
${i18n.importLine}
export function PaymentLinkSection({ provider, disabled, submit }: { provider: ProviderName; disabled: boolean; submit(input: BillingAction): Promise<void> }): React.JSX.Element {
${i18n.hookLine}
  const form = usePaymentLinkForm(provider, submit, { defaultName: ${i18n.value("defaultLinkName", "Pro plan")}, required: ${i18n.value("paymentLinkRequired", "Payment-link name and price ID are required")}, completed: ${i18n.value("paymentReceived", "Payment received")} });
  return <PaymentLinkFormView form={form} disabled={disabled} nameLabel={${i18n.value("paymentLinkName", "Payment-link name")}} priceLabel={${i18n.value("providerPriceId", "Provider price ID")}} submitLabel={${i18n.value("createPaymentLink", "Create payment link")}} />;
}
`;
}
