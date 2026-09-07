// @allow-long 310: full native account settings surface with auth and typed session controls
import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import { mobilePath, type IdentityWorkspaceMode } from "./model.js";

export function expoFullSettingsContent(
  mode: IdentityWorkspaceMode = "monorepo",
  hasI18n = false,
  hasEmail = true,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "settings", nativeI18nImportPath("mobile", mode));
  const credentialState = hasEmail
    ? `  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [twoFactorPassword, setTwoFactorPassword] = React.useState("");
  const [deletePassword, setDeletePassword] = React.useState("");`
    : "";
  const twoFactorState = hasEmail
    ? `  const twoFactorEnabled = Boolean(user && typeof user === "object" && Reflect.get(user, "twoFactorEnabled") === true);`
    : "";
  const credentialCards = hasEmail
    ? `<Card><CardHeader><CardTitle>${i18n.child("password.title", "Password")}</CardTitle><CardDescription>${i18n.child("password.description", "Changing your password revokes other active sessions.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry maxLength={64} placeholder={${i18n.value("password.currentPasswordLabel", "Current password")}} /><Input value={newPassword} onChangeText={setNewPassword} secureTextEntry maxLength={64} placeholder={${i18n.value("password.newPasswordLabel", "New password")}} /><Button disabled={!currentPassword || newPassword.length < 8 || newPassword.length > 64} onPress={() => void run(async () => { const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }); if (result.error) throw new Error("Password change failed"); setCurrentPassword(""); setNewPassword(""); await invalidateSessions(); }, ${i18n.value("password.successMessage", "Password updated")}) }><Text>${i18n.child("password.submit", "Update password")}</Text></Button><Link href="/(auth)/forgot-password" asChild><Button variant="outline"><Text>${i18n.child("native.forgotPassword", "Forgot password")}</Text></Button></Link></CardContent></Card>

    <Card><CardHeader><View className="flex-row items-center justify-between"><CardTitle>${i18n.child("twoFactor.title", "Two-factor authentication")}</CardTitle><Badge><Text>{twoFactorEnabled ? ${i18n.value("twoFactor.enabled", "Enabled")} : ${i18n.value("twoFactor.disabled", "Disabled")}}</Text></Badge></View><CardDescription>${i18n.child("twoFactor.description", "Protect sign-in with a time-based one-time password.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={twoFactorPassword} onChangeText={setTwoFactorPassword} secureTextEntry maxLength={64} placeholder={${i18n.value("twoFactor.passwordLabel", "Current password")}} />{twoFactorEnabled ? <Button variant="destructive" disabled={!twoFactorPassword} onPress={() => void run(async () => { const result = await authClient.twoFactor.disable({ password: twoFactorPassword }); if (result.error) throw new Error("Two-factor change failed"); setTwoFactorPassword(""); await refetch(); }, ${i18n.value("native.twoFactorDisabled", "Two-factor disabled")}) }><Text>${i18n.child("twoFactor.disable", "Disable two-factor")}</Text></Button> : <Button disabled={!twoFactorPassword} onPress={() => void run(async () => { const result = await authClient.twoFactor.enable({ password: twoFactorPassword }); if (result.error) throw new Error("Two-factor change failed"); setTwoFactorPassword(""); router.push({ pathname: "/2fa", params: { totpURI: result.data?.totpURI ?? "" } }); }, ${i18n.value("native.twoFactorSetup", "Scan the authenticator setup and verify")}) }><Text>${i18n.child("twoFactor.enable", "Enable two-factor")}</Text></Button>}</CardContent></Card>`
    : "";
  const dangerCard = hasEmail
    ? `<Card className="border-destructive/40"><CardHeader><CardTitle>${i18n.child("danger.title", "Delete account")}</CardTitle><CardDescription>${i18n.child("danger.description", "This permanently removes the account after server verification.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={deletePassword} onChangeText={setDeletePassword} secureTextEntry maxLength={64} placeholder={${i18n.value("native.confirmPassword", "Confirm current password")}} /><Button variant="destructive" disabled={!deletePassword} onPress={() => void run(async () => { const result = await authClient.deleteUser({ password: deletePassword }); if (result.error) throw new Error("Account deletion failed"); router.replace("/"); }, ${i18n.value("native.accountDeleted", "Account deleted")}) }><Text>${i18n.child("danger.delete", "Delete account")}</Text></Button></CardContent></Card>`
    : `<Card className="border-destructive/40"><CardHeader><CardTitle>${i18n.child("danger.title", "Delete account")}</CardTitle><CardDescription>${i18n.child("danger.oauthDescription", "OAuth-only accounts require a recent sign-in before permanent deletion.")}</CardDescription></CardHeader><CardContent className="gap-3"><Button variant="destructive" onPress={() => void deleteOAuthAccount()}><Text>${i18n.child("danger.delete", "Delete account")}</Text></Button></CardContent></Card>`;
  return `import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { authClient${hasEmail ? "" : ", identityClient, isIdentityRecentAuthenticationError"} } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
${i18n.importLine}

export default function SettingsScreen(): React.JSX.Element {
${i18n.hookLine}
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending, refetch } = authClient.useSession();
  const user = session?.user;
  const applicationIdentity = useQuery(orpc.me.queryOptions({ enabled: Boolean(user) }));
  const currentSessionId = session?.session?.id;
  const [name, setName] = React.useState(user?.name ?? "");
${credentialState}
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const sessions = useQuery(orpc.identity.sessions.list.queryOptions({ input: {}, enabled: Boolean(user) }));
  const sessionsKey = orpc.identity.sessions.list.key({ type: "query" });
  const invalidateSessions = async (): Promise<void> => queryClient.invalidateQueries({ queryKey: sessionsKey });
  const revokeSession = useMutation(orpc.identity.sessions.revoke.mutationOptions({ onSuccess: invalidateSessions }));
  const revokeOthers = useMutation(orpc.identity.sessions.revokeOthers.mutationOptions({ onSuccess: invalidateSessions }));
${twoFactorState}

  async function run(action: () => Promise<void>, success: string): Promise<void> {
    setError(null); setStatus(null);
    try { await action(); setStatus(success); } catch { setError(${i18n.value("native.operationError", "Account operation failed")}); }
  }
${
  hasEmail
    ? ""
    : `
  async function deleteOAuthAccount(): Promise<void> {
    setError(null); setStatus(null);
    try {
      const result = await identityClient.deleteAccount();
      if (result.error) {
        setError(isIdentityRecentAuthenticationError(result.error) ? ${i18n.value("danger.reauthenticate", "Sign in again before deleting your account.")} : ${i18n.value("danger.genericError", "The account could not be deleted.")});
        return;
      }
      router.replace("/");
    } catch { setError(${i18n.value("danger.genericError", "The account could not be deleted.")}); }
  }
`
}

  if (sessionPending) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator /></View>;
  if (!user) return <View className="flex-1 items-center justify-center gap-3 bg-background p-6"><Text className="text-2xl font-bold">${i18n.child("native.signInRequired", "Sign in required")}</Text><Link href="/(auth)/sign-in" asChild><Button><Text>${i18n.child("native.signIn", "Sign in")}</Text></Button></Link></View>;

  return <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic"><View className="w-full max-w-[760px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-xs font-semibold uppercase tracking-widest text-primary">${i18n.child("native.kicker", "Account control")}</Text><Text className="text-3xl font-bold tracking-tight">${i18n.child("title", "Settings")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("description", "Profile, credentials, two-factor security, and active sessions.")}</Text></View>
    <View className="flex-row flex-wrap gap-2"><Link href="/workspace" asChild><Button variant="outline"><Text>${i18n.child("native.organizations", "Organizations & teams")}</Text></Button></Link>{applicationIdentity.data?.user?.role === "admin" || applicationIdentity.data?.user?.role === "superAdmin" ? <Link href="/admin" asChild><Button variant="outline"><Text>${i18n.child("admin", "Admin")}</Text></Button></Link> : null}</View>
    {error ? <Alert accessibilityRole="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {status ? <Alert accessibilityRole="alert"><AlertDescription>{status}</AlertDescription></Alert> : null}

    <Card><CardHeader><CardTitle>${i18n.child("profileTitle", "Profile")}</CardTitle><CardDescription>{user.email}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={name} onChangeText={setName} maxLength={50} placeholder={${i18n.value("namePlaceholder", "Display name")}} /><Button disabled={!name.trim() || name.trim().length > 50} onPress={() => void run(async () => { const result = await authClient.updateUser({ name: name.trim() }); if (result.error) throw new Error("Profile update failed"); await refetch(); }, ${i18n.value("profile.successMessage", "Profile saved")}) }><Text>${i18n.child("profile.submit", "Save profile")}</Text></Button></CardContent></Card>

    ${credentialCards}

    <Card><CardHeader><View className="flex-row items-center justify-between"><CardTitle>${i18n.child("sessions.title", "Sessions")}</CardTitle><Badge><Text>{sessions.data?.length ?? 0}</Text></Badge></View><CardDescription>${i18n.child("sessions.description", "Review devices and revoke access remotely.")}</CardDescription></CardHeader><CardContent className="gap-3">{sessions.isPending ? <ActivityIndicator /> : null}{(sessions.data ?? []).map((item) => <View key={item.id} className="gap-2 rounded-xl border p-3"><View className="flex-row items-center justify-between"><View className="flex-1"><Text className="font-mono text-xs">{item.id.slice(0, 10)}</Text><Text className="text-xs text-muted-foreground">{item.userAgent ?? ${i18n.value("sessions.unknownDevice", "Unknown device")}}</Text></View>{item.id === currentSessionId ? <Badge><Text>${i18n.child("sessions.current", "Current")}</Text></Badge> : <Button size="sm" variant="outline" disabled={revokeSession.isPending} onPress={() => void run(() => revokeSession.mutateAsync({ sessionId: item.id }).then(() => undefined), ${i18n.value("native.sessionRevoked", "Session revoked")}) }><Text>${i18n.child("sessions.revoke", "Revoke")}</Text></Button>}</View></View>)}<Button variant="outline" disabled={revokeOthers.isPending || (sessions.data?.length ?? 0) < 2} onPress={() => void run(() => revokeOthers.mutateAsync({}).then(() => undefined), ${i18n.value("native.otherSessionsRevoked", "Other sessions revoked")}) }><Text>${i18n.child("sessions.revokeOthers", "Revoke other sessions")}</Text></Button></CardContent></Card>

    ${dangerCard}
  </View></ScrollView>;
}
`;
}

export function expoFullSettingsFile(
  mode: IdentityWorkspaceMode,
  hasI18n = false,
  hasEmail = true,
): TemplateFile {
  return file(
    mobilePath(mode, "app/settings.tsx"),
    expoFullSettingsContent(mode, hasI18n, hasEmail),
  );
}
