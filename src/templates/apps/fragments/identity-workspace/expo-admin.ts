import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import { mobilePath, type IdentityWorkspaceMode } from "./model.js";

function expoAdminSource(mode: IdentityWorkspaceMode = "monorepo", hasI18n = false): string {
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    <Card><CardHeader><View className="flex-row items-center justify-between"><CardTitle>${i18n.child("native.users", "Users")}</CardTitle>{users.data ? <Badge><Text>{users.data.total}</Text></Badge> : null}</View><CardDescription>${i18n.child("filters.description", "Search and apply explicit account mutations.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={search} onChangeText={setSearch} placeholder={${i18n.value("filters.placeholder", "Search name or email")}} />{users.error ? <Alert accessibilityRole="alert" variant="destructive"><AlertTitle>${i18n.child("list.loadErrorTitle", "We couldn't load the users")}</AlertTitle><AlertDescription>${i18n.child("errors.requestFailed", "The request failed. Try again.")}</AlertDescription></Alert> : null}{users.isPending ? <ActivityIndicator /> : null}{users.data && !users.isPending && !users.error && users.data.users.length === 0 ? <Text className="text-sm text-muted-foreground">${i18n.child("list.emptyTitle", "No users found")}</Text> : null}{(users.data?.users ?? []).map((user) => <View key={user.id} className="gap-2 rounded-xl border p-3"><View className="flex-row items-start justify-between gap-3"><View className="flex-1"><Text className="font-semibold">{user.name ?? ${i18n.value("native.unnamedUser", "Unnamed user")}}</Text><Text className="text-sm text-muted-foreground">{user.email}</Text></View><Badge variant={user.banned ? "destructive" : "secondary"}><Text>{user.banned ? ${i18n.value("status.suspended", "Suspended")} : ${roleValue("user.role")}}</Text></Badge></View><View className="flex-row flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} onPress={() => void run(() => changeRole.mutateAsync({ userId: user.id, role: user.role === "admin" ? "user" : "admin" }))}><Text>{user.role === "admin" ? ${i18n.value("native.makeUser", "Make user")} : ${i18n.value("actions.promote", "Make admin")}}</Text></Button><Button size="sm" variant={user.banned ? "outline" : "destructive"} disabled={pending} onPress={() => void run(() => setBanned.mutateAsync({ userId: user.id, banned: !user.banned, reason: user.banned ? undefined : ${i18n.value("native.suspensionReason", "Suspended by mobile administrator")} }))}><Text>{user.banned ? ${i18n.value("actions.restore", "Restore")} : ${i18n.value("actions.suspend", "Suspend")}}</Text></Button></View></View>)}</CardContent></Card>
  </View></ScrollView>;
}
`;
}

export function expoAdminContent(
  _mode: IdentityWorkspaceMode = "monorepo",
  _hasI18n = false,
): string {
  return 'export { AdminScreen as default } from "@/features/admin-users/screen";\n';
}
export function expoAdminFeatureFiles(
  mode: IdentityWorkspaceMode,
  hasI18n: boolean,
): TemplateFile[] {
  const root = mobilePath(mode, "src/features/admin-users");
  const i18n = nativeI18nTemplate(hasI18n, "adminUsers", nativeI18nImportPath("mobile", mode));
  let view = expoAdminSource(mode, hasI18n)
    .replace('import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";\n', "")
    .replace('import { authClient } from "@/lib/auth-client";\n', "")
    .replace('import { orpc } from "@/lib/orpc";\n', "")
    .replace(
      'type AdminRole = "admin" | "user";',
      'import type { AdminScreenState } from "../screen";\nimport { canCreateAdminUser } from "../model";',
    )
    .replace(
      "export default function AdminScreen()",
      "export function AdminView({ state }: { state: AdminScreenState })",
    );
  const start = view.indexOf("  const queryClient = useQueryClient();");
  const end = view.indexOf("  if (sessionPending", start);
  view =
    view.slice(0, start) +
    "  const { identity, users, search, create, operations } = state;\n  const { sessionPending, hasSession, applicationPending, isAdmin } = identity;\n  const { pending, error } = operations;\n" +
    view.slice(end);
  view = view.replace(
    "(Boolean(session?.user) && applicationIdentity.isPending)",
    "(hasSession && applicationPending)",
  );
  for (const name of ["name", "email", "password"]) {
    const cap = name[0]!.toUpperCase() + name.slice(1);
    view = view.replace(
      new RegExp(`<Input value=\\{${name}\\} onChangeText=\\{set${cap}\\}([^]*?) />`),
      `<create.Field name="${name}">{(field) => <Input value={field.state.value} onChangeText={field.handleChange}$1 />}</create.Field>`,
    );
  }
  const roleStart = view.indexOf('<Button variant="outline" onPress={() => setNewRole(');
  const roleEnd = view.indexOf("</Button>", roleStart) + "</Button>".length;
  const roleControl = view
    .slice(roleStart, roleEnd)
    .replace(
      'setNewRole(newRole === "admin" ? "user" : "admin")',
      'field.handleChange(field.state.value === "admin" ? "user" : "admin")',
    )
    .replaceAll("newRole", "field.state.value");
  view =
    view.slice(0, roleStart) +
    '<create.Field name="role">{(field) => ' +
    roleControl +
    "}</create.Field>" +
    view.slice(roleEnd);
  const submitStart = view.indexOf("<Button disabled={pending || !name.trim()");
  const submitEnd = view.indexOf("</Button>", submitStart) + "</Button>".length;
  const submitText = view.slice(submitStart, submitEnd).match(/<Text>[^]*?<\/Text>/)![0];
  view =
    view.slice(0, submitStart) +
    "<create.Subscribe selector={(form) => form.values}>{(value) => <Button disabled={pending || !canCreateAdminUser(value)} onPress={() => void create.handleSubmit()}>" +
    submitText +
    "</Button>}</create.Subscribe>" +
    view.slice(submitEnd);
  view = view.replace(
    /<Input value=\{search\} onChangeText=\{setSearch\}([^]*?) \/>/,
    '<search.Field name="search">{(field) => <Input value={field.state.value} onChangeText={field.handleChange}$1 />}</search.Field>',
  );
  view = view.replace(
    'onPress={() => void run(() => changeRole.mutateAsync({ userId: user.id, role: user.role === "admin" ? "user" : "admin" }))}',
    "onPress={() => void operations.changeRole(user)}",
  );
  view = view.replace(
    /onPress=\{\(\) => void run\(\(\) => setBanned\.mutateAsync\([^]*?\)\)\}/,
    "onPress={() => void operations.toggleBan(user)}",
  );
  const createStart = view.indexOf("    <Card><CardHeader><CardTitle>");
  const createEnd = view.indexOf("</Card>", createStart) + "</Card>".length;
  const createCard = view.slice(createStart, createEnd);
  const roleLabelStart = view.indexOf("  function roleLabel(");
  const roleLabelEnd = roleLabelStart < 0 ? -1 : view.indexOf("  }", roleLabelStart) + "  }".length;
  const roleLabel = roleLabelStart < 0 ? "" : view.slice(roleLabelStart, roleLabelEnd);
  view =
    view.slice(0, createStart) + "    <AdminCreateCard state={state} />" + view.slice(createEnd);
  view = view
    .replace(
      'import { canCreateAdminUser } from "../model";',
      'import { AdminCreateCard } from "./create-card";',
    )
    .replace("identity, users, search, create, operations", "identity, users, search, operations");
  return [
    file(`${root}/components/admin-view.tsx`, view),
    file(
      `${root}/components/create-card.tsx`,
      `import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { canCreateAdminUser } from "../model";
import type { AdminScreenState } from "../screen";
${i18n.importLine}
export function AdminCreateCard({ state }: { state: Pick<AdminScreenState, "create" | "operations"> }): React.JSX.Element {
${i18n.hookLine}
${roleLabel}
  const { create, operations: { pending } } = state;
  return (${createCard});
}
`,
    ),
    file(
      `${root}/model.ts`,
      `export type AdminRole = "admin" | "user";
export interface AdminCreateValues { name: string; email: string; password: string; role: AdminRole; }
export interface AdminUser { id: string; email: string; name?: string | null; role: string; banned?: boolean | null; }
export function canCreateAdminUser(value: AdminCreateValues): boolean { return Boolean(value.name.trim()) && value.email.includes("@") && value.password.length >= 8; }
`,
    ),
    file(
      `${root}/queries.ts`,
      `import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
export function useAdminIdentity() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const application = useQuery(orpc.me.queryOptions({ enabled: Boolean(session?.user) }));
  const role = application.data?.user?.role ?? "user";
  return { sessionPending, hasSession: Boolean(session?.user), applicationPending: application.isPending, isAdmin: role === "admin" || role === "superAdmin" };
}
export function useAdminUsers(search: string, isAdmin: boolean) {
  return useQuery(orpc.adminUsers.list.queryOptions({ input: { search: search.trim() || undefined, page: 1, limit: 50 }, enabled: isAdmin }));
}
`,
    ),
    file(
      `${root}/mutations.ts`,
      `import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
export function useAdminMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: orpc.adminUsers.list.key({ type: "query" }) });
  const createUser = useMutation(orpc.adminUsers.create.mutationOptions({ onSuccess: refresh }));
  const changeRole = useMutation(orpc.adminUsers.changeRole.mutationOptions({ onSuccess: refresh }));
  const setBanned = useMutation(orpc.adminUsers.setBanned.mutationOptions({ onSuccess: refresh }));
  return { createUser, changeRole, setBanned };
}
`,
    ),
    file(
      `${root}/use-admin-operations.ts`,
      `import { useState } from "react";
import { useAdminMutations } from "./mutations";
import type { AdminCreateValues, AdminUser } from "./model";
${i18n.importLine}
export function useAdminOperations() {
${i18n.hookLine}
  const mutations = useAdminMutations();
  const [error, setError] = useState<string | null>(null);
  async function run(operation: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try { await operation(); return true; } ${hasI18n ? "catch {" : "catch (cause) {"} setError(${hasI18n ? i18n.value("native.operationError", "Admin operation failed") : 'cause instanceof Error ? cause.message : "Admin operation failed"'}); return false; }
  }
  return { error, pending: mutations.createUser.isPending || mutations.changeRole.isPending || mutations.setBanned.isPending,
    create: (value: AdminCreateValues) => run(() => mutations.createUser.mutateAsync({ ...value, name: value.name.trim(), email: value.email.trim() })),
    changeRole: (user: AdminUser) => run(() => mutations.changeRole.mutateAsync({ userId: user.id, role: user.role === "admin" ? "user" : "admin" })),
    toggleBan: (user: AdminUser) => run(() => mutations.setBanned.mutateAsync({ userId: user.id, banned: !user.banned, reason: user.banned ? undefined : ${i18n.value("native.suspensionReason", "Suspended by mobile administrator")} })),
  };
}
export type AdminOperations = ReturnType<typeof useAdminOperations>;
`,
    ),
    file(
      `${root}/use-admin-forms.ts`,
      `import { useForm, useStore } from "@tanstack/react-form";
import { canCreateAdminUser, type AdminCreateValues } from "./model";
import type { AdminOperations } from "./use-admin-operations";
export function useAdminSearch() {
  const form = useForm({ defaultValues: { search: "" } });
  const value = useStore(form.store, (state) => state.values.search);
  return { form, value };
}
export function useAdminCreateForm(operations: AdminOperations) {
  const form = useForm({ defaultValues: { name: "", email: "", password: "", role: "user" } as AdminCreateValues,
    onSubmit: async ({ value }) => {
      if (!canCreateAdminUser(value)) return;
      if (await operations.create(value)) form.reset({ name: "", email: "", password: "", role: value.role });
    } });
  return form;
}
`,
    ),
    file(
      `${root}/screen.tsx`,
      `import type * as React from "react";
import { useAdminIdentity, useAdminUsers } from "./queries";
import { useAdminOperations } from "./use-admin-operations";
import { useAdminSearch, useAdminCreateForm } from "./use-admin-forms";
import { AdminView } from "./components/admin-view";
export interface AdminScreenState { identity: ReturnType<typeof useAdminIdentity>; users: ReturnType<typeof useAdminUsers>; operations: ReturnType<typeof useAdminOperations>; search: ReturnType<typeof useAdminSearch>["form"]; create: ReturnType<typeof useAdminCreateForm>; }
export function AdminScreen(): React.JSX.Element {
  const identity = useAdminIdentity();
  const search = useAdminSearch();
  const users = useAdminUsers(search.value, identity.isAdmin);
  const operations = useAdminOperations();
  const create = useAdminCreateForm(operations);
  return <AdminView state={{ identity, users, operations, create, search: search.form }} />;
}
`,
    ),
  ];
}
