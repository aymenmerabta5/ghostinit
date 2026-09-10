export function manualReviewDecisionContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { PaymentReviewState } from "../types";

export function ManualReviewDecision({ state, amount }: { state: PaymentReviewState; amount: string }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { form, decision, error, pending, choose } = state;
  return <form.AppForm><Form form={form} className="flex flex-col gap-3 rounded-lg bg-muted p-4">
    <p className="text-sm leading-6">{decision === "approved" ? t("manualApproveConfirm", { amount }) : t("manualRejectConfirm")}</p>
    <form.AppField name="reason">{(field) => <field.TextAreaField label={decision === "rejected" ? t("manualRejectionReason") : t("manualOptionalNote")} maxLength={500} required={decision === "rejected"} disabled={pending} />}</form.AppField>
    {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="flex flex-wrap gap-2"><form.SubmitButton variant={decision === "rejected" ? "destructive" : "default"} pendingLabel={t("manualReviewSaving")}>{decision === "approved" ? t("manualConfirmApproval") : t("manualConfirmRejection")}</form.SubmitButton><Button type="button" variant="outline" disabled={pending} onClick={() => choose(null)}>{t("manualCancelReview")}</Button></div>
  </Form></form.AppForm>;
}
`;
}
