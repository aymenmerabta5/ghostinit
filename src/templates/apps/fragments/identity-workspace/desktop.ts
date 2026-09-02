// @allow-long 420: Electron workspace and settings routes share the generated typed clients
import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import { desktopPath, type IdentityWorkspaceMode } from "./model.js";

export function desktopWorkspaceRouteContent(
  mode: IdentityWorkspaceMode = "monorepo",
  hasI18n = false,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "workspace", nativeI18nImportPath("desktop", mode));
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
  return `import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "../lib/orpc";
${i18n.importLine}

type OrganizationRole = "owner" | "admin" | "member";

export const Route = createFileRoute("/workspace")({ component: WorkspacePage });

function WorkspacePage(): React.JSX.Element {
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
  const [memberId, setMemberId] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<OrganizationRole>("member");
  const [error, setError] = React.useState<string | null>(null);
  const teams = useQuery(orpc.identity.teams.list.queryOptions({ input: { organizationId: activeOrganizationId ?? "" }, enabled: Boolean(activeOrganizationId) }));
  const activeTeamId = teamId ?? teams.data?.[0]?.id ?? null;
  const members = useQuery(orpc.identity.organizations.listMembers.queryOptions({ input: { organizationId: activeOrganizationId ?? "" }, enabled: Boolean(activeOrganizationId) }));
  const invitations = useQuery(orpc.identity.invitations.list.queryOptions({ input: { organizationId: activeOrganizationId ?? "" }, enabled: Boolean(activeOrganizationId) }));
  const teamMembers = useQuery(orpc.identity.teams.listMembers.queryOptions({ input: { organizationId: activeOrganizationId ?? "", teamId: activeTeamId ?? "" }, enabled: Boolean(activeOrganizationId && activeTeamId) }));

  async function invalidate(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.identity.organizations.list.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.organizations.listMembers.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.teams.list.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.teams.listMembers.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.invitations.list.key({ type: "query" }) }),
    ]);
  }
  async function run(action: () => Promise<unknown>): Promise<void> { setError(null); try { await action(); } ${hasI18n ? "catch {" : "catch (cause) {"} setError(${hasI18n ? i18n.value("operationError", "Workspace operation failed") : 'cause instanceof Error ? cause.message : "Workspace operation failed"'}); } }
  const createOrganization = useMutation(orpc.identity.organizations.create.mutationOptions({ onSuccess: async ({ organization }) => { setOrganizationId(organization.id); setOrganizationName(""); setOrganizationSlug(""); await invalidate(); } }));
  const setActiveOrganization = useMutation(orpc.identity.organizations.setActive.mutationOptions({ onSuccess: invalidate }));
  const createTeam = useMutation(orpc.identity.teams.create.mutationOptions({ onSuccess: async ({ team }) => { setTeamId(team.id); setTeamName(""); await invalidate(); } }));
  const setActiveTeam = useMutation(orpc.identity.teams.setActive.mutationOptions({ onSuccess: invalidate }));
  const invite = useMutation(orpc.identity.invitations.create.mutationOptions({ onSuccess: async () => { setInviteEmail(""); await invalidate(); } }));
  const cancelInvitation = useMutation(orpc.identity.invitations.cancel.mutationOptions({ onSuccess: invalidate }));
  const acceptInvitation = useMutation(orpc.identity.invitations.accept.mutationOptions({ onSuccess: invalidate }));
  const changeRole = useMutation(orpc.identity.organizations.changeMemberRole.mutationOptions({ onSuccess: invalidate }));
  const removeMember = useMutation(orpc.identity.organizations.removeMember.mutationOptions({ onSuccess: invalidate }));
  const addTeamMember = useMutation(orpc.identity.teams.addMember.mutationOptions({ onSuccess: async () => { setMemberId(""); await invalidate(); } }));
  const removeTeamMember = useMutation(orpc.identity.teams.removeMember.mutationOptions({ onSuccess: invalidate }));
  const pending = [createOrganization, setActiveOrganization, createTeam, setActiveTeam, invite, cancelInvitation, acceptInvitation, changeRole, removeMember, addTeamMember, removeTeamMember].some((mutation) => mutation.isPending);
  const invitationRoleItems = [{ label: ${i18n.value("roles.admin", "Admin")}, value: "admin" }, { label: ${i18n.value("roles.member", "Member")}, value: "member" }];

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">${i18n.child("kicker", "Identity workspace")}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">${i18n.child("title", "Organizations and teams")}</h1><p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">${i18n.child("desktopDescription", "Tenant membership remains server-authorized; the desktop app is only a typed client.")}</p></div><Button render={<Link to="/settings" />} nativeButton={false} variant="outline">${i18n.child("settings", "Settings")}</Button></div>
    {error ? <Alert variant="destructive"><AlertTitle>${i18n.child("operationError", "Workspace operation failed")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card><CardHeader><CardTitle>${i18n.child("organizations", "Organizations")}</CardTitle><CardDescription>${i18n.child("desktopOrganizationsDescription", "Choose or create an active tenant.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{organizations.isPending ? <Skeleton className="h-16 w-full" aria-label={${i18n.value("loading", "Loading…")}} /> : null}{(organizations.data ?? []).map((organization) => <Button type="button" key={organization.id} variant={organization.id === activeOrganizationId ? "default" : "outline"} aria-pressed={organization.id === activeOrganizationId} onClick={() => setOrganizationId(organization.id)} className="h-auto justify-start p-3 text-start"><span className="block font-medium">{organization.name}</span><span className="text-xs text-muted-foreground">{organization.slug}</span></Button>)}<FieldGroup><Field><FieldLabel htmlFor="desktop-organization-name">${i18n.child("organizationName", "Organization name")}</FieldLabel><Input id="desktop-organization-name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></Field><Field><FieldLabel htmlFor="desktop-organization-slug">${i18n.child("organizationSlug", "Organization slug")}</FieldLabel><Input id="desktop-organization-slug" value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value)} placeholder={${i18n.value("organizationSlugPlaceholder", "acme-team")}} /></Field></FieldGroup><Button disabled={pending || !organizationName.trim() || !organizationSlug.trim()} onClick={() => void run(() => createOrganization.mutateAsync({ name: organizationName.trim(), slug: organizationSlug.trim() }))}>${i18n.child("createOrganization", "Create organization")}</Button>{activeOrganizationId ? <Button variant="outline" disabled={pending} onClick={() => void run(() => setActiveOrganization.mutateAsync({ organizationId: activeOrganizationId }))}>${i18n.child("setActive", "Set active")}</Button> : null}</CardContent></Card>
      <div className="flex flex-col gap-6">
        <Card><CardHeader><CardTitle>${i18n.child("members", "Members")}</CardTitle><CardDescription>${i18n.child("desktopMembersDescription", "Change roles without calling Better Auth admin endpoints directly.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{(members.data ?? []).map((membership) => <div key={membership.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="font-mono text-xs">{membership.userId}</p><p className="text-xs text-muted-foreground">{${roleValue("membership.role")}}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending || !activeOrganizationId} onClick={() => activeOrganizationId && void run(() => changeRole.mutateAsync({ organizationId: activeOrganizationId, membershipId: membership.id, role: membership.role === "admin" ? "member" : "admin" }))}>{membership.role === "admin" ? ${i18n.value("makeMember", "Make member")} : ${i18n.value("makeAdmin", "Make admin")}}</Button><Button size="sm" variant="destructive" disabled={pending || !activeOrganizationId} onClick={() => activeOrganizationId && void run(() => removeMember.mutateAsync({ organizationId: activeOrganizationId, membershipId: membership.id }))}>${i18n.child("remove", "Remove")}</Button></div></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>${i18n.child("teams", "Teams")}</CardTitle><CardDescription>${i18n.child("desktopTeamsDescription", "Create a team, activate it, and assign members.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex flex-wrap gap-2">{(teams.data ?? []).map((team) => <Button key={team.id} size="sm" variant={team.id === activeTeamId ? "default" : "outline"} aria-pressed={team.id === activeTeamId} onClick={() => setTeamId(team.id)}>{team.name}</Button>)}</div><FieldGroup><Field><FieldLabel htmlFor="desktop-team-name">${i18n.child("teamName", "Team name")}</FieldLabel><div className="flex gap-2"><Input id="desktop-team-name" value={teamName} onChange={(event) => setTeamName(event.target.value)} /><Button disabled={pending || !activeOrganizationId || !teamName.trim()} onClick={() => activeOrganizationId && void run(() => createTeam.mutateAsync({ organizationId: activeOrganizationId, name: teamName.trim() }))}>${i18n.child("create", "Create")}</Button></div></Field></FieldGroup>{activeOrganizationId && activeTeamId ? <Button variant="outline" onClick={() => void run(() => setActiveTeam.mutateAsync({ organizationId: activeOrganizationId, teamId: activeTeamId }))}>${i18n.child("setActiveTeam", "Set active team")}</Button> : null}<FieldGroup><Field><FieldLabel htmlFor="desktop-team-member">${i18n.child("memberUserId", "Member user ID")}</FieldLabel><div className="flex gap-2"><Input id="desktop-team-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} /><Button disabled={pending || !activeOrganizationId || !activeTeamId || !memberId.trim()} onClick={() => activeOrganizationId && activeTeamId && void run(() => addTeamMember.mutateAsync({ organizationId: activeOrganizationId, teamId: activeTeamId, userId: memberId.trim() }))}>${i18n.child("add", "Add")}</Button></div></Field></FieldGroup>{(teamMembers.data ?? []).map((membership) => <div key={membership.userId} className="flex items-center justify-between rounded-lg border p-3"><span className="font-mono text-xs">{membership.userId}</span><Button size="sm" variant="outline" disabled={pending} onClick={() => activeOrganizationId && activeTeamId && void run(() => removeTeamMember.mutateAsync({ organizationId: activeOrganizationId, teamId: activeTeamId, userId: membership.userId }))}>${i18n.child("remove", "Remove")}</Button></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>${i18n.child("invitations", "Invitations")}</CardTitle><CardDescription>${i18n.child("desktopInvitationsDescription", "Invite administrators or members and process pending invitations.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><FieldGroup className="grid md:grid-cols-[1fr_10rem_auto] md:items-end"><Field><FieldLabel htmlFor="desktop-invite-email">${i18n.child("inviteEmail", "Invite email")}</FieldLabel><Input id="desktop-invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder={${i18n.value("inviteEmailPlaceholder", "teammate@example.com")}} /></Field><Field><FieldLabel htmlFor="desktop-invite-role">${i18n.child("roleLabel", "Role")}</FieldLabel><Select items={invitationRoleItems} value={inviteRole} onValueChange={(role) => { if (role === "admin" || role === "member") setInviteRole(role); }}><SelectTrigger id="desktop-invite-role"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{invitationRoleItems.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Button disabled={pending || !activeOrganizationId || !inviteEmail.includes("@")} onClick={() => activeOrganizationId && void run(() => invite.mutateAsync({ organizationId: activeOrganizationId, email: inviteEmail.trim(), role: inviteRole }))}>${i18n.child("invite", "Invite")}</Button></FieldGroup>{(invitations.data ?? []).map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="text-sm font-medium">{invitation.email}</p><p className="text-xs text-muted-foreground">{${roleValue("invitation.role")}} · {${statusValue("invitation.status")}}</p></div>{invitation.status === "pending" ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void run(() => acceptInvitation.mutateAsync({ invitationId: invitation.id }))}>${i18n.child("accept", "Accept")}</Button><Button size="sm" variant="destructive" disabled={pending} onClick={() => void run(() => cancelInvitation.mutateAsync({ invitationId: invitation.id }))}>${i18n.child("cancel", "Cancel")}</Button></div> : null}</div>)}</CardContent></Card>
      </div>
    </div>
  </main>;
}
`;
}

export function desktopFullSettingsRouteContent(
  mode: IdentityWorkspaceMode = "monorepo",
  hasI18n = false,
  hasEmail = true,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "settings", nativeI18nImportPath("desktop", mode));
  const credentialState = hasEmail
    ? `  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [twoFactorPassword, setTwoFactorPassword] = React.useState("");
  const [deletePassword, setDeletePassword] = React.useState("");`
    : "";
  const twoFactorState = hasEmail
    ? `  const twoFactorEnabled = Boolean(user && typeof user === "object" && Reflect.get(user, "twoFactorEnabled") === true);`
    : "";
  const credentialCards = hasEmail
    ? `<Card><CardHeader><CardTitle>${i18n.child("password.title", "Password")}</CardTitle><CardDescription>${i18n.child("password.description", "Other sessions are revoked after a credential change.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><FieldGroup><Field><FieldLabel htmlFor="settings-current-password">${i18n.child("password.currentPasswordLabel", "Current password")}</FieldLabel><Input id="settings-current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field><Field><FieldLabel htmlFor="settings-new-password">${i18n.child("password.newPasswordLabel", "New password")}</FieldLabel><Input id="settings-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field></FieldGroup><Button disabled={!currentPassword || newPassword.length < 8} onClick={() => void run(async () => { const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }); if (result.error) throw new Error("Password change failed"); setCurrentPassword(""); setNewPassword(""); await invalidateSessions(); }, ${i18n.value("password.successMessage", "Password updated")})}>${i18n.child("password.submit", "Update password")}</Button><Button render={<Link to="/forgot-password" />} nativeButton={false} variant="outline">${i18n.child("native.forgotPassword", "Forgot password?")}</Button></CardContent></Card></div>
    <Card><CardHeader><CardTitle>${i18n.child("twoFactor.title", "Two-factor authentication")}</CardTitle><CardDescription>{twoFactorEnabled ? ${i18n.value("twoFactor.enabledDescription", "Enabled for this account.")} : ${i18n.value("twoFactor.enableDescription", "Add an authenticator app to protect sign-in.")}}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{twoFactorEnabled ? <><FieldGroup><Field><FieldLabel htmlFor="settings-two-factor-password">${i18n.child("twoFactor.passwordLabel", "Current password")}</FieldLabel><Input id="settings-two-factor-password" type="password" maxLength={64} value={twoFactorPassword} onChange={(event) => setTwoFactorPassword(event.target.value)} /></Field></FieldGroup><Button variant="destructive" disabled={!twoFactorPassword} onClick={() => void run(async () => { const result = await authClient.twoFactor.disable({ password: twoFactorPassword }); if (result.error) throw new Error("Two-factor change failed"); await refetch(); setTwoFactorPassword(""); }, ${i18n.value("native.twoFactorDisabled", "Two-factor disabled")})}>${i18n.child("twoFactor.disable", "Disable two-factor")}</Button></> : <Button onClick={() => void navigate({ to: "/2fa" })}>${i18n.child("twoFactor.enable", "Enable two-factor")}</Button>}</CardContent></Card>`
    : "</div>";
  const dangerCard = hasEmail
    ? `<Card className="border-destructive/40"><CardHeader><CardTitle>${i18n.child("danger.title", "Delete account")}</CardTitle><CardDescription>${i18n.child("danger.description", "Permanently remove this account after password verification.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><FieldGroup><Field><FieldLabel htmlFor="settings-delete-password">${i18n.child("password.currentPasswordLabel", "Current password")}</FieldLabel><Input id="settings-delete-password" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></Field></FieldGroup><Button variant="destructive" disabled={!deletePassword} onClick={() => void run(async () => { const result = await authClient.deleteUser({ password: deletePassword }); if (result.error) throw new Error("Account deletion failed"); await navigate({ to: "/" }); }, ${i18n.value("native.accountDeleted", "Account deleted")})}>${i18n.child("danger.delete", "Delete account")}</Button></CardContent></Card>`
    : `<Card className="border-destructive/40"><CardHeader><CardTitle>${i18n.child("danger.title", "Delete account")}</CardTitle><CardDescription>${i18n.child("danger.oauthDescription", "OAuth-only accounts require a recent sign-in before permanent deletion.")}</CardDescription></CardHeader><CardContent><Button variant="destructive" onClick={() => void deleteOAuthAccount()}>${i18n.child("danger.delete", "Delete account")}</Button></CardContent></Card>`;
  return `import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient${hasEmail ? "" : ", identityClient, isIdentityRecentAuthenticationError"} } from "../lib/auth";
import { orpc } from "../lib/orpc";
${i18n.importLine}

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage(): React.JSX.Element {
${i18n.hookLine}
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, refetch } = authClient.useSession();
  const user = session?.user;
  const currentSessionId = session?.session?.id;
  const [name, setName] = React.useState(user?.name ?? "");
${credentialState}
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const sessions = useQuery(orpc.identity.sessions.list.queryOptions({ input: {}, enabled: Boolean(user) }));
  const sessionsKey = orpc.identity.sessions.list.key({ type: "query" });
  const invalidateSessions = async (): Promise<void> => queryClient.invalidateQueries({ queryKey: sessionsKey });
  const revoke = useMutation(orpc.identity.sessions.revoke.mutationOptions({ onSuccess: invalidateSessions }));
  const revokeOthers = useMutation(orpc.identity.sessions.revokeOthers.mutationOptions({ onSuccess: invalidateSessions }));
${twoFactorState}
  async function run(action: () => Promise<void>, success: string): Promise<void> { setError(null); setStatus(null); try { await action(); setStatus(success); } catch { setError(${i18n.value("native.operationError", "Account operation failed")}); } }
${
  hasEmail
    ? ""
    : `  async function deleteOAuthAccount(): Promise<void> {
    setError(null); setStatus(null);
    try {
      const result = await identityClient.deleteAccount();
      if (result.error) { setError(isIdentityRecentAuthenticationError(result.error) ? ${i18n.value("danger.reauthenticate", "Sign in again before deleting your account.")} : ${i18n.value("danger.genericError", "The account could not be deleted.")}); return; }
      await navigate({ to: "/" });
    } catch { setError(${i18n.value("danger.genericError", "The account could not be deleted.")}); }
  }
`
}

  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">${i18n.child("native.kicker", "Account control")}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">${i18n.child("title", "Settings")}</h1><p className="mt-2 text-sm text-muted-foreground">${i18n.child("description", "Profile, credentials, two-factor security, and active sessions.")}</p></div><Button render={<Link to="/workspace" />} nativeButton={false} variant="outline">${i18n.child("native.organizations", "Organizations & teams")}</Button></div>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}{status ? <Alert role="status"><AlertDescription>{status}</AlertDescription></Alert> : null}
    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>${i18n.child("profileTitle", "Profile")}</CardTitle><CardDescription>{user?.email ?? ${i18n.value("native.notSignedIn", "Not signed in")}}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><FieldGroup><Field><FieldLabel htmlFor="settings-display-name">${i18n.child("namePlaceholder", "Display name")}</FieldLabel><Input id="settings-display-name" value={name} onChange={(event) => setName(event.target.value)} /></Field></FieldGroup><Button disabled={!user || !name.trim()} onClick={() => void run(async () => { const result = await authClient.updateUser({ name: name.trim() }); if (result.error) throw new Error("Profile update failed"); await refetch(); }, ${i18n.value("profile.successMessage", "Profile saved")})}>${i18n.child("profile.submit", "Save profile")}</Button></CardContent></Card>
    ${credentialCards}
    <Card><CardHeader><CardTitle>${i18n.child("sessions.title", "Sessions")}</CardTitle><CardDescription>${i18n.child("sessions.description", "Review and revoke devices through the identity service.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{(sessions.data ?? []).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-mono text-xs">{item.id.slice(0, 10)}</p><p className="text-xs text-muted-foreground">{item.userAgent ?? ${i18n.value("sessions.unknownDevice", "Unknown device")}}</p></div>{item.id === currentSessionId ? <Badge variant="secondary">${i18n.child("sessions.current", "Current")}</Badge> : <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => void run(() => revoke.mutateAsync({ sessionId: item.id }).then(() => undefined), ${i18n.value("native.sessionRevoked", "Session revoked")})}>${i18n.child("sessions.revoke", "Revoke")}</Button>}</div>)}<Button variant="outline" disabled={revokeOthers.isPending || (sessions.data?.length ?? 0) < 2} onClick={() => void run(() => revokeOthers.mutateAsync({}).then(() => undefined), ${i18n.value("native.otherSessionsRevoked", "Other sessions revoked")})}>${i18n.child("sessions.revokeOthers", "Revoke other sessions")}</Button></CardContent></Card>
    ${dangerCard}
  </main>;
}
`;
}

export function desktopIdentityWorkspaceFiles(
  mode: IdentityWorkspaceMode,
  hasI18n = false,
  hasEmail = true,
): TemplateFile[] {
  return [
    file(desktopPath(mode, "routes/workspace.tsx"), desktopWorkspaceRouteContent(mode, hasI18n)),
    file(
      desktopPath(mode, "routes/settings.tsx"),
      desktopFullSettingsRouteContent(mode, hasI18n, hasEmail),
    ),
  ];
}
