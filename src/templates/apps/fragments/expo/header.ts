/**
 * Expo header + sign-out fragments - RNR + Uniwind className, no StyleSheet, no hardcoded hex
 */

export function expoHeaderContent(hasI18n = false, hasEve = false, hasPdf = false): string {
  const i18nImport = hasI18n ? 'import { LocaleSwitcher, useTranslations } from "@/lib/i18n";' : "";
  const i18nHook = hasI18n ? '  const t = useTranslations("header");\n' : "";
  const label = (key: string, fallback: string): string => (hasI18n ? `{t("${key}")}` : fallback);
  return `import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
${i18nImport}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\\s+/);
    if (parts.length >= 2) return \`\${parts[0][0]}\${parts[parts.length - 1][0]}\`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "U";
}

export function Header(): React.JSX.Element {
${i18nHook}  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const isAuthed = !!user;
  const initials = getInitials(user?.name, user?.email);

  return (
    <View className="border-b border-border bg-background">
      <View className="min-h-14 flex-row items-center justify-between px-4">
        <View className="flex-row items-center gap-3">
          <Link href="/" asChild>
            <Button variant="ghost" size="sm" accessibilityLabel={${hasI18n ? 't("home")' : '"GhostInit home"'}}><Text className="text-sm font-bold tracking-tight">${label("productName", "GhostInit")}</Text></Button>
          </Link>
          <Badge><Text className="text-[10px]">${label("productBadge", "mobile")}</Text></Badge>
        </View>
        <View className="flex-row items-center gap-2">
          ${hasI18n ? "<LocaleSwitcher />" : ""}
          {isPending ? (
            <Skeleton accessibilityLabel={${hasI18n ? 't("userMenu")' : '"Loading account"'}} className="size-11 rounded-full" />
          ) : isAuthed ? (
            <Button size="icon" variant="secondary" accessibilityLabel={${hasI18n ? 't("userMenu")' : '"Open account settings"'}} onPress={() => router.push("/settings")}><Text className="text-[11px] font-bold">{initials}</Text></Button>
          ) : (
            <View className="flex-row gap-2">
              <Link href="/sign-in" asChild><Button variant="outline" size="sm"><Text>${label("signIn", "Sign in")}</Text></Button></Link>
              <Link href="/sign-up" asChild><Button size="sm"><Text>${label("signUp", "Sign up")}</Text></Button></Link>
            </View>
          )}
        </View>
      </View>
      {isAuthed ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1 px-4 pb-2">
          <Link href="/dashboard" asChild><Button variant="ghost" size="sm"><Text>${label("dashboard", "Dashboard")}</Text></Button></Link>
          ${hasEve ? `<Link href="/agent" asChild><Button variant="ghost" size="sm"><Text>${label("agent", "Agent")}</Text></Button></Link>` : ""}
          ${hasPdf ? `<Link href="/pdf" asChild><Button variant="ghost" size="sm"><Text>${label("pdf", "PDF")}</Text></Button></Link>` : ""}
          <Link href="/billing" asChild><Button variant="ghost" size="sm"><Text>${label("billing", "Billing")}</Text></Button></Link>
          <Link href="/settings" asChild><Button variant="ghost" size="sm"><Text>${label("settings", "Settings")}</Text></Button></Link>
        </ScrollView>
      ) : null}
    </View>
  );
}
`;
}

export function expoSignOutButtonContent(hasI18n = false): string {
  const i18nImport = hasI18n ? 'import { useTranslations } from "@/lib/i18n";' : "";
  const i18nHook = hasI18n ? '  const t = useTranslations("navigation");\n' : "";
  const label = hasI18n ? 't("signOut")' : '"Sign out"';
  return `import * as React from "react";
import { useRouter } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
${i18nImport}

export function SignOutButton(): React.JSX.Element {
${i18nHook}  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut(): Promise<void> {
    setPending(true);
    try { await authClient.signOut(); } finally { setPending(false); router.replace("/"); }
  }

  return <Button size="sm" variant="outline" accessibilityLabel={${label}} isLoading={pending} onPress={handleSignOut} disabled={pending}>{${label}}</Button>;
}
`;
}
