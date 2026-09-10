/** React Native presenters share portable form workflows, never DOM controls. */
export function expoAuthFrameContent(): string {
  return `import type * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
export function AuthFrame({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer?: React.ReactNode }): React.JSX.Element {
  return <View className="flex-1 bg-background"><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1"><ScrollView contentContainerClassName="flex-grow items-center justify-center p-4 sm:p-6" keyboardShouldPersistTaps="handled"><View className="w-full max-w-[32rem] self-center gap-5"><View className="gap-1"><Text className="text-2xl font-bold tracking-tight">{title}</Text><Text className="text-sm text-muted-foreground">{description}</Text></View>{children}{footer}</View></ScrollView></KeyboardAvoidingView></View>;
}
`;
}

function baseImports(state: string): string {
  return `import type * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSurfaceTranslations } from "@/lib/translations";
import { AuthFrame } from "./auth-frame";
import { NativeFormField as AuthTextField } from "@/components/form-fields/native-field";
import type { ${state} } from "../types";
`;
}

export function expoCredentialFormContent(kind: "sign-in" | "sign-up", hasEmail: boolean): string {
  const name = kind === "sign-in" ? "SignIn" : "SignUp";
  const key = kind === "sign-in" ? "signIn" : "signUp";
  const fields = [...(kind === "sign-up" ? ["name"] : []), "email", "password"];
  const oauth = (pending: string) =>
    `<View className="gap-3"><Button variant="outline" disabled={${pending} || methods.pending} onPress={() => void methods.onOAuth("google")}><Text>{t("${key}.oauthGoogle")}</Text></Button><Button variant="outline" disabled={${pending} || methods.pending} onPress={() => void methods.onOAuth("github")}><Text>{t("${key}.oauthGitHub")}</Text></Button></View>`;
  return `${baseImports(`${name}FormState`)}
export function ${name}Form({ state }: { state: ${name}FormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { methods${hasEmail ? ", form" : ""} } = state;
  const error = ${kind === "sign-in" && !hasEmail ? "methods.error" : "state.error ?? methods.error"};
  return <AuthFrame title={t("${key}.title")} description={t("${key}.${hasEmail ? "description" : "emailDisabled"}")} footer={<View className="flex-row flex-wrap justify-between gap-3"><Link href="/" asChild><Button variant="ghost"><Text>{t("${key}.backHome")}</Text></Button></Link><Link href="/${kind === "sign-in" ? "sign-up" : "sign-in"}" asChild><Button variant="ghost"><Text>{t("${kind === "sign-in" ? "signIn.createAccountLink" : "signUp.signInLink"}")}</Text></Button></Link></View>}>
    {error ? <Alert accessibilityRole="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    ${
      hasEmail
        ? `<form.Subscribe selector={(value) => value.isSubmitting}>{(pending) => <View className="gap-4">${oauth("pending")}
      ${fields.map((field) => `<form.Field name="${field}">{(input) => <AuthTextField label={t("${key}.${field}Label")} value={input.state.value} onChange={input.handleChange} onBlur={input.handleBlur} errors={input.state.meta.errors} disabled={pending || methods.pending}${field === "password" ? " secureTextEntry maxLength={64}" : field === "email" ? ' keyboardType="email-address" autoCapitalize="none"' : " maxLength={50}"} />}</form.Field>`).join("\n      ")}
      <Button disabled={pending || methods.pending} onPress={() => void form.handleSubmit()}><Text>{t("${key}.submit")}</Text></Button>
      ${kind === "sign-in" ? '<View className="flex-row flex-wrap gap-2"><Link href="/forgot-password" asChild><Button variant="ghost"><Text>{t("signIn.forgotPassword")}</Text></Button></Link><Link href="/magic-link" asChild><Button variant="ghost"><Text>{t("signIn.magicLink")}</Text></Button></Link><Link href="/verify-email" asChild><Button variant="ghost"><Text>{t("signIn.verifyEmail")}</Text></Button></Link></View>' : '<Text className="text-xs text-muted-foreground">{t("signUp.termsPrefix")} {t("signUp.securityNote")}</Text>'}
    </View>}</form.Subscribe>`
        : oauth("false")
    }
  </AuthFrame>;
}
`.replace(
    hasEmail
      ? "__not-present__"
      : 'import { NativeFormField as AuthTextField } from "@/components/form-fields/native-field";\n',
    "",
  );
}

export function expoChallengeFormContent(): string {
  return `${baseImports("TwoFactorFormState")}
import { Input } from "@/components/ui/input";
export function TwoFactorForm({ state, totpUri }: { state: TwoFactorFormState; totpUri: string }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form } = state;
  return <AuthFrame title={t("twoFactor.title")} description={t(state.useBackupCode ? "twoFactor.backupCodeDescription" : "twoFactor.description")} footer={<Link href="/sign-in" asChild><Button variant="ghost"><Text>{t("twoFactor.backSignIn")}</Text></Button></Link>}>
    {state.error ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    {totpUri ? <View className="gap-2"><Text>{t("twoFactor.setupUriLabel")}</Text><Input accessibilityLabel={t("twoFactor.setupUriLabel")} value={totpUri} editable={false} selectTextOnFocus /></View> : null}
    <form.Subscribe selector={(value) => value.isSubmitting}>{(pending) => <View className="gap-4"><form.Field name="code">{(field) => <AuthTextField label={t(state.useBackupCode ? "twoFactor.backupCodeLabel" : "twoFactor.codeLabel")} value={field.state.value} onChange={(value) => field.handleChange(state.useBackupCode ? value : value.replace(/[^0-9]/g, "").slice(0, 6))} onBlur={field.handleBlur} errors={field.state.meta.errors} disabled={pending} keyboardType={state.useBackupCode ? "default" : "number-pad"} maxLength={state.useBackupCode ? undefined : 6} autoCapitalize="none" />}</form.Field><Button disabled={pending} onPress={() => void form.handleSubmit()}><Text>{t("twoFactor.submit")}</Text></Button>{!totpUri ? <Button variant="ghost" disabled={pending} onPress={state.toggleMethod}><Text>{t(state.useBackupCode ? "twoFactor.useAuthenticatorCode" : "twoFactor.useBackupCode")}</Text></Button> : null}</View>}</form.Subscribe>
  </AuthFrame>;
}
`;
}

export function expoForgotFormContent(): string {
  return `${baseImports("ForgotPasswordFormState")}
export function ForgotPasswordForm({ state }: { state: ForgotPasswordFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const { form } = state;
  return <AuthFrame title={t("forgotPassword.title")} description={t("forgotPassword.description")} footer={<Link href="/sign-in" asChild><Button variant="ghost"><Text>{t("forgotPassword.backSignIn")}</Text></Button></Link>}>
    {state.error ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    {state.success ? <Alert accessibilityRole="alert"><AlertDescription>{t("forgotPassword.successMessage")}</AlertDescription></Alert> : null}
    <form.Subscribe selector={(value) => value.isSubmitting}>{(pending) => <View className="gap-4"><form.Field name="email">{(field) => <AuthTextField label={t("forgotPassword.emailLabel")} value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} disabled={pending} keyboardType="email-address" autoCapitalize="none" />}</form.Field><Button disabled={pending} onPress={() => void form.handleSubmit()}><Text>{t("forgotPassword.submit")}</Text></Button></View>}</form.Subscribe>
  </AuthFrame>;
}
`;
}

export function expoResetFormContent(): string {
  return `${baseImports("ResetPasswordFormState")}
export function ResetPasswordForm({ state }: { state: ResetPasswordFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const { form } = state;
  return <AuthFrame title={t("resetPassword.title")} description={t("resetPassword.description")} footer={<Link href="/sign-in" asChild><Button variant="ghost"><Text>{t("resetPassword.backSignIn")}</Text></Button></Link>}>
    {state.error ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    {!state.token ? <Link href="/forgot-password" asChild><Button variant="outline"><Text>{t("resetPassword.requestNewLink")}</Text></Button></Link> : <form.Subscribe selector={(value) => value.isSubmitting}>{(pending) => <View className="gap-4"><form.Field name="newPassword">{(field) => <AuthTextField label={t("resetPassword.newPasswordLabel")} value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} disabled={pending} secureTextEntry maxLength={64} />}</form.Field><form.Field name="confirmPassword">{(field) => <AuthTextField label={t("resetPassword.confirmPasswordLabel")} value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} disabled={pending} secureTextEntry maxLength={64} />}</form.Field><Button disabled={pending} onPress={() => void form.handleSubmit()}><Text>{t("resetPassword.submit")}</Text></Button></View>}</form.Subscribe>}
  </AuthFrame>;
}
`;
}

export function expoEmailFormContent(kind: "magic-link" | "verify-email"): string {
  const key = kind === "magic-link" ? "magicLink" : "verifyEmail";
  return `${baseImports("EmailFlowFormState")}
export function EmailFlowForm({ state }: { state: EmailFlowFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form } = state;
  return <AuthFrame title={t("emailFlow.${key}.title")} description={t("emailFlow.${key}.description")} footer={<Link href="/sign-in" asChild><Button variant="ghost"><Text>{t("emailFlow.backSignIn")}</Text></Button></Link>}>
    {state.error ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    {state.sent ? <Alert accessibilityRole="alert"><AlertDescription>{t("emailFlow.success")}</AlertDescription></Alert> : null}
    <form.Subscribe selector={(value) => value.isSubmitting}>{(pending) => <View className="gap-4"><form.Field name="email">{(field) => <AuthTextField label={t("emailFlow.emailLabel")} value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} disabled={pending} keyboardType="email-address" autoCapitalize="none" />}</form.Field><Button disabled={pending} onPress={() => void form.handleSubmit()}><Text>{t("emailFlow.sendLink")}</Text></Button></View>}</form.Subscribe>
  </AuthFrame>;
}
`;
}
