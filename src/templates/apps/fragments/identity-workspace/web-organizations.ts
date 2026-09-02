import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceOrganizationsCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
${i18n.importLine}
import type { IdentityWorkspaceController } from "../controller";

interface OrganizationsCardProps {
  workspace: IdentityWorkspaceController;
}

export function OrganizationsCard({ workspace }: OrganizationsCardProps): React.JSX.Element {
${i18n.hookLine}
  const { createOrganization, organizationId, organizationName, organizations, organizationSlug,
    pending, run, setActiveOrganization, setOrganizationName, setOrganizationSlug,
    setSelectedOrganizationId } = workspace;
  return <Card><CardHeader><CardTitle>${i18n.child("organizations")}</CardTitle><CardDescription>${i18n.child("organizationsDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    {organizations.isPending ? <Skeleton className="h-16 w-full" aria-label={${i18n.value("loadingOrganizations")}} /> : (organizations.data ?? []).length === 0 ? <Empty><EmptyHeader><EmptyTitle>${i18n.child("noOrganizations")}</EmptyTitle><EmptyDescription>${i18n.child("noOrganizationsDescription")}</EmptyDescription></EmptyHeader></Empty> : null}
    {(organizations.data ?? []).map((organization) => <Button key={organization.id} type="button" variant={organization.id === organizationId ? "secondary" : "outline"} aria-pressed={organization.id === organizationId} onClick={() => setSelectedOrganizationId(organization.id)} className="h-auto justify-start p-3 text-start">
      <span className="block font-medium">{organization.name}</span><span className="text-xs text-muted-foreground">{organization.slug}</span>
    </Button>)}
    <Separator />
    <FieldGroup>
      <Field><FieldLabel htmlFor="organization-name">${i18n.child("organizationName")}</FieldLabel><Input id="organization-name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></Field>
      <Field><FieldLabel htmlFor="organization-slug">${i18n.child("organizationSlug")}</FieldLabel><Input id="organization-slug" value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value)} placeholder={${i18n.value("organizationSlugPlaceholder")}} /></Field>
    </FieldGroup>
    <Button disabled={pending || !organizationName.trim() || !organizationSlug.trim()} onClick={() => void run(() => createOrganization.mutateAsync({ name: organizationName.trim(), slug: organizationSlug.trim() }))}>${i18n.child("createOrganization")}</Button>
    {organizationId ? <Button variant="outline" disabled={pending} onClick={() => void run(() => setActiveOrganization.mutateAsync({ organizationId }))}>${i18n.child("useOrganization")}</Button> : null}
  </CardContent></Card>;
}
`;
}
