import { file, type TemplateFile } from "../shared.js";
import { expoRootLayoutContent } from "./fragments/expo/layout.js";
import { buildExpoMarketingContent } from "./fragments/expo/marketing.js";
import {
  expoSignInContent,
  expoSignUpContent,
  expoForgotPasswordContent,
  expoResetPasswordContent,
  expoTwoFactorContent,
} from "./fragments/expo/auth.js";
import {
  expoDashboardContent,
  expoSettingsContent,
  expoBillingContent,
  expoNotFoundContent,
} from "./fragments/expo/dashboard.js";

export function expoPageFiles(): TemplateFile[] {
  return [
    file("apps/mobile/app/_layout.tsx", expoRootLayoutContent()),
    file("apps/mobile/app/index.tsx", buildExpoMarketingContent()),
    file("apps/mobile/app/(auth)/sign-in.tsx", expoSignInContent()),
    file("apps/mobile/app/(auth)/sign-up.tsx", expoSignUpContent()),
    file("apps/mobile/app/(auth)/forgot-password.tsx", expoForgotPasswordContent()),
    file("apps/mobile/app/(auth)/reset-password.tsx", expoResetPasswordContent()),
    file("apps/mobile/app/2fa.tsx", expoTwoFactorContent()),
    file("apps/mobile/app/dashboard.tsx", expoDashboardContent()),
    file("apps/mobile/app/settings.tsx", expoSettingsContent()),
    file("apps/mobile/app/billing.tsx", expoBillingContent()),
    file("apps/mobile/app/+not-found.tsx", expoNotFoundContent()),
  ];
}
