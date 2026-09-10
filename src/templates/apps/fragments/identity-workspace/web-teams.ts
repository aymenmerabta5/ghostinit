import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceTeamsCardContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
${i18n.importLine}
import type { WorkspaceTeams } from "../use-workspace-teams";
import { TeamMembers } from "./team-members";

export function TeamsCard({ model }: { model: WorkspaceTeams }): React.JSX.Element {
${i18n.hookLine}
  const { access, form, pending, teamId, teams } = model;
  return <Card><CardHeader><CardTitle>${i18n.child("teams")}</CardTitle><CardDescription>${i18n.child("teamsDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {teams.length > 0 ? <ToggleGroup value={teamId ? [teamId] : []} onValueChange={(values: string[]) => { const selected = values[0]; if (selected) model.select(selected); }} spacing={2} aria-label={${i18n.value("selectTeam")}}>{teams.map((team) => <ToggleGroupItem key={team.id} value={team.id}>{team.name}</ToggleGroupItem>)}</ToggleGroup> : null}
    {access.canWriteTeams ? <form.AppForm><Form form={form} className="flex flex-col gap-3"><form.AppField name="name">{(field) => <field.TextField label={t("teamName")} placeholder={t("teamNamePlaceholder")} required maxLength={100} />}</form.AppField><form.SubmitButton disabled={pending}>${i18n.child("create")}</form.SubmitButton></Form></form.AppForm> : null}
    {teamId ? <Button variant="outline" disabled={pending || !access.canActivateTeam} onClick={model.activate}>${i18n.child("useSelectedTeam")}</Button> : null}
    {teamId && model.currentUser && model.membersReady && !access.canActivateTeam ? <p className="text-sm text-muted-foreground">${i18n.child("teamMembershipRequired")}</p> : null}
    <TeamMembers model={model} />
  </CardContent></Card>;
}
`;
}

export function identityWorkspaceTeamMembersContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
${i18n.importLine}
import { compactIdentityId } from "../access";
import type { WorkspaceTeams } from "../use-workspace-teams";
import { MemberIdentity } from "./member-identity";

export function TeamMembers({ model }: { model: WorkspaceTeams }): React.JSX.Element {
${i18n.hookLine}
  const { access, memberForm, pending, currentUser, teamId, teamMembers } = model;
  const memberItems = access.availableTeamMembers.map((member) => ({ value: member.userId, label: member.userId === currentUser?.id ? currentUser?.name?.trim() || t("you") : t("memberLabel") + " " + compactIdentityId(member.userId) }));
  return <div className="flex flex-col gap-3 border-t border-border pt-4">
    {access.canWriteTeams && teamId ? memberItems.length > 0 ? <memberForm.AppForm><Form form={memberForm} className="flex flex-col gap-3"><memberForm.AppField name="userId">{(field) => <field.SelectField label={t("selectMember")} options={memberItems} />}</memberForm.AppField><memberForm.SubmitButton disabled={pending}>${i18n.child("addMember")}</memberForm.SubmitButton></Form></memberForm.AppForm> : model.membersReady ? <p className="text-sm text-muted-foreground">${i18n.child("noEligibleMembers")}</p> : null : null}
    {teamMembers.map((membership) => <div key={membership.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><MemberIdentity userId={membership.userId} currentUser={currentUser} />{access.canWriteTeams ? <Button size="sm" variant="outline" disabled={pending || !model.membersReady} onClick={() => model.removeMember(membership.userId)}>${i18n.child("remove")}</Button> : null}</div>)}
  </div>;
}
`;
}
