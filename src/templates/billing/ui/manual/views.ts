export function manualFormViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ManualPaymentFormState } from "../types";
import { ManualPaymentFields } from "./payment-fields";

export function ManualPaymentFormView({ state }: { state: ManualPaymentFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { form, enabled, error, submitted } = state;
  if (!enabled) return <Alert><AlertDescription>{t("manualUnavailable")}</AlertDescription></Alert>;
  return <form.AppForm><Form form={form} className="flex flex-col gap-5">
    <ManualPaymentFields form={form} fileInput={state.fileInput} methods={state.methods} receiverInstructions={state.receiverInstructions} />
    {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {submitted ? <Alert role="status"><AlertDescription>{t("manualSubmitted")}</AlertDescription></Alert> : null}
    <div><form.SubmitButton pendingLabel={t("manualSubmitting")}>{t("manualSubmit")}</form.SubmitButton></div>
  </Form></form.AppForm>;
}
`;
}

export function manualReviewRowViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { formatManualAmount, type ManualPayment } from "../model";
import type { PaymentReviewState } from "../types";
import { ManualReviewDecision } from "./review-decision";

export function ManualReviewRowView({ item, state, receipt }: { item: ManualPayment; state: PaymentReviewState; receipt: React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  const { resolved, decision, choose } = state;
  const amount = formatManualAmount(item.amountMinor, locale);
  return <li className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-col gap-1"><span className="font-medium tabular-nums">{amount}</span><span className="break-all text-sm text-muted-foreground">{t("manualAccount")}: {item.ownerId}</span><span className="text-sm text-muted-foreground"><bdi>{item.method}</bdi> · <time dateTime={item.createdAt}><bdi>{new Date(item.createdAt).toLocaleString(locale)}</bdi></time></span>{item.reference ? <span className="break-words text-sm">{t("manualReference")}: <bdi>{item.reference}</bdi></span> : null}</div><Badge variant="outline">{resolved === "approved" ? t("manualApproved") : resolved === "rejected" ? t("manualRejected") : t("manualPending")}</Badge></div>
    {receipt}
    {resolved ? <p role="status" className="text-sm">{t("manualReviewSaved")}</p> : decision ? <ManualReviewDecision state={state} amount={amount} /> : <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => choose("approved")}>{t("manualApprove")}</Button><Button type="button" size="sm" variant="outline" onClick={() => choose("rejected")}>{t("manualReject")}</Button></div>}
  </li>;
}
`;
}

export function manualReceiptViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ReceiptPreviewState } from "../types";

export function ManualReceiptView({ state }: { state: ReceiptPreviewState }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { preview, pending, failed, open, close } = state;
  return <div className="flex flex-col items-start gap-3">
    {preview ? <>
      {preview.image ? <img src={preview.url} alt={t("manualReceiptPreview")} className="max-h-96 max-w-full rounded-lg object-contain" /> : <p className="text-sm text-muted-foreground">{t("manualPdfHelp")}</p>}
      <div className="flex flex-wrap gap-2"><Button render={<a href={preview.url} download={preview.name} />} nativeButton={false} variant="outline" size="sm">{t("manualDownload")}</Button><Button type="button" variant="ghost" size="sm" onClick={close}>{t("manualCloseReceipt")}</Button></div>
    </> : <Button type="button" size="sm" variant="outline" onClick={open} disabled={pending} aria-busy={pending}>{pending ? t("manualLoadingReceipt") : t("manualViewReceipt")}</Button>}
    {failed ? <Alert variant="destructive" role="alert"><AlertDescription>{t("manualReceiptFailed")}</AlertDescription></Alert> : null}
  </div>;
}
`;
}
