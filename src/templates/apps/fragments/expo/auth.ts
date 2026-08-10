// @allow-long 360: one Expo auth screen set (sign-in/sign-up/2FA) sharing form validators
/**
 * Expo auth fragments – sign-in, sign-up, 2FA, forgot, reset
 * RNR + Uniwind: className tokens (bg-background, text-foreground, etc.) no StyleSheet, no hardcoded hex.
 */

export function expoSignInContent(): string {
  return `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInScreen(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSignIn(): Promise<void> {
    setError(null);
    if (!email.includes("@")) { setError("Enter a valid email"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setPending(true);
    try {
      const res = await authClient.signIn.email({ email, password, callbackURL: "/dashboard" });
      const r = res as unknown as { error?: { message?: string } | null };
      if (r?.error) { setError(r.error.message ?? "Sign in failed"); return; }
      router.replace("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-6" keyboardShouldPersistTaps="handled">
          <View className="gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">Sign in</Text>
              <Text className="text-sm text-muted-foreground">Enter your credentials.</Text>
            </View>
            {error ? <View className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            <View className="gap-4">
              <View className="gap-2">
                <Label>Email</Label>
                <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
              </View>
              <View className="gap-2">
                <View className="flex-row justify-between items-center">
                  <Label>Password</Label>
                  <Link href="/forgot-password" asChild><Text className="text-xs text-muted-foreground underline">Forgot?</Text></Link>
                </View>
                <Input value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
              </View>
            </View>
            <Button onPress={handleSignIn} disabled={pending}>{pending ? <ActivityIndicator /> : <Text>Sign in</Text>}</Button>
            <View className="flex-row justify-between mt-3">
              <Link href="/" asChild><Text className="text-xs text-muted-foreground underline">← Home</Text></Link>
              <Link href="/sign-up" asChild><Text className="text-xs text-muted-foreground underline">Create account</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">__PROJECT_NAME__ • SecureStore • Better Auth</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}

export function expoSignUpContent(): string {
  return `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignUpScreen(): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSignUp(): Promise<void> {
    setError(null);
    if (name.trim().length < 2) { setError("Enter your name"); return; }
    if (!email.includes("@")) { setError("Enter a valid email"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setPending(true);
    try {
      const res = await authClient.signUp.email({ name, email, password, callbackURL: "/dashboard" });
      const r = res as unknown as { error?: { message?: string } | null };
      if (r?.error) { setError(r.error.message ?? "Sign up failed"); return; }
      router.replace("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign up failed"); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-6" keyboardShouldPersistTaps="handled">
          <View className="gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">Create account</Text>
              <Text className="text-sm text-muted-foreground">Start your workspace.</Text>
            </View>
            {error ? <View className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            <View className="gap-4">
              <View className="gap-2">
                <Label>Name</Label>
                <Input value={name} onChangeText={setName} placeholder="Ada Lovelace" />
              </View>
              <View className="gap-2">
                <Label>Email</Label>
                <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
              </View>
              <View className="gap-2">
                <Label>Password</Label>
                <Input value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
                <Text className="text-xs text-muted-foreground mt-1">At least 8 characters.</Text>
              </View>
            </View>
            <Button onPress={handleSignUp} disabled={pending}>{pending ? <ActivityIndicator /> : <Text>Create account</Text>}</Button>
            <View className="flex-row justify-center mt-3">
              <Link href="/sign-in" asChild><Text className="text-xs text-muted-foreground underline">Already have an account? Sign in</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">__PROJECT_NAME__ • SecureStore • Better Auth</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}

export function expoTwoFactorContent(): string {
  return `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function TwoFactorScreen(): React.JSX.Element {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleVerify(): Promise<void> {
    setError(null);
    if (code.length !== 6) { setError("Enter a 6-digit code"); return; }
    setPending(true);
    try {
      const res = await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
      const r = res as unknown as { error?: { message?: string } | null };
      if (r?.error) { setError(r.error.message ?? "Invalid code"); return; }
      router.replace("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid code"); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-6" keyboardShouldPersistTaps="handled">
          <View className="gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">Two-factor authentication</Text>
              <Text className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</Text>
            </View>
            {error ? <View className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            <View className="gap-2">
              <Label>Authentication code</Label>
              <Input value={code} onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="000000" keyboardType="number-pad" maxLength={6} className="text-center tracking-[0.3em] text-lg h-14" />
              <Text className="text-xs text-muted-foreground">Open Authy, 1Password, Google Authenticator. Refreshes every 30s.</Text>
            </View>
            <Button onPress={handleVerify} disabled={pending}>{pending ? <ActivityIndicator /> : <Text>Verify and continue</Text>}</Button>
            <View className="flex-row justify-between mt-3">
              <Link href="/sign-in" asChild><Text className="text-xs text-muted-foreground underline">Back to sign in</Text></Link>
              <Link href="/settings" asChild><Text className="text-xs text-muted-foreground underline">Recovery codes</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">__PROJECT_NAME__ • SecureStore • Better Auth</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}

export function expoForgotPasswordContent(): string {
  return `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordScreen(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null); setStatus(null);
    if (!email.includes("@")) { setError("Enter a valid email"); return; }
    setPending(true);
    try {
      const res = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      const r = res as unknown as { error?: { message?: string } | null };
      if (r?.error) { setError(r.error.message ?? "Failed to send"); return; }
      setStatus("If this email exists, check your inbox for the reset link.");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send"); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-6" keyboardShouldPersistTaps="handled">
          <View className="gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">Forgot password</Text>
              <Text className="text-sm text-muted-foreground">Enter your email and we will send a reset link. Expires in 1 hour.</Text>
            </View>
            {error ? <View className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            {status ? <View className="bg-secondary border border-border rounded-lg p-3"><Text className="text-secondary-foreground text-sm">{status}</Text></View> : null}
            <View className="gap-2">
              <Label>Email</Label>
              <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
              <Text className="text-xs text-muted-foreground">We send a reset link if this address exists.</Text>
            </View>
            <Button onPress={handleSubmit} disabled={pending}>{pending ? <ActivityIndicator /> : <Text>Send reset link</Text>}</Button>
            <View className="flex-row justify-between mt-3">
              <Link href="/sign-in" asChild><Text className="text-xs text-muted-foreground underline">Back to sign in</Text></Link>
              <Link href="/sign-up" asChild><Text className="text-xs text-muted-foreground underline">Create account</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">__PROJECT_NAME__ • SecureStore • Better Auth</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}

export function expoResetPasswordContent(): string {
  return `import * as React from "react";
import { useState, useEffect } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetSearchParams = { token?: string; error?: string };

export default function ResetPasswordScreen(): React.JSX.Element {
  const router = useRouter();
  const { token: tokenParam, error: urlError } = useLocalSearchParams<ResetSearchParams>();
  const token = typeof tokenParam === "string" ? tokenParam : Array.isArray(tokenParam) ? tokenParam[0] : "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (urlError) setError(urlError === "INVALID_TOKEN" ? "Invalid or expired reset link." : String(urlError));
    else if (!token) setError("Missing reset token. Use the link from your email.");
  }, [urlError, token]);

  async function handleReset(): Promise<void> {
    setError(null);
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!token) { setError("Missing reset token. Use the link from your email."); return; }
    setPending(true);
    try {
      type ResetPayload = { newPassword: string; token: string };
      const payload: ResetPayload = { newPassword, token: String(token) };
      const resetFn = authClient.resetPassword as unknown as (p: ResetPayload) => Promise<unknown>;
      const res = await resetFn(payload);
      const r = res as unknown as { error?: { message?: string } | null };
      if (r?.error) { setError(r.error.message ?? "Failed to reset"); return; }
      router.replace("/(auth)/sign-in?reset=success");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to reset"); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-6" keyboardShouldPersistTaps="handled">
          <View className="gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">Reset password</Text>
              <Text className="text-sm text-muted-foreground">Choose a new password. Link expires in 1 hour and can only be used once.</Text>
            </View>
            {error ? <View className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            {!token ? (
              <View className="gap-3">
                <Text className="text-sm text-muted-foreground">Missing reset token. Use the link from your email.</Text>
                <Link href="/(auth)/forgot-password" asChild><Button><Text>Request new link</Text></Button></Link>
              </View>
            ) : (
              <View className="gap-5">
                <View className="gap-4">
                  <View className="gap-2">
                    <Label>New password</Label>
                    <Input value={newPassword} onChangeText={setNewPassword} placeholder="••••••••" secureTextEntry />
                  </View>
                  <View className="gap-2">
                    <Label>Confirm password</Label>
                    <Input value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" secureTextEntry />
                  </View>
                </View>
                <Button onPress={handleReset} disabled={pending}>{pending ? <ActivityIndicator /> : <Text>Reset password</Text>}</Button>
              </View>
            )}
            <View className="flex-row justify-center mt-3">
              <Link href="/(auth)/sign-in" asChild><Text className="text-xs text-muted-foreground underline">Back to sign in</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">__PROJECT_NAME__ • SecureStore • Better Auth</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}
