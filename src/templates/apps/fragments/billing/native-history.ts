import { nativeI18nImportPath } from "../native-i18n.js";
import {
  nativeBillingAlias,
  type NativeBillingMode,
  type NativeBillingPlatform,
} from "./native-platform.js";

export type BillingHistoryKind = "subscriptions" | "invoices";

export function billingHistoryCard(source: string, kind: BillingHistoryKind): string {
  const line = source.split("\n").find((value) => value.includes(`${kind}.map((item)`));
  if (!line) throw new Error(`Native billing ${kind} card is missing`);
  return line
    .trim()
    .replaceAll("snapshot.isPending", "isPending")
    .replaceAll("snapshot.error", "readError");
}

export function nativeBillingHistoryCardContent(
  platform: NativeBillingPlatform,
  mode: NativeBillingMode,
  source: string,
  hasI18n: boolean,
  kind: BillingHistoryKind,
): string {
  const native = platform === "expo";
  const name = kind === "subscriptions" ? "SubscriptionsCard" : "InvoicesCard";
  const itemType = kind === "subscriptions" ? "SubscriptionView" : "InvoiceView";
  return `import type * as React from "react";
${native ? 'import { ActivityIndicator, View } from "react-native";\nimport { Text } from "@/components/ui/text";' : 'import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";\nimport { Skeleton } from "@/components/ui/skeleton";'}
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ${itemType} } from "../model";
import { ${kind === "invoices" ? "formatBillingInvoiceStatus" : "formatBillingSubscriptionStatus"} } from "../status-labels";
${kind === "invoices" ? `import { formatBillingInvoiceAmount } from "${nativeBillingAlias(platform, mode)}/lib/billing-money";` : ""}
${hasI18n ? `import type { NamespaceTranslate } from "${nativeI18nImportPath(native ? "mobile" : "desktop", mode)}";` : ""}
export function ${name}({ ${kind}, isPending, readError${kind === "invoices" ? ", locale" : ""}${hasI18n ? ", t" : ""} }: { ${kind}: readonly ${itemType}[]; isPending: boolean; readError: Error | null;${kind === "invoices" ? " locale: string;" : ""}${hasI18n ? ' t: NamespaceTranslate<"billing">;' : ""} }): React.JSX.Element {
  return ${billingHistoryCard(source, kind)};
}
`;
}
