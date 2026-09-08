import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceTeamsCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
${i18n.importLine}
import type { IdentityWorkspaceController } from "../controller";
import { TeamMembers } from "./team-members";

export function TeamsCard({ workspace }: { workspace: IdentityWorkspaceController }): React.JSX.Element {
${i18n.hookLine}
  const { access, createTeam, organizationId, pending, permissions, run, setActiveTeam, setSelectedTeamId, setTeamName, teamId, teamMembers, teamName, teams } = workspace;
  return <Card><CardHeader><CardTitle>${i18n.child("teams")}</CardTitle><CardDescription>${i18n.child("teamsDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <ToggleGroup value={teamId ? [teamId] : []} onValueChange={(values: string[]) => { const selected = values[0]; if (selected) setSelectedTeamId(selected); }} spacing={2} aria-label={${i18n.value("selectTeam")}}>{(teams.data ?? []).map((team) => <ToggleGroupItem key={team.id} value={team.id}>{team.name}</ToggleGroupItem>)}</ToggleGroup>
    {access.canWriteTeams ? <Field><FieldLabel htmlFor="team-name">${i18n.child("teamName")}</FieldLabel><div className="flex gap-2"><Input id="team-name" disabled={pending} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder={${i18n.value("teamNamePlaceholder")}} /><Button disabled={pending || !organizationId || !teamName.trim()} onClick={() => organizationId && void run(() => createTeam.mutateAsync({ organizationId, name: teamName.trim() }))}>${i18n.child("create")}</Button></div></Field> : null}
    {organizationId && teamId ? <Button variant="outline" disabled={pending || !access.canActivateTeam} onClick={() => void run(() => setActiveTeam.mutateAsync({ organizationId, teamId }))}>${i18n.child("useSelectedTeam")}</Button> : null}
    {teamId && permissions.currentUser && teamMembers.isSuccess && !access.canActivateTeam ? <p className="text-sm text-muted-foreground">${i18n.child("teamMembershipRequired")}</p> : null}
    <TeamMembers workspace={workspace} />
  </CardContent></Card>;
}
`;
}

export function identityWorkspaceTeamMembersContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
${i18n.importLine}
import { compactIdentityId } from "../access";
import type { IdentityWorkspaceController } from "../controller";
import { MemberIdentity } from "./member-identity";

export function TeamMembers({ workspace }: { workspace: IdentityWorkspaceController }): React.JSX.Element {
${i18n.hookLine}
  const { access, addTeamMember, members, organizationId, pending, permissions, removeTeamMember, run, setTeamMemberId, teamId, teamMemberId, teamMembers } = workspace;
  const memberItems = access.availableTeamMembers.map((member) => ({ value: member.userId, label: member.userId === permissions.currentUser?.id ? permissions.currentUser?.name?.trim() || t("you") : t("memberLabel") + " " + compactIdentityId(member.userId) }));
  const selectedMember = memberItems.some((member) => member.value === teamMemberId) ? teamMemberId : "";
  return <div className="flex flex-col gap-3 border-t border-border pt-4">
    {access.canWriteTeams && teamId ? memberItems.length > 0 ? <Field><FieldLabel htmlFor="team-member-id">${i18n.child("selectMember")}</FieldLabel><div className="flex items-end gap-2">
      <Select items={memberItems} value={selectedMember} onValueChange={setTeamMemberId} disabled={pending} placeholder={t("selectMember")}><SelectTrigger id="team-member-id"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{memberItems.map((member) => <SelectItem key={member.value} value={member.value}>{member.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Button disabled={pending || !organizationId || !selectedMember} onClick={() => organizationId && teamId && selectedMember && void run(() => addTeamMember.mutateAsync({ organizationId, teamId, userId: selectedMember }))}>${i18n.child("addMember")}</Button>
    </div></Field> : members.isSuccess && teamMembers.isSuccess ? <p className="text-sm text-muted-foreground">${i18n.child("noEligibleMembers")}</p> : null : null}
    {(teamMembers.data ?? []).map((membership) => <div key={membership.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><MemberIdentity userId={membership.userId} currentUser={permissions.currentUser} />{access.canWriteTeams ? <Button size="sm" variant="outline" disabled={pending || !teamMembers.isSuccess} onClick={() => organizationId && teamId && void run(() => removeTeamMember.mutateAsync({ organizationId, teamId, userId: membership.userId }))}>${i18n.child("remove")}</Button> : null}</div>)}
  </div>;
}
`;
}
