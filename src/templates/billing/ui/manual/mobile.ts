import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nTemplate } from "../../../apps/fragments/native-i18n.js";

export function manualMobilePageContent(_mode: "single" | "monorepo", hasI18n: boolean): string {
  const i18n = nativeI18nTemplate(hasI18n, "billing");
  return `import * as React from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { ManualMobilePayments } from "@/features/manual-payments/screen";
${i18n.importLine}
export default function BillingScreen(): React.JSX.Element {
${i18n.hookLine}
  return <ScrollView className="flex-1 bg-background"><View className="w-full max-w-[960px] self-center gap-5 p-5"><Text className="text-2xl font-bold tracking-tight">${i18n.child("title", "Billing")}</Text><ManualMobilePayments /></View></ScrollView>;
}
`;
}

/** Online and manual-only billing compose the same native feature. */
export function manualMobileContent(_hasI18n: boolean): string {
  return 'import { ManualMobilePayments } from "@/features/manual-payments/screen";\n';
}

const copy = {
  title: ["manualTitle", "Manual payment"],
  description: [
    "manualDescription",
    "Top up your balance by bank transfer or BaridiMob. Submit a receipt for review after you pay.",
  ],
  readFailed: [
    "manualReadFailed",
    "Your latest balance and payments could not be loaded. Refresh to try again.",
  ],
  loading: ["manualLoading", "Loading manual payments"],
  balance: ["manualBalance", "Approved balance"],
  balanceHelp: ["manualBalanceHelp", "Only approved payments add credit to this balance."],
  webHelp: [
    "manualWebHelp",
    "Use your web account to upload a receipt or review payments. You may need to sign in again.",
  ],
  openWeb: ["manualOpenWeb", "Submit receipt on web"],
  unavailable: [
    "manualUnavailable",
    "Manual payments are not ready. Ask the account administrator for payment instructions before sending money.",
  ],
  webUnavailable: [
    "manualWebUnavailable",
    "The web billing page is not configured. Contact support for access.",
  ],
  history: ["manualHistory", "Your payments"],
  empty: ["manualHistoryEmpty", "No receipts submitted"],
  approved: ["manualApproved", "Approved"],
  rejected: ["manualRejected", "Rejected"],
  pending: ["manualPending", "Pending review"],
  refresh: ["refresh", "Refresh billing"],
} as const;

function typesContent(): string {
  return `export interface ManualSummary {
  readonly enabled: boolean; readonly balanceMinor: number; readonly receiverInstructions: string;
}
export interface ManualPayment {
  readonly id: string; readonly amountMinor: number; readonly status: "pending" | "approved" | "rejected";
  readonly method: string; readonly createdAt: string; readonly reason: string | null;
}
export interface ManualPaymentCopy {
${Object.keys(copy)
  .map((key) => `  readonly ${key}: string;`)
  .join("\n")}
}
`;
}

function screenContent(hasI18n: boolean): string {
  const i18n = nativeI18nTemplate(hasI18n, "billing");
  return `import * as React from "react";
import { ManualPaymentCard } from "./components/manual-payment-card";
import { useManualPayments } from "./use-manual-payments";
import { useManualWebHandoff } from "./use-manual-web-handoff";
import type { ManualPaymentCopy } from "./types";
${i18n.importLine.replace("{ useTranslations }", "{ usePlatformI18n, useTranslations }")}
export function ManualMobilePayments(): React.JSX.Element {
${i18n.hookLine}
  const locale = ${hasI18n ? "usePlatformI18n().locale" : '"en"'};
  const payments = useManualPayments();
  const handoff = useManualWebHandoff();
  const copy: ManualPaymentCopy = {
${Object.entries(copy)
  .map(([key, [message, fallback]]) => `    ${key}: ${i18n.value(message, fallback)},`)
  .join("\n")}
  };
  return <ManualPaymentCard copy={copy} locale={locale}
    summary={payments.summary.data} items={payments.history.data?.items}
    summaryPending={payments.summary.isPending} historyPending={payments.history.isPending}
    readError={Boolean(payments.summary.error || payments.history.error)} historyError={Boolean(payments.history.error)}
    refreshDisabled={!payments.isAuthenticated || payments.summary.isFetching || payments.history.isFetching}
    onRefresh={payments.refresh} opening={handoff.pending} openError={handoff.error} onOpen={handoff.open} />;
}
`;
}

function cardContent(): string {
  return `import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { ManualSummary, ManualPayment, ManualPaymentCopy } from "../types";
export interface ManualPaymentCardProps {
  readonly copy: ManualPaymentCopy; readonly locale: string;
  readonly summary?: ManualSummary; readonly items?: readonly ManualPayment[];
  readonly summaryPending: boolean; readonly historyPending: boolean;
  readonly readError: boolean; readonly historyError: boolean;
  readonly refreshDisabled: boolean; readonly opening: boolean; readonly openError: boolean;
  readonly onRefresh: () => void; readonly onOpen: () => Promise<void>;
}
export function ManualPaymentCard({ copy, locale, summary, items, summaryPending, historyPending, readError, historyError, refreshDisabled, opening, openError, onRefresh, onOpen }: ManualPaymentCardProps): React.JSX.Element {
  const money = (minor: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "DZD" }).format(minor / 100);
  return <Card><CardHeader><CardTitle>{copy.title}</CardTitle><CardDescription>{copy.description}</CardDescription></CardHeader><CardContent className="gap-4">
    {readError ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>{copy.readFailed}</AlertDescription></Alert> : null}
    {summaryPending ? <ActivityIndicator accessibilityLabel={copy.loading} /> : null}
    {summary ? <><View className="gap-1"><Text className="text-sm text-muted-foreground">{copy.balance}</Text><Text className="text-3xl font-semibold">{money(summary.balanceMinor)}</Text><Text className="text-sm text-muted-foreground">{copy.balanceHelp}</Text></View>{summary.enabled ? <><Text className="text-sm leading-6">{summary.receiverInstructions}</Text><Text className="text-sm text-muted-foreground">{copy.webHelp}</Text><Button disabled={opening} onPress={() => void onOpen()}><Text>{copy.openWeb}</Text></Button></> : <Text className="text-sm text-muted-foreground">{copy.unavailable}</Text>}</> : null}
    {openError ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>{copy.webUnavailable}</AlertDescription></Alert> : null}
    <Text className="text-base font-semibold">{copy.history}</Text>
    {historyPending ? <ActivityIndicator accessibilityLabel={copy.loading} /> : items?.length === 0 && !historyError ? <Text className="text-sm text-muted-foreground">{copy.empty}</Text> : items?.map((item) => <View key={item.id} className="gap-2 border-b border-border py-3"><View className="flex-row flex-wrap items-center justify-between gap-2"><Text className="font-medium">{money(item.amountMinor)}</Text><Badge variant={item.status === "rejected" ? "destructive" : "secondary"}><Text>{item.status === "approved" ? copy.approved : item.status === "rejected" ? copy.rejected : copy.pending}</Text></Badge></View><View accessible accessibilityLabel={item.method + " · " + new Date(item.createdAt).toLocaleDateString(locale)} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}><Text accessible={false} className="text-sm text-muted-foreground" style={{ flexShrink: 1, maxWidth: "100%" }}>{item.method}</Text><Text accessible={false} className="text-sm text-muted-foreground">{" · "}</Text><Text accessible={false} className="text-sm text-muted-foreground" style={{ flexShrink: 1, maxWidth: "100%" }}>{new Date(item.createdAt).toLocaleDateString(locale)}</Text></View>{item.reason ? <Text className="text-sm">{item.reason}</Text> : null}</View>)}
    <Button variant="outline" disabled={refreshDisabled} onPress={onRefresh}><Text>{copy.refresh}</Text></Button>
  </CardContent></Card>;
}
`;
}

export function manualMobileFeatureFiles(
  mode: "single" | "monorepo",
  hasI18n: boolean,
): TemplateFile[] {
  const root = `${mode === "monorepo" ? "apps/mobile/src" : "src"}/features/manual-payments`;
  return [
    file(`${root}/types.ts`, typesContent()),
    file(`${root}/screen.tsx`, screenContent(hasI18n)),
    file(`${root}/components/manual-payment-card.tsx`, cardContent()),
    file(
      `${root}/queries.ts`,
      `import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
export const manualSummaryOptions = (enabled: boolean) => orpc.billing.manual.summary.queryOptions({ enabled });
export const manualHistoryOptions = (enabled: boolean) => orpc.billing.manual.list.queryOptions({ enabled });
export function useManualSummaryQuery(enabled: boolean) { return useQuery(manualSummaryOptions(enabled)); }
export function useManualHistoryQuery(enabled: boolean) { return useQuery(manualHistoryOptions(enabled)); }
`,
    ),
    file(
      `${root}/use-manual-payments.ts`,
      `import { useAuth } from "@/hooks/use-auth";
import { useManualSummaryQuery, useManualHistoryQuery } from "./queries";
export function useManualPayments() {
  const { isAuthenticated } = useAuth();
  const summary = useManualSummaryQuery(isAuthenticated);
  const history = useManualHistoryQuery(isAuthenticated);
  const refresh = () => { void summary.refetch(); void history.refetch(); };
  return { isAuthenticated, summary, history, refresh };
}
`,
    ),
    file(
      `${root}/mutations.ts`,
      `import * as Linking from "expo-linking";
import { env } from "${mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo"}";
export async function openManualBillingWeb(isCurrent: () => boolean): Promise<void> {
  const configured = [env.EXPO_PUBLIC_APP_URL, env.EXPO_PUBLIC_API_URL].flatMap((value) => {
    if (typeof value !== "string" || !value.trim()) return [];
    try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? [url] : []; }
    catch { return []; }
  })[0];
  if (!configured) throw new Error("MANUAL_WEB_UNAVAILABLE");
  const url = new URL("/billing", configured).toString();
  if (!(await Linking.canOpenURL(url))) throw new Error("MANUAL_WEB_UNAVAILABLE");
  if (isCurrent()) await Linking.openURL(url);
}
`,
    ),
    file(
      `${root}/use-manual-web-handoff.ts`,
      `import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { openManualBillingWeb } from "./mutations";
export function useManualWebHandoff() {
  const handoff = useAuthOwnedMutation((_input: undefined, isCurrent: () => boolean) => openManualBillingWeb(isCurrent));
  const open = async (): Promise<void> => { await handoff.run(undefined); };
  return { pending: handoff.isPending, error: Boolean(handoff.error), open };
}
`,
    ),
  ];
}
