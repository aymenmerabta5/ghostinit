import { file, type TemplateFile } from "../../../shared.js";
import type { RouterType } from "./imports.js";
import { identityPureClientFiles } from "./client-validation.js";
import { authOAuthButtonsContent } from "./controls.js";
import { signInFormContent } from "./sign-in.js";
import { signUpFormContent } from "./sign-up.js";
import { signInMethodsContent } from "./sign-in-methods.js";
import { twoFactorFormContent } from "./two-factor.js";
import {
  authFeatureTypesContent,
  authScreenContent,
  recoveryScreenContent,
} from "./feature-routes.js";
import {
  authIntentHookContent,
  authMethodsHookContent,
  authMutationsContent,
  authNavigationHookContent,
} from "./feature-actions.js";
import {
  signInFormHookContent,
  signUpFormHookContent,
  twoFactorFormHookContent,
} from "./form-workflows.js";
import {
  emailFlowHookContent,
  forgotPasswordHookContent,
  resetPasswordHookContent,
} from "./recovery-workflows.js";
import { forgotPasswordViewContent } from "../recovery/forgot-password.js";
import { resetPasswordFormContent } from "../recovery/reset-password-form.js";
import { emailFlowViewContent } from "../recovery/email-flows.js";

export interface AuthFeatureOptions {
  router: RouterType;
  sourceRoot?: string;
  hasEmail: boolean;
  hasPasskey: boolean;
  includePureClientFiles?: boolean;
}

export function authFeatureFiles({
  router,
  sourceRoot = "apps/web/src",
  hasEmail,
  hasPasskey,
  includePureClientFiles = true,
}: AuthFeatureOptions): TemplateFile[] {
  const base = sourceRoot + "/features/auth";
  const files: TemplateFile[] = [
    ...(includePureClientFiles ? identityPureClientFiles(sourceRoot) : []),
    file(base + "/mutations.ts", authMutationsContent(hasEmail, hasPasskey)),
    file(base + "/types.ts", authFeatureTypesContent(hasEmail)),
    file(base + "/use-auth-intent.ts", authIntentHookContent()),
    file(base + "/use-auth-methods.ts", authMethodsHookContent(hasPasskey)),
    file(base + "/use-auth-navigation.ts", authNavigationHookContent(router, hasEmail)),
    file(base + "/use-sign-in-form.ts", signInFormHookContent(hasEmail)),
    file(base + "/use-sign-up-form.ts", signUpFormHookContent(hasEmail)),
    file(base + "/sign-in-screen.tsx", authScreenContent(router, "sign-in")),
    file(base + "/sign-up-screen.tsx", authScreenContent(router, "sign-up")),
    file(base + "/components/oauth-buttons.tsx", authOAuthButtonsContent()),
    file(base + "/components/sign-in-methods.tsx", signInMethodsContent(router, hasPasskey)),
    file(base + "/components/sign-in-form.tsx", signInFormContent(router, hasEmail, hasPasskey)),
    file(base + "/components/sign-up-form.tsx", signUpFormContent(router, hasEmail)),
  ];
  if (hasEmail)
    files.push(
      file(base + "/two-factor-screen.tsx", authScreenContent(router, "two-factor")),
      file(base + "/use-two-factor-form.ts", twoFactorFormHookContent()),
      file(base + "/components/two-factor-form.tsx", twoFactorFormContent(router)),
      file(base + "/use-forgot-password-form.ts", forgotPasswordHookContent()),
      file(base + "/use-reset-password-form.ts", resetPasswordHookContent()),
      file(base + "/use-email-flow-form.ts", emailFlowHookContent()),
      file(base + "/forgot-password-screen.tsx", recoveryScreenContent("forgot-password")),
      file(base + "/reset-password-screen.tsx", recoveryScreenContent("reset-password")),
      file(base + "/magic-link-screen.tsx", recoveryScreenContent("magic-link")),
      file(base + "/verify-email-screen.tsx", recoveryScreenContent("verify-email")),
      file(base + "/components/forgot-password-form.tsx", forgotPasswordViewContent(router)),
      file(base + "/components/reset-password-form.tsx", resetPasswordFormContent(router)),
      file(base + "/components/reset-password-loading.tsx", resetPasswordLoadingContent()),
      file(base + "/components/magic-link-form.tsx", emailFlowViewContent("magic-link", router)),
      file(
        base + "/components/verify-email-form.tsx",
        emailFlowViewContent("verify-email", router),
      ),
    );
  return files;
}

function resetPasswordLoadingContent(): string {
  return `"use client";
import type * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
export function ResetPasswordLoadingView(): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  return <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14"><div className="w-full max-w-[440px]" role="status" aria-busy={true}><Card className="border-0 bg-transparent p-0 shadow-none"><CardHeader className="p-0 pb-6 sm:p-0 sm:pb-6"><CardTitle as="h1" className="text-3xl tracking-tight">{t("resetPassword.title")}</CardTitle><CardDescription>{t("resetPassword.loading")}</CardDescription></CardHeader><CardContent className="space-y-6 p-0 sm:p-0" aria-hidden={true}><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card></div></main>;
}
`;
}
