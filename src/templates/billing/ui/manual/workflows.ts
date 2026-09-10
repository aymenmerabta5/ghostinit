export function manualFormHookContent(): string {
  return `"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useSubmitManualPayment } from "./mutations";
import { createManualPaymentSchema } from "./schema";
import { manualAmountMinor, type ManualSummary } from "./model";

export function useManualPaymentForm(summary: ManualSummary) {
  const t = useSurfaceTranslations("billing");
  const mutation = useSubmitManualPayment();
  const captureOwner = useAuthOwnedEffect();
  const busy = React.useRef(false);
  const attempt = React.useRef<{ fingerprint: string; requestKey: string } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const form = useAppForm({
    defaultValues: { amount: "", method: summary.allowedMethods[0] ?? "", reference: "", receipt: null as File | null },
    validators: { onSubmit: createManualPaymentSchema({ amount: t("manualAmountInvalid"), receipt: t("manualReceiptInvalid") }) },
    onSubmit: async ({ value }) => {
      if (busy.current || !summary.enabled) return;
      const amountMinor = manualAmountMinor(value.amount);
      if (amountMinor === null || !value.receipt) return;
      const isCurrent = captureOwner();
      if (!isCurrent()) return;
      busy.current = true;
      const fingerprint = JSON.stringify([amountMinor, value.method, value.reference.trim(), value.receipt.name, value.receipt.size, value.receipt.lastModified]);
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestKey: crypto.randomUUID() };
      try {
        const result = await mutation.submit({ amountMinor, requestKey: attempt.current.requestKey, method: value.method, reference: value.reference.trim() || undefined, receipt: value.receipt });
        if (result.status !== "success" || !isCurrent() || !result.isCurrent()) return;
        attempt.current = null; form.reset({ amount: "", method: value.method, reference: "", receipt: null });
        if (fileInput.current) fileInput.current.value = "";
      } catch { /* Mutation owns the error; keep the form and retry key. */ }
      finally { busy.current = false; }
    },
  });
  return { form, fileInput, enabled: summary.enabled, receiverInstructions: summary.receiverInstructions, methods: summary.allowedMethods, error: mutation.error ? t("manualSubmitFailed") : null, submitted: mutation.isSuccess };
}
`;
}

export function manualReviewHookContent(): string {
  return `"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useReviewManualPayment } from "./mutations";
import { createManualReviewSchema } from "./schema";

export function usePaymentReview(id: string) {
  const t = useSurfaceTranslations("billing");
  const mutation = useReviewManualPayment();
  const captureOwner = useAuthOwnedEffect();
  const [decision, setDecision] = React.useState<"approved" | "rejected" | null>(null);
  const busy = React.useRef(false);
  const resolved = mutation.data?.status === "approved" || mutation.data?.status === "rejected" ? mutation.data.status : null;
  const form = useAppForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: createManualReviewSchema(decision, t("manualReasonRequired")) },
    onSubmit: async ({ value }) => {
      if (busy.current || !decision || resolved) return;
      const isCurrent = captureOwner();
      if (!isCurrent()) return;
      busy.current = true;
      try { await mutation.review({ id, decision, reason: value.reason.trim() || undefined }); }
      catch { /* The mutation owns the error; the reason remains in the form. */ }
      finally { busy.current = false; }
    },
  });
  function choose(value: "approved" | "rejected" | null): void {
    if (busy.current || resolved) return;
    mutation.reset(); setDecision(value);
  }
  return { form, decision, resolved, choose, pending: mutation.isPending, error: mutation.error ? t("manualReviewFailed") : null };
}
`;
}

export function manualReceiptHookContent(): string {
  return `"use client";
import * as React from "react";
import { useManualReceipt } from "./queries";
import { manualReceiptBlob } from "./receipt-utils";

export function useReceiptPreview(id: string) {
  const instanceId = React.useId();
  const [requested, setRequested] = React.useState(false);
  const query = useManualReceipt(id, instanceId, requested);
  const [resource, setResource] = React.useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  React.useEffect(() => {
    if (!requested || !query.data) { setResource({ url: null, failed: false }); return; }
    try {
      const url = URL.createObjectURL(manualReceiptBlob(query.data));
      setResource({ url, failed: false });
      return () => URL.revokeObjectURL(url);
    } catch { setResource({ url: null, failed: true }); }
  }, [requested, query.data]);
  const preview = requested && resource.url && query.data ? { url: resource.url, name: query.data.originalName, image: query.data.mimeType === "image/png" || query.data.mimeType === "image/jpeg" } : null;
  return { preview, pending: requested && query.isFetching, failed: requested && (Boolean(query.error) || resource.failed), open: () => { if (query.error) void query.refetch(); setRequested(true); }, close: () => setRequested(false) };
}
`;
}
