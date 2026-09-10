import type { RouterType } from "./imports.js";

export function authRouteContent(router: RouterType, path: string, screen: string): string {
  const feature = path === "2fa" ? "two-factor" : path;
  return router === "next"
    ? `import { ${screen} } from "@/features/auth/${feature}-screen";\nexport default function Page() { return <${screen} />; }\n`
    : `import { createFileRoute } from "@tanstack/react-router";\nimport { ${screen} } from "@/features/auth/${feature}-screen";\nexport const Route = createFileRoute("/${path}")({ component: ${screen} });\n`;
}

export function authScreenContent(
  router: RouterType,
  kind: "sign-in" | "sign-up" | "two-factor",
): string {
  const name = kind === "sign-in" ? "SignIn" : kind === "sign-up" ? "SignUp" : "TwoFactor";
  const key = kind === "sign-in" ? "signIn" : kind === "sign-up" ? "signUp" : "twoFactor";
  return `"use client";
import type * as React from "react";
import ${router === "next" ? 'Link from "next/link"' : '{ Link } from "@tanstack/react-router"'};
import { ArrowLeft } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { use${name}Form } from "./use-${kind}-form";
import { ${name}Form } from "./components/${kind}-form";

export function ${name}Screen(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const state = use${name}Form();
  return <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14"><div className="flex w-full max-w-[440px] flex-col gap-8">
    <Link ${router === "next" ? "href" : "to"}="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />{t("${key}.backHome")}</Link>
    <${name}Form state={state} />
    <p className="mx-auto max-w-[48ch] text-center text-xs leading-5 text-muted-foreground">${kind === "sign-up" ? '{t("signUp.termsPrefix")} ' : ""}{t("${key}.securityNote")}</p>
  </div></main>;
}
`;
}

export function recoveryScreenContent(
  kind: "forgot-password" | "reset-password" | "magic-link" | "verify-email",
): string {
  if (kind === "reset-password")
    return `"use client";
import type * as React from "react";
import { useResetPasswordForm } from "./use-reset-password-form";
import { ResetPasswordForm } from "./components/reset-password-form";
import { ResetPasswordLoadingView } from "./components/reset-password-loading";
export function ResetPasswordScreen({ token, queryError }: { token: string; queryError: string | null }): React.JSX.Element {
  const state = useResetPasswordForm(token, queryError);
  return <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14"><ResetPasswordForm state={state} /></main>;
}
export function ResetPasswordLoading(): React.JSX.Element { return <ResetPasswordLoadingView />; }
`;
  if (kind === "forgot-password")
    return `"use client";
import type * as React from "react";
import { useForgotPasswordForm } from "./use-forgot-password-form";
import { ForgotPasswordView } from "./components/forgot-password-form";
export function ForgotPasswordScreen(): React.JSX.Element {
  const state = useForgotPasswordForm();
  return <ForgotPasswordView state={state} />;
}
`;
  const name = kind === "magic-link" ? "MagicLink" : "VerifyEmail";
  return `"use client";
import type * as React from "react";
import { useEmailFlowForm } from "./use-email-flow-form";
import { EmailFlowView } from "./components/${kind}-form";
export function ${name}Screen(): React.JSX.Element {
  const state = useEmailFlowForm("${kind}");
  return <EmailFlowView state={state} />;
}
`;
}

export function authFeatureTypesContent(hasEmail: boolean): string {
  return `import type { useAuthMethods } from "./use-auth-methods";
import type { useSignInForm } from "./use-sign-in-form";
import type { useSignUpForm } from "./use-sign-up-form";
export type AuthMethodsState = ReturnType<typeof useAuthMethods>;
export type SignInFormState = ReturnType<typeof useSignInForm>;
export type SignUpFormState = ReturnType<typeof useSignUpForm>;
${
  hasEmail
    ? `import type { useTwoFactorForm } from "./use-two-factor-form";
import type { useForgotPasswordForm } from "./use-forgot-password-form";
import type { useResetPasswordForm } from "./use-reset-password-form";
import type { useEmailFlowForm } from "./use-email-flow-form";
export type TwoFactorFormState = ReturnType<typeof useTwoFactorForm>;
export type ForgotPasswordFormState = ReturnType<typeof useForgotPasswordForm>;
export type ResetPasswordFormState = ReturnType<typeof useResetPasswordForm>;
export type EmailFlowFormState = ReturnType<typeof useEmailFlowForm>;`
    : ""
}
`;
}
