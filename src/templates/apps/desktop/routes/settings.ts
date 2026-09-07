import type { DesktopMode } from "../model.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

export function desktopRouteSettingsContent(
  hasBilling = true,
  hasEmail = true,
  hasI18n = false,
  mode: DesktopMode = "monorepo",
): string {
  const i18n = nativeI18nTemplate(hasI18n, "settings", nativeI18nImportPath("desktop", mode));
  const supportingHooks = hasI18n
    ? '  const commonT = useTranslations("common");\n  const errorsT = useTranslations("errors");\n  const adminT = useTranslations("adminUsers");'
    : "";
  const billingLink = hasBilling
    ? `<Button render={<Link to="/billing" />} nativeButton={false} size="sm" variant="outline">${i18n.child("billing", "Billing")}</Button>`
    : "";
  const recoveryLink = hasEmail
    ? `<Button render={<Link to="/forgot-password" />} nativeButton={false} variant="outline">${i18n.child("native.forgotPassword", "Reset password")}</Button>`
    : "";
  const securityPanel = hasEmail
    ? `<Card>
           <CardHeader><CardTitle>${i18n.child("securityTitle", "Security")}</CardTitle><CardDescription>${i18n.child("description", "Manage account and workspace preferences. Desktop uses the same Better Auth session as web.")}</CardDescription></CardHeader>
           <CardContent className="flex flex-col gap-2">
             <Button render={<Link to="/2fa" />} nativeButton={false} variant="outline">${i18n.child("security.twoFactor", "Two-factor")}</Button>
             ${recoveryLink}
          </CardContent>
        </Card>`
    : "";
  return `import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "../hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
${i18n.importLine}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
${i18n.hookLine}
${supportingHooks}
  const { user, isPending, isAuthenticated } = useAuth();
  if (isPending) return <main className="mx-auto flex max-w-5xl flex-col gap-3 p-6" aria-label={${hasI18n ? 'commonT("loading")' : '"Loading…"'}}><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></main>;
  if (!isAuthenticated || !user) {
    return (
      <Empty className="mx-auto max-w-2xl"><EmptyHeader><EmptyTitle>${i18n.child("native.signInRequired", "Sign in required")}</EmptyTitle></EmptyHeader><EmptyContent><Button render={<Link to="/" />} nativeButton={false} variant="outline">${hasI18n ? '{errorsT("backHome")}' : "Back to home"}</Button></EmptyContent></Empty>
    );
  }
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("title", "Settings")}</h1>
        <p className="text-sm text-muted-foreground max-w-[65ch]">${i18n.child("description", "Manage account and workspace preferences. Desktop uses the same Better Auth session as web.")}</p>
      </div>
      <Separator />
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2"><CardHeader><CardTitle>${i18n.child("profile.title", "Profile")}</CardTitle><CardDescription>{${hasI18n ? 't("profile.readOnlySummary", { email: String(user.email ?? ""), role: ((user as { role?: string })?.role === "admin" || (user as { role?: string })?.role === "superAdmin") ? adminT("roles.admin") : adminT("roles.user") })' : '`Signed in as ${String(user.email ?? "")}. Role ${String((user as { role?: string })?.role ?? "user")}.`'}}</CardDescription></CardHeader><CardContent>
          <Field className="mt-4">
            <FieldLabel htmlFor="profile-name">${i18n.child("profile.nameLabel", "Name")}</FieldLabel>
            <Input id="profile-name" defaultValue={String((user as { name?: string | null })?.name ?? "")} readOnly placeholder={${i18n.value("profile.nameNotSet", "Not set")}} aria-describedby="profile-name-description" />
            <FieldDescription id="profile-name-description">${i18n.child("profile.readOnlyDescription", "Profile editing is available through the authenticated web surface.")}</FieldDescription>
          </Field>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="secondary">{${hasI18n ? '((user as { role?: string })?.role === "admin" || (user as { role?: string })?.role === "superAdmin") ? adminT("roles.admin") : adminT("roles.user")' : 'String((user as { role?: string })?.role ?? "user")'}}</Badge>
            <Badge variant="outline">{String(user.email ?? "")}</Badge>
          </div>
          <Alert className="mt-4"><AlertTitle>${i18n.child("profile.editingTitle", "Profile editing")}</AlertTitle><AlertDescription>${i18n.child("profile.editingDescription", "Use authClient.updateUser from client components. This view reads the current Better Auth session.")}</AlertDescription></Alert>
          <div className="mt-4 flex gap-2">
            <Button render={<Link to="/dashboard" />} nativeButton={false} size="sm" variant="outline">${i18n.child("dashboard", "Dashboard")}</Button>
            ${billingLink}
          </div>
        </CardContent></Card>
        ${securityPanel}
      </div>
    </main>
  );
}
`;
}
