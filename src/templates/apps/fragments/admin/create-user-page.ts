import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function createUserFormContent(): string {
  return `"use client";

import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createAdminUserSchema } from "../schema";
import { useAdminUsersTranslations } from "../translations";
import type { CreateAdminUserInput } from "../types";

export interface CreateUserFormProps {
  error: string | null;
  pending: boolean;
  onCreate(input: CreateAdminUserInput): Promise<boolean>;
  onCreated(): void;
}

export function CreateUserForm({
  error,
  pending,
  onCreate,
  onCreated,
}: CreateUserFormProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  const roleOptions = [
    { label: translate("roles.user"), value: "user" },
    { label: translate("roles.admin"), value: "admin" },
  ] as const;
  const defaultValues: CreateAdminUserInput = {
    name: "",
    email: "",
    password: "",
    role: "user",
  };
  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: createAdminUserSchema(translate) },
    onSubmit: async ({ value }) => {
      const created = await onCreate(value);
      if (created) {
        form.reset();
        onCreated();
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{translate("create.cardTitle")}</CardTitle>
        <CardDescription className="max-w-[65ch]">
          {translate("create.cardDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>{translate("create.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <form.AppForm>
          <Form
            form={form}
            className="flex flex-col gap-6"
          >
            <FieldGroup>
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    label={translate("create.nameLabel")}
                    description={translate("create.nameDescription")}
                    placeholder={translate("create.namePlaceholder")}
                    autoComplete="name"
                    disabled={pending}
                  />
                )}
              </form.AppField>
              <form.AppField name="email">
                {(field) => (
                  <field.TextField
                    type="email"
                    label={translate("create.emailLabel")}
                    description={translate("create.emailDescription")}
                    placeholder={translate("create.emailPlaceholder")}
                    autoComplete="email"
                    disabled={pending}
                  />
                )}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.PasswordField
                    label={translate("create.passwordLabel")}
                    description={translate("create.passwordDescription")}
                    autoComplete="new-password"
                    disabled={pending}
                  />
                )}
              </form.AppField>
              <form.AppField name="role">
                {(field) => (
                  <field.SelectField
                    label={translate("create.roleLabel")}
                    description={translate("create.roleDescription")}
                    options={roleOptions}
                    disabled={pending}
                  />
                )}
              </form.AppField>
            </FieldGroup>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <span className="sr-only" role="status" aria-live="polite">
                  {isSubmitting ? translate("create.creating") : ""}
                </span>
              )}
            </form.Subscribe>
            <form.SubmitButton className="w-auto self-start" pendingLabel={translate("create.creatingPending")}>
              {translate("create.submit")}
            </form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}
`;
}

export function adminCreateUserFormFile(options: AdminTemplateOptions): TemplateFile {
  return file(
    `${adminFeatureRoot(options)}/components/create-user-form.tsx`,
    createUserFormContent(),
  );
}

export function nextAdminCreateUserPage(options: AdminTemplateOptions): TemplateFile {
  const root = options.sourceRoot === "src" ? "src/app" : "apps/web/src/app";
  return file(
    `${root}/admin/users/create/page.tsx`,
    `"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AdminCreateUserFeature, useAdminUsersTranslations } from "@/features/admin-users";

export default function AdminCreateUserPage(): React.JSX.Element {
  const router = useRouter();
  const translate = useAdminUsersTranslations();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{translate("create.shellTitle")}</h1>
          <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{translate("create.shellDescription")}</p>
        </div>
        <Button className="w-auto self-start" variant="outline" size="sm" render={<Link href="/admin/users" />} nativeButton={false}>
          {translate("create.back")}
        </Button>
      </header>
      <div className="w-full max-w-2xl"><AdminCreateUserFeature onCreated={() => router.push("/admin/users")} /></div>
    </main>
  );
}
`,
  );
}
