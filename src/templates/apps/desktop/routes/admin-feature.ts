import { file, type TemplateFile } from "../../../shared.js";
import type { DesktopMode } from "../model.js";
import { desktopKernelSpecifier, desktopOrpcSpecifier } from "./specifiers.js";
import { desktopAdminUsersSource } from "./admin-users.js";
import { desktopAdminOverviewSource } from "./admin-overview.js";
import { desktopAdminCreateFeatureFiles } from "./admin-create-feature.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

function withoutDataImports(source: string): string {
  return source
    .replace(
      /^import.*(?:@tanstack\/react-query|desktopQueryOptions|import type \{ AdminUser \}).*;\n/gm,
      "",
    )
    .replace(/export const Route = createFileRoute\([^]*?\}\);\n\n/, "")
    .replace("import { createFileRoute, Link }", "import { Link }")
    .replace(/^import type \{ AdminUser \}[^;]*;\n/gm, "");
}

export function desktopAdminFeatureFiles(mode: DesktopMode, hasI18n: boolean): TemplateFile[] {
  const root = `${mode === "single" ? "src" : "apps/desktop/src"}/renderer/features/admin-users`;
  const i18n = nativeI18nTemplate(hasI18n, "adminUsers", nativeI18nImportPath("desktop", mode));
  let users = desktopAdminUsersSource(false, mode, hasI18n);
  const rowStart = users.indexOf("function AdminUserActions(");
  const rowEnd = users.indexOf("function AdminUsersPage()", rowStart);
  const row = users.slice(rowStart, rowEnd);
  const setupStart = row.indexOf("  const queryClient =");
  const setupEnd = row.indexOf("  return <div", setupStart);
  const setup = row
    .slice(setupStart, setupEnd)
    .replace(
      "  const queryClient = useQueryClient();",
      "  const { changeRole, changeBan, refresh } = useAdminRowMutations();",
    )
    .replace(
      "  const changeRole = useMutation(orpc.adminUsers.changeRole.mutationOptions());\n",
      "",
    )
    .replace("  const changeBan = useMutation(orpc.adminUsers.setBanned.mutationOptions());\n", "")
    .replace(
      'await queryClient.invalidateQueries({ queryKey: orpc.adminUsers.list.key({ type: "query" }) });',
      "await refresh();",
    );
  const rowView = `import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AdminUser } from "../model";
import type { AdminUserActionState } from "../use-admin-user-actions";
${i18n.importLine}
export function AdminUserActionsView({ user, state }: { user: AdminUser; state: AdminUserActionState }): React.JSX.Element {
${i18n.hookLine}
  const { pending, operationError, run } = state;
${row.slice(setupEnd)}`;
  users = users.slice(0, rowStart) + users.slice(rowEnd);
  const dataStart = users.indexOf("  const session = useQuery(");
  const dataEnd = users.indexOf("  if (authPending)", dataStart);
  const data = users.slice(dataStart, dataEnd);
  users = withoutDataImports(
    users.slice(0, dataStart) +
      "  const { authPending, role, data, error, loading } = useAdminUsersData();\n\n" +
      users.slice(dataEnd),
  )
    .replace("function AdminUsersPage()", "export function AdminUsersScreen()")
    .replace(
      'import * as React from "react";\n',
      'import { useAdminUsersData } from "./queries";\nimport { AdminUserActions } from "./user-actions";\n',
    );
  let overview = desktopAdminOverviewSource(false, mode, hasI18n);
  const identityStart = overview.indexOf("  const session = useQuery(");
  const identityEnd = overview.indexOf("  if (isPending)", identityStart);
  overview = withoutDataImports(
    overview.slice(0, identityStart) +
      "  const { role, isPending } = useAdminIdentity();\n" +
      overview.slice(identityEnd),
  )
    .replace("function AdminPage()", "export function AdminOverviewScreen()")
    .replace(
      'import { Link } from "@tanstack/react-router";',
      'import { Link } from "@tanstack/react-router";\nimport { useAdminIdentity } from "./queries";',
    );
  return [
    file(`${root}/model.ts`, `export type { AdminUser } from "${desktopKernelSpecifier(mode)}";\n`),
    file(
      `${root}/queries.ts`,
      `import { useQuery } from "@tanstack/react-query";
import { desktopQueryOptions, orpc } from "${desktopOrpcSpecifier(mode)}";
import type { AdminUser } from "./model";
export function useAdminIdentity() {
  const session = useQuery(desktopQueryOptions.me());
  return { isPending: session.isPending, role: session.data?.user?.banned ? null : session.data?.user?.role };
}
export function useAdminUsersData() {
${data}
  return { authPending, role, data, error, loading };
}
`,
    ),
    file(
      `${root}/mutations.ts`,
      `import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "${desktopOrpcSpecifier(mode)}";
export function useAdminRowMutations() {
  const queryClient = useQueryClient();
  const changeRole = useMutation(orpc.adminUsers.changeRole.mutationOptions());
  const changeBan = useMutation(orpc.adminUsers.setBanned.mutationOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.adminUsers.list.key({ type: "query" }) });
  return { changeRole, changeBan, refresh };
}
export function useCreateAdminUserMutation() { return useMutation(orpc.adminUsers.create.mutationOptions()); }
`,
    ),
    file(
      `${root}/use-admin-user-actions.ts`,
      `import * as React from "react";
import { useAdminRowMutations } from "./mutations";
import type { AdminUser } from "./model";
export function useAdminUserActions(user: AdminUser) {
${setup}
  return { pending, operationError, run };
}
export type AdminUserActionState = ReturnType<typeof useAdminUserActions>;
`,
    ),
    file(`${root}/components/user-actions-view.tsx`, rowView),
    file(
      `${root}/user-actions.tsx`,
      `import type * as React from "react";
import { useAdminUserActions } from "./use-admin-user-actions";
import { AdminUserActionsView } from "./components/user-actions-view";
import type { AdminUser } from "./model";
export function AdminUserActions({ user }: { user: AdminUser }): React.JSX.Element {
  return <AdminUserActionsView user={user} state={useAdminUserActions(user)} />;
}
`,
    ),
    file(`${root}/screen.tsx`, users),
    file(`${root}/overview-screen.tsx`, overview),
    ...desktopAdminCreateFeatureFiles(root, mode, hasI18n),
  ];
}
