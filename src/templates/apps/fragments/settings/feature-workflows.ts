import { file, type TemplateFile } from "../../../shared.js";

function profileIdentity(): string {
  return `"use client";
import { useSyncExternalStore } from "react";
import { useSettingsIdentityQuery } from "./queries";
import type { SettingsUser } from "./model";
const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;
export function useProfileIdentity(initialUser?: SettingsUser) {
  const identity = useSettingsIdentityQuery();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return { user: hydrated ? identity.user : initialUser ?? identity.user, pending: hydrated && identity.isPending, error: identity.error };
}
`;
}

function profileForm(router: "next" | "tanstack", native = false): string {
  return `"use client";
${native ? 'import { useForm as useAppForm } from "@tanstack/react-form";' : 'import { useAppForm } from "@/components/ui/form";'}
import { createProfileSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
${native ? "" : 'import { toast } from "sonner";'}
${router === "next" ? 'import { useRouter } from "next/navigation";' : ""}
import { useSettingsIdentityRefresh, useUpdateProfileMutation } from "./mutations";

export function useProfileForm(initialName: string) {
  const t = useSurfaceTranslations("settings");
  ${router === "next" ? "const router = useRouter();" : ""}
  const mutation = useUpdateProfileMutation();
  const refreshSettingsIdentity = useSettingsIdentityRefresh();
  const form = useAppForm({
    defaultValues: { name: initialName },
    validators: { onSubmit: createProfileSchema({ nameRequired: t("validation.nameRequired"), nameTooShort: t("validation.nameTooShort"), nameTooLong: t("validation.nameTooLong") }) },
    onSubmit: async ({ value }) => {
      const result = await mutation.run(value);
      if (result.status !== "success" || !result.isCurrent()) return;
      ${native ? "" : 'toast.success(t("profile.successTitle"), { description: t("profile.successMessage") });'}
      refreshSettingsIdentity();
      ${router === "next" ? "router.refresh();" : ""}
    },
  });
  return { form, error: mutation.error ? t("errors.profileUpdate") : null, success: mutation.isSuccess };
}
export type ProfileForm = ReturnType<typeof useProfileForm>;
`;
}

function passwordForm(native = false): string {
  return `"use client";
${native ? 'import { useForm as useAppForm } from "@tanstack/react-form";' : 'import { useAppForm } from "@/components/ui/form";'}
import { createChangePasswordSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
${native ? "" : 'import { toast } from "sonner";'}
import { useChangePasswordMutation } from "./mutations";

export function usePasswordForm() {
  const t = useSurfaceTranslations("settings");
  const mutation = useChangePasswordMutation();
  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "" },
    validators: { onSubmit: createChangePasswordSchema({ currentPasswordRequired: t("validation.currentPasswordRequired"), passwordRequired: t("validation.passwordRequired"), passwordTooShort: t("validation.passwordTooShort"), passwordTooLong: t("validation.passwordTooLong") }) },
    onSubmit: async ({ value }) => {
      const result = await mutation.run(value);
      if (result.status !== "success" || !result.isCurrent()) return;
      form.reset();
      ${native ? "" : 'toast.success(t("password.successTitle"), { description: t("password.successMessage") });'}
    },
  });
  return { form, error: mutation.error ? t("errors.passwordUpdate") : null, success: mutation.isSuccess };
}
export type PasswordForm = ReturnType<typeof usePasswordForm>;
`;
}

function twoFactorForm(native = false): string {
  return `"use client";
${native ? 'import { useForm as useAppForm } from "@tanstack/react-form";' : 'import { useAppForm } from "@/components/ui/form";'}
import { createRequiredPasswordSchema, createTotpSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSettingsIdentityQuery } from "./queries";
import { useTwoFactorMutation } from "./mutations";

export function useTwoFactorSettings() {
  const t = useSurfaceTranslations("settings");
  const serverEnabled = useSettingsIdentityQuery().twoFactorEnabled;
  const prepare = useTwoFactorMutation();
  const complete = useTwoFactorMutation();
  const enabled = complete.data?.kind === "complete" && complete.variables?.previousEnabled === serverEnabled ? complete.data.enabled : serverEnabled;
  const challenge = !enabled && prepare.data?.kind === "challenge" ? prepare.data : null;
  const passwordSchema = createRequiredPasswordSchema(t("validation.passwordRequired"));
  const enableForm = useAppForm({ defaultValues: { password: "" }, validators: { onSubmit: passwordSchema }, onSubmit: async ({ value }) => {
    await prepare.run({ kind: "enable", password: value.password });
  } });
  const verifyForm = useAppForm({ defaultValues: { code: "" }, validators: { onSubmit: createTotpSchema(t("validation.codeSixDigits")) }, onSubmit: async ({ value }) => {
    const result = await complete.run({ kind: "verify", code: value.code, previousEnabled: serverEnabled });
    if (result.status !== "success" || !result.isCurrent()) return;
    verifyForm.reset(); enableForm.reset(); prepare.reset();
  } });
  const disableForm = useAppForm({ defaultValues: { password: "" }, validators: { onSubmit: passwordSchema }, onSubmit: async ({ value }) => {
    const result = await complete.run({ kind: "disable", password: value.password, previousEnabled: serverEnabled });
    if (result.status !== "success" || !result.isCurrent()) return;
    disableForm.reset(); prepare.reset();
  } });
  return { backupCodes: challenge?.backupCodes ?? null, totpUri: challenge?.totpUri ?? null, enabled, enableForm, verifyForm, disableForm,
    error: complete.error ? t(complete.variables?.kind === "verify" ? "errors.invalidCode" : "errors.twoFactorDisable") : prepare.error ? t("errors.twoFactorEnable") : null };
}
export type TwoFactorSettings = ReturnType<typeof useTwoFactorSettings>;
`;
}

function sessionManagement(): string {
  return `"use client";
import { useSettingsIdentityQuery, useSettingsSessionsQuery } from "./queries";
import { useRevokeSessionMutation } from "./mutations";
import type { IdentitySessionsInitialState } from "./model";
export function useIdentitySessions(initial: IdentitySessionsInitialState) {
  const identity = useSettingsIdentityQuery();
  const query = useSettingsSessionsQuery(initial);
  const mutation = useRevokeSessionMutation();
  const variables = mutation.variables;
  return {
    currentSessionId: identity.sessionId,
    sessions: (query.data ?? []).filter((session) => session.revokedAt === null),
    error: query.error ?? mutation.error, isLoading: query.isPending, isRefreshing: query.isFetching, readSucceeded: query.isSuccess,
    pendingSessionId: mutation.isPending && variables && "sessionId" in variables ? variables.sessionId : undefined,
    isRevokingOthers: mutation.isPending && Boolean(variables && "others" in variables),
    refresh: () => { void query.refetch(); },
    revokeSession: (sessionId: string) => { if (sessionId !== identity.sessionId) void mutation.run({ sessionId }); },
    revokeOtherSessions: () => { void mutation.run({ others: true }); },
  };
}
export type IdentitySessions = ReturnType<typeof useIdentitySessions>;
`;
}

export function accountDeletionWorkflowContent(
  router: "next" | "tanstack" | "expo",
  hasEmail: boolean,
): string {
  const native = router === "expo";
  return `"use client";
${hasEmail ? `${native ? 'import { useForm as useAppForm } from "@tanstack/react-form";' : 'import { useState } from "react";\nimport { useAppForm } from "@/components/ui/form";'}\nimport { createRequiredPasswordSchema } from "@/lib/auth-validation";` : ""}
import { ${router === "tanstack" ? "useNavigate" : "useRouter"} } from "${native ? "expo-router" : router === "next" ? "next/navigation" : "@tanstack/react-router"}";
import { useSurfaceTranslations } from "@/lib/translations";
import { isIdentityRecentAuthenticationError } from "@/lib/auth-model";
import { identityErrorCode } from "./model";
import { useDeleteAccountMutation } from "./mutations";
export function useAccountDeletion() {
  const t = useSurfaceTranslations("settings");
  ${router === "tanstack" ? "const navigate = useNavigate();" : "const router = useRouter();"}
  const mutation = useDeleteAccountMutation(() => { ${hasEmail ? `form.reset(); ${native ? "" : "setOpen(false);"}` : ""} ${native ? 'router.replace("/");' : router === "next" ? 'router.push("/"); router.refresh();' : 'void navigate({ to: "/" });'} });
  const error = !mutation.error ? null : identityErrorCode(mutation.error) === "ACCOUNT_DELETION_RESTRICTED" ? t("danger.retainedRecordError")
    : isIdentityRecentAuthenticationError(mutation.error.cause) ? t("danger.reauthenticate")
    : identityErrorCode(mutation.error) === "INVALID_PASSWORD" ? t("danger.invalidPassword") : t("danger.genericError");
${
  hasEmail
    ? `  ${native ? "" : "const [open, setOpen] = useState(false);"}
  const form = useAppForm({ defaultValues: { password: "" }, validators: { onSubmit: createRequiredPasswordSchema(t("validation.passwordRequired")) }, onSubmit: async ({ value }) => { await mutation.run(value.password); } });
  ${native ? "" : "const onOpenChange = (value: boolean) => { if (mutation.pending) return; setOpen(value); if (!value) { form.reset(); mutation.reset(); } };\n  const cancel = () => { if (!mutation.pending) setOpen(false); };"}
  return { form, ${native ? "" : "open, onOpenChange, cancel,"} error, pending: mutation.pending };`
    : "  return { error, pending: mutation.pending, remove: () => { void mutation.run(); } };"
}
}
export type AccountDeletion = ReturnType<typeof useAccountDeletion>;
`;
}

export function settingsWorkflowFiles(
  root: string,
  router: "next" | "tanstack",
  hasSessions: boolean,
  hasEmail: boolean,
  native = false,
): TemplateFile[] {
  return [
    file(`${root}/use-profile-identity.ts`, profileIdentity()),
    file(`${root}/use-profile-form.ts`, profileForm(router, native)),
    ...(hasEmail
      ? [
          file(`${root}/use-password-form.ts`, passwordForm(native)),
          file(`${root}/use-two-factor-settings.ts`, twoFactorForm(native)),
        ]
      : []),
    ...(hasSessions ? [file(`${root}/use-identity-sessions.ts`, sessionManagement())] : []),
  ];
}
