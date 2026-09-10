export function signInFormHookContent(hasEmail: boolean): string {
  return `"use client";
${
  hasEmail
    ? `import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createSignInSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { signInWithEmail } from "./mutations";`
    : ""
}
import { useAuthIntent } from "./use-auth-intent";
import { useAuthMethods } from "./use-auth-methods";
import { useAuthNavigation } from "./use-auth-navigation";

export function useSignInForm() {
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
${
  hasEmail
    ? `  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const methods = useAuthMethods(intent, navigation.dashboard, "signIn", () => setError(null));
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: createSignInSchema({ invalidEmail: t("validation.invalidEmail"), passwordRequired: t("validation.passwordRequired"), passwordTooShort: t("validation.passwordTooShort"), passwordTooLong: t("validation.passwordTooLong") }) },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin(); if (!ticket) return;
      setError(null); methods.reset();
      try {
        const result = await signInWithEmail(value);
        if (!ticket.isCurrent()) return;
        if (result.error) { setError(t("signIn.genericError")); return; }
        const data = result.data;
        const twoFactor = typeof data === "object" && data !== null && "twoFactorRedirect" in data && data.twoFactorRedirect === true;
        await navigation.afterSignIn(twoFactor);
      } catch { if (ticket.isCurrent()) setError(t("signIn.genericError")); }
      finally { ticket.finish(); }
    },
  });
  return { form, error, methods };`
    : `  const methods = useAuthMethods(intent, navigation.dashboard, "signIn");
  return { methods };`
}
}
`;
}

export function signUpFormHookContent(hasEmail: boolean): string {
  return `"use client";
${
  hasEmail
    ? `import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createSignUpSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { signUpWithEmail } from "./mutations";`
    : ""
}
import { useAuthIntent } from "./use-auth-intent";
import { useAuthMethods } from "./use-auth-methods";
import { useAuthNavigation } from "./use-auth-navigation";

export function useSignUpForm() {
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
${
  hasEmail
    ? `  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const methods = useAuthMethods(intent, navigation.dashboard, "signUp", () => setError(null));
  const form = useAppForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: createSignUpSchema({ invalidEmail: t("validation.invalidEmail"), passwordRequired: t("validation.passwordRequired"), passwordTooShort: t("validation.passwordTooShort"), passwordTooLong: t("validation.passwordTooLong"), nameRequired: t("validation.nameRequired"), nameTooShort: t("validation.nameTooShort"), nameTooLong: t("validation.nameTooLong") }) },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin(); if (!ticket) return;
      setError(null); methods.reset();
      try {
        const result = await signUpWithEmail(value);
        if (!ticket.isCurrent()) return;
        if (result.error) { setError(t("signUp.genericError")); return; }
        await navigation.afterSignUp(Boolean(result.data?.token));
      } catch { if (ticket.isCurrent()) setError(t("signUp.genericError")); }
      finally { ticket.finish(); }
    },
  });
  return { form, error: error ?? methods.error, methods };`
    : `  const methods = useAuthMethods(intent, navigation.dashboard, "signUp");
  return { error: methods.error, methods };`
}
}
`;
}

export function twoFactorFormHookContent(): string {
  return `"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createTwoFactorChallengeSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { verifyAuthChallenge } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";
import { useAuthNavigation } from "./use-auth-navigation";

export function useTwoFactorForm() {
  const t = useSurfaceTranslations("auth");
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
  const [error, setError] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const form = useAppForm({
    defaultValues: { code: "", trustDevice: false },
    validators: { onSubmit: createTwoFactorChallengeSchema(useBackupCode ? "backup" : "authenticator", t(useBackupCode ? "twoFactor.backupCodeDescription" : "validation.codeSixDigits")) },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin(); if (!ticket) return;
      setError(null);
      try {
        const result = await verifyAuthChallenge(useBackupCode ? "backup" : "authenticator", { code: value.code.trim(), trustDevice: value.trustDevice });
        if (!ticket.isCurrent()) return;
        if (result.error) { setError(t("twoFactor.genericError")); return; }
        await navigation.dashboard();
      } catch { if (ticket.isCurrent()) setError(t("twoFactor.genericError")); }
      finally { ticket.finish(); }
    },
  });
  function toggleMethod(): void { if (form.state.isSubmitting) return; setUseBackupCode((value) => !value); setError(null); form.reset(); }
  return { form, error, useBackupCode, toggleMethod };
}
`;
}
