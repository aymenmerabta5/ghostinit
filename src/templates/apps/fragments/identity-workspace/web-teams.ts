import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceTeamsCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
${i18n.importLine}
import type { IdentityWorkspaceController } from "../controller";

interface TeamsCardProps {
  workspace: IdentityWorkspaceController;
}

export function TeamsCard({ workspace }: TeamsCardProps): React.JSX.Element {
${i18n.hookLine}
  const { addTeamMember, createTeam, organizationId, pending, removeTeamMember, run,
    setActiveTeam, setSelectedTeamId, setTeamMemberId, setTeamName, teamId, teamMemberId,
    teamMembers, teamName, teams } = workspace;
  return <Card><CardHeader><CardTitle>${i18n.child("teams")}</CardTitle><CardDescription>${i18n.child("teamsDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    <ToggleGroup value={teamId ? [teamId] : []} onValueChange={(values: string[]) => { const selected = values[0]; if (selected) setSelectedTeamId(selected); }} spacing={2} aria-label={${i18n.value("selectTeam")}}>{(teams.data ?? []).map((team) => <ToggleGroupItem key={team.id} value={team.id}>{team.name}</ToggleGroupItem>)}</ToggleGroup>
    <FieldGroup><Field><FieldLabel htmlFor="team-name">${i18n.child("teamName")}</FieldLabel><div className="flex gap-2"><Input id="team-name" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder={${i18n.value("teamNamePlaceholder")}} /><Button disabled={pending || !organizationId || !teamName.trim()} onClick={() => organizationId && void run(() => createTeam.mutateAsync({ organizationId, name: teamName.trim() }))}>${i18n.child("create")}</Button></div></Field></FieldGroup>
    {organizationId && teamId ? <Button variant="outline" disabled={pending} onClick={() => void run(() => setActiveTeam.mutateAsync({ organizationId, teamId }))}>${i18n.child("useSelectedTeam")}</Button> : null}
    <Separator />
    <FieldGroup><Field><FieldLabel htmlFor="team-member-id">${i18n.child("memberUserId")}</FieldLabel><div className="flex gap-2"><Input id="team-member-id" value={teamMemberId} onChange={(event) => setTeamMemberId(event.target.value)} placeholder={${i18n.value("memberUserIdPlaceholder")}} /><Button disabled={pending || !organizationId || !teamId || !teamMemberId.trim()} onClick={() => organizationId && teamId && void run(() => addTeamMember.mutateAsync({ organizationId, teamId, userId: teamMemberId.trim() }))}>${i18n.child("addMember")}</Button></div></Field></FieldGroup>
    {(teamMembers.data ?? []).map((membership) => <div key={membership.userId} className="flex items-center justify-between rounded-lg border p-3"><span className="font-mono text-xs">{membership.userId}</span><Button size="sm" variant="outline" disabled={pending} onClick={() => organizationId && teamId && void run(() => removeTeamMember.mutateAsync({ organizationId, teamId, userId: membership.userId }))}>${i18n.child("remove")}</Button></div>)}
  </CardContent></Card>;
}
`;
}
