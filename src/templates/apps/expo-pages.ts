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
  expoNotFoundContent,
} from "./fragments/expo/dashboard.js";
import { expoBillingContent } from "./fragments/expo/billing.js";
import {
  expoFullSettingsContent,
  expoEmailFlowFiles,
  expoIdentityWorkspaceFiles,
} from "./fragments/identity-workspace/index.js";
import {
  resolveExpoBillingProviders,
  resolveExpoCapabilities,
  type ExpoCapabilities,
  type ExpoFeatureInput,
} from "./expo-core.js";

export function expoDashboardPageContent(capabilities: ExpoCapabilities): string {
  const hasCapabilityNavigation =
    capabilities.hasMessaging ||
    capabilities.hasNotifications ||
    capabilities.hasStorage ||
    capabilities.hasFeatureFlags ||
    capabilities.hasJobs ||
    capabilities.hasPdf ||
    capabilities.hasEve;
  let content = expoDashboardContent(capabilities.hasI18n, hasCapabilityNavigation);
  if (!capabilities.hasBilling) {
    content = content
      .replace(
        "Welcome back. Manage your account, billing, and modules.",
        "Welcome back. Manage your account and modules.",
      )
      .replace(
        '                <Link href="/billing" asChild><Button variant="outline" size="sm"><Text>Billing</Text></Button></Link>\n',
        "",
      )
      .replace(
        '                <Link href="/billing" asChild><Button variant="outline"><Text>Manage billing</Text></Button></Link>\n',
        "",
      )
      .replace(
        '                <Link href="/billing" asChild><Button variant="outline" size="sm"><Text>{t("identity.billing")}</Text></Button></Link>\n',
        "",
      )
      .replace(
        '                <Link href="/billing" asChild><Button variant="outline"><Text>{t("actions.manageBilling")}</Text></Button></Link>\n',
        "",
      );
  }
  const navigationLabel = (key: string, fallback: string): string =>
    capabilities.hasI18n ? `{navigationT("${key}")}` : fallback;
  const capabilityLinks = [
    capabilities.hasMessaging
      ? `                <Link href="/(app)/messages" asChild><Button variant="outline"><Text>${navigationLabel("messages", "Messages")}</Text></Button></Link>`
      : "",
    capabilities.hasNotifications
      ? `                <Link href="/notifications" asChild><Button variant="outline"><Text>${navigationLabel("notifications", "Notifications")}</Text></Button></Link>`
      : "",
    capabilities.hasStorage
      ? `                <Link href="/storage" asChild><Button variant="outline"><Text>${navigationLabel("storage", "Storage")}</Text></Button></Link>`
      : "",
    capabilities.hasFeatureFlags
      ? `                <Link href="/feature-flags" asChild><Button variant="outline"><Text>${navigationLabel("featureFlags", "Feature flags")}</Text></Button></Link>`
      : "",
    capabilities.hasJobs
      ? `                <Link href="/jobs" asChild><Button variant="outline"><Text>${navigationLabel("jobs", "Jobs")}</Text></Button></Link>`
      : "",
    capabilities.hasPdf
      ? `                <Link href="/pdf" asChild><Button variant="outline"><Text>${navigationLabel("pdf", "PDF")}</Text></Button></Link>`
      : "",
    capabilities.hasEve
      ? `                <Link href="/agent" asChild><Button variant="outline"><Text>${navigationLabel("agent", "Agent")}</Text></Button></Link>`
      : "",
  ].filter(Boolean);
  if (capabilityLinks.length > 0) {
    const settingsAction = capabilities.hasI18n
      ? '                <Link href="/settings" asChild><Button variant="outline"><Text>{t("actions.security")}</Text></Button></Link>'
      : '                <Link href="/settings" asChild><Button variant="outline"><Text>Security & 2FA</Text></Button></Link>';
    content = content.replace(settingsAction, `${capabilityLinks.join("\n")}\n${settingsAction}`);
  }
  return content;
}

export function expoPageFiles(input: ExpoFeatureInput = false): TemplateFile[] {
  const capabilities = resolveExpoCapabilities(input, true);
  const selectedBilling = resolveExpoBillingProviders(input);
  const files: TemplateFile[] = [
    file("apps/mobile/app/_layout.tsx", expoRootLayoutContent(capabilities)),
    file(
      "apps/mobile/app/index.tsx",
      buildExpoMarketingContent({
        hasAuth: capabilities.hasAuth,
        hasI18n: capabilities.hasI18n,
        reduceUnauthenticated: true,
      }),
    ),
    file("apps/mobile/app/+not-found.tsx", expoNotFoundContent(capabilities.hasI18n)),
  ];

  if (capabilities.hasAuth) {
    files.push(
      file(
        "apps/mobile/app/(auth)/sign-in.tsx",
        expoSignInContent(capabilities.hasEmail, capabilities.hasI18n),
      ),
      file(
        "apps/mobile/app/(auth)/sign-up.tsx",
        expoSignUpContent(capabilities.hasI18n, capabilities.hasEmail),
      ),
      ...(capabilities.hasEmail
        ? [file("apps/mobile/app/2fa.tsx", expoTwoFactorContent(capabilities.hasI18n))]
        : []),
      file("apps/mobile/app/dashboard.tsx", expoDashboardPageContent(capabilities)),
      file(
        "apps/mobile/app/settings.tsx",
        capabilities.hasApi
          ? expoFullSettingsContent("monorepo", capabilities.hasI18n, capabilities.hasEmail)
          : expoSettingsContent(capabilities.hasI18n, capabilities.hasEmail),
      ),
    );
    if (capabilities.hasEmail) {
      files.push(
        file(
          "apps/mobile/app/(auth)/forgot-password.tsx",
          expoForgotPasswordContent(capabilities.hasI18n),
        ),
        file(
          "apps/mobile/app/(auth)/reset-password.tsx",
          expoResetPasswordContent(capabilities.hasI18n),
        ),
      );
    }
    if (capabilities.hasApi)
      files.push(...expoIdentityWorkspaceFiles("monorepo", capabilities.hasI18n));
    if (capabilities.hasEmail) files.push(...expoEmailFlowFiles("monorepo", capabilities.hasI18n));
  }
  if (capabilities.hasBilling) {
    files.push(
      file(
        "apps/mobile/app/billing.tsx",
        expoBillingContent("monorepo", selectedBilling, capabilities.hasI18n),
      ),
    );
  }

  return files;
}
