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
              <Link href="/2fa" asChild><Button variant="outline"><Text>Two-factor</Text></Button></Link>
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
import { useEffect, useState } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Sub = { id: string; provider: string; status: string; };
type Inv = { id: string; provider: string; amount: number; currency?: string; status: string; paid: boolean; };

export default function BillingScreen(): React.JSX.Element {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Use oRPC client via fetch with auth cookie; fallback to unauthenticated gracefully
        const { orpc } = await import("@/lib/orpc");
        // orpc is RPCLink-based; for billing we call via orpc.billing.list if available, else fallback fetch with auth header
        const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_APP_URL ?? "http://localhost:3000";
        const { authClient } = await import("@/lib/auth-client");
        const cookie = await authClient.getCookie();
        const headers: Record<string, string> = cookie ? { cookie } : {};
        const r = await fetch(baseUrl + "/api/rpc/billing.subscriptions", { headers });
        if (r.ok) {
          const d = await r.json() as { subscriptions?: Sub[]; invoices?: Inv[]; result?: { subscriptions?: Sub[]; invoices?: Inv[] } };
          const payload = (d as unknown as { result?: unknown }).result ?? d;
          const subsData = (payload as { subscriptions?: Sub[] }).subscriptions;
          const invsData = (payload as { invoices?: Inv[] }).invoices;
          if (mounted) { if (subsData) setSubs(subsData); if (invsData) setInvs(invsData); }
        } else {
          // fallback to legacy REST for backwards compat
          const legacy = await fetch(baseUrl + "/api/billing/subscriptions", { headers });
          if (legacy.ok) {
            const d = await legacy.json() as { subscriptions?: Sub[]; invoices?: Inv[] };
            if (mounted) { if (d.subscriptions) setSubs(d.subscriptions); if (d.invoices) setInvs(d.invoices); }
          }
        }
      } catch (e) { if (mounted) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  async function handleCheckout(provider: string): Promise<void> {
    setCheckoutLoading(true); setError(null);
    try {
      const { Linking: LinkingForUrls } = await import("expo-linking");
      // Use app-internal billing route as success fallback (no dedicated success screen needed)
      const successUrl = LinkingForUrls.createURL("/billing?checkout=success");
      const failureUrl = LinkingForUrls.createURL("/billing?checkout=cancel");
      const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_APP_URL ?? "http://localhost:3000";
      const { authClient } = await import("@/lib/auth-client");
      const cookie = await authClient.getCookie();
      const headers: Record<string, string> = { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) };
      const r = await fetch(baseUrl + "/api/rpc/billing.createCheckout", { method: "POST", headers, body: JSON.stringify({ provider, priceId: "price_demo", successUrl, failureUrl }) });
      if (!r.ok) {
        // fallback legacy REST
        const legacy = await fetch(baseUrl + "/api/billing/checkout", { method: "POST", headers, body: JSON.stringify({ provider, priceId: "price_demo", successUrl, failureUrl }) });
        if (!legacy.ok) throw new Error(await legacy.text());
        const data = await legacy.json() as { url?: string; checkout_url?: string };
        const url = data.url ?? data.checkout_url;
        if (url) { const { Linking } = await import("expo-linking"); await Linking.openURL(url); }
        return;
      }
      const data = await r.json() as { url?: string; checkout_url?: string; result?: { url?: string } };
      const url = data.url ?? data.checkout_url ?? (data as unknown as { result?: { url?: string } }).result?.url;
      if (url) { const { Linking } = await import("expo-linking"); await Linking.openURL(url); }
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout failed"); } finally { setCheckoutLoading(false); }
  }

  const hasSubs = subs.length > 0;
  const pastDue = subs.some((s) => s.status === "past_due");

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-5 gap-5 max-w-[960px] w-full self-center">
        <View className="flex-row justify-between items-center">
          <View className="gap-1">
            <Text className="text-2xl font-bold tracking-tight">Billing</Text>
            <Text className="text-sm text-muted-foreground">Manage your subscriptions.</Text>
          </View>
          <Link href="/dashboard" asChild><Button variant="outline"><Text>Dashboard</Text></Button></Link>
        </View>
        <View className="h-px bg-border" />
        {loading ? <View className="p-8 items-center"><ActivityIndicator /><Text className="text-sm text-muted-foreground mt-2">Loading subscriptions…</Text></View> : hasSubs ? (
          <View className="gap-4">
            <Card>
              <CardHeader><View className="flex-row justify-between items-center"><CardTitle>Subscriptions</CardTitle><Badge variant={pastDue ? "destructive" : "secondary"}><Text>{pastDue ? "past due" : subs.length + " active"}</Text></Badge></View><CardDescription>Your active subscriptions across providers</CardDescription></CardHeader>
              <CardContent className="gap-2">
                {subs.map((s) => (
                  <View key={s.id} className="flex-row justify-between items-center border border-border rounded-lg px-3 py-2">
                    <View className="flex-row items-center gap-2"><Badge variant="secondary"><Text className="text-xs">{s.provider}</Text></Badge><Text className="font-mono text-xs">{s.status}</Text></View>
                  </View>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Invoices</CardTitle><CardDescription>Recent invoices</CardDescription></CardHeader>
              <CardContent className="gap-2">
                {invs.length===0 ? <Text className="text-sm text-muted-foreground">No invoices.</Text> : invs.map((inv) => (
                  <View key={inv.id} className="flex-row justify-between items-center border border-border rounded-lg px-3 py-2">
                    <Text className="text-sm">{inv.provider} — {inv.amount} {inv.currency ?? ""}</Text><Badge variant={inv.paid ? "secondary" : "destructive"}><Text className="text-xs">{inv.status}</Text></Badge>
                  </View>
                ))}
              </CardContent>
            </Card>
          </View>
        ) : (
          <Card>
            <CardHeader><CardTitle>No subscriptions</CardTitle><CardDescription>Start a checkout with any provider. Entitlement is checked server-side via oRPC.</CardDescription></CardHeader>
            <CardContent className="gap-3">
              {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
              <View className="flex-row flex-wrap gap-2">
                <Button size="sm" disabled={checkoutLoading} onPress={() => void handleCheckout("stripe")}><Text>Stripe checkout</Text></Button>
                <Button size="sm" variant="outline" disabled={checkoutLoading} onPress={() => void handleCheckout("chargily")}><Text>Chargily (EDAHABIA/CIB)</Text></Button>
                <Button size="sm" variant="outline" disabled={checkoutLoading} onPress={() => void handleCheckout("paddle")}><Text>Paddle</Text></Button>
                <Button size="sm" variant="outline" disabled={checkoutLoading} onPress={() => void handleCheckout("polar")}><Text>Polar</Text></Button>
              </View>
            </CardContent>
          </Card>
        )}
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
