import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceInvitationsCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
${i18n.importLine}
import type { WorkspaceInvitations } from "../use-workspace-invitations";
import { InvitationRow } from "./invitation-row";

interface InvitationsCardProps {
  model: WorkspaceInvitations;
}

export function InvitationsCard({ model }: InvitationsCardProps): React.JSX.Element {
${i18n.hookLine}
  const { form, invitations, pending, permissions } = model;
  const roleItems = [{ label: t("roles.admin"), value: "admin" }, { label: t("roles.member"), value: "member" }] as const;
  return <Card><CardHeader><CardTitle>${i18n.child("invitations")}</CardTitle><CardDescription>${i18n.child("invitationsDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    {model.canWrite ? <form.AppForm><Form form={form} className="flex flex-col gap-3"><FieldGroup className="grid sm:grid-cols-[1fr_9rem] sm:items-end">
      <form.AppField name="email">{(field) => <field.TextField type="email" label={t("inviteEmail")} placeholder={t("inviteEmailPlaceholder")} required />}</form.AppField>
      <form.AppField name="role">{(field) => <field.SelectField label={t("roleLabel")} options={roleItems} />}</form.AppField>
    </FieldGroup><form.SubmitButton disabled={pending}>${i18n.child("invite")}</form.SubmitButton></Form></form.AppForm> : null}
    {!permissions.isPending && !permissions.hasError && !permissions.canReadInvitations ? <p className="text-sm text-muted-foreground">${i18n.child("invitationsRestricted")}</p> : null}
    {permissions.canReadInvitations ? invitations.map((invitation) => <InvitationRow key={invitation.id} invitation={invitation} pending={pending} canCancel={model.canCancel} canAccept={model.canAccept(invitation)} onAccept={() => model.accept(invitation)} onCancel={() => model.cancel(invitation)} />) : null}
  </CardContent></Card>;
}
`;
}
