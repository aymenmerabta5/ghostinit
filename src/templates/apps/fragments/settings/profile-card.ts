import { file, type TemplateFile } from "../../../shared.js";

export function settingsProfileCardContent(): string {
  return `"use client";

import type * as React from "react";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { createProfileSchema, identityClient } from "@/lib/auth-client";
import { getQueryClient, requestQueryAuthScopeRefresh } from "@/lib/query-client";
import { useSurfaceTranslations } from "@/lib/translations";
import { useQueryAuthSession } from "@/components/query-auth-boundary";

interface ProfileEditorProps {
  email: string;
  initialName: string;
  role: string;
}

function ProfileEditor({ email, initialName, role }: ProfileEditorProps): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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
      try {
        const result = await identityClient.updateProfile({ name: value.name });
        if (result.error) { setError(t("errors.profileUpdate")); return; }
        // Canonical identity refresh can remount the form; feedback belongs to the toast store.
        toast.success(t("profile.successTitle"), { description: t("profile.successMessage") });
        requestQueryAuthScopeRefresh(getQueryClient());
        router.refresh();
      } catch {
        setError(t("errors.profileUpdate"));
      }
    },
  });

  return (
    <Card className="grid gap-0 overflow-hidden xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <CardHeader className="border-b border-border/70 bg-muted/20 xl:border-b-0 xl:border-e">
        <CardTitle as="h2">{t("profile.title")}</CardTitle>
        <CardDescription className="max-w-[44ch] break-words">{t("profile.description", { email, role })}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
        {error ? <Alert variant="destructive"><AlertTitle>{t("profile.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form.AppForm>
          <Form form={form} className="flex max-w-xl flex-col gap-5">
            <FieldGroup>
              <form.AppField name="name">
                {(field) => <field.TextField label={t("profile.nameLabel")} description={t("profile.nameDescription")} placeholder={t("profile.namePlaceholder")} autoComplete="name" required maxLength={50} />}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton className="w-auto self-start" pendingLabel={t("profile.submitting")}>{t("profile.submit")}</form.SubmitButton>
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

export function settingsProfileCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/profile-card.tsx",
    settingsProfileCardContent(),
  );
}
