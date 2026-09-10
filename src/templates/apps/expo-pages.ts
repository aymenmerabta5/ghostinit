import { expoSettingsFeatureFiles } from "./fragments/settings/native-expo.js";
import { file, type TemplateFile } from "../shared.js";
import { expoRootLayoutContent, expoProviderFiles } from "./fragments/expo/layout.js";
import { expoMarketingFiles } from "./fragments/expo/marketing.js";
import { expoAuthFeatureFiles } from "./fragments/auth/native.js";
import {
  expoDashboardContent,
  expoSettingsContent,
  expoSystemFiles,
} from "./fragments/expo/dashboard.js";
import { nativeBillingFeatureFiles } from "./fragments/billing/native.js";
import { billingMoneyFile } from "../billing/ui/money.js";
import { manualMobileFeatureFiles } from "../billing/ui/manual/mobile.js";
import { authOwnedEffectFile } from "./fragments/auth-owned-effect.js";
import { authOwnedMutationFile } from "./fragments/auth-owned-mutation.js";
import {
  expoFullSettingsContent,
  expoIdentityWorkspaceFiles,
} from "./fragments/identity-workspace/index.js";
import {
  resolveExpoBillingProviders,
  resolveExpoCapabilities,
  type ExpoCapabilities,
  type ExpoFeatureInput,
} from "./expo-core.js";

function expoDashboardScreenContent(capabilities: ExpoCapabilities): string {
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

export function expoDashboardPageContent(_capabilities: ExpoCapabilities): string {
  return 'export { DashboardScreen as default } from "@/features/dashboard/screen";\n';
}
export function expoDashboardFeatureFiles(
  sourceRoot: string,
  capabilities: ExpoCapabilities,
): TemplateFile[] {
  const root = `${sourceRoot}/features/dashboard`;
  let screen = expoDashboardScreenContent(capabilities);
  const modelStart = screen.indexOf("function authUserRole(");
  const modelEnd = screen.indexOf("export default function DashboardScreen", modelStart);
  const model = screen
    .slice(modelStart, modelEnd)
    .replace("function authUserRole", "export function authUserRole");
  screen = screen.slice(0, modelStart) + screen.slice(modelEnd);
  screen = screen
    .replace(
      'import { authClient } from "@/lib/auth-client";',
      'import { useDashboardIdentity } from "./queries";\nimport { authUserRole } from "./model";',
    )
    .replace("export default function DashboardScreen", "export function DashboardScreen")
    .replace(
      "  const { data: session, isPending } = authClient.useSession();\n  const user = session?.user;",
      "  const { user, isPending } = useDashboardIdentity();",
    );
  return [
    file(`${root}/screen.tsx`, screen),
    file(`${root}/model.ts`, model),
    file(
      `${root}/queries.ts`,
      `import { authClient } from "@/lib/auth-client";
export function useDashboardIdentity() {
  const { data: session, isPending } = authClient.useSession();
  return { user: session?.user, isPending };
}
`,
    ),
  ];
}

export function expoPageFiles(input: ExpoFeatureInput = false): TemplateFile[] {
  const capabilities = resolveExpoCapabilities(input, true);
  const selectedBilling = resolveExpoBillingProviders(input);
  const files: TemplateFile[] = [
    file("apps/mobile/app/_layout.tsx", expoRootLayoutContent(capabilities)),
    ...expoProviderFiles("apps/mobile/src", capabilities),
    ...expoMarketingFiles("apps/mobile", {
      hasAuth: capabilities.hasAuth,
      hasApi: capabilities.hasApi,
      hasBilling: capabilities.hasBilling,
      hasI18n: capabilities.hasI18n,
    }),
    ...expoSystemFiles("apps/mobile", capabilities.hasI18n),
  ];

  if (capabilities.hasAuth) {
    files.push(...expoSettingsFeatureFiles("monorepo", capabilities.hasApi, capabilities.hasEmail));
    files.push(
      ...expoAuthFeatureFiles("monorepo", capabilities.hasEmail, capabilities.hasI18n),
      file("apps/mobile/app/dashboard.tsx", expoDashboardPageContent(capabilities)),
      ...expoDashboardFeatureFiles("apps/mobile/src", capabilities),
      file(
        "apps/mobile/app/settings.tsx",
        capabilities.hasApi
          ? expoFullSettingsContent("monorepo", capabilities.hasI18n, capabilities.hasEmail)
          : expoSettingsContent(capabilities.hasI18n, capabilities.hasEmail),
      ),
    );
    if (capabilities.hasApi)
      files.push(...expoIdentityWorkspaceFiles("monorepo", capabilities.hasI18n));
  }
  if (
    capabilities.hasAuth ||
    capabilities.hasBilling ||
    capabilities.hasNotifications ||
    capabilities.hasJobs ||
    capabilities.hasStorage ||
    capabilities.hasFeatureFlags ||
    capabilities.hasPdf
  ) {
    files.push(authOwnedEffectFile("apps/mobile/src"));
    files.push(authOwnedMutationFile("apps/mobile/src"));
  }
  if (capabilities.hasBilling) {
    files.push(
      ...(selectedBilling.includes("manual")
        ? manualMobileFeatureFiles("monorepo", capabilities.hasI18n)
        : []),
      billingMoneyFile("apps/mobile/src"),
      ...nativeBillingFeatureFiles("expo", "monorepo", selectedBilling, capabilities.hasI18n),
    );
  }

  return files;
}
