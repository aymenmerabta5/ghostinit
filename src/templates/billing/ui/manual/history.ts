export function manualHistoryContent(): string {
  return `"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { formatManualAmount, type ManualPayment } from "../model";

export function ManualPaymentHistory({ items, renderReceipt }: { items: ManualPayment[]; renderReceipt: (id: string) => React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  if (items.length === 0) return <Empty><EmptyHeader><EmptyTitle>{t("manualHistoryEmpty")}</EmptyTitle><EmptyDescription>{t("manualHistoryEmptyHelp")}</EmptyDescription></EmptyHeader></Empty>;
  return <ul className="divide-y">{items.map((item) => <li key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-col gap-1"><span className="text-base font-medium tabular-nums">{formatManualAmount(item.amountMinor, locale)}</span><span className="text-sm text-muted-foreground"><bdi>{item.method}</bdi> · <time dateTime={item.createdAt}><bdi>{new Date(item.createdAt).toLocaleString(locale)}</bdi></time></span>{item.reference ? <span className="break-words text-sm text-muted-foreground">{t("manualReference")}: <bdi>{item.reference}</bdi></span> : null}</div><Badge variant={item.status === "rejected" ? "destructive" : item.status === "approved" ? "secondary" : "outline"}>{item.status === "approved" ? t("manualApproved") : item.status === "rejected" ? t("manualRejected") : t("manualPending")}</Badge></div>
    {item.reason ? <p className="break-words text-sm">{t("manualReviewNote")}: <bdi>{item.reason}</bdi></p> : null}
    {renderReceipt(item.id)}
  </li>)}</ul>;
}
`;
}
