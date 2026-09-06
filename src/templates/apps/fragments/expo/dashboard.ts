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

export function expoSettingsContent(hasI18n = false, hasEmail = true): string {
  const i18n = nativeI18nTemplate(hasI18n, "settings");
  const recovery = nativeI18nTemplate(hasI18n, "recovery");
  const recoveryHook =
    hasEmail && hasI18n ? recovery.hookLine.replace("const t", "const recoveryT") : "";
  const recoveryValue = (key: string, english: string): string =>
    hasI18n ? `recoveryT(${JSON.stringify(key)})` : JSON.stringify(english);
  const profileDescription = hasI18n
    ? '{t("profileDescription")}'
    : 'Signed in as {String(user?.email ?? "")}.';
  const securityCard = hasEmail
    ? `<Card>
          <CardHeader>
            <CardTitle>${i18n.child("securityTitle", "Security")}</CardTitle>
            <CardDescription>${i18n.child("securityDescription", "Manage password and two-factor authentication.")}</CardDescription>
          </CardHeader>
          <CardContent className="gap-2">
            <View className="flex-row flex-wrap gap-2">
              <Link href="/(auth)/forgot-password" asChild><Button variant="outline"><Text>{${recoveryValue("resetPassword.title", "Reset password")}}</Text></Button></Link>
              <Link href="/2fa" asChild><Button variant="outline"><Text>${i18n.child("twoFactor.title", "Two-factor authentication")}</Text></Button></Link>
            </View>
          </CardContent>
        </Card>`
    : "";
  return `import * as React from "react";
import { useState } from "react";
import { View, ScrollView } from "react-native";
import { Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
${i18n.importLine}

export default function SettingsScreen(): React.JSX.Element {
${i18n.hookLine}
${recoveryHook}
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  async function handleSave(): Promise<void> {
    setSaved(null);
    try {
      const res = await authClient.updateUser({ name });
      if (res.error) {
        setSaved(res.error.message ?? ${i18n.value("genericError", "Failed to save")});
      } else {
        setSaved(${i18n.value("successMessage", "Saved")});
      }
    } catch (e) {
      setSaved(${hasI18n ? i18n.value("genericError", "Failed to save") : 'e instanceof Error ? e.message : "Failed to save"'});
    }
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-5 gap-5 max-w-[960px] w-full self-center">
        <View className="gap-1">
          <Text className="text-2xl font-bold tracking-tight">${i18n.child("title", "Settings")}</Text>
          <Text className="text-sm text-muted-foreground">${i18n.child("description", "Manage your account preferences.")}</Text>
        </View>
        <View className="h-px bg-border" />
        <Card>
          <CardHeader>
            <CardTitle>${i18n.child("profileTitle", "Profile")}</CardTitle>
            <CardDescription>${profileDescription}</CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="gap-2">
              <Label>${i18n.child("nameLabel", "Name")}</Label>
              <Input value={name} onChangeText={setName} placeholder={${i18n.value("namePlaceholder", "Your name")}} />
            </View>
            {saved ? <Text className="text-xs text-primary">{saved}</Text> : null}
            <Button onPress={handleSave}><Text>${i18n.child("save", "Save")}</Text></Button>
          </CardContent>
        </Card>
        ${securityCard}
      </View>
    </ScrollView>
  );
}
`;
}

export function expoNotFoundContent(hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "errors");
  return `import * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
${i18n.importLine}

export default function NotFoundScreen(): React.JSX.Element {
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
