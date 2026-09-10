import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceOrganizationsCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
${i18n.importLine}
import type { WorkspaceOrganizations } from "../use-workspace-organizations";

interface OrganizationsCardProps {
  model: WorkspaceOrganizations;
}

export function OrganizationsCard({ model }: OrganizationsCardProps): React.JSX.Element {
${i18n.hookLine}
  const { form, organizationId, organizations, pending } = model;
  return <Card><CardHeader><CardTitle>${i18n.child("organizations")}</CardTitle><CardDescription>${i18n.child("organizationsDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    {model.loading ? <Skeleton className="h-16 w-full" aria-label={${i18n.value("loadingOrganizations")}} /> : model.ready && organizations.length === 0 ? <Empty><EmptyHeader><EmptyTitle>${i18n.child("noOrganizations")}</EmptyTitle><EmptyDescription>${i18n.child("noOrganizationsDescription")}</EmptyDescription></EmptyHeader></Empty> : null}
    {organizations.map((organization) => <Button key={organization.id} type="button" variant={organization.id === organizationId ? "secondary" : "outline"} aria-pressed={organization.id === organizationId} onClick={() => model.select(organization.id)} className="h-auto min-w-0 flex-col items-start gap-1 whitespace-normal p-3 text-start">
      <span className="max-w-full wrap-anywhere font-medium">{organization.name}</span><span className="max-w-full wrap-anywhere text-xs text-muted-foreground">{organization.slug}</span>
    </Button>)}
    <Separator />
    <form.AppForm><Form form={form} className="flex flex-col gap-3"><FieldGroup>
      <form.AppField name="name">{(field) => <field.TextField label={t("organizationName")} required maxLength={120} />}</form.AppField>
      <form.AppField name="slug">{(field) => <field.TextField label={t("organizationSlug")} placeholder={t("organizationSlugPlaceholder")} required minLength={2} maxLength={80} />}</form.AppField>
    </FieldGroup><form.SubmitButton disabled={pending}>${i18n.child("createOrganization")}</form.SubmitButton></Form></form.AppForm>
    {organizationId ? <Button variant="outline" disabled={pending} onClick={model.activate}>${i18n.child("useOrganization")}</Button> : null}
  </CardContent></Card>;
}
`;
}
