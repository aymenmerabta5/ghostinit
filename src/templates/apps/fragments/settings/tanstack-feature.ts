// @allow-long 640: typed settings adapters and prop-driven component renderers share one feature contract
import { file, type TemplateFile } from "../../../shared.js";
import { settingsPasskeyCardContent, settingsPasskeyListContent } from "./passkey-card.js";
import { settingsSessionsListContent } from "./sessions-card.js";

function settingsTypesContent(): string {
  return `export interface SettingsActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface EnableTwoFactorResult extends SettingsActionResult {
  totpUri?: string;
  backupCodes?: string[];
}

export interface SettingsSession {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: string | number | Date;
}

export interface SettingsProfile {
  key: string;
  email: string;
  initialName: string;
  role: string;
}
`;
}

function settingsSchemaContent(): string {
  return `import { z } from "zod";

interface PasswordMessages {
  passwordRequired: string;
  passwordTooShort: string;
  passwordTooLong: string;
}

function passwordSchema(messages: PasswordMessages) {
  return z.string().min(1, messages.passwordRequired).min(8, messages.passwordTooShort).max(64, messages.passwordTooLong);
}

export function createProfileSchema(messages: {
  nameRequired: string;
  nameTooShort: string;
  nameTooLong: string;
}) {
  return z.object({ name: z.string().trim().min(1, messages.nameRequired).min(2, messages.nameTooShort).max(50, messages.nameTooLong) });
}

export function createChangePasswordSchema(messages: PasswordMessages & { currentPasswordRequired: string }) {
  return z.object({
    currentPassword: z.string().min(1, messages.currentPasswordRequired),
    newPassword: passwordSchema(messages),
  });
}

export function createRequiredPasswordSchema(passwordRequired: string) {
  return z.object({ password: z.string().min(1, passwordRequired) });
}

export function createTotpSchema(codeSixDigits: string) {
  return z.object({ code: z.string().regex(/^[0-9]{6}$/, codeSixDigits) });
}
`;
}

function settingsQueriesContent(hasIdentityTransport: boolean, hasPasskey: boolean): string {
  const imports = hasIdentityTransport
    ? `import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, type QueryAuthScope } from "@/lib/query-client";`
    : "";
  const helpers = hasIdentityTransport
    ? `export function identitySessionsQueryOptions(scope: QueryAuthScope | null) {
  const options = orpc.identity.sessions.list.queryOptions({ input: {} });
  return {
    ...options,
    queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "identity-sessions"],
    enabled: Boolean(scope) && typeof window !== "undefined",
  };
}

export function identitySessionsQueryKey(scope: QueryAuthScope) {
  return authScopedQueryKey(scope, orpc.identity.sessions.list.key({ type: "query" }));
}`
    : "";
  const passkeyHelper = hasPasskey
    ? `export function usePasskeyListQuery() {
  return identityPasskeyClient.useList();
}`
    : "";
  const query = hasIdentityTransport
    ? `  const queryClient = useQueryClient();
  const queryScope = currentQueryAuthScope(queryClient);
  const sessionsQuery = useQuery(identitySessionsQueryOptions(queryScope));
  const sessions = (sessionsQuery.data ?? []).filter((item) => item.revokedAt === null);`
    : `  const sessions: never[] = [];`;
  const result = hasIdentityTransport
    ? `    sessions,
    sessionsError: sessionsQuery.error,
    sessionsFetching: sessionsQuery.isFetching,
    sessionsPending: sessionsQuery.isPending,
    refetchSessions: async () => { await sessionsQuery.refetch(); },`
    : `    sessions,
    sessionsError: null,
    sessionsFetching: false,
    sessionsPending: false,
    refetchSessions: async () => undefined,`;
  return `"use client";
${imports}
import { identityClient${hasPasskey ? ", identityPasskeyClient" : ""} } from "@/lib/auth-client";

${helpers}
${passkeyHelper}

export function useSettingsQueries() {
  const session = identityClient.useSession();
  const user = session.data?.user;
  const roleValue = user && typeof user === "object" ? Reflect.get(user, "role") : undefined;
  const twoFactorValue = user && typeof user === "object"
    ? Reflect.get(user, "twoFactorEnabled")
    : undefined;
${query}
  return {
    profile: {
      key: user ? user.id + ":" + (user.name ?? "") : "anonymous",
      email: user?.email ?? "",
      initialName: user?.name ?? "",
      role: typeof roleValue === "string" ? roleValue : "user",
    },
    serverTwoFactorEnabled: twoFactorValue === true,
    currentSessionId: session.data?.session.id,
${result}
  };
}
`;
}

function settingsMutationsContent(hasIdentityTransport: boolean, hasPasskey: boolean): string {
  const imports = hasIdentityTransport
    ? `import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { currentQueryAuthScope } from "@/lib/query-client";
import { identitySessionsQueryKey } from "./queries";`
    : "";
  const invalidateHelper = hasIdentityTransport
    ? `async function invalidateIdentitySessions(queryClient: QueryClient): Promise<void> {
  const scope = currentQueryAuthScope(queryClient);
  if (!scope) return;
  await queryClient.invalidateQueries({ queryKey: identitySessionsQueryKey(scope) });
}`
    : "";
  const transport = hasIdentityTransport
    ? `  const queryClient = useQueryClient();
  const revokeSession = useMutation(orpc.identity.sessions.revoke.mutationOptions({
    onSuccess: async () => invalidateIdentitySessions(queryClient),
  }));
  const revokeOthers = useMutation(orpc.identity.sessions.revokeOthers.mutationOptions({
    onSuccess: async () => invalidateIdentitySessions(queryClient),
  }));`
    : "";
  const transportResult = hasIdentityTransport
    ? `    revokeSession: (sessionId: string) => revokeSession.mutate({ sessionId }),
    revokeOthers: () => revokeOthers.mutate({}),
    revokingSessionId: revokeSession.isPending ? revokeSession.variables?.sessionId : undefined,
    revokingOthers: revokeOthers.isPending,
    sessionMutationError: revokeSession.error ?? revokeOthers.error,`
    : `    revokeSession: (_sessionId: string) => undefined,
    revokeOthers: () => undefined,
    revokingSessionId: undefined,
    revokingOthers: false,
    sessionMutationError: null,`;
  const passkeyHelpers = hasPasskey
    ? `export function isPasskeyRecentAuthenticationError(cause: unknown): boolean {
  return isIdentityRecentAuthenticationError(cause);
}

export async function registerPasskey(input: { name?: string }) {
  return identityPasskeyClient.register(input);
}

export async function renamePasskey(input: { id: string; name: string }) {
  return identityPasskeyClient.rename(input);
}

export async function deletePasskey(input: { id: string }) {
  return identityPasskeyClient.delete(input);
}`
    : "";
  return `"use client";
${imports}
import { identityClient${hasPasskey ? ", identityPasskeyClient, isIdentityRecentAuthenticationError" : ""} } from "@/lib/auth-client";
import type { EnableTwoFactorResult, SettingsActionResult } from "./types";

function actionResult(error: { code?: string; message?: string } | null | undefined): SettingsActionResult {
  return error ? { ok: false, code: error.code } : { ok: true };
}

async function recoverSettingsAction<Result extends SettingsActionResult>(
  operation: () => Promise<Result>,
): Promise<Result | SettingsActionResult> {
  try { return await operation(); }
  catch { return { ok: false, code: "REQUEST_FAILED" }; }
}

${invalidateHelper}
${passkeyHelpers}

export function useSettingsMutations() {
${transport}
  return {
    updateProfile: (name: string) => recoverSettingsAction(async () => {
      const result = await identityClient.updateProfile({ name });
      return actionResult(result.error);
    }),
    changePassword: (currentPassword: string, newPassword: string) => recoverSettingsAction(async () => {
      const result = await identityClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      return actionResult(result.error);
    }),
    enableTwoFactor: (password: string): Promise<EnableTwoFactorResult> => recoverSettingsAction(async () => {
      const result = await identityClient.enableTwoFactor({ password });
      if (result.error || !result.data) return { ok: false, code: result.error?.code };
      return { ok: true, totpUri: result.data.totpURI, backupCodes: result.data.backupCodes };
    }),
    verifyTwoFactor: (code: string) => recoverSettingsAction(async () => {
      const result = await identityClient.verifyTwoFactor({ code, trustDevice: false });
      return actionResult(result.error);
    }),
    disableTwoFactor: (password: string) => recoverSettingsAction(async () => {
      const result = await identityClient.disableTwoFactor({ password });
      return actionResult(result.error);
    }),
    deleteAccount: (password: string) => recoverSettingsAction(async () => {
      const result = await identityClient.deleteAccount({ password });
      return actionResult(result.error);
    }),
${transportResult}
  };
}
`;
}

function profileCardContent(): string {
  return `"use client";
import type * as React from "react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createProfileSchema } from "./schema";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SettingsActionResult, SettingsProfile } from "./types";

export function ProfileCard({ profile, updateProfile }: {
  profile: SettingsProfile;
  updateProfile: (name: string) => Promise<SettingsActionResult>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const form = useAppForm({
    defaultValues: { name: profile.initialName },
    validators: { onSubmit: createProfileSchema({
      nameRequired: t("validation.nameRequired"),
      nameTooShort: t("validation.nameTooShort"),
      nameTooLong: t("validation.nameTooLong"),
    }) },
    onSubmit: async ({ value }) => {
      setError(null); setSuccess(false);
      const result = await updateProfile(value.name);
      if (!result.ok) setError(result.message ?? t("errors.profileUpdate"));
      else setSuccess(true);
    },
  });
  return <Card><CardHeader>
    <CardTitle className="text-base">{t("profile.title")}</CardTitle>
    <CardDescription className="max-w-[60ch]">{t("profile.description", { email: profile.email, role: profile.role })}</CardDescription>
  </CardHeader><CardContent className="flex flex-col gap-4">
    {error ? <Alert variant="destructive"><AlertTitle>{t("profile.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {success ? <Alert><AlertTitle>{t("profile.successTitle")}</AlertTitle><AlertDescription>{t("profile.successMessage")}</AlertDescription></Alert> : null}
    <form.AppForm><Form form={form} className="flex flex-col gap-4"><FieldGroup>
      <form.AppField name="name">{(field) => <field.TextField label={t("profile.nameLabel")} description={t("profile.nameDescription")} placeholder={t("profile.namePlaceholder")} autoComplete="name" required maxLength={50} />}</form.AppField>
    </FieldGroup><form.SubmitButton pendingLabel={t("profile.submitting")}>{t("profile.submit")}</form.SubmitButton></Form></form.AppForm>
  </CardContent></Card>;
}
`;
}

function passwordCardContent(): string {
  return `"use client";
import type * as React from "react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createChangePasswordSchema } from "./schema";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SettingsActionResult } from "./types";

export function PasswordCard({ changePassword }: {
  changePassword: (currentPassword: string, newPassword: string) => Promise<SettingsActionResult>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "" },
    validators: { onSubmit: createChangePasswordSchema({
      currentPasswordRequired: t("validation.currentPasswordRequired"),
      passwordRequired: t("validation.passwordRequired"),
      passwordTooShort: t("validation.passwordTooShort"),
      passwordTooLong: t("validation.passwordTooLong"),
    }) },
    onSubmit: async ({ value }) => {
      setError(null); setSuccess(false);
      const result = await changePassword(value.currentPassword, value.newPassword);
      if (!result.ok) setError(result.message ?? t("errors.passwordUpdate"));
      else { setSuccess(true); form.reset(); }
    },
  });
  return <Card><CardHeader><CardTitle className="text-base">{t("password.title")}</CardTitle><CardDescription>{t("password.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {error ? <Alert variant="destructive"><AlertTitle>{t("password.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {success ? <Alert><AlertTitle>{t("password.successTitle")}</AlertTitle><AlertDescription>{t("password.successMessage")}</AlertDescription></Alert> : null}
    <form.AppForm><Form form={form} className="flex flex-col gap-4"><FieldGroup>
      <form.AppField name="currentPassword">{(field) => <field.PasswordField label={t("password.currentPasswordLabel")} autoComplete="current-password" required />}</form.AppField>
      <form.AppField name="newPassword">{(field) => <field.PasswordField label={t("password.newPasswordLabel")} description={t("password.newPasswordDescription")} autoComplete="new-password" required minLength={8} maxLength={64} />}</form.AppField>
    </FieldGroup><form.SubmitButton pendingLabel={t("password.submitting")}>{t("password.submit")}</form.SubmitButton></Form></form.AppForm>
  </CardContent></Card>;
}
`;
}

function twoFactorHookContent(): string {
  return `"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createRequiredPasswordSchema, createTotpSchema } from "./schema";
import { useSurfaceTranslations } from "@/lib/translations";
import type { EnableTwoFactorResult, SettingsActionResult } from "./types";

interface TwoFactorActions {
  enable: (password: string) => Promise<EnableTwoFactorResult>;
  verify: (code: string) => Promise<SettingsActionResult>;
  disable: (password: string) => Promise<SettingsActionResult>;
}

export function useTwoFactorSettings(serverEnabled: boolean, actions: TwoFactorActions) {
  const t = useSurfaceTranslations("settings");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<{ server: boolean; value: boolean } | null>(null);
  const enabled = optimistic?.server === serverEnabled ? optimistic.value : serverEnabled;
  const passwordSchema = createRequiredPasswordSchema(t("validation.passwordRequired"));
  const enableForm = useAppForm({
    defaultValues: { password: "" }, validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      setError(null); const result = await actions.enable(value.password);
      if (!result.ok || !result.totpUri) { setError(result.message ?? t("errors.twoFactorEnable")); return; }
      setTotpUri(result.totpUri); setBackupCodes(result.backupCodes ?? []);
    },
  });
  const verifyForm = useAppForm({
    defaultValues: { code: "" }, validators: { onSubmit: createTotpSchema(t("validation.codeSixDigits")) },
    onSubmit: async ({ value }) => {
      setError(null); const result = await actions.verify(value.code);
      if (!result.ok) { setError(result.message ?? t("errors.invalidCode")); return; }
      setOptimistic({ server: serverEnabled, value: true }); setTotpUri(null); setBackupCodes(null);
      verifyForm.reset(); enableForm.reset();
    },
  });
  const disableForm = useAppForm({
    defaultValues: { password: "" }, validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      setError(null); const result = await actions.disable(value.password);
      if (!result.ok) { setError(result.message ?? t("errors.twoFactorDisable")); return; }
      setOptimistic({ server: serverEnabled, value: false }); disableForm.reset();
    },
  });
  return { backupCodes, disableForm, enabled, enableForm, error, totpUri, verifyForm };
}
`;
}

function twoFactorCardContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useTwoFactorSettings } from "./use-two-factor-settings";
import type { EnableTwoFactorResult, SettingsActionResult } from "./types";

interface TwoFactorCardProps {
  serverEnabled: boolean;
  enable: (password: string) => Promise<EnableTwoFactorResult>;
  verify: (code: string) => Promise<SettingsActionResult>;
  disable: (password: string) => Promise<SettingsActionResult>;
}

export function TwoFactorCard(props: TwoFactorCardProps): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const state = useTwoFactorSettings(props.serverEnabled, props);
  const { backupCodes, disableForm, enabled, enableForm, error, totpUri, verifyForm } = state;
  return <Card><CardHeader><div className="flex items-center justify-between gap-3">
    <CardTitle className="text-base">{t("twoFactor.title")}</CardTitle><Badge variant={enabled ? "secondary" : "outline"}>{enabled ? t("twoFactor.enabled") : t("twoFactor.disabled")}</Badge>
  </div><CardDescription>{t("twoFactor.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {error ? <Alert variant="destructive"><AlertTitle>{t("twoFactor.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {enabled ? <disableForm.AppForm><Form form={disableForm} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("twoFactor.enabledDescription")}</p><FieldGroup><disableForm.AppField name="password">{(field) => <field.PasswordField label={t("twoFactor.passwordLabel")} autoComplete="current-password" required />}</disableForm.AppField></FieldGroup><disableForm.SubmitButton variant="outline" pendingLabel={t("twoFactor.disabling")}>{t("twoFactor.disable")}</disableForm.SubmitButton>
    </Form></disableForm.AppForm> : !totpUri ? <enableForm.AppForm><Form form={enableForm} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("twoFactor.enableDescription")}</p><FieldGroup><enableForm.AppField name="password">{(field) => <field.PasswordField label={t("twoFactor.passwordLabel")} autoComplete="current-password" required />}</enableForm.AppField></FieldGroup><enableForm.SubmitButton pendingLabel={t("twoFactor.preparing")}>{t("twoFactor.enable")}</enableForm.SubmitButton>
    </Form></enableForm.AppForm> : <verifyForm.AppForm><Form form={verifyForm} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("twoFactor.scanDescription")}</p><div className="break-all rounded-md border p-3 font-mono text-xs">{totpUri}</div>
      {backupCodes ? <pre className="whitespace-pre-wrap rounded-md border p-3 font-mono text-xs">{backupCodes.join("\\n")}</pre> : null}
      <FieldGroup><verifyForm.AppField name="code">{(field) => <field.OtpField label={t("twoFactor.codeLabel")} description={t("twoFactor.codeDescription")} placeholder="000000" required length={6} />}</verifyForm.AppField></FieldGroup><verifyForm.SubmitButton pendingLabel={t("twoFactor.verifying")}>{t("twoFactor.verify")}</verifyForm.SubmitButton>
    </Form></verifyForm.AppForm>}
  </CardContent></Card>;
}
`;
}

function sessionsCardContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSurfaceTranslations } from "@/lib/translations";
import { SessionList } from "./session-list";
import type { SettingsSession } from "./types";

interface SessionsCardProps {
  currentSessionId?: string;
  error: unknown;
  isFetching: boolean;
  loading: boolean;
  pendingSessionId?: string;
  revokingOthers: boolean;
  sessions: SettingsSession[];
  refresh: () => Promise<void>;
  revoke: (sessionId: string) => void;
  revokeOthers: () => void;
}

export function SessionsCard(props: SessionsCardProps): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  return <Card><CardHeader><div className="flex items-center justify-between gap-2">
    <CardTitle className="text-base">{t("sessions.title")}</CardTitle><Badge variant="secondary">{props.sessions.length}</Badge>
  </div><CardDescription>{t("sessions.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {props.error ? <Alert variant="destructive"><AlertTitle>{t("sessions.errorTitle")}</AlertTitle><AlertDescription>{props.error instanceof Error ? props.error.message : t("sessions.genericError")}</AlertDescription></Alert> : null}
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => void props.refresh()} disabled={props.isFetching}>{props.isFetching ? t("sessions.loading") : t("sessions.refresh")}</Button>
      <Button size="sm" variant="destructive" onClick={props.revokeOthers} disabled={props.sessions.length <= 1 || props.revokingOthers}>{props.revokingOthers ? t("sessions.revokingOthers") : t("sessions.revokeOthers")}</Button>
    </div><Separator /><SessionList currentSessionId={props.currentSessionId} isLoading={props.loading} pendingSessionId={props.pendingSessionId} sessions={props.sessions} onRevoke={props.revoke} />
  </CardContent></Card>;
}
`;
}

function dangerZoneContent(hasEmail = true): string {
  if (!hasEmail) {
    return `"use client";
import type * as React from "react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SettingsActionResult } from "./types";

export function DangerZoneSection({ deleteAccount }: {
  deleteAccount: () => Promise<SettingsActionResult>;
}): React.JSX.Element {
  const navigate = useNavigate(); const t = useSurfaceTranslations("settings");
  const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);
  async function remove(): Promise<void> {
    setError(null); setPending(true);
    try {
      const result = await deleteAccount();
      if (!result.ok) { setError(result.code === "SESSION_EXPIRED" || result.code === "SESSION_NOT_FRESH" ? t("danger.reauthenticate") : t("danger.genericError")); return; }
      await navigate({ to: "/" });
    } catch { setError(t("danger.genericError")); }
    finally { setPending(false); }
  }
  return <Card className="border-destructive/30"><CardHeader><CardTitle className="text-base text-destructive">{t("danger.title")}</CardTitle><CardDescription>{t("danger.oauthDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    {error ? <Alert variant="destructive"><AlertTitle>{t("danger.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Button variant="destructive" disabled={pending} onClick={() => void remove()}>{pending ? t("danger.deleting") : t("danger.delete")}</Button>
  </CardContent></Card>;
}
`;
  }
  return `"use client";
import type * as React from "react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createRequiredPasswordSchema } from "./schema";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SettingsActionResult } from "./types";

export function DangerZoneSection({ deleteAccount }: {
  deleteAccount: (password: string) => Promise<SettingsActionResult>;
}): React.JSX.Element {
  const navigate = useNavigate(); const t = useSurfaceTranslations("settings");
  const [error, setError] = useState<string | null>(null); const [open, setOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: createRequiredPasswordSchema(t("validation.passwordRequired")) },
    onSubmit: async ({ value }) => {
      setError(null); const result = await deleteAccount(value.password);
      if (!result.ok) { setError(result.message ?? t("errors.deleteAccount")); return; }
      setOpen(false); void navigate({ to: "/" });
    },
  });
  return <Card className="border-destructive/30"><CardHeader><CardTitle className="text-base text-destructive">{t("danger.title")}</CardTitle><CardDescription>{t("danger.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    {error ? <Alert variant="destructive"><AlertTitle>{t("danger.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) form.reset(); }}><DialogTrigger render={<Button variant="destructive" />}>{t("danger.delete")}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{t("danger.dialogTitle")}</DialogTitle><DialogDescription>{t("danger.dialogDescription")}</DialogDescription></DialogHeader>
      <form.AppForm><Form form={form} className="flex flex-col gap-3"><FieldGroup><form.AppField name="password">{(field) => <field.PasswordField label={t("danger.passwordLabel")} description={t("danger.passwordDescription")} placeholder={t("danger.passwordPlaceholder")} autoComplete="current-password" required />}</form.AppField></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("danger.cancel")}</Button><form.SubmitButton variant="destructive" pendingLabel={t("danger.deleting")}>{t("danger.confirm")}</form.SubmitButton></DialogFooter></Form></form.AppForm>
    </DialogContent></Dialog>
  </CardContent></Card>;
}
`;
}

function controllerContent(
  hasIdentityTransport: boolean,
  hasEmail: boolean,
  hasPasskey: boolean,
): string {
  const sessionsImport = hasIdentityTransport
    ? `import { SessionsCard } from "./sessions-card";`
    : "";
  const sessions = hasIdentityTransport
    ? `      <SessionsCard
        currentSessionId={queries.currentSessionId}
        error={queries.sessionsError ?? mutations.sessionMutationError}
        isFetching={queries.sessionsFetching}
        loading={queries.sessionsPending}
        pendingSessionId={mutations.revokingSessionId}
        revokingOthers={mutations.revokingOthers}
        sessions={queries.sessions}
        refresh={queries.refetchSessions}
        revoke={mutations.revokeSession}
        revokeOthers={mutations.revokeOthers}
      />`
    : "";
  const passwordImports = hasEmail
    ? `import { PasswordCard } from "./password-card";
import { TwoFactorCard } from "./two-factor-card";`
    : "";
  const passwordCards = hasEmail
    ? `    <PasswordCard changePassword={mutations.changePassword} />
    <TwoFactorCard serverEnabled={queries.serverTwoFactorEnabled} enable={mutations.enableTwoFactor} verify={mutations.verifyTwoFactor} disable={mutations.disableTwoFactor} />`
    : "";
  const passkeyImport = hasPasskey ? `import { PasskeyCard } from "./passkey-card";` : "";
  const passkeyCard = hasPasskey ? "    <PasskeyCard />" : "";
  const dangerSection = hasEmail
    ? "<DangerZoneSection deleteAccount={mutations.deleteAccount} />"
    : '<DangerZoneSection deleteAccount={() => mutations.deleteAccount("")} />';
  return `"use client";
import type * as React from "react";
import { DangerZoneSection } from "./danger-zone-section";
${passwordImports}
${passkeyImport}
import { ProfileCard } from "./profile-card";
import { SecurityNavigationSection } from "./security-navigation-section";
${sessionsImport}
import { useSettingsMutations } from "./mutations";
import { useSettingsQueries } from "./queries";

export function SettingsController(): React.JSX.Element {
  const queries = useSettingsQueries();
  const mutations = useSettingsMutations();
  return <>
    <ProfileCard key={queries.profile.key} profile={queries.profile} updateProfile={mutations.updateProfile} />
${passwordCards}
${passkeyCard}
${sessions}
    <SecurityNavigationSection />
    ${dangerSection}
  </>;
}
`;
}

export function tanstackSettingsDataFeatureFiles(
  root: string,
  hasIdentityTransport: boolean,
  securityContent: string,
  hasEmail = true,
  hasPasskey = true,
): TemplateFile[] {
  return [
    file(`${root}/types.ts`, settingsTypesContent()),
    file(`${root}/schema.ts`, settingsSchemaContent()),
    file(`${root}/queries.ts`, settingsQueriesContent(hasIdentityTransport, hasPasskey)),
    file(`${root}/mutations.ts`, settingsMutationsContent(hasIdentityTransport, hasPasskey)),
    file(
      `${root}/settings-controller.tsx`,
      controllerContent(hasIdentityTransport, hasEmail, hasPasskey),
    ),
    file(`${root}/profile-card.tsx`, profileCardContent()),
    ...(hasEmail
      ? [
          file(`${root}/password-card.tsx`, passwordCardContent()),
          file(`${root}/two-factor-card.tsx`, twoFactorCardContent()),
          file(`${root}/use-two-factor-settings.ts`, twoFactorHookContent()),
        ]
      : []),
    ...(hasPasskey
      ? [
          file(`${root}/passkey-card.tsx`, settingsPasskeyCardContent("feature-adapter")),
          file(`${root}/passkey-list.tsx`, settingsPasskeyListContent()),
        ]
      : []),
    ...(hasIdentityTransport
      ? [
          file(`${root}/sessions-card.tsx`, sessionsCardContent()),
          file(`${root}/session-list.tsx`, settingsSessionsListContent()),
        ]
      : []),
    file(`${root}/security-navigation-section.tsx`, securityContent),
    file(`${root}/danger-zone-section.tsx`, dangerZoneContent(hasEmail)),
  ];
}
