export function manualPanelContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { formatManualAmount } from "./model";
import { ManualPaymentForm } from "./payment-form";
import { ManualPaymentHistory } from "./components/payment-history";
import { ManualReviewQueue } from "./components/review-queue";
import { ManualReviewRow } from "./payment-review";
import { ManualReceiptPreview } from "./receipt-preview";
import { useManualOwnerGeneration, useManualPayments } from "./use-manual-payments";

function ManualPaymentsScreen(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  const { summary, history, queue, refresh } = useManualPayments();
  return <section className="flex flex-col gap-6" aria-label={t("manualTitle")}>
    <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex flex-col gap-2"><CardTitle as="h2">{t("manualTitle")}</CardTitle><CardDescription className="max-w-[65ch]">{t("manualDescription")}</CardDescription></div><Button type="button" variant="outline" size="sm" disabled={summary.isFetching || history.isFetching} aria-busy={summary.isFetching || history.isFetching} onClick={() => void refresh()}>{t("refresh")}</Button></div></CardHeader><CardContent className="flex flex-col gap-6">
      {summary.error || history.error ? <Alert variant="destructive" role="alert"><AlertDescription>{t("manualReadFailed")}</AlertDescription></Alert> : null}
      {!summary.data && summary.isPending ? <div className="flex flex-col gap-4" aria-label={t("manualLoading")}><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /></div> : null}
      {summary.data ? <><div className="flex flex-col gap-1"><span className="text-sm text-muted-foreground">{t("manualBalance")}</span><strong className="text-3xl font-semibold tracking-tight tabular-nums">{formatManualAmount(summary.data.balanceMinor, locale)}</strong><p className="text-sm text-muted-foreground">{t("manualBalanceHelp")}</p></div><ManualPaymentForm summary={summary.data} /></> : null}
    </CardContent></Card>
    {history.data ? <Card><CardHeader><CardTitle as="h2">{t("manualHistory")}</CardTitle><CardDescription>{t("manualHistoryHelp")}</CardDescription></CardHeader><CardContent><ManualPaymentHistory items={history.data.items} renderReceipt={(id) => <ManualReceiptPreview id={id} />} /></CardContent></Card> : null}
    {summary.data?.canReview ? <Card><CardHeader><CardTitle as="h2">{t("manualQueue")}</CardTitle><CardDescription className="max-w-[65ch]">{t("manualQueueHelp")}</CardDescription></CardHeader><CardContent>
      {queue.error ? <Alert variant="destructive" role="alert"><AlertDescription>{t("manualQueueFailed")}</AlertDescription></Alert> : null}
      {queue.isPending && !queue.data ? <Skeleton className="h-48 w-full" aria-label={t("manualQueueLoading")} /> : null}
      {queue.data ? <ManualReviewQueue empty={queue.data.items.length === 0}>{queue.data.items.map((item) => <ManualReviewRow key={item.id} item={item} />)}</ManualReviewQueue> : null}
    </CardContent></Card> : null}
  </section>;
}
export function ManualBillingPanel(): React.JSX.Element {
  const generation = useManualOwnerGeneration();
  return <ManualPaymentsScreen key={generation} />;
}
`;
}
