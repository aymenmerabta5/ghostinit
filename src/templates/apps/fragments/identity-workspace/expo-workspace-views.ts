import { nativeI18nTemplate } from "../native-i18n.js";

function imports(name: string, hasI18n: boolean): string {
  const i18n = nativeI18nTemplate(hasI18n, "workspace");
  return `import type * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { compactIdentityId } from "../access";
import type { Workspace${name} } from "../use-workspace-${name.toLowerCase()}";
${i18n.importLine}
`;
}

export function expoOrganizationsCardContent(hasI18n: boolean): string {
  const t = nativeI18nTemplate(hasI18n, "workspace");
  return `${imports("Organizations", hasI18n).replace('import { compactIdentityId } from "../access";\n', "")}
export function OrganizationsCard({ model }: { model: WorkspaceOrganizations }): React.JSX.Element {
${t.hookLine}
  const { form, organizations, organizationId, pending } = model;
  return <Card><CardHeader><CardTitle>${t.child("organizations", "Organizations")}</CardTitle><CardDescription>${t.child("organizationsDescription", "Choose an organization or create a new workspace.")}</CardDescription></CardHeader><CardContent className="gap-3">
    {model.loading ? <ActivityIndicator accessibilityLabel={${t.value("loadingOrganizations", "Loading organizations")}} /> : model.ready && organizations.length === 0 ? <Text>${t.child("noOrganizations", "No organizations yet")}</Text> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">{organizations.map((organization) => <Button key={organization.id} accessibilityState={{ selected: organization.id === organizationId }} variant={organization.id === organizationId ? "default" : "outline"} onPress={() => model.select(organization.id)} className="min-w-44 h-auto p-3"><Text className="font-semibold">{organization.name}</Text><Text className="text-xs text-muted-foreground">{organization.slug}</Text></Button>)}</ScrollView>
    <form.Field name="name">{(field) => <View className="gap-1"><Text>${t.child("organizationName", "Organization name")}</Text><Input accessibilityLabel={${t.value("organizationName", "Organization name")}} value={field.state.value} onChangeText={field.handleChange} onBlur={field.handleBlur} maxLength={120} /></View>}</form.Field>
    <form.Field name="slug">{(field) => <View className="gap-1"><Text>${t.child("organizationSlug", "Organization slug")}</Text><Input accessibilityLabel={${t.value("organizationSlug", "Organization slug")}} value={field.state.value} onChangeText={field.handleChange} onBlur={field.handleBlur} autoCapitalize="none" maxLength={80} /></View>}</form.Field>
    <form.Subscribe selector={(state) => state.errors.length}>{(errors) => errors ? <Text accessibilityRole="alert" className="text-destructive">${t.child("operationError", "Check the organization details and try again.")}</Text> : null}</form.Subscribe>
    <View className="flex-row flex-wrap gap-2"><Button disabled={pending} onPress={() => void form.handleSubmit()}><Text>${t.child("createOrganization", "Create organization")}</Text></Button>{organizationId ? <Button disabled={pending} variant="outline" onPress={model.activate}><Text>${t.child("useOrganization", "Use organization")}</Text></Button> : null}</View>
  </CardContent></Card>;
}
`;
}

export function expoMembersCardContent(hasI18n: boolean): string {
  const t = nativeI18nTemplate(hasI18n, "workspace");
  return `${imports("Members", hasI18n).replace('import { Input } from "@/components/ui/input";\n', "").replace("ActivityIndicator, ScrollView, View", "ActivityIndicator, View")}
export function MembersCard({ model, loading }: { model: WorkspaceMembers; loading: boolean }): React.JSX.Element {
${t.hookLine}
  const roleLabel = (role: string) => role === "owner" ? ${t.value("roles.owner", "Owner")} : role === "admin" ? ${t.value("roles.admin", "Admin")} : ${t.value("roles.member", "Member")};
  return <Card><CardHeader><CardTitle>${t.child("members", "Members")}</CardTitle><CardDescription>${t.child("membersPolicyDescription", "Manage member roles and access.")}</CardDescription></CardHeader><CardContent className="gap-3">
    {loading ? <ActivityIndicator accessibilityLabel={${t.value("members", "Members")}} /> : null}
    {model.members.map((member) => <View key={member.id} className="gap-2 rounded-xl border border-border p-3"><Text>{member.userId === model.currentUser?.id ? model.currentUser?.name || compactIdentityId(member.userId) : compactIdentityId(member.userId)}</Text><Text className="text-sm text-muted-foreground">{roleLabel(member.role)}</Text>{model.access.canManageMember(member) ? <View className="flex-row flex-wrap gap-2">{model.access.rolesForMember(member).map((role) => <Button key={role} size="sm" variant={role === member.role ? "default" : "outline"} disabled={model.pending || role === member.role} onPress={() => model.changeRole(member, role)}><Text>{roleLabel(role)}</Text></Button>)}<Button size="sm" variant="destructive" disabled={model.pending} onPress={() => model.remove(member)}><Text>${t.child("remove", "Remove")}</Text></Button></View> : null}</View>)}
  </CardContent></Card>;
}
`;
}

export function expoTeamsCardContent(hasI18n: boolean): string {
  const t = nativeI18nTemplate(hasI18n, "workspace");
  return `${imports("Teams", hasI18n)}
export function TeamsCard({ model, loading }: { model: WorkspaceTeams; loading: boolean }): React.JSX.Element {
${t.hookLine}
  const { form, memberForm } = model;
  return <Card><CardHeader><CardTitle>${t.child("teams", "Teams")}</CardTitle><CardDescription>${t.child("teamsDescription", "Activate a team and manage its membership.")}</CardDescription></CardHeader><CardContent className="gap-3">
    {loading ? <ActivityIndicator accessibilityLabel={${t.value("teams", "Teams")}} /> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">{model.teams.map((team) => <Button key={team.id} size="sm" accessibilityState={{ selected: team.id === model.teamId }} variant={team.id === model.teamId ? "default" : "outline"} onPress={() => model.select(team.id)}><Text>{team.name}</Text></Button>)}</ScrollView>
    {model.access.canWriteTeams ? <><form.Field name="name">{(field) => <View className="gap-1"><Text>${t.child("teamName", "Team name")}</Text><Input accessibilityLabel={${t.value("teamName", "Team name")}} value={field.state.value} onChangeText={field.handleChange} onBlur={field.handleBlur} maxLength={100} /></View>}</form.Field><form.Subscribe selector={(state) => state.errors.length}>{(errors) => errors ? <Text accessibilityRole="alert" className="text-destructive">${t.child("operationError", "Check the team details and try again.")}</Text> : null}</form.Subscribe><Button disabled={model.pending} onPress={() => void form.handleSubmit()}><Text>${t.child("create", "Create")}</Text></Button></> : null}
    {model.access.canActivateTeam ? <Button variant="outline" disabled={model.pending} onPress={model.activate}><Text>${t.child("setActiveTeam", "Set active team")}</Text></Button> : null}
    {model.teamId && model.access.canWriteTeams && model.membersReady ? <><memberForm.Field name="userId">{(field) => <View className="gap-2"><Text>${t.child("memberUserId", "Organization member")}</Text>{model.access.availableTeamMembers.map((member) => <Button key={member.userId} variant={field.state.value === member.userId ? "default" : "outline"} disabled={model.pending} onPress={() => field.handleChange(member.userId)}><Text>{member.userId === model.currentUser?.id ? model.currentUser?.name || compactIdentityId(member.userId) : compactIdentityId(member.userId)}</Text></Button>)}</View>}</memberForm.Field><Button disabled={model.pending} onPress={() => void memberForm.handleSubmit()}><Text>${t.child("add", "Add")}</Text></Button></> : null}
    {model.teamMembers.map((member) => <View key={member.userId} className="flex-row items-center justify-between gap-3 rounded-xl border border-border p-3"><Text>{member.userId === model.currentUser?.id ? model.currentUser?.name || compactIdentityId(member.userId) : compactIdentityId(member.userId)}</Text>{model.access.canWriteTeams ? <Button size="sm" variant="outline" disabled={model.pending} onPress={() => model.removeMember(member.userId)}><Text>${t.child("remove", "Remove")}</Text></Button> : null}</View>)}
  </CardContent></Card>;
}
`;
}

export function expoInvitationsCardContent(hasI18n: boolean): string {
  const t = nativeI18nTemplate(hasI18n, "workspace");
  return `${imports("Invitations", hasI18n).replace('import { compactIdentityId } from "../access";\n', "").replace("ActivityIndicator, ScrollView, View", "ActivityIndicator, View")}
export function InvitationsCard({ model, loading }: { model: WorkspaceInvitations; loading: boolean }): React.JSX.Element {
${t.hookLine}
  const { form } = model;
  const roles = model.permissions.isOwner ? (["owner", "admin", "member"] as const) : (["admin", "member"] as const);
  const roleLabel = (role: string) => role === "owner" ? ${t.value("roles.owner", "Owner")} : role === "admin" ? ${t.value("roles.admin", "Admin")} : ${t.value("roles.member", "Member")};
  return <Card><CardHeader><CardTitle>${t.child("invitations", "Invitations")}</CardTitle><CardDescription>${t.child("invitationsDescription", "Invite teammates and process pending invitations.")}</CardDescription></CardHeader><CardContent className="gap-3">
    {loading ? <ActivityIndicator accessibilityLabel={${t.value("invitations", "Invitations")}} /> : null}
    {model.canWrite ? <><form.Field name="email">{(field) => <View className="gap-1"><Text>${t.child("inviteEmail", "Teammate email")}</Text><Input accessibilityLabel={${t.value("inviteEmail", "Teammate email")}} value={field.state.value} onChangeText={field.handleChange} onBlur={field.handleBlur} keyboardType="email-address" autoCapitalize="none" /></View>}</form.Field><form.Field name="role">{(field) => <View className="flex-row flex-wrap gap-2">{roles.map((role) => <Button key={role} variant={role === field.state.value ? "default" : "outline"} disabled={model.pending} onPress={() => field.handleChange(role)}><Text>{roleLabel(role)}</Text></Button>)}</View>}</form.Field><form.Subscribe selector={(state) => state.errors.length}>{(errors) => errors ? <Text accessibilityRole="alert" className="text-destructive">${t.child("operationError", "Check the invitation details and try again.")}</Text> : null}</form.Subscribe><Button disabled={model.pending} onPress={() => void form.handleSubmit()}><Text>${t.child("sendInvitation", "Send invitation")}</Text></Button></> : null}
    {model.invitations.map((invitation) => <View key={invitation.id} className="gap-2 rounded-xl border border-border p-3"><Text className="font-medium">{invitation.email}</Text><Text className="text-sm text-muted-foreground">{roleLabel(invitation.role)} · {invitation.status}</Text>{invitation.status === "pending" ? <View className="flex-row gap-2">{model.canAccept(invitation) ? <Button size="sm" variant="outline" disabled={model.pending} onPress={() => model.accept(invitation)}><Text>${t.child("accept", "Accept")}</Text></Button> : null}{model.canCancel ? <Button size="sm" variant="destructive" disabled={model.pending} onPress={() => model.cancel(invitation)}><Text>${t.child("cancel", "Cancel")}</Text></Button> : null}</View> : null}</View>)}
  </CardContent></Card>;
}
`;
}
