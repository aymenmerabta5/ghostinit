import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";
import type { DesktopMode } from "../model.js";
import { desktopKernelSpecifier, desktopOrpcSpecifier } from "./specifiers.js";

export function desktopRouteAdminUsersContent(
  _isConvex = false,
  mode: DesktopMode = "monorepo",
  hasI18n = false,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "adminUsers", nativeI18nImportPath("desktop", mode));
  const dataImports = `import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { desktopQueryOptions, orpc } from "${desktopOrpcSpecifier(mode)}";
import type { AdminUser, UserRole } from "${desktopKernelSpecifier(mode)}";`;
  const dataState = `  const session = useQuery(desktopQueryOptions.me());
  const authPending = session.isPending;
  const role = session.data?.user?.banned ? null : session.data?.user?.role;
  const queryClient = useQueryClient();
  const adminUsersKey = orpc.adminUsers.list.key({ type: "query" });
  const usersQuery = useQuery(
    orpc.adminUsers.list.queryOptions({
      input: { page: 1, limit: 100 },
      enabled: role === "admin",
      select: (result) => ({
        users: result.users.map(
          (listedUser): AdminUser => ({ ...listedUser, authId: listedUser.id }),
        ),
        total: result.total,
      }),
    }),
  );
  const changeRole = useMutation(
    orpc.adminUsers.changeRole.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: adminUsersKey });
      },
    }),
  );
  const changeBan = useMutation(
    orpc.adminUsers.setBanned.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: adminUsersKey });
      },
    }),
  );
  const data = usersQuery.data ?? null;
  const operationError = usersQuery.error ?? changeRole.error ?? changeBan.error;
  const error = ${
    hasI18n
      ? "Boolean(operationError)"
      : `operationError instanceof Error
    ? operationError.message
    : operationError
      ? String(operationError)
      : null`
  };
  const loading = usersQuery.isPending;
  async function setRole(authId: string, currentRole: UserRole): Promise<void> {
    try {
      await changeRole.mutateAsync({
        userId: authId,
        role: currentRole === "admin" ? "user" : "admin",
      });
    } catch {
      // The mutation state renders the typed transport error.
    }
  }
  async function toggleBan(authId: string, banned: boolean): Promise<void> {
    try {
      await changeBan.mutateAsync({ userId: authId, banned: !banned });
    } catch {
      // The mutation state renders the typed transport error.
    }
  }
`;
  return `import { createFileRoute, Link } from "@tanstack/react-router";
${dataImports}
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
${i18n.importLine}

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
${i18n.hookLine}
${dataState}

  if (authPending) return <main className="mx-auto flex max-w-5xl flex-col gap-3 p-6" aria-label={${i18n.value("table.loading", "Loading…")}}><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></main>;
  if (role !== "admin") {
    return (
      <Alert className="mx-auto max-w-2xl" variant="destructive">
        <AlertTitle>${i18n.child("native.accessRequired", "Forbidden")}</AlertTitle>
        <AlertDescription>${i18n.child("native.accessDescription", "Admin only.")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("native.users", "Users")}</h1>
        <Button render={<Link to="/admin/users/create" />} nativeButton={false} size="sm">${i18n.child("list.create", "Create user")}</Button>
      </div>
      <p className="text-sm text-muted-foreground max-w-[65ch]">${i18n.child("list.description", "Manage accounts, roles, and bans.")} <span>{${hasI18n ? '(data?.total ?? 0) === 1 ? t("counts.accountOne", { count: data?.total ?? 0 }) : t("counts.accountMany", { count: data?.total ?? 0 })' : "`Total ${data?.total ?? 0} users.`"}}</span></p>
      <Separator />
      {error ? <Alert variant="destructive"><AlertTitle>${i18n.child("list.loadErrorTitle", "Failed to load")}</AlertTitle><AlertDescription>{${hasI18n ? 't("errors.requestFailed")' : "error"}}</AlertDescription></Alert> : null}
      <Card>
        <CardHeader><CardTitle>${i18n.child("list.title", "All users")}</CardTitle><CardDescription>{data?.users.length === 0 ? ${i18n.value("list.emptyTitle", "No users found.")} : ${hasI18n ? '(data?.users.length ?? 0) === 1 ? t("counts.accountOne", { count: data?.users.length ?? 0 }) : t("counts.accountMany", { count: data?.users.length ?? 0 })' : "`" + "${data?.users.length ?? 0} users" + "`"}}</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {loading ? <div className="flex flex-col gap-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : data && data.users.length === 0 ? <Empty><EmptyHeader><EmptyTitle>${i18n.child("list.emptyTitle", "No users found.")}</EmptyTitle><EmptyDescription>${i18n.child("list.description", "Manage accounts, roles, and bans.")}</EmptyDescription></EmptyHeader></Empty> : data ? data.users.map((u) => (
            <div key={u.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2"><p className="font-medium truncate">{u.name ?? u.email}</p><Badge variant="secondary">{${hasI18n ? 'u.role === "admin" ? t("roles.admin") : t("roles.user")' : "u.role"}}</Badge>{u.banned ? <Badge variant="destructive">${i18n.child("status.suspended", "banned")}</Badge> : null}</div>
                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!u.authId} onClick={() => { if (u.authId) void setRole(u.authId, u.role); }}>{u.role === "admin" ? ${i18n.value("actions.demote", "Demote")} : ${i18n.value("actions.promote", "Make admin")}}</Button>
                <Button type="button" size="sm" variant={u.banned ? "default" : "destructive"} disabled={!u.authId} onClick={() => { if (u.authId) void toggleBan(u.authId, u.banned); }}>{u.banned ? ${i18n.value("actions.restore", "Unban")} : ${i18n.value("actions.suspend", "Ban")}}</Button>
              </div>
            </div>
          )) : null}
        </CardContent>
      </Card>
    </main>
  );
}
`;
}

export function desktopRouteAdminCreateUserContent(
  _isConvex = false,
  mode: DesktopMode = "monorepo",
  hasI18n = false,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "adminUsers", nativeI18nImportPath("desktop", mode));
  return `import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { desktopQueryOptions, orpc } from "${desktopOrpcSpecifier(mode)}";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
${i18n.importLine}

export const Route = createFileRoute("/admin/users/create")({
  component: AdminCreateUserPage,
});

function AdminCreateUserPage() {
${i18n.hookLine}
  const session = useQuery(desktopQueryOptions.me());
  const authPending = session.isPending;
  const userRole = session.data?.user?.banned ? null : session.data?.user?.role;
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const createUser = useMutation(orpc.adminUsers.create.mutationOptions());
  const roleItems = [{ label: ${i18n.value("roles.user", "User")}, value: "user" }, { label: ${i18n.value("roles.admin", "Admin")}, value: "admin" }];
  const createUserSchema = z.object({ name: z.string().min(1, ${i18n.value("validation.nameRequired", "Name required")}), email: z.string().email(${i18n.value("validation.emailInvalid", "Enter a valid email")}), password: z.string().min(8, ${i18n.value("validation.passwordTooShort", "Password must be at least 8 characters")}).max(128, ${i18n.value("validation.passwordTooLong", "Password must be 128 characters or fewer")}), role: z.enum(["admin","user"]) });
  const form = useForm({
    defaultValues: { name: "", email: "", password: "", role: "user" } as { name: string; email: string; password: string; role: "admin" | "user" },
    validators: { onSubmit: ({ value }) => { const p = createUserSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = createUserSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ${i18n.value("errors.validation", "Invalid")}); return; }
      try {
        await createUser.mutateAsync(parsed.data);
        await router.navigate({ to: "/admin/users" });
      } ${hasI18n ? "catch {" : "catch (cause) {"}
        setError(${hasI18n ? 't("errors.createFailed")' : 'cause instanceof Error ? cause.message : "Unable to create user"'});
      }
    },
  });

  if (authPending) return <main className="mx-auto flex max-w-xl flex-col gap-3 p-6" aria-label={${i18n.value("table.loading", "Loading…")}}><Skeleton className="h-8 w-48" /><Skeleton className="h-72 w-full" /></main>;
  if (userRole !== "admin") {
    return (
      <Alert className="mx-auto max-w-2xl" variant="destructive">
        <AlertTitle>${i18n.child("native.accessRequired", "Forbidden")}</AlertTitle>
        <AlertDescription>${i18n.child("native.accessDescription", "Admin only.")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">${i18n.child("create.shellTitle", "Create user")}</h1><Button render={<Link to="/admin/users" />} nativeButton={false} size="sm" variant="outline">${i18n.child("create.back", "Back to users")}</Button></div>
      <p className="text-sm text-muted-foreground max-w-[65ch]">${i18n.child("create.shellDescription", "Add a new account. Admins can manage all users.")}</p>
      <Separator />
      <Card><CardHeader><CardTitle>${i18n.child("create.cardTitle", "User details")}</CardTitle><CardDescription>${i18n.child("create.cardDescription", "Password must be at least 8 characters.")}</CardDescription></CardHeader><CardContent>
        <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }} className="flex flex-col gap-4">
          {error ? <Alert variant="destructive" aria-live="assertive"><AlertTitle>${i18n.child("create.errorTitle", "Failed to create")}</AlertTitle><AlertDescription>{${hasI18n ? 't("errors.createFailed")' : "error"}}</AlertDescription></Alert> : null}
          <form.Field name="name" validators={{ onChange: ({ value }) => (value.trim().length ? undefined : ${i18n.value("validation.nameRequired", "Name required")}) }}>{(field) => { const nameError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(nameError)}><FieldLabel htmlFor="admin-create-name">${i18n.child("create.nameLabel", "Name")}</FieldLabel><Input id="admin-create-name" name={field.name} required autoComplete="name" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder={${i18n.value("create.namePlaceholder", "Ada Lovelace")}} aria-describedby="admin-create-name-description" aria-errormessage={nameError ? "admin-create-name-error" : undefined} aria-invalid={Boolean(nameError)} /><FieldDescription id="admin-create-name-description">${i18n.child("create.nameDescription", "Use the name shown to workspace members.")}</FieldDescription><FieldError id="admin-create-name-error">{nameError}</FieldError></Field>); }}</form.Field>
          <form.Field name="email" validators={{ onChange: ({ value }) => (value.includes("@") ? undefined : ${i18n.value("validation.emailInvalid", "Enter a valid email")}), onSubmit: ({ value }) => (z.email().safeParse(value).success ? undefined : ${i18n.value("validation.emailInvalid", "Enter a valid email")}) }}>{(field) => { const emailError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(emailError)}><FieldLabel htmlFor="admin-create-email">${i18n.child("create.emailLabel", "Email")}</FieldLabel><Input id="admin-create-email" name={field.name} type="email" required autoComplete="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder={${i18n.value("create.emailPlaceholder", "you@example.com")}} aria-describedby="admin-create-email-description" aria-errormessage={emailError ? "admin-create-email-error" : undefined} aria-invalid={Boolean(emailError)} /><FieldDescription id="admin-create-email-description">${i18n.child("create.emailDescription", "This address becomes the user sign-in identity.")}</FieldDescription><FieldError id="admin-create-email-error">{emailError}</FieldError></Field>); }}</form.Field>
          <form.Field name="password" validators={{ onChange: ({ value }) => (value.length >= 8 ? undefined : ${i18n.value("validation.passwordTooShort", "Password must be at least 8 characters")}) }}>{(field) => { const passwordError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(passwordError)}><FieldLabel htmlFor="admin-create-password">${i18n.child("create.passwordLabel", "Password")}</FieldLabel><Input id="admin-create-password" name={field.name} type="password" required minLength={8} autoComplete="new-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} aria-describedby="admin-create-password-description" aria-errormessage={passwordError ? "admin-create-password-error" : undefined} aria-invalid={Boolean(passwordError)} /><FieldDescription id="admin-create-password-description">${i18n.child("create.passwordDescription", "Use at least eight characters.")}</FieldDescription><FieldError id="admin-create-password-error">{passwordError}</FieldError></Field>); }}</form.Field>
          <form.Field name="role">{(field) => { const roleError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(roleError)}><FieldLabel htmlFor="admin-create-role">${i18n.child("create.roleLabel", "Role")}</FieldLabel><Select items={roleItems} name={field.name} value={field.state.value} onValueChange={(role) => { if (role === "admin" || role === "user") field.handleChange(role); }}><SelectTrigger id="admin-create-role" onBlur={field.handleBlur} aria-describedby="admin-create-role-description" aria-errormessage={roleError ? "admin-create-role-error" : undefined} aria-invalid={Boolean(roleError)}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roleItems.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription id="admin-create-role-description">${i18n.child("create.roleDescription", "Admins can manage users and workspace policy.")}</FieldDescription><FieldError id="admin-create-role-error">{roleError}</FieldError></Field>); }}</form.Field>
          <Button type="submit">${i18n.child("create.submit", "Create user")}</Button>
        </form>
      </CardContent></Card>
    </main>
  );
}
`;
}
