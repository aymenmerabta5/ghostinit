import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceMembersCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
${i18n.importLine}
import type { WorkspaceMembers } from "../use-workspace-members";
import { MemberRow } from "./member-row";

export function MembersCard({ model }: { model: WorkspaceMembers }): React.JSX.Element {
${i18n.hookLine}
  const members = model.members;
  return <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>${i18n.child("members")}</CardTitle><CardDescription>${i18n.child("membersPolicyDescription")}</CardDescription></div><Badge variant="secondary">{members.length}</Badge></div></CardHeader><CardContent className="flex flex-col gap-2">
    {members.map((membership) => <MemberRow key={membership.id} membership={membership} model={model} />)}
  </CardContent></Card>;
}
`;
}

export function identityWorkspaceMemberRowContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
${i18n.importLine}
import type { WorkspaceMembers } from "../use-workspace-members";
import { organizationRole, type IdentityOrganizationMembership } from "../types";
import { MemberIdentity } from "./member-identity";

export function MemberRow({ membership, model }: { membership: IdentityOrganizationMembership; model: WorkspaceMembers }): React.JSX.Element {
${i18n.hookLine}
  const { access, pending, currentUser } = model;
  const roleLabel = (role: string) => t(role === "owner" ? "roles.owner" : role === "admin" ? "roles.admin" : "roles.member");
  const roleItems = access.rolesForMember(membership).map((value) => ({ value, label: roleLabel(value) }));
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
    <div className="space-y-1"><MemberIdentity userId={membership.userId} currentUser={currentUser} /><p className="text-xs text-muted-foreground">{roleLabel(membership.role)}</p></div>
    {access.canManageMember(membership) ? <div className="flex items-end gap-2">
      <Field><FieldLabel className="sr-only" htmlFor={"member-role-" + membership.id}>${i18n.child("memberRole")}</FieldLabel>
        <Select items={roleItems} disabled={pending} value={membership.role} onValueChange={(value) => model.changeRole(membership, organizationRole(value))}>
          <SelectTrigger id={"member-role-" + membership.id}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roleItems.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => model.remove(membership)}>${i18n.child("remove")}</Button>
    </div> : null}
  </div>;
}
`;
}
