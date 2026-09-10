import { file, type TemplateFile } from "../../../shared.js";
import type { IdentityWorkspaceMode } from "../identity-workspace/model.js";
import { accountDeletionFeatureFiles } from "./deletion-feature.js";
import { accountDeletionWorkflowContent, settingsWorkflowFiles } from "./feature-workflows.js";
import { settingsFeatureModelContent, settingsFeatureMutationsContent } from "./feature-data.js";
import { nativeSettingsQueriesContent } from "./native-data.js";
import { expoDeletionViewContent, expoSettingsViews } from "./native-expo-views.js";

export function expoSettingsRouteContent(): string {
  return 'export { SettingsScreen as default } from "@/features/settings/settings-screen";\n';
}

export function expoSettingsFeatureFiles(
  mode: IdentityWorkspaceMode,
  hasApi: boolean,
  hasEmail: boolean,
): TemplateFile[] {
  const sourceRoot = mode === "monorepo" ? "apps/mobile/src" : "src";
  const root = `${sourceRoot}/features/settings`;
  return [
    file(`${root}/model.ts`, settingsFeatureModelContent()),
    file(`${root}/queries.ts`, nativeSettingsQueriesContent(hasApi)),
    file(
      `${root}/mutations.ts`,
      settingsFeatureMutationsContent("tanstack", hasApi, hasApi && hasEmail, false),
    ),
    ...settingsWorkflowFiles(root, "tanstack", hasApi, hasApi && hasEmail, true),
    ...expoSettingsViews(root, hasApi, hasEmail),
    ...(hasApi
      ? accountDeletionFeatureFiles(sourceRoot, "tanstack", hasEmail).map((entry) => {
          if (entry.path.endsWith("/use-account-deletion.ts"))
            return file(entry.path, accountDeletionWorkflowContent("expo", hasEmail));
          if (entry.path.endsWith("/components/danger-zone-view.tsx"))
            return file(entry.path, expoDeletionViewContent(hasEmail));
          return entry;
        })
      : []),
    file(
      `${root}/settings-screen.tsx`,
      `import type * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSettingsIdentityQuery } from "./queries";
import { useProfileForm } from "./use-profile-form";
import { ProfileView } from "./components/profile-view";
import type { SettingsUser } from "./model";
${
  hasApi && hasEmail
    ? `import { usePasswordForm } from "./use-password-form";
import { useTwoFactorSettings } from "./use-two-factor-settings";
import { PasswordView } from "./components/password-view";
import { TwoFactorView } from "./components/two-factor-view";`
    : ""
}
${
  hasApi
    ? `import { useIdentitySessions } from "./use-identity-sessions";
import { SessionsView } from "./components/sessions-view";
import { DangerZoneCard } from "@/features/account-deletion/account-deletion";`
    : ""
}

export function SettingsScreen(): React.JSX.Element {
  const identity = useSettingsIdentityQuery();
  const t = useSurfaceTranslations("settings");
  const errors = useSurfaceTranslations("errors");
  const common = useSurfaceTranslations("common");
  if (identity.isPending) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (identity.error) return <View className="flex-1 items-center justify-center gap-3 p-6"><Alert accessibilityRole="alert" variant="destructive"><AlertTitle>{errors("genericTitle")}</AlertTitle><AlertDescription>{errors("genericDescription")}</AlertDescription></Alert><Button onPress={() => void identity.retry()}><Text>{common("retry")}</Text></Button></View>;
  if (!identity.user) return <View className="flex-1 items-center justify-center gap-3 p-6"><Text className="text-2xl font-bold">{t("native.signInRequired")}</Text><Link href="/(auth)/sign-in" asChild><Button><Text>{t("native.signIn")}</Text></Button></Link></View>;
  return <SettingsPanels key={identity.user.id + ":" + identity.sessionId} user={identity.user} />;
}
function SettingsPanels({ user }: { user: SettingsUser }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  return <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic"><View className="w-full max-w-[760px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-xs font-semibold text-primary">{t("native.kicker")}</Text><Text className="text-3xl font-bold">{t("title")}</Text><Text className="text-sm text-muted-foreground">{t("description")}</Text></View>
    ${hasApi ? '<View className="flex-row flex-wrap gap-2"><Link href="/workspace" asChild><Button variant="outline"><Text>{t("native.organizations")}</Text></Button></Link>{user.role === "admin" || user.role === "superAdmin" ? <Link href="/admin" asChild><Button variant="outline"><Text>{t("admin")}</Text></Button></Link> : null}</View>' : ""}
    <ProfileSection key={user.id} user={user} />
    ${hasApi && hasEmail ? "<PasswordSection /><TwoFactorSection />" : ""}
    ${hasEmail ? '<View className="flex-row gap-2"><Link href="/(auth)/forgot-password" asChild><Button variant="outline"><Text>{t("native.forgotPassword")}</Text></Button></Link><Link href="/2fa" asChild><Button variant="outline"><Text>{t("twoFactor.title")}</Text></Button></Link></View>' : ""}
    ${hasApi ? "<SessionsSection /><DangerZoneCard />" : ""}
  </View></ScrollView>;
}
function ProfileSection({ user }: { user: SettingsUser }): React.JSX.Element {
  const model = useProfileForm(user.name ?? "");
  return <ProfileView model={model} email={user.email} />;
}
${
  hasApi && hasEmail
    ? `function PasswordSection(): React.JSX.Element {
  const model = usePasswordForm(); return <PasswordView model={model} />;
}
function TwoFactorSection(): React.JSX.Element {
  const model = useTwoFactorSettings(); return <TwoFactorView model={model} />;
}`
    : ""
}
${
  hasApi
    ? `function SessionsSection(): React.JSX.Element {
  const model = useIdentitySessions({}); return <SessionsView model={model} />;
}`
    : ""
}
`,
    ),
  ];
}
