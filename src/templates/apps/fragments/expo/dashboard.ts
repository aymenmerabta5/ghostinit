/**
 * Expo dashboard, settings, billing, not-found fragments - RNR + Uniwind className
 */

export function expoDashboardContent(): string {
  return `import * as React from "react";
import { View, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  if (isPending) {
    return <View className="flex-1 bg-background items-center justify-center"><ActivityIndicator /></View>;
  }

  if (!user) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6 gap-3">
        <Text className="text-xl font-bold">Not signed in</Text>
        <Text className="text-sm text-muted-foreground">Please sign in to access dashboard.</Text>
        <View className="mt-4"><Link href="/sign-in" asChild><Button><Text>Sign in</Text></Button></Link></View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-5 gap-5 max-w-[960px] w-full self-center">
        <View className="gap-1">
          <View className="flex-row justify-between items-center">
            <Text className="text-2xl font-bold tracking-tight">Dashboard</Text>
            <View className="flex-row gap-2">
              <Link href="/settings" asChild><Button variant="outline" size="sm"><Text>Settings</Text></Button></Link>
              <Pressable onPress={async () => { await authClient.signOut(); router.replace("/"); }} className="border border-border rounded-lg px-3 h-9 items-center justify-center"><Text className="text-sm">Sign out</Text></Pressable>
            </View>
          </View>
          <Text className="text-sm text-muted-foreground">Welcome back. Manage your account, billing, and modules.</Text>
        </View>
        <View className="h-px bg-border" />
        <View className="gap-3">
          <Card>
            <CardHeader>
              <View className="flex-row justify-between items-center">
                <CardTitle>Profile</CardTitle>
                <Badge><Text>{String(user?.role ?? "user")}</Text></Badge>
              </View>
              <CardDescription>Signed in as {String(user?.email ?? "")}. Name {String(user?.name ?? "not set")}.</CardDescription>
            </CardHeader>
            <CardContent>
              <View className="flex-row flex-wrap gap-2">
                <Link href="/settings" asChild><Button variant="outline" size="sm"><Text>Edit profile</Text></Button></Link>
                <Link href="/billing" asChild><Button variant="outline" size="sm"><Text>Billing</Text></Button></Link>
              </View>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-2">
                <Link href="/settings" asChild><Button variant="outline"><Text>Security & 2FA</Text></Button></Link>
                <Link href="/billing" asChild><Button variant="outline"><Text>Manage billing</Text></Button></Link>
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

export function expoSettingsContent(): string {
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

export default function SettingsScreen(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  async function handleSave(): Promise<void> {
    setSaved(null);
    try {
      const res = await (authClient as unknown as { updateUser?: (data: { name: string }) => Promise<{ error?: { message?: string } | null }> }).updateUser?.({ name });
      const r = res as unknown as { error?: { message?: string } | null } | undefined;
      if (r?.error) {
        setSaved(r.error.message ?? "Failed to save");
      } else {
        setSaved("Saved");
      }
    } catch (e) {
      setSaved(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-5 gap-5 max-w-[960px] w-full self-center">
        <View className="gap-1">
          <Text className="text-2xl font-bold tracking-tight">Settings</Text>
          <Text className="text-sm text-muted-foreground">Manage your account preferences.</Text>
        </View>
        <View className="h-px bg-border" />
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Signed in as {String(user?.email ?? "")}.</CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="gap-2">
              <Label>Name</Label>
              <Input value={name} onChangeText={setName} placeholder="Your name" />
            </View>
            {saved ? <Text className="text-xs text-primary">{saved}</Text> : null}
            <Button onPress={handleSave}><Text>Save</Text></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage password and 2FA from web. Mobile uses SecureStore tokens.</CardDescription>
          </CardHeader>
          <CardContent className="gap-2">
            <View className="flex-row flex-wrap gap-2">
              <Link href="/(auth)/forgot-password" asChild><Button variant="outline"><Text>Reset password</Text></Button></Link>
              <Link href="/two-factor" asChild><Button variant="outline"><Text>Two-factor</Text></Button></Link>
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
`;
}

export function expoBillingContent(): string {
  return `import * as React from "react";
import { View, ScrollView } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function BillingScreen(): React.JSX.Element {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-5 gap-5 max-w-[960px] w-full self-center">
        <View className="flex-row justify-between items-center">
          <View className="gap-1">
            <Text className="text-2xl font-bold tracking-tight">Billing</Text>
            <Text className="text-sm text-muted-foreground">Flexible billing — stripe, chargily, paddle, polar.</Text>
          </View>
          <Link href="/dashboard" asChild><Button variant="outline"><Text>Dashboard</Text></Button></Link>
        </View>
        <View className="h-px bg-border" />
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>Idempotent webhook handling. Manage via web portal.</CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="bg-secondary/50 border border-border rounded-xl p-4 items-center gap-2">
              <Text className="font-semibold text-sm">No billing configured</Text>
              <Text className="text-xs text-muted-foreground text-center">Open web billing portal to manage subscriptions.</Text>
              <View className="flex-row flex-wrap gap-2 mt-2">
                <Badge variant="secondary"><Text className="text-xs">stripe</Text></Badge>
                <Badge variant="secondary"><Text className="text-xs">chargily</Text></Badge>
                <Badge variant="secondary"><Text className="text-xs">paddle</Text></Badge>
                <Badge variant="secondary"><Text className="text-xs">polar</Text></Badge>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
`;
}

export function expoNotFoundContent(): string {
  return `import * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

export default function NotFoundScreen(): React.JSX.Element {
  return (
    <View className="flex-1 bg-background items-center justify-center p-6 gap-3">
      <Text className="text-2xl font-bold tracking-tight">Not found</Text>
      <Text className="text-sm text-muted-foreground">This screen does not exist.</Text>
      <View className="mt-3">
        <Link href="/" asChild><Button><Text>Go home</Text></Button></Link>
      </View>
    </View>
  );
}
`;
}
