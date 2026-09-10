import { file, type TemplateFile } from "../../../shared.js";

const imports = `"use client";
import type * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { SettingsField, SettingsFeedback } from "./settings-field";
`;

function submit(form: string, label: string, extraDisabled = "false"): string {
  const pendingLabel: Record<string, string> = {
    "profile.submit": "profile.submitting",
    "password.submit": "password.submitting",
    "twoFactor.enable": "twoFactor.preparing",
    "twoFactor.disable": "twoFactor.disabling",
    "twoFactor.verify": "twoFactor.verifying",
    "danger.delete": "danger.deleting",
  };
  return `<${form}.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>{([canSubmit, pending]) => <Button disabled={${extraDisabled === "false" ? "" : `${extraDisabled} || `}!canSubmit || pending} onPress={() => void ${form}.handleSubmit()}><Text>{t(pending ? "${pendingLabel[label] ?? label}" : "${label}")}</Text></Button>}</${form}.Subscribe>`;
}

function field(form: string, name: string, label: string, password = false): string {
  return `<${form}.Field name="${name}">{(field) => <SettingsField field={field} label={t("${label}")}${password ? " secureTextEntry" : ""} />}</${form}.Field>`;
}

export function expoSettingsViews(
  root: string,
  hasApi: boolean,
  hasEmail: boolean,
): TemplateFile[] {
  return [
    file(
      `${root}/components/settings-field.tsx`,
      `import type * as React from "react";
import { NativeFormField } from "@/components/form-fields/native-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
interface FieldState { state: { value: string; meta: { errors: readonly unknown[] } }; handleChange(value: string): void; handleBlur(): void }
export function SettingsField({ field, label, secureTextEntry = false }: { field: FieldState; label: string; secureTextEntry?: boolean }): React.JSX.Element {
  return <NativeFormField value={field.state.value} label={label} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} secureTextEntry={secureTextEntry} autoCapitalize={secureTextEntry ? "none" : "sentences"} />;
}
export function SettingsFeedback({ error, success }: { error?: string | null; success?: string }): React.JSX.Element | null {
  return error || success ? <Alert accessibilityRole="alert" variant={error ? "destructive" : "default"}><AlertDescription>{error ?? success}</AlertDescription></Alert> : null;
}
`,
    ),
    file(
      `${root}/components/profile-view.tsx`,
      `${imports.replace('import { View } from "react-native";\n', "")}
import type { ProfileForm } from "../use-profile-form";
export function ProfileView({ email, model }: { email: string; model: ProfileForm }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { form } = model;
  return <Card><CardHeader><CardTitle>{t("profile.title")}</CardTitle><CardDescription>{email}</CardDescription></CardHeader><CardContent className="gap-3">${field("form", "name", "profile.nameLabel")}${submit("form", "profile.submit")}<SettingsFeedback error={model.error} success={model.success ? t("profile.successMessage") : undefined} /></CardContent></Card>;
}
`,
    ),
    ...(hasApi && hasEmail
      ? [
          file(
            `${root}/components/password-view.tsx`,
            `${imports.replace('import { View } from "react-native";\n', "")}
import type { PasswordForm } from "../use-password-form";
export function PasswordView({ model }: { model: PasswordForm }): React.JSX.Element {
  const t = useSurfaceTranslations("settings"); const { form } = model;
  return <Card><CardHeader><CardTitle>{t("password.title")}</CardTitle><CardDescription>{t("password.description")}</CardDescription></CardHeader><CardContent className="gap-3">${field("form", "currentPassword", "password.currentPasswordLabel", true)}${field("form", "newPassword", "password.newPasswordLabel", true)}${submit("form", "password.submit")}<SettingsFeedback error={model.error} success={model.success ? t("password.successMessage") : undefined} /></CardContent></Card>;
}
`,
          ),
          file(
            `${root}/components/two-factor-view.tsx`,
            `${imports}
import type { TwoFactorSettings } from "../use-two-factor-settings";
export function TwoFactorView({ model }: { model: TwoFactorSettings }): React.JSX.Element {
  const t = useSurfaceTranslations("settings"); const { enableForm, verifyForm, disableForm } = model;
  return <Card><CardHeader><CardTitle>{t("twoFactor.title")}</CardTitle><CardDescription>{t(model.enabled ? "twoFactor.enabled" : "twoFactor.disabled")}</CardDescription></CardHeader><CardContent className="gap-3">
    <SettingsFeedback error={model.error} />
    {model.enabled ? <View className="gap-3">${field("disableForm", "password", "twoFactor.passwordLabel", true)}${submit("disableForm", "twoFactor.disable")}</View>
      : model.totpUri ? <View className="gap-3"><Text>{t("twoFactor.scanDescription")}</Text><Text selectable className="font-mono text-xs">{model.totpUri}</Text>{model.backupCodes ? <View><Text>{t("twoFactor.backupCodesTitle")}</Text><Text selectable>{model.backupCodes.join("\\n")}</Text><Text>{t("twoFactor.backupCodesDescription")}</Text></View> : null}${field("verifyForm", "code", "twoFactor.codeLabel")}${submit("verifyForm", "twoFactor.verify")}</View>
      : <View className="gap-3">${field("enableForm", "password", "twoFactor.passwordLabel", true)}${submit("enableForm", "twoFactor.enable")}</View>}
  </CardContent></Card>;
}
`,
          ),
        ]
      : []),
    ...(hasApi
      ? [
          file(
            `${root}/components/sessions-view.tsx`,
            `${imports.replace("SettingsField, SettingsFeedback", "SettingsFeedback")}
import { ActivityIndicator } from "react-native";
import type { IdentitySessions } from "../use-identity-sessions";
export function SessionsView({ model }: { model: IdentitySessions }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  return <Card><CardHeader><CardTitle>{t("sessions.title")}</CardTitle><CardDescription>{t("sessions.description")}</CardDescription></CardHeader><CardContent className="gap-3">
    <SettingsFeedback error={model.error ? t("sessions.genericError") : null} />
    {model.isLoading ? <ActivityIndicator /> : model.readSucceeded && model.sessions.length === 0 ? <Text className="text-sm text-muted-foreground">{t("sessions.empty")}</Text> : model.sessions.map((session) => <View key={session.id} className="gap-2 rounded-xl border p-3"><Text>{session.userAgent ?? t("sessions.unknownDevice")}</Text>{session.id === model.currentSessionId ? <Text>{t("sessions.current")}</Text> : <Button disabled={model.pendingSessionId === session.id} variant="outline" onPress={() => model.revokeSession(session.id)}><Text>{t("sessions.revoke")}</Text></Button>}</View>)}
    <Button variant="outline" disabled={model.isRefreshing} onPress={model.refresh}><Text>{t("sessions.refresh")}</Text></Button>
    <Button variant="outline" disabled={model.isRevokingOthers || model.sessions.length < 2} onPress={model.revokeOtherSessions}><Text>{t("sessions.revokeOthers")}</Text></Button>
  </CardContent></Card>;
}
`,
          ),
        ]
      : []),
  ];
}

export function expoDeletionViewContent(hasEmail: boolean): string {
  return `${imports
    .replace('import { View } from "react-native";\n', "")
    .replace('from "./settings-field"', 'from "@/features/settings/components/settings-field"')
    .replace(hasEmail ? "__unused__" : "SettingsField, SettingsFeedback", "SettingsFeedback")}
import type { AccountDeletion } from "../use-account-deletion";
export function DangerZoneView({ model }: { model: AccountDeletion }): React.JSX.Element {
  const t = useSurfaceTranslations("settings"); ${hasEmail ? "const { form } = model;" : ""}
  return <Card className="border-destructive/40"><CardHeader><CardTitle>{t("danger.title")}</CardTitle><CardDescription>{t("${hasEmail ? "danger.description" : "danger.oauthDescription"}")}</CardDescription></CardHeader><CardContent className="gap-3"><SettingsFeedback error={model.error} />
    ${hasEmail ? `${field("form", "password", "native.confirmPassword", true)}${submit("form", "danger.delete", "model.pending")}` : '<Button variant="destructive" disabled={model.pending} onPress={model.remove}><Text>{t(model.pending ? "danger.deleting" : "danger.delete")}</Text></Button>'}
  </CardContent></Card>;
}
`;
}
