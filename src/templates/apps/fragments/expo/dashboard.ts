import { file, type TemplateFile } from "../../../shared.js";
import { expoSettingsRouteContent } from "../settings/native-expo.js";
/**
 * Expo dashboard, settings, billing, not-found fragments - RNR + Uniwind className
 */
import { nativeI18nTemplate } from "../native-i18n.js";

export function expoDashboardContent(hasI18n = false, hasCapabilityNavigation = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "dashboard");
  const navigation = nativeI18nTemplate(hasI18n, "navigation");
  const navigationHook =
    hasI18n && hasCapabilityNavigation
      ? navigation.hookLine.replace("const t", "const navigationT")
      : "";
  const signedInDescription = hasI18n
    ? '{t("identity.signedInAs", { email: String(user?.email ?? ""), name: String(user?.name ?? t("identity.nameNotSet")) })}'
    : 'Signed in as {String(user?.email ?? "")}. Name {String(user?.name ?? "not set")}.';
  return `import * as React from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { SignOutButton } from "@/components/sign-out-button";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
${i18n.importLine}

function authUserRole(value: unknown): string {
  if (typeof value !== "object" || value === null) return "user";
  const role = Reflect.get(value, "role");
  return typeof role === "string" ? role : "user";
}

export default function DashboardScreen(): React.JSX.Element {
${i18n.hookLine}
${navigationHook}
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  if (isPending) {
    return <View className="flex-1 bg-background items-center justify-center"><ActivityIndicator /></View>;
  }

  if (!user) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6 gap-3">
        <Text className="text-xl font-bold">${i18n.child("unauthenticatedTitle", "Not signed in")}</Text>
        <Text className="text-sm text-muted-foreground">${i18n.child("unauthenticatedDescription", "Please sign in to access dashboard.")}</Text>
        <View className="mt-4"><Link href="/sign-in" asChild><Button><Text>${i18n.child("signIn", "Sign in")}</Text></Button></Link></View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-5 gap-5 max-w-[960px] w-full self-center">
        <View className="gap-1">
          <View className="flex-row justify-between items-center">
            <Text className="text-2xl font-bold tracking-tight">${i18n.child("title", "Dashboard")}</Text>
            <View className="flex-row gap-2">
              <Link href="/settings" asChild><Button variant="outline" size="sm"><Text>${i18n.child("header.settings", "Settings")}</Text></Button></Link>
              <SignOutButton />
            </View>
          </View>
          <Text className="text-sm text-muted-foreground">${i18n.child("single.description", "Welcome back. Manage your account, billing, and modules.")}</Text>
        </View>
        <View className="h-px bg-border" />
        <View className="gap-3">
          <Card>
            <CardHeader>
              <View className="flex-row justify-between items-center">
                <CardTitle>${i18n.child("single.profileTitle", "Profile")}</CardTitle>
                <Badge><Text>{authUserRole(user)}</Text></Badge>
              </View>
              <CardDescription>${signedInDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <View className="flex-row flex-wrap gap-2">
                <Link href="/settings" asChild><Button variant="outline" size="sm"><Text>${i18n.child("identity.editProfile", "Edit profile")}</Text></Button></Link>
                <Link href="/billing" asChild><Button variant="outline" size="sm"><Text>${i18n.child("identity.billing", "Billing")}</Text></Button></Link>
              </View>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>${i18n.child("actions.title", "Quick actions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-2">
                <Link href="/settings" asChild><Button variant="outline"><Text>${i18n.child("actions.security", "Security & 2FA")}</Text></Button></Link>
                <Link href="/billing" asChild><Button variant="outline"><Text>${i18n.child("actions.manageBilling", "Manage billing")}</Text></Button></Link>
              </View>
            </CardContent>
          </Card>
        </View>
      </View>
    </ScrollView>
  );
}
`;
}

export function expoSettingsContent(_hasI18n = false, _hasEmail = true): string {
  return expoSettingsRouteContent();
}

function expoNotFoundScreenContent(hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "errors");
  return `import * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
${i18n.importLine}

export function NotFoundScreen(): React.JSX.Element {
${i18n.hookLine}
  return (
    <View className="flex-1 bg-background items-center justify-center p-6 gap-3">
      <Text className="text-2xl font-bold tracking-tight">${i18n.child("notFoundTitle", "Not found")}</Text>
      <Text className="text-sm text-muted-foreground">${i18n.child("notFoundDescription", "This screen does not exist.")}</Text>
      <View className="mt-3">
        <Link href="/" asChild><Button><Text>${i18n.child("backHome", "Go home")}</Text></Button></Link>
      </View>
    </View>
  );
}
`;
}

export function expoNotFoundContent(_hasI18n = false): string {
  return 'export { NotFoundScreen as default } from "@/features/system/not-found";\n';
}
export function expoSystemFiles(packageRoot: string, hasI18n: boolean): TemplateFile[] {
  const prefix = packageRoot ? packageRoot + "/" : "";
  return [
    file(`${prefix}app/+not-found.tsx`, expoNotFoundContent(hasI18n)),
    file(`${prefix}src/features/system/not-found.tsx`, expoNotFoundScreenContent(hasI18n)),
  ];
}
