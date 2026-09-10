export function forgotPasswordHookContent(): string {
  return `"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createEmailSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { requestPasswordReset } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";

export function useForgotPasswordForm() {
  const t = useSurfaceTranslations("recovery");
  const authT = useSurfaceTranslations("auth");
  const intent = useAuthIntent();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: createEmailSchema(authT("validation.invalidEmail")) },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin(); if (!ticket) return;
      setError(null); setSuccess(false);
      try {
        const result = await requestPasswordReset(value.email);
        if (!ticket.isCurrent()) return;
        if (result.error) { setError(t("forgotPassword.genericError")); return; }
        setSuccess(true); form.reset();
      } catch { if (ticket.isCurrent()) setError(t("forgotPassword.genericError")); }
      finally { ticket.finish(); }
    },
  });
  return { form, success, error };
}
`;
}

export function resetPasswordHookContent(): string {
  return `"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createResetPasswordSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { resetPassword } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";
import { useAuthNavigation } from "./use-auth-navigation";

export function useResetPasswordForm(token: string, queryError: string | null) {
  const t = useSurfaceTranslations("recovery");
  const authT = useSurfaceTranslations("auth");
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
  const linkError = queryError ? queryError === "INVALID_TOKEN" ? t("resetPassword.expiredToken") : t("resetPassword.genericError") : token ? null : t("resetPassword.missingToken");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: { onSubmit: createResetPasswordSchema({ passwordRequired: authT("validation.passwordRequired"), passwordTooShort: authT("validation.passwordTooShort"), passwordTooLong: authT("validation.passwordTooLong"), passwordMismatch: t("resetPassword.passwordMismatch") }) },
    onSubmit: async ({ value }) => {
      if (!token) return;
      const ticket = intent.begin(); if (!ticket) return;
      setSubmissionError(null);
      try {
        const result = await resetPassword({ newPassword: value.newPassword, token });
        if (!ticket.isCurrent()) return;
        if (result.error) { setSubmissionError(t("resetPassword.genericError")); return; }
        await navigation.afterPasswordReset();
      } catch { if (ticket.isCurrent()) setSubmissionError(t("resetPassword.genericError")); }
      finally { ticket.finish(); }
    },
  });
  return { form, token, error: submissionError ?? linkError };
}
`;
}

export function emailFlowHookContent(): string {
  return `"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createEmailSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { requestMagicLink, requestEmailVerification } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";

export function useEmailFlowForm(kind: "magic-link" | "verify-email") {
  const t = useSurfaceTranslations("auth");
  const intent = useAuthIntent();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: createEmailSchema(t("validation.invalidEmail")) },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin(); if (!ticket) return;
      setError(null); setSent(false);
      try {
        const result = await (kind === "magic-link" ? requestMagicLink(value.email) : requestEmailVerification(value.email));
        if (!ticket.isCurrent()) return;
        if (result.error) { setError(t("emailFlow.sendError")); return; }
        setSent(true);
      } catch { if (ticket.isCurrent()) setError(t("emailFlow.sendError")); }
      finally { ticket.finish(); }
    },
  });
  return { form, error, sent };
}
`;
}
