import { file, type TemplateFile } from "../../../shared.js";

export function settingsProfileCardContent(useServerActions = false): string {
  const actionImport = useServerActions ? 'import { updateProfileAction } from "../actions";' : "";
  const submit = useServerActions
    ? `const result = await updateProfileAction({ name: value.name });
      if (!result.ok) {
        setError(result.error);
        return;
      }`
    : `const result = await identityClient.updateProfile({ name: value.name });
      if (result.error) {
        setError(result.error.message ?? t("errors.profileUpdate"));
        return;
      }`;
  return `"use client";

import type * as React from "react";
import { useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { createProfileSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";
import { useQueryAuthSession } from "@/components/query-auth-boundary";
${actionImport}

interface ProfileEditorProps {
  email: string;
  initialName: string;
  role: string;
}

function ProfileEditor({ email, initialName, role }: ProfileEditorProps): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const form = useAppForm({
    defaultValues: { name: initialName },
    validators: {
      onSubmit: createProfileSchema({
        nameRequired: t("validation.nameRequired"),
        nameTooShort: t("validation.nameTooShort"),
        nameTooLong: t("validation.nameTooLong"),
      }),
    },
    onSubmit: async ({ value }) => {
      setError(null);
      setSuccess(false);
      try {
        ${submit.replaceAll("\n", "\n  ")}
        setSuccess(true);
      } catch {
        setError(t("errors.profileUpdate"));
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("profile.title")}</CardTitle>
        <CardDescription className="max-w-[60ch]">{t("profile.description", { email, role })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>{t("profile.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>{t("profile.successTitle")}</AlertTitle><AlertDescription>{t("profile.successMessage")}</AlertDescription></Alert> : null}
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-5">
            <FieldGroup>
              <form.AppField name="name">
                {(field) => <field.TextField label={t("profile.nameLabel")} description={t("profile.nameDescription")} placeholder={t("profile.namePlaceholder")} autoComplete="name" required maxLength={50} />}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton pendingLabel={t("profile.submitting")}>{t("profile.submit")}</form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}

export interface ProfileCardProps { initialUser?: { id: string; email: string; name: string | null; role: string | null }; }

const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ProfileCard({ initialUser }: ProfileCardProps): React.JSX.Element {
  const common = useSurfaceTranslations("common");
  const errors = useSurfaceTranslations("errors");
  const sessionState = identityClient.useSession();
  const canonical = useQueryAuthSession();
  const session = sessionState.data;
  const isPending = canonical?.hasCanonicalApi ? canonical.isPending : sessionState.isPending;
  const error = canonical?.hasCanonicalApi ? canonical.error : sessionState.error;
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  if (hydrated && isPending) return <Card role="status" aria-busy={true} aria-label={common("loading")}>
    <CardHeader><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-56" /></CardHeader>
    <CardContent className="flex flex-col gap-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-9 w-36" /></CardContent>
  </Card>;
  const liveUser = canonical?.hasCanonicalApi ? canonical.currentRequest?.user : session?.user;
  const user = hydrated ? liveUser : initialUser ?? liveUser;
  if (!user) return <Alert role="alert" variant={error ? "destructive" : "default"}>
    <AlertTitle>{errors(error ? "genericTitle" : "unauthorizedTitle")}</AlertTitle>
    <AlertDescription>{errors(error ? "genericDescription" : "unauthorizedDescription")}</AlertDescription>
  </Alert>;
  const roleValue = user && typeof user === "object" ? Reflect.get(user, "role") : undefined;
  const role = typeof roleValue === "string" ? roleValue : "user";
  return (
    <ProfileEditor
      key={user.id}
      email={user.email}
      initialName={user.name ?? ""}
      role={role}
    />
  );
}
`;
}

export function settingsProfileCard(useServerActions = false): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/profile-card.tsx",
    settingsProfileCardContent(useServerActions),
  );
}
