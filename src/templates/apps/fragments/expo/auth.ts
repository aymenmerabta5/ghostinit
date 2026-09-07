// @allow-long 360: one Expo auth screen set (sign-in/sign-up/2FA) sharing form validators
/**
 * Expo auth fragments – sign-in, sign-up, 2FA, forgot, reset
 * RNR + Uniwind: className tokens (bg-background, text-foreground, etc.) no StyleSheet, no hardcoded hex.
 */
import { nativeI18nTemplate } from "../native-i18n.js";

export function expoSignInContent(hasEmail = true, hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "auth");
  if (!hasEmail) {
    return `import * as React from "react";
import { useState } from "react";
import { View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { identityClient, type IdentityOAuthProvider } from "@/lib/auth-client";
${i18n.importLine}

export default function SignInScreen(): React.JSX.Element {
${i18n.hookLine}
  const router = useRouter();
  const [pending, setPending] = useState<IdentityOAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function signInWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null); setPending(provider);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) { setError(${i18n.value("signIn.genericError", "Sign in failed")}); return; }
      router.replace("/dashboard");
    } catch { setError(${i18n.value("signIn.genericError", "Sign in failed")}); }
    finally { setPending(null); }
  }
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="text-2xl font-bold">${i18n.child("signIn.title", "Sign in")}</Text>
      <Text className="max-w-[32rem] text-center text-sm text-muted-foreground">${i18n.child("signIn.emailDisabled", "Email/password sign-in is unavailable. Continue with a configured OAuth provider.")}</Text>
      {error ? <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text> : null}
      <View className="w-full max-w-[32rem] gap-3"><Button variant="outline" disabled={pending !== null} onPress={() => void signInWithOAuth("google")}><Text>{pending === "google" ? ${i18n.value("signIn.oauthPending", "Opening…")} : ${i18n.value("signIn.oauthGoogle", "Continue with Google")}}</Text></Button><Button variant="outline" disabled={pending !== null} onPress={() => void signInWithOAuth("github")}><Text>{pending === "github" ? ${i18n.value("signIn.oauthPending", "Opening…")} : ${i18n.value("signIn.oauthGitHub", "Continue with GitHub")}}</Text></Button></View>
      <Link href="/" asChild><Text className="text-sm text-primary underline">${i18n.child("signIn.backHome", "Back to home")}</Text></Link>
    </View>
  );
}
`;
  }
  const recoveryLink = hasEmail
    ? `<Link href="/forgot-password" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("signIn.forgotShort", "Forgot?")}</Text></Link>`
    : "";
  const emailLinks = hasEmail
    ? `<View className="flex-row justify-center gap-4"><Link href="/(auth)/magic-link" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("signIn.magicLink", "Magic link")}</Text></Link><Link href="/(auth)/verify-email" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("signIn.verifyEmail", "Verify email")}</Text></Link></View>`
    : "";
  return `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { identityClient, type IdentityOAuthProvider } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
${i18n.importLine}

function requiresTwoFactor(data: unknown): boolean {
  return typeof data === "object" && data !== null && Reflect.get(data, "twoFactorRedirect") === true;
}

export default function SignInScreen(): React.JSX.Element {
${i18n.hookLine}
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState<IdentityOAuthProvider | null>(null);

  async function signInWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null); setOauthPending(provider);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) { setError(${i18n.value("signIn.genericError", "Sign in failed")}); return; }
      router.replace("/dashboard");
    } catch { setError(${i18n.value("signIn.genericError", "Sign in failed")}); }
    finally { setOauthPending(null); }
  }

  async function handleSignIn(): Promise<void> {
    setError(null);
    if (!email.includes("@")) { setError(${i18n.value("validation.invalidEmail", "Enter a valid email")}); return; }
    if (password.length < 8) { setError(${i18n.value("validation.passwordTooShort", "Password must be at least 8 characters")}); return; }
    if (password.length > 64) { setError(${i18n.value("validation.passwordTooLong", "Password must be at most 64 characters")}); return; }
    setPending(true);
    try {
      const res = await identityClient.signInWithEmail({ email, password, callbackURL: "/dashboard" });
      if (res.error) { setError(${i18n.value("signIn.genericError", "Sign in failed")}); return; }
      router.replace(requiresTwoFactor(res.data) ? "/2fa" : "/dashboard");
    } catch { setError(${i18n.value("signIn.genericError", "Sign in failed")}); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center p-4 sm:p-6" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-[32rem] self-center gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">${i18n.child("signIn.title", "Sign in")}</Text>
              <Text className="text-sm text-muted-foreground">${i18n.child("signIn.description", "Enter your credentials.")}</Text>
            </View>
            {error ? <View accessibilityRole="alert" className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            <View className="gap-3"><Button variant="outline" disabled={pending || oauthPending !== null} onPress={() => void signInWithOAuth("google")}><Text>{oauthPending === "google" ? ${i18n.value("signIn.oauthPending", "Opening…")} : ${i18n.value("signIn.oauthGoogle", "Continue with Google")}}</Text></Button><Button variant="outline" disabled={pending || oauthPending !== null} onPress={() => void signInWithOAuth("github")}><Text>{oauthPending === "github" ? ${i18n.value("signIn.oauthPending", "Opening…")} : ${i18n.value("signIn.oauthGitHub", "Continue with GitHub")}}</Text></Button></View>
            <View className="gap-4">
              <View className="gap-2">
                <Label>${i18n.child("signIn.emailLabel", "Email")}</Label>
                <Input value={email} onChangeText={setEmail} placeholder={${i18n.value("signIn.emailPlaceholder", "you@example.com")}} autoCapitalize="none" keyboardType="email-address" />
              </View>
              <View className="gap-2">
                <View className="flex-row justify-between items-center">
                  <Label>${i18n.child("signIn.passwordLabel", "Password")}</Label>
                  ${recoveryLink}
                </View>
                <Input value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry maxLength={64} />
              </View>
            </View>
            <Button onPress={handleSignIn} disabled={pending || oauthPending !== null}>{pending ? <ActivityIndicator /> : <Text>${i18n.child("signIn.submit", "Sign in")}</Text>}</Button>
            ${emailLinks}
            <View className="flex-row justify-between mt-3">
              <Link href="/" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("signIn.backHome", "Back to home")}</Text></Link>
              <Link href="/sign-up" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("signIn.createAccountLink", "Create account")}</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">${i18n.child("signIn.securityNote", "Secure session powered by Better Auth.")}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}

export function expoSignUpContent(hasI18n = false, hasEmail = true): string {
  const i18n = nativeI18nTemplate(hasI18n, "auth");
  if (!hasEmail) {
    return `import * as React from "react";
import { useState } from "react";
import { View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { identityClient, type IdentityOAuthProvider } from "@/lib/auth-client";
${i18n.importLine}

export default function SignUpScreen(): React.JSX.Element {
${i18n.hookLine}
  const router = useRouter();
  const [pending, setPending] = useState<IdentityOAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function signUpWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null); setPending(provider);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) { setError(${i18n.value("signUp.genericError", "Account creation failed")}); return; }
      router.replace("/dashboard");
    } catch { setError(${i18n.value("signUp.genericError", "Account creation failed")}); }
    finally { setPending(null); }
  }
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="text-2xl font-bold">${i18n.child("signUp.title", "Create account")}</Text>
      <Text className="max-w-[32rem] text-center text-sm text-muted-foreground">${i18n.child("signUp.emailDisabled", "Password signup is unavailable. Continue with a configured OAuth provider.")}</Text>
      {error ? <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text> : null}
      <View className="w-full max-w-[32rem] gap-3"><Button variant="outline" disabled={pending !== null} onPress={() => void signUpWithOAuth("google")}><Text>{pending === "google" ? ${i18n.value("signUp.oauthPending", "Opening…")} : ${i18n.value("signUp.oauthGoogle", "Continue with Google")}}</Text></Button><Button variant="outline" disabled={pending !== null} onPress={() => void signUpWithOAuth("github")}><Text>{pending === "github" ? ${i18n.value("signUp.oauthPending", "Opening…")} : ${i18n.value("signUp.oauthGitHub", "Continue with GitHub")}}</Text></Button></View>
      <Link href="/sign-in" asChild><Text className="text-sm text-primary underline">${i18n.child("signUp.signInLink", "Sign in")}</Text></Link>
    </View>
  );
}
`;
  }
  return `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { identityClient, type IdentityOAuthProvider } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
${i18n.importLine}

export default function SignUpScreen(): React.JSX.Element {
${i18n.hookLine}
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState<IdentityOAuthProvider | null>(null);

  async function signUpWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null); setOauthPending(provider);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) { setError(${i18n.value("signUp.genericError", "Sign up failed")}); return; }
      router.replace("/dashboard");
    } catch { setError(${i18n.value("signUp.genericError", "Sign up failed")}); }
    finally { setOauthPending(null); }
  }

  async function handleSignUp(): Promise<void> {
    setError(null);
    if (name.trim().length < 2) { setError(${i18n.value("validation.nameTooShort", "Enter your name")}); return; }
    if (name.trim().length > 50) { setError(${i18n.value("validation.nameTooLong", "Name must be at most 50 characters")}); return; }
    if (!email.includes("@")) { setError(${i18n.value("validation.invalidEmail", "Enter a valid email")}); return; }
    if (password.length < 8) { setError(${i18n.value("validation.passwordTooShort", "Password must be at least 8 characters")}); return; }
    if (password.length > 64) { setError(${i18n.value("validation.passwordTooLong", "Password must be at most 64 characters")}); return; }
    setPending(true);
    try {
      const res = await identityClient.signUpWithEmail({ name: name.trim(), email, password, callbackURL: "/dashboard" });
      if (res.error) { setError(${i18n.value("signUp.genericError", "Sign up failed")}); return; }
      router.replace("/dashboard");
    } catch { setError(${i18n.value("signUp.genericError", "Sign up failed")}); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center p-4 sm:p-6" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-[32rem] self-center gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">${i18n.child("signUp.title", "Create account")}</Text>
              <Text className="text-sm text-muted-foreground">${i18n.child("signUp.description", "Start your workspace.")}</Text>
            </View>
            {error ? <View accessibilityRole="alert" className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            <View className="gap-3"><Button variant="outline" disabled={pending || oauthPending !== null} onPress={() => void signUpWithOAuth("google")}><Text>{oauthPending === "google" ? ${i18n.value("signUp.oauthPending", "Opening…")} : ${i18n.value("signUp.oauthGoogle", "Continue with Google")}}</Text></Button><Button variant="outline" disabled={pending || oauthPending !== null} onPress={() => void signUpWithOAuth("github")}><Text>{oauthPending === "github" ? ${i18n.value("signUp.oauthPending", "Opening…")} : ${i18n.value("signUp.oauthGitHub", "Continue with GitHub")}}</Text></Button></View>
            <View className="gap-4">
              <View className="gap-2">
                <Label>${i18n.child("signUp.nameLabel", "Name")}</Label>
                <Input value={name} onChangeText={setName} placeholder={${i18n.value("signUp.namePlaceholder", "Ada Lovelace")}} maxLength={50} />
              </View>
              <View className="gap-2">
                <Label>${i18n.child("signUp.emailLabel", "Email")}</Label>
                <Input value={email} onChangeText={setEmail} placeholder={${i18n.value("signUp.emailPlaceholder", "you@example.com")}} autoCapitalize="none" keyboardType="email-address" />
              </View>
              <View className="gap-2">
                <Label>${i18n.child("signUp.passwordLabel", "Password")}</Label>
                <Input value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry maxLength={64} />
                <Text className="text-xs text-muted-foreground mt-1">${i18n.child("signUp.passwordDescription", "At least 8 characters.")}</Text>
              </View>
            </View>
            <Button onPress={handleSignUp} disabled={pending || oauthPending !== null}>{pending ? <ActivityIndicator /> : <Text>${i18n.child("signUp.submit", "Create account")}</Text>}</Button>
            <View className="flex-row justify-center mt-3">
              <Link href="/sign-in" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("signUp.signInPrompt", "Already have an account?")} ${i18n.child("signUp.signInLink", "Sign in")}</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">${i18n.child("signUp.securityNote", "Secure session powered by Better Auth.")}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}

export function expoTwoFactorContent(hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "auth");
  return `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import { identityClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
${i18n.importLine}

export default function TwoFactorScreen(): React.JSX.Element {
${i18n.hookLine}
  const router = useRouter();
  const params = useLocalSearchParams<{ totpURI?: string | string[] }>();
  const totpURI = typeof params.totpURI === "string" ? params.totpURI : params.totpURI?.[0] ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleVerify(): Promise<void> {
    setError(null);
    if (code.length !== 6) { setError(${i18n.value("validation.codeSixDigits", "Enter a 6-digit code")}); return; }
    setPending(true);
    try {
      const res = await identityClient.verifyTwoFactor({ code, trustDevice: false });
      if (res.error) { setError(${i18n.value("twoFactor.genericError", "Invalid code")}); return; }
      router.replace("/dashboard");
    } catch { setError(${i18n.value("twoFactor.genericError", "Invalid code")}); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center p-4 sm:p-6" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-[32rem] self-center gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">${i18n.child("twoFactor.title", "Two-factor authentication")}</Text>
              <Text className="text-sm text-muted-foreground">${i18n.child("twoFactor.description", "Enter the 6-digit code from your authenticator app.")}</Text>
            </View>
            {error ? <View accessibilityRole="alert" className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            {totpURI ? <View className="gap-2"><Label>${i18n.child("twoFactor.setupUriLabel", "Authenticator setup URI")}</Label><Input value={totpURI} editable={false} selectTextOnFocus accessibilityLabel={${i18n.value("twoFactor.setupUriLabel", "Authenticator setup URI")}} /></View> : null}
            <View className="gap-2">
              <Label>${i18n.child("twoFactor.codeLabel", "Authentication code")}</Label>
              <Input value={code} onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="000000" keyboardType="number-pad" maxLength={6} className="text-center tracking-[0.3em] text-lg h-14" />
              <Text className="text-xs text-muted-foreground">${i18n.child("twoFactor.codeDescription", "Open your authenticator app. The code refreshes every 30 seconds.")}</Text>
            </View>
            <Button onPress={handleVerify} disabled={pending}>{pending ? <ActivityIndicator /> : <Text>${i18n.child("twoFactor.submit", "Verify and continue")}</Text>}</Button>
            <View className="flex-row justify-between mt-3">
              <Link href="/sign-in" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("twoFactor.backSignIn", "Back to sign in")}</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">${i18n.child("twoFactor.securityNote", "Secure two-factor authentication powered by Better Auth.")}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}

export function expoForgotPasswordContent(hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "recovery");
  return `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { identityClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
${i18n.importLine}

export default function ForgotPasswordScreen(): React.JSX.Element {
${i18n.hookLine}
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null); setStatus(null);
    if (!email.includes("@")) { setError(${i18n.value("forgotPassword.invalidEmail", "Enter a valid email")}); return; }
    setPending(true);
    try {
      const res = await identityClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      if (res.error) { setError(${i18n.value("forgotPassword.genericError", "Failed to send")}); return; }
      setStatus(${i18n.value("forgotPassword.successMessage", "If this email exists, check your inbox for the reset link.")});
    } catch { setError(${i18n.value("forgotPassword.genericError", "Failed to send")}); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center p-4 sm:p-6" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-[32rem] self-center gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">${i18n.child("forgotPassword.title", "Forgot password")}</Text>
              <Text className="text-sm text-muted-foreground">${i18n.child("forgotPassword.description", "Enter your email and we will send a reset link. Expires in 1 hour.")}</Text>
            </View>
            {error ? <View accessibilityRole="alert" className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            {status ? <View accessibilityRole="alert" className="bg-secondary border border-border rounded-lg p-3"><Text className="text-secondary-foreground text-sm">{status}</Text></View> : null}
            <View className="gap-2">
              <Label>${i18n.child("forgotPassword.emailLabel", "Email")}</Label>
              <Input value={email} onChangeText={setEmail} placeholder={${i18n.value("forgotPassword.emailPlaceholder", "you@example.com")}} autoCapitalize="none" keyboardType="email-address" />
              <Text className="text-xs text-muted-foreground">${i18n.child("forgotPassword.emailDescription", "We send a reset link if this address exists.")}</Text>
            </View>
            <Button onPress={handleSubmit} disabled={pending}>{pending ? <ActivityIndicator /> : <Text>${i18n.child("forgotPassword.submit", "Send reset link")}</Text>}</Button>
            <View className="flex-row justify-between mt-3">
              <Link href="/sign-in" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("forgotPassword.backSignIn", "Back to sign in")}</Text></Link>
              <Link href="/sign-up" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("forgotPassword.createAccount", "Create account")}</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">${i18n.child("forgotPassword.successTitle", "Check your email")}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}

export function expoResetPasswordContent(hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "recovery");
  return `import * as React from "react";
import { useState, useEffect } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams, Link } from "expo-router";
import { identityClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
${i18n.importLine}

type ResetSearchParams = { token?: string; error?: string };

export default function ResetPasswordScreen(): React.JSX.Element {
${i18n.hookLine}
  const router = useRouter();
  const { token: tokenParam, error: urlError } = useLocalSearchParams<ResetSearchParams>();
  const token = typeof tokenParam === "string" ? tokenParam : Array.isArray(tokenParam) ? tokenParam[0] : "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (urlError) setError(urlError === "INVALID_TOKEN" ? ${i18n.value("resetPassword.expiredToken", "Invalid or expired reset link.")} : ${i18n.value("resetPassword.genericError", "The password could not be reset.")});
    else if (!token) setError(${i18n.value("resetPassword.missingToken", "Missing reset token. Use the link from your email.")});
  }, [urlError, token${hasI18n ? ", t" : ""}]);

  async function handleReset(): Promise<void> {
    setError(null);
    if (newPassword !== confirmPassword) { setError(${i18n.value("resetPassword.passwordMismatch", "Passwords do not match")}); return; }
    if (newPassword.length < 8) { setError(${i18n.value("resetPassword.passwordTooShort", "Password must be at least 8 characters")}); return; }
    if (newPassword.length > 64) { setError(${i18n.value("resetPassword.passwordTooLong", "Password must be at most 64 characters")}); return; }
    if (!token) { setError(${i18n.value("resetPassword.missingToken", "Missing reset token. Use the link from your email.")}); return; }
    setPending(true);
    try {
      const res = await identityClient.resetPassword({ newPassword, token });
      if (res.error) { setError(${i18n.value("resetPassword.genericError", "Failed to reset")}); return; }
      router.replace("/(auth)/sign-in?reset=success");
    } catch { setError(${i18n.value("resetPassword.genericError", "Failed to reset")}); }
    finally { setPending(false); }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center p-4 sm:p-6" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-[32rem] self-center gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">${i18n.child("resetPassword.title", "Reset password")}</Text>
              <Text className="text-sm text-muted-foreground">${i18n.child("resetPassword.description", "Choose a new password. Link expires in 1 hour and can only be used once.")}</Text>
            </View>
            {error ? <View accessibilityRole="alert" className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"><Text className="text-destructive text-sm">{error}</Text></View> : null}
            {!token ? (
              <View className="gap-3">
                <Text className="text-sm text-muted-foreground">${i18n.child("resetPassword.missingToken", "Missing reset token. Use the link from your email.")}</Text>
                <Link href="/(auth)/forgot-password" asChild><Button><Text>${i18n.child("resetPassword.requestNewLink", "Request new link")}</Text></Button></Link>
              </View>
            ) : (
              <View className="gap-5">
                <View className="gap-4">
                  <View className="gap-2">
                    <Label>${i18n.child("resetPassword.newPasswordLabel", "New password")}</Label>
                    <Input value={newPassword} onChangeText={setNewPassword} placeholder="••••••••" secureTextEntry maxLength={64} />
                  </View>
                  <View className="gap-2">
                    <Label>${i18n.child("resetPassword.confirmPasswordLabel", "Confirm password")}</Label>
                    <Input value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" secureTextEntry maxLength={64} />
                  </View>
                </View>
                <Button onPress={handleReset} disabled={pending}>{pending ? <ActivityIndicator /> : <Text>${i18n.child("resetPassword.submit", "Reset password")}</Text>}</Button>
              </View>
            )}
            <View className="flex-row justify-center mt-3">
              <Link href="/(auth)/sign-in" asChild><Text className="text-xs text-muted-foreground underline">${i18n.child("resetPassword.backSignIn", "Back to sign in")}</Text></Link>
            </View>
            <Text className="text-xs text-muted-foreground text-center mt-6">${i18n.child("resetPassword.invalidLinkDescription", "Request a new link if this one has expired.")}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
`;
}
