// @allow-long 430: native workspace and admin screens remain cohesive typed interaction surfaces
import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import { mobilePath, type IdentityWorkspaceMode } from "./model.js";

function expoWorkspaceContent(mode: IdentityWorkspaceMode = "monorepo", hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "workspace", nativeI18nImportPath("mobile", mode));
  const localizedHelpers = hasI18n
    ? `  function roleLabel(value: string): string {
    if (value === "owner") return t("roles.owner");
    if (value === "admin") return t("roles.admin");
    if (value === "member") return t("roles.member");
    return value;
  }
  function statusLabel(value: string): string {
    if (value === "pending") return t("statuses.pending");
    if (value === "accepted") return t("statuses.accepted");
    if (value === "rejected") return t("statuses.rejected");
    if (value === "expired") return t("statuses.expired");
    if (value === "cancelled") return t("statuses.cancelled");
    return value;
  }`
    : "";
  const roleValue = (expression: string): string =>
    hasI18n ? `roleLabel(${expression})` : expression;
  const statusValue = (expression: string): string =>
    hasI18n ? `statusLabel(${expression})` : expression;
  const inviteRole = hasI18n
    ? 't("role", { role: roleLabel(inviteRole) })'
    : '"Role: " + inviteRole';
  return `import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { orpc } from "@/lib/orpc";
${i18n.importLine}

type OrganizationRole = "owner" | "admin" | "member";

export default function WorkspaceScreen(): React.JSX.Element {
${i18n.hookLine}
${localizedHelpers}
  const queryClient = useQueryClient();
  const organizations = useQuery(orpc.identity.organizations.list.queryOptions({ input: {} }));
  const [organizationId, setOrganizationId] = React.useState<string | null>(null);
  const activeOrganizationId = organizationId ?? organizations.data?.[0]?.id ?? null;
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [organizationName, setOrganizationName] = React.useState("");
  const [organizationSlug, setOrganizationSlug] = React.useState("");
  const [teamName, setTeamName] = React.useState("");
  const [teamMemberId, setTeamMemberId] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<OrganizationRole>("member");
  const [error, setError] = React.useState<string | null>(null);

  const teams = useQuery(orpc.identity.teams.list.queryOptions({ input: { organizationId: activeOrganizationId ?? "" }, enabled: Boolean(activeOrganizationId) }));
  const activeTeamId = teamId ?? teams.data?.[0]?.id ?? null;
  const members = useQuery(orpc.identity.organizations.listMembers.queryOptions({ input: { organizationId: activeOrganizationId ?? "" }, enabled: Boolean(activeOrganizationId) }));
  const invitations = useQuery(orpc.identity.invitations.list.queryOptions({ input: { organizationId: activeOrganizationId ?? "" }, enabled: Boolean(activeOrganizationId) }));
  const teamMembers = useQuery(orpc.identity.teams.listMembers.queryOptions({ input: { organizationId: activeOrganizationId ?? "", teamId: activeTeamId ?? "" }, enabled: Boolean(activeOrganizationId && activeTeamId) }));

  async function invalidateWorkspace(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.identity.organizations.list.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.organizations.listMembers.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.teams.list.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.teams.listMembers.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.invitations.list.key({ type: "query" }) }),
    ]);
  }
  async function run(action: () => Promise<unknown>): Promise<void> {
    setError(null);
    try { await action(); } ${hasI18n ? "catch {" : "catch (cause) {"} setError(${hasI18n ? i18n.value("operationError", "Workspace operation failed") : 'cause instanceof Error ? cause.message : "Workspace operation failed"'}); }
  }

  const createOrganization = useMutation(orpc.identity.organizations.create.mutationOptions({ onSuccess: async ({ organization }) => { setOrganizationId(organization.id); setOrganizationName(""); setOrganizationSlug(""); await invalidateWorkspace(); } }));
  const setActiveOrganization = useMutation(orpc.identity.organizations.setActive.mutationOptions({ onSuccess: invalidateWorkspace }));
  const createTeam = useMutation(orpc.identity.teams.create.mutationOptions({ onSuccess: async ({ team }) => { setTeamId(team.id); setTeamName(""); await invalidateWorkspace(); } }));
  const setActiveTeam = useMutation(orpc.identity.teams.setActive.mutationOptions({ onSuccess: invalidateWorkspace }));
  const invite = useMutation(orpc.identity.invitations.create.mutationOptions({ onSuccess: async () => { setInviteEmail(""); await invalidateWorkspace(); } }));
  const cancelInvitation = useMutation(orpc.identity.invitations.cancel.mutationOptions({ onSuccess: invalidateWorkspace }));
  const acceptInvitation = useMutation(orpc.identity.invitations.accept.mutationOptions({ onSuccess: invalidateWorkspace }));
  const changeRole = useMutation(orpc.identity.organizations.changeMemberRole.mutationOptions({ onSuccess: invalidateWorkspace }));
  const removeMember = useMutation(orpc.identity.organizations.removeMember.mutationOptions({ onSuccess: invalidateWorkspace }));
  const addTeamMember = useMutation(orpc.identity.teams.addMember.mutationOptions({ onSuccess: async () => { setTeamMemberId(""); await invalidateWorkspace(); } }));
  const removeTeamMember = useMutation(orpc.identity.teams.removeMember.mutationOptions({ onSuccess: invalidateWorkspace }));
  const pending = [createOrganization, setActiveOrganization, createTeam, setActiveTeam, invite, cancelInvitation, acceptInvitation, changeRole, removeMember, addTeamMember, removeTeamMember].some((mutation) => mutation.isPending);

  if (organizations.isPending) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator /></View>;

  return <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic"><View className="w-full max-w-[960px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-xs font-semibold uppercase tracking-widest text-primary">${i18n.child("kicker", "Identity workspace")}</Text><Text className="text-3xl font-bold tracking-tight">${i18n.child("title", "Organizations and teams")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("mobileDescription", "Every action crosses the typed identity transport and server policy.")}</Text></View>
    {error ? <Alert accessibilityRole="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>${i18n.child("organizations", "Organizations")}</CardTitle><CardDescription>${i18n.child("mobileOrganizationsDescription", "Choose the active tenant or create a new workspace.")}</CardDescription></CardHeader><CardContent className="gap-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">{(organizations.data ?? []).map((organization) => <Button accessibilityState={{ selected: organization.id === activeOrganizationId }} key={organization.id} variant={organization.id === activeOrganizationId ? "default" : "outline"} onPress={() => setOrganizationId(organization.id)} className="min-w-44 h-auto p-3"><Text className="font-semibold">{organization.name}</Text><Text className="text-xs text-muted-foreground">{organization.slug}</Text></Button>)}</ScrollView>
      <Input value={organizationName} onChangeText={setOrganizationName} placeholder={${i18n.value("organizationName", "Organization name")}} /><Input value={organizationSlug} onChangeText={setOrganizationSlug} autoCapitalize="none" placeholder={${i18n.value("organizationSlugPlaceholder", "acme-team")}} />
      <View className="flex-row flex-wrap gap-2"><Button disabled={pending || !organizationName.trim() || !organizationSlug.trim()} onPress={() => void run(() => createOrganization.mutateAsync({ name: organizationName.trim(), slug: organizationSlug.trim() }))}><Text>${i18n.child("create", "Create")}</Text></Button>{activeOrganizationId ? <Button variant="outline" disabled={pending} onPress={() => void run(() => setActiveOrganization.mutateAsync({ organizationId: activeOrganizationId }))}><Text>${i18n.child("setActive", "Set active")}</Text></Button> : null}</View>
    </CardContent></Card>

    <Card><CardHeader><View className="flex-row items-center justify-between"><CardTitle>${i18n.child("members", "Members")}</CardTitle><Badge><Text>{members.data?.length ?? 0}</Text></Badge></View><CardDescription>${i18n.child("membersDescription", "Promote, demote, or remove organization members.")}</CardDescription></CardHeader><CardContent className="gap-2">{(members.data ?? []).map((membership) => <View key={membership.id} className="gap-2 rounded-xl border p-3"><Text className="font-mono text-xs">{membership.userId}</Text><View className="flex-row items-center justify-between"><Text className="text-sm text-muted-foreground">{${roleValue("membership.role")}}</Text><View className="flex-row gap-2"><Button size="sm" variant="outline" disabled={pending || !activeOrganizationId} onPress={() => activeOrganizationId && void run(() => changeRole.mutateAsync({ organizationId: activeOrganizationId, membershipId: membership.id, role: membership.role === "admin" ? "member" : "admin" }))}><Text>{membership.role === "admin" ? ${i18n.value("makeMember", "Make member")} : ${i18n.value("makeAdmin", "Make admin")}}</Text></Button><Button size="sm" variant="destructive" disabled={pending || !activeOrganizationId} onPress={() => activeOrganizationId && void run(() => removeMember.mutateAsync({ organizationId: activeOrganizationId, membershipId: membership.id }))}><Text>${i18n.child("remove", "Remove")}</Text></Button></View></View></View>)}</CardContent></Card>

    <Card><CardHeader><CardTitle>${i18n.child("teams", "Teams")}</CardTitle><CardDescription>${i18n.child("teamsDescription", "Activate a team and manage its membership.")}</CardDescription></CardHeader><CardContent className="gap-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">{(teams.data ?? []).map((team) => <Button key={team.id} size="sm" variant={team.id === activeTeamId ? "default" : "outline"} onPress={() => setTeamId(team.id)}><Text>{team.name}</Text></Button>)}</ScrollView>
      <View className="flex-row gap-2"><Input className="flex-1" value={teamName} onChangeText={setTeamName} placeholder={${i18n.value("teamName", "Team name")}} /><Button disabled={pending || !activeOrganizationId || !teamName.trim()} onPress={() => activeOrganizationId && void run(() => createTeam.mutateAsync({ organizationId: activeOrganizationId, name: teamName.trim() }))}><Text>${i18n.child("create", "Create")}</Text></Button></View>
      {activeOrganizationId && activeTeamId ? <Button variant="outline" disabled={pending} onPress={() => void run(() => setActiveTeam.mutateAsync({ organizationId: activeOrganizationId, teamId: activeTeamId }))}><Text>${i18n.child("setActiveTeam", "Set active team")}</Text></Button> : null}
      <View className="flex-row gap-2"><Input className="flex-1" value={teamMemberId} onChangeText={setTeamMemberId} autoCapitalize="none" placeholder={${i18n.value("memberUserId", "Member user ID")}} /><Button disabled={pending || !activeOrganizationId || !activeTeamId || !teamMemberId.trim()} onPress={() => activeOrganizationId && activeTeamId && void run(() => addTeamMember.mutateAsync({ organizationId: activeOrganizationId, teamId: activeTeamId, userId: teamMemberId.trim() }))}><Text>${i18n.child("add", "Add")}</Text></Button></View>
      {(teamMembers.data ?? []).map((membership) => <View key={membership.userId} className="flex-row items-center justify-between rounded-xl border p-3"><Text className="font-mono text-xs">{membership.userId}</Text><Button size="sm" variant="outline" disabled={pending} onPress={() => activeOrganizationId && activeTeamId && void run(() => removeTeamMember.mutateAsync({ organizationId: activeOrganizationId, teamId: activeTeamId, userId: membership.userId }))}><Text>${i18n.child("remove", "Remove")}</Text></Button></View>)}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>${i18n.child("invitations", "Invitations")}</CardTitle><CardDescription>${i18n.child("invitationsDescription", "Invite teammates and process pending invitations.")}</CardDescription></CardHeader><CardContent className="gap-3">
      <Input value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" autoCapitalize="none" placeholder={${i18n.value("inviteEmailPlaceholder", "teammate@example.com")}} /><Button variant="outline" onPress={() => setInviteRole(inviteRole === "admin" ? "member" : "admin")}><Text>{${inviteRole}}</Text></Button><Button disabled={pending || !activeOrganizationId || !inviteEmail.includes("@")} onPress={() => activeOrganizationId && void run(() => invite.mutateAsync({ organizationId: activeOrganizationId, email: inviteEmail.trim(), role: inviteRole }))}><Text>${i18n.child("sendInvitation", "Send invitation")}</Text></Button>
      {(invitations.data ?? []).map((invitation) => <View key={invitation.id} className="gap-2 rounded-xl border p-3"><View className="flex-row items-center justify-between"><View className="flex-1"><Text className="font-medium">{invitation.email}</Text><Text className="text-xs text-muted-foreground">{${roleValue("invitation.role")}} · {${statusValue("invitation.status")}}</Text></View>{invitation.status === "pending" ? <View className="flex-row gap-2"><Button size="sm" variant="outline" disabled={pending} onPress={() => void run(() => acceptInvitation.mutateAsync({ invitationId: invitation.id }))}><Text>${i18n.child("accept", "Accept")}</Text></Button><Button size="sm" variant="destructive" disabled={pending} onPress={() => void run(() => cancelInvitation.mutateAsync({ invitationId: invitation.id }))}><Text>${i18n.child("cancel", "Cancel")}</Text></Button></View> : null}</View></View>)}
    </CardContent></Card>
  </View></ScrollView>;
}
`;
}

function expoAdminContent(mode: IdentityWorkspaceMode = "monorepo", hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "adminUsers", nativeI18nImportPath("mobile", mode));
  const localizedRole = hasI18n
    ? `  function roleLabel(value: string): string {
    if (value === "admin" || value === "superAdmin") return t("roles.admin");
    if (value === "user") return t("roles.user");
    return value;
  }`
    : "";
  const roleValue = (expression: string): string =>
    hasI18n ? `roleLabel(${expression})` : expression;
  const selectedRole = hasI18n
    ? 't("native.role", { role: roleLabel(newRole) })'
    : '"Role: " + newRole';
  return `import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
${i18n.importLine}

type AdminRole = "admin" | "user";

export default function AdminScreen(): React.JSX.Element {
${i18n.hookLine}
${localizedRole}
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const applicationIdentity = useQuery(
    orpc.me.queryOptions({ enabled: Boolean(session?.user) }),
  );
  const role = applicationIdentity.data?.user?.role ?? "user";
  const isAdmin = role === "admin" || role === "superAdmin";
  const [search, setSearch] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [newRole, setNewRole] = React.useState<AdminRole>("user");
  const [error, setError] = React.useState<string | null>(null);
  const users = useQuery(orpc.adminUsers.list.queryOptions({ input: { search: search.trim() || undefined, page: 1, limit: 50 }, enabled: isAdmin }));
  const usersKey = orpc.adminUsers.list.key({ type: "query" });
  const refresh = async (): Promise<void> => queryClient.invalidateQueries({ queryKey: usersKey });
  const createUser = useMutation(orpc.adminUsers.create.mutationOptions({ onSuccess: refresh }));
  const changeRole = useMutation(orpc.adminUsers.changeRole.mutationOptions({ onSuccess: refresh }));
  const setBanned = useMutation(orpc.adminUsers.setBanned.mutationOptions({ onSuccess: refresh }));
  const pending = createUser.isPending || changeRole.isPending || setBanned.isPending;
  async function run(action: () => Promise<unknown>): Promise<void> { setError(null); try { await action(); } ${hasI18n ? "catch {" : "catch (cause) {"} setError(${hasI18n ? i18n.value("native.operationError", "Admin operation failed") : 'cause instanceof Error ? cause.message : "Admin operation failed"'}); } }

  if (sessionPending || (Boolean(session?.user) && applicationIdentity.isPending)) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator /></View>;
  if (!isAdmin) return <View className="flex-1 items-center justify-center gap-3 bg-background p-6"><Text className="text-2xl font-bold">${i18n.child("native.accessRequired", "Admin access required")}</Text><Text className="text-center text-sm text-muted-foreground">${i18n.child("native.accessDescription", "The server session does not grant an administrative role.")}</Text></View>;

  return <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic"><View className="w-full max-w-[960px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-xs font-semibold uppercase tracking-widest text-primary">${i18n.child("native.kicker", "Administration")}</Text><Text className="text-3xl font-bold tracking-tight">${i18n.child("list.title", "Accounts")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("list.description", "Create accounts and manage role or suspension state through audited oRPC mutations.")}</Text></View>
    {error ? <Alert accessibilityRole="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>${i18n.child("create.shellTitle", "Create account")}</CardTitle><CardDescription>${i18n.child("create.passwordDescription", "Issue a temporary password through a secure channel.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={name} onChangeText={setName} placeholder={${i18n.value("create.nameLabel", "Name")}} /><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder={${i18n.value("create.emailLabel", "Email")}} /><Input value={password} onChangeText={setPassword} secureTextEntry placeholder={${i18n.value("create.passwordLabel", "Temporary password")}} /><Button variant="outline" onPress={() => setNewRole(newRole === "admin" ? "user" : "admin")}><Text>{${selectedRole}}</Text></Button><Button disabled={pending || !name.trim() || !email.includes("@") || password.length < 8} onPress={() => void run(async () => { await createUser.mutateAsync({ name: name.trim(), email: email.trim(), password, role: newRole }); setName(""); setEmail(""); setPassword(""); })}><Text>${i18n.child("create.submit", "Create user")}</Text></Button></CardContent></Card>
    <Card><CardHeader><View className="flex-row items-center justify-between"><CardTitle>${i18n.child("native.users", "Users")}</CardTitle><Badge><Text>{users.data?.total ?? 0}</Text></Badge></View><CardDescription>${i18n.child("filters.description", "Search and apply explicit account mutations.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={search} onChangeText={setSearch} placeholder={${i18n.value("filters.placeholder", "Search name or email")}} />{users.isPending ? <ActivityIndicator /> : null}{(users.data?.users ?? []).map((user) => <View key={user.id} className="gap-2 rounded-xl border p-3"><View className="flex-row items-start justify-between gap-3"><View className="flex-1"><Text className="font-semibold">{user.name ?? ${i18n.value("native.unnamedUser", "Unnamed user")}}</Text><Text className="text-sm text-muted-foreground">{user.email}</Text></View><Badge variant={user.banned ? "destructive" : "secondary"}><Text>{user.banned ? ${i18n.value("status.suspended", "Suspended")} : ${roleValue("user.role")}}</Text></Badge></View><View className="flex-row flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} onPress={() => void run(() => changeRole.mutateAsync({ userId: user.id, role: user.role === "admin" ? "user" : "admin" }))}><Text>{user.role === "admin" ? ${i18n.value("native.makeUser", "Make user")} : ${i18n.value("actions.promote", "Make admin")}}</Text></Button><Button size="sm" variant={user.banned ? "outline" : "destructive"} disabled={pending} onPress={() => void run(() => setBanned.mutateAsync({ userId: user.id, banned: !user.banned, reason: user.banned ? undefined : ${i18n.value("native.suspensionReason", "Suspended by mobile administrator")} }))}><Text>{user.banned ? ${i18n.value("actions.restore", "Restore")} : ${i18n.value("actions.suspend", "Suspend")}}</Text></Button></View></View>)}</CardContent></Card>
  </View></ScrollView>;
}
`;
}

export function expoIdentityWorkspaceFiles(
  mode: IdentityWorkspaceMode,
  hasI18n = false,
): TemplateFile[] {
  return [
    file(mobilePath(mode, "app/workspace.tsx"), expoWorkspaceContent(mode, hasI18n)),
    file(mobilePath(mode, "app/admin.tsx"), expoAdminContent(mode, hasI18n)),
  ];
}

export { expoAdminContent, expoWorkspaceContent };
