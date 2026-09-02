import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceInvitationsCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
${i18n.importLine}
import type { IdentityWorkspaceController } from "../controller";
import { organizationRole } from "../types";
import { InvitationRow } from "./invitation-row";

interface InvitationsCardProps {
  workspace: IdentityWorkspaceController;
}

export function InvitationsCard({ workspace }: InvitationsCardProps): React.JSX.Element {
${i18n.hookLine}
  const { acceptInvitation, cancelInvitation, invitations, inviteEmail, inviteMember, inviteRole,
    organizationId, pending, run, setInviteEmail, setInviteRole } = workspace;
  const roleItems = [{ label: t("roles.admin"), value: "admin" }, { label: t("roles.member"), value: "member" }] as const;
  return <Card><CardHeader><CardTitle>${i18n.child("invitations")}</CardTitle><CardDescription>${i18n.child("invitationsDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    <FieldGroup className="grid sm:grid-cols-[1fr_9rem_auto] sm:items-end">
      <Field><FieldLabel htmlFor="invitation-email">${i18n.child("inviteEmail")}</FieldLabel><Input id="invitation-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder={${i18n.value("inviteEmailPlaceholder")}} /></Field>
      <Field><FieldLabel htmlFor="invitation-role">${i18n.child("roleLabel")}</FieldLabel><Select items={roleItems} value={inviteRole} onValueChange={(value) => setInviteRole(organizationRole(value))}><SelectTrigger id="invitation-role"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roleItems.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Button disabled={pending || !organizationId || !inviteEmail.includes("@")} onClick={() => organizationId && void run(() => inviteMember.mutateAsync({ organizationId, email: inviteEmail.trim(), role: inviteRole }))}>${i18n.child("invite")}</Button>
    </FieldGroup>
    {(invitations.data ?? []).map((invitation) => <InvitationRow key={invitation.id} invitation={invitation} pending={pending} onAccept={(invitationId) => run(() => acceptInvitation.mutateAsync({ invitationId }))} onCancel={(invitationId) => run(() => cancelInvitation.mutateAsync({ invitationId }))} />)}
  </CardContent></Card>;
}
`;
}
