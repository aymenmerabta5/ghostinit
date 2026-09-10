import type { BillingProviderName } from "../../../../lib/addons.js";
import { file, type TemplateFile } from "../../../shared.js";
import { expoBillingContent } from "../expo/billing.js";
import { desktopRouteBillingContent } from "../../desktop/routes/billing.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import { nativeBillingModelContent } from "./native-model.js";
import { nativeBillingHistoryCardContent } from "./native-history.js";
import { billingStatusContent } from "../../../billing/ui/status.js";
import {
  nativeBillingAlias,
  nativeBillingMutationsContent,
  type NativeBillingMode,
  type NativeBillingPlatform,
} from "./native-platform.js";
import {
  nativeBillingViewContent,
  nativePaymentLinkSectionContent,
  nativePaymentLinkViewContent,
  nativeProviderCardContent,
} from "./native-view.js";

function featureRoot(platform: NativeBillingPlatform, mode: NativeBillingMode): string {
  return platform === "expo"
    ? `${mode === "monorepo" ? "apps/mobile/" : ""}src/features/billing`
    : `${mode === "monorepo" ? "apps/desktop/" : ""}src/renderer/features/billing`;
}

function routeContent(platform: NativeBillingPlatform, mode: NativeBillingMode): string {
  const alias = nativeBillingAlias(platform, mode);
  return platform === "expo"
    ? `import { BillingScreen } from "${alias}/features/billing/screen";\nexport default BillingScreen;\n`
    : `import { createFileRoute } from "@tanstack/react-router";\nimport { BillingScreen } from "${alias}/features/billing/screen";\nexport const Route = createFileRoute("/billing")({ component: BillingScreen });\n`;
}

function snapshotHookContent(platform: NativeBillingPlatform, mode: NativeBillingMode): string {
  const alias = nativeBillingAlias(platform, mode);
  return `import { useEffect } from "react";
${platform === "expo" ? `import { AppState } from "react-native";\nimport { useAuth } from "${alias}/hooks/use-auth";` : ""}
import { useBillingSnapshotQuery, useBillingIdentityQuery } from "./queries";
import { subscriptionView, invoiceView } from "./model";
export function useBillingSnapshot() {
  ${platform === "expo" ? "const { isAuthenticated } = useAuth();\n  const identity = useBillingIdentityQuery(isAuthenticated);" : "const identity = useBillingIdentityQuery(true);\n  const isAuthenticated = Boolean(identity.data?.user && !identity.data.user.banned);"}
  const snapshot = useBillingSnapshotQuery(isAuthenticated);
  const subscriptions = snapshot.data?.subscriptions.flatMap((value) => subscriptionView(value) ?? []) ?? [];
  const invoices = snapshot.data?.invoices.flatMap((value) => invoiceView(value) ?? []) ?? [];
  const role = identity.data?.user?.banned ? null : identity.data?.user?.role;
  useEffect(() => {
    ${platform === "expo" ? `const listener = AppState.addEventListener("change", (state) => { if (state === "active" && isAuthenticated) void snapshot.refetch(); });\n    return () => listener.remove();` : `const refresh = () => { if (isAuthenticated) void snapshot.refetch(); };\n    window.addEventListener("focus", refresh);\n    return () => window.removeEventListener("focus", refresh);`}
  }, [isAuthenticated, snapshot.refetch]);
  const refresh = () => { if (isAuthenticated) void snapshot.refetch(); };
  return { subscriptions, invoices, isAuthenticated, isAdmin: role === "admin" || role === "superAdmin",
    isPending: isAuthenticated && snapshot.isPending, isRefreshing: snapshot.isFetching,
    readError: snapshot.error, refresh };
}
`;
}

function screenContent(
  platform: NativeBillingPlatform,
  mode: NativeBillingMode,
  hasI18n: boolean,
  manual: boolean,
): string {
  const alias = nativeBillingAlias(platform, mode);
  const i18n = nativeI18nTemplate(
    hasI18n,
    "billing",
    nativeI18nImportPath(platform === "expo" ? "mobile" : "desktop", mode),
  );
  return `import * as React from "react";
${platform === "expo" ? 'import { Text } from "@/components/ui/text";' : ""}
import { BillingView } from "./components/billing-view";
import { ProviderCard } from "./components/provider-card";
import { PaymentLinkSection } from "./payment-link-section";
import { useBillingSnapshot } from "./use-billing-snapshot";
import { useBillingActions } from "./use-billing-actions";
import { selectedProviders } from "./model";
${manual ? `import { ${platform === "expo" ? "ManualMobilePayments" : "ManualBillingPanel"} } from "${alias}/features/manual-payments/screen";` : ""}
${i18n.importLine.replace("{ useTranslations }", "{ usePlatformI18n, useTranslations }")}
export function BillingScreen(): React.JSX.Element {
${i18n.hookLine}
  const locale = ${hasI18n ? "usePlatformI18n().locale" : '"en"'};
  const snapshot = useBillingSnapshot();
  const actions = useBillingActions(snapshot.refresh);
  const providerControls = selectedProviders.map((provider) => <ProviderCard key={provider.id} provider={provider}
    description={${i18n.value("providerDescription", "Only server-selected provider capabilities are exposed")}}
    checkoutLabel={${i18n.value("startCheckout", "Start checkout")}} portalLabel={${i18n.value("openPortal", "Open portal")}}
    disabled={!snapshot.isAuthenticated || actions.isPending}
    onCheckout={() => { void actions.run({ kind: "checkout", provider: provider.id }); }}
    onPortal={() => { void actions.run({ kind: "portal", provider: provider.id }); }}
    paymentLink={provider.paymentLink ? snapshot.isAdmin
      ? <PaymentLinkSection provider={provider.id} disabled={actions.isPending} submit={actions.submit} />
      : <${platform === "expo" ? "Text" : "p"} className="text-xs text-muted-foreground">${i18n.child("adminPaymentLinks", "Merchant administrators can create payment links")}</${platform === "expo" ? "Text" : "p"}> : null} />);
  return <BillingView {...snapshot} locale={locale} onRefresh={snapshot.refresh}
    actionError={actions.error ? ${i18n.value("checkoutError", "Billing action failed")} : null}
    providerControls={providerControls}${manual ? ` manualPayments={<${platform === "expo" ? "ManualMobilePayments" : "ManualBillingPanel"} />}` : ""}${hasI18n ? " t={t}" : ""} />;
}
`;
}

/** Native billing uses one read workflow, one redirect operation, and a separate merchant form. */
export function nativeBillingFeatureFiles(
  platform: NativeBillingPlatform,
  mode: NativeBillingMode,
  providers: readonly BillingProviderName[],
  hasI18n: boolean,
): TemplateFile[] {
  const root = featureRoot(platform, mode);
  const route =
    platform === "expo"
      ? `${mode === "monorepo" ? "apps/mobile/" : ""}app/billing.tsx`
      : `${mode === "monorepo" ? "apps/desktop/" : ""}src/renderer/routes/billing.tsx`;
  const source =
    platform === "expo"
      ? expoBillingContent(mode, providers, hasI18n)
      : desktopRouteBillingContent(providers, hasI18n, mode);
  if (providers.length > 0 && providers.every((provider) => provider === "manual"))
    return [file(route, source)];
  const alias = nativeBillingAlias(platform, mode);
  return [
    file(route, routeContent(platform, mode)),
    file(root + "/status-labels.ts", billingStatusContent()),
    file(
      `${root}/screen.tsx`,
      screenContent(platform, mode, hasI18n, providers.includes("manual")),
    ),
    file(`${root}/model.ts`, nativeBillingModelContent(providers)),
    file(
      `${root}/components/subscriptions-card.tsx`,
      nativeBillingHistoryCardContent(platform, mode, source, hasI18n, "subscriptions"),
    ),
    file(
      `${root}/components/invoices-card.tsx`,
      nativeBillingHistoryCardContent(platform, mode, source, hasI18n, "invoices"),
    ),
    file(
      `${root}/queries.ts`,
      `import { useQuery } from "@tanstack/react-query";
import { orpc } from "${alias}/lib/orpc";
export function useBillingIdentityQuery(enabled: boolean) { return useQuery(orpc.me.queryOptions({ enabled })); }
export function useBillingSnapshotQuery(enabled: boolean) { return useQuery(orpc.billing.subscriptions.queryOptions({ enabled })); }
`,
    ),
    file(`${root}/mutations.ts`, nativeBillingMutationsContent(platform, mode, source)),
    file(`${root}/use-billing-snapshot.ts`, snapshotHookContent(platform, mode)),
    file(
      `${root}/use-billing-actions.ts`,
      `import { useAuthOwnedMutation } from "${alias}/hooks/use-auth-owned-mutation";
import { performBillingAction, type BillingAction } from "./mutations";
export function useBillingActions(refresh: () => void) {
  const action = useAuthOwnedMutation(performBillingAction, { onSuccess: (_data, _input, isCurrent) => { if (isCurrent()) refresh(); } });
  const submit = async (input: BillingAction): Promise<void> => { await action.run(input); };
  return { run: action.run, submit, error: action.error, isPending: action.isPending };
}
`,
    ),
    file(
      `${root}/use-payment-link-form.ts`,
      `${platform === "expo" ? 'import { useForm } from "@tanstack/react-form";' : 'import { useAppForm } from "@/components/ui/form";'}
import type { ProviderName } from "./model";
import type { BillingAction } from "./mutations";
export function usePaymentLinkForm(provider: ProviderName, submit: (input: BillingAction) => Promise<void>, copy: { defaultName: string; required: string; completed: string }) {
  return ${platform === "expo" ? "useForm" : "useAppForm"}({ defaultValues: { name: copy.defaultName, price: "" },
    validators: { onSubmit: ({ value }) => value.name.trim() && value.price.trim() ? undefined : copy.required },
    onSubmit: async ({ value }) => { await submit({ kind: "payment-link", provider, name: value.name.trim(), price: value.price.trim(), afterCompletionMessage: copy.completed }); },
  });
}
export type PaymentLinkFormController = ReturnType<typeof usePaymentLinkForm>;
`,
    ),
    file(
      `${root}/types.ts`,
      'export type { PaymentLinkFormController } from "./use-payment-link-form";\n',
    ),
    file(
      `${root}/payment-link-section.tsx`,
      nativePaymentLinkSectionContent(platform, mode, hasI18n),
    ),
    file(
      `${root}/components/billing-view.tsx`,
      nativeBillingViewContent(platform, mode, source, hasI18n, providers.includes("manual")),
    ),
    file(`${root}/components/provider-card.tsx`, nativeProviderCardContent(platform)),
    file(`${root}/components/payment-link-form.tsx`, nativePaymentLinkViewContent(platform)),
  ];
}
