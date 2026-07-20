/**
 * Expo header + sign-out fragments - RNR + Uniwind className, no StyleSheet, no hardcoded hex
 */

export function expoHeaderContent(): string {
  return `import * as React from "react";
import { View, Pressable } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const isAuthed = !!user;
  const initials = getInitials(user?.name, user?.email);

  return (
    <View className="border-b border-border bg-background/95">
      <View className="flex-row items-center justify-between px-5 h-14">
        <View className="flex-row items-center gap-3">
          <Link href="/" asChild>
            <Pressable><Text className="text-sm font-bold tracking-tight">GhostInit</Text></Pressable>
          </Link>
          <Badge><Text className="text-[10px]">mobile</Text></Badge>
          {isAuthed ? (
            <View className="flex-row gap-2 ml-2">
              <Link href="/dashboard" asChild><Button variant="ghost" size="sm"><Text>Dashboard</Text></Button></Link>
              <Link href="/billing" asChild><Button variant="ghost" size="sm"><Text>Billing</Text></Button></Link>
              <Link href="/settings" asChild><Button variant="ghost" size="sm"><Text>Settings</Text></Button></Link>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          {isPending ? (
            <View className="w-8 h-8 rounded-full bg-muted" />
          ) : isAuthed ? (
            <Pressable onPress={() => router.push("/settings")} className="w-8 h-8 rounded-full bg-foreground items-center justify-center">
              <Text className="text-background text-[11px] font-bold">{initials}</Text>
            </Pressable>
          ) : (
            <View className="flex-row gap-2">
              <Link href="/sign-in" asChild><Button variant="outline" size="sm"><Text>Sign in</Text></Button></Link>
              <Link href="/sign-up" asChild><Button size="sm"><Text>Sign up</Text></Button></Link>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
`;
}

export function expoSignOutButtonContent(): string {
  return `import * as React from "react";
import { Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { Text } from "@/components/ui/text";

export function SignOutButton(): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut(): Promise<void> {
    setPending(true);
    try { await authClient.signOut(); } finally { setPending(false); router.replace("/"); }
  }

  return (
    <Pressable onPress={handleSignOut} disabled={pending} className="border border-border rounded-lg h-9 px-3 items-center justify-center bg-background">
      {pending ? <ActivityIndicator size="small" /> : <Text className="text-[13px] font-semibold">Sign out</Text>}
    </Pressable>
  );
}
`;
}
