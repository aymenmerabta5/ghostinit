import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceMembersCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
${i18n.importLine}
import type { IdentityWorkspaceController } from "../controller";
import { organizationRole } from "../types";

interface MembersCardProps {
  workspace: IdentityWorkspaceController;
}

export function MembersCard({ workspace }: MembersCardProps): React.JSX.Element {
${i18n.hookLine}
  const { changeMemberRole, members, organizationId, pending, removeMember, run } = workspace;
  const roleItems = [{ label: t("roles.owner"), value: "owner" }, { label: t("roles.admin"), value: "admin" }, { label: t("roles.member"), value: "member" }] as const;
  return <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>${i18n.child("members")}</CardTitle><CardDescription>${i18n.child("membersPolicyDescription")}</CardDescription></div><Badge variant="secondary">{members.data?.length ?? 0}</Badge></div></CardHeader><CardContent className="flex flex-col gap-2">
    {(members.data ?? []).map((membership) => <div key={membership.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-mono text-xs">{membership.userId}</p><p className="text-xs text-muted-foreground">{t(membership.role === "owner" ? "roles.owner" : membership.role === "admin" ? "roles.admin" : "roles.member")}</p></div><div className="flex items-end gap-2"><Field><FieldLabel className="sr-only" htmlFor={"member-role-" + membership.id}>${i18n.child("memberRole")}</FieldLabel><Select items={roleItems} value={membership.role} onValueChange={(value) => organizationId && void run(() => changeMemberRole.mutateAsync({ organizationId, membershipId: membership.id, role: organizationRole(value) }))}><SelectTrigger id={"member-role-" + membership.id} aria-label={${i18n.value("memberRole")}}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roleItems.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Button size="sm" variant="destructive" disabled={pending} onClick={() => organizationId && void run(() => removeMember.mutateAsync({ organizationId, membershipId: membership.id }))}>${i18n.child("remove")}</Button></div></div>)}
  </CardContent></Card>;
}
`;
}
