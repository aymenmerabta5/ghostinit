export function manualFieldsContent(): string {
  return `"use client";
import * as React from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ManualPaymentFormState } from "../types";

type ManualPaymentFieldsProps = Pick<ManualPaymentFormState, "form" | "fileInput" | "methods" | "receiverInstructions">;

export function ManualPaymentFields({ form, fileInput, methods, receiverInstructions }: ManualPaymentFieldsProps): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const id = React.useId();
  return <>
    <div className="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm leading-6" aria-label={t("manualInstructions")}>{receiverInstructions}</div>
    <p className="text-sm leading-6 text-muted-foreground">{t("manualInstructionsHelp")}</p>
    <form.Subscribe selector={(state) => state.isSubmitting}>{(pending) => <>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="amount">{(field) => <field.TextField label={t("manualAmount")} description={t("manualAmountHelp")} inputMode="decimal" required disabled={pending} />}</form.AppField>
        <form.AppField name="method">{(field) => <field.SelectField label={t("manualMethod")} options={methods.map((value) => ({ label: value, value }))} disabled={pending} />}</form.AppField>
      </div>
      <form.AppField name="reference">{(field) => <field.TextField label={t("manualReference")} maxLength={160} disabled={pending} />}</form.AppField>
      <form.AppField name="receipt">{(field) => <Field data-invalid={field.state.meta.errors.length > 0}>
        <FieldLabel htmlFor={id}>{t("manualReceipt")}</FieldLabel>
        <Input ref={fileInput} id={id} type="file" accept="image/png,image/jpeg,application/pdf" disabled={pending} required aria-describedby={id + "-help"} aria-invalid={field.state.meta.errors.length > 0} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.files?.[0] ?? null)} />
        <p id={id + "-help"} className="text-sm text-muted-foreground">{t("manualReceiptHelp")}</p>
        {field.state.meta.errors.length > 0 ? <FieldError>{t("manualReceiptInvalid")}</FieldError> : null}
      </Field>}</form.AppField>
    </>}</form.Subscribe>
  </>;
}
`;
}
