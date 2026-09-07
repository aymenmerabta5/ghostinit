import { file, type TemplateFile } from "../../../shared.js";
import type { AdminTemplateOptions } from "./model.js";

function authRouteContent(options: AdminTemplateOptions): string {
  const accessImport =
    options.mode === "monorepo"
      ? `import { isAdminRole } from "@repo/auth/access";`
      : `import { isSingleAdminRole as isAdminRole } from "@/lib/access";`;
  return `import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { requireProtectedRoute } from "@/lib/protected-route";
${accessImport}

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context, location }) => {
    const result = await requireProtectedRoute(context.queryClient);
    if (!result.protectedSession.user || !isAdminRole(result.protectedSession.user.role)) {
      throw redirect({ to: "/" });
    }
    if (location.pathname === "/admin") throw redirect({ to: "/admin/users" });
    return result;
  },
  component: AdminRoute,
});

function AdminRoute(): React.JSX.Element {
  return <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8"><Outlet /></div>;
}
`;
}

function usersRouteContent(_options: AdminTemplateOptions): string {
  return `import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { AdminUsersFeature } from "@/features/admin-users";
import { loadInitialAdminUsers } from "@/lib/protected-route";

export const Route = createFileRoute("/admin/users")({
  loader: ({ context }) => loadInitialAdminUsers(context),
  component: AdminUsersPage,
});

function AdminUsersPage(): React.JSX.Element {
  const location = useLocation();
  if (location.pathname !== "/admin/users") return <Outlet />;
  return <AdminUsersFeature />;
}
`;
}
function createRouteContent(): string {
  return `import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AdminCreateUserFeature, useAdminUsersTranslations } from "@/features/admin-users";

export const Route = createFileRoute("/admin/users/create")({ component: AdminCreateUserPage });

function AdminCreateUserPage(): React.JSX.Element {
  const router = useRouter();
  const translate = useAdminUsersTranslations();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{translate("create.shellTitle")}</h1>
          <p className="max-w-[65ch] text-sm text-muted-foreground">{translate("create.shellDescription")}</p>
        </div>
        <Button variant="ghost" size="sm" render={<Link to="/admin/users" />} nativeButton={false}>
          {translate("create.back")}
        </Button>
      </header>
      <Separator />
      <AdminCreateUserFeature onCreated={() => void router.navigate({ to: "/admin/users" })} />
    </main>
  );
}
`;
}

export function tanstackAdminRouteFiles(options: AdminTemplateOptions): TemplateFile[] {
  const root = options.sourceRoot === "src" ? "src/routes" : "apps/web/src/routes";
  return [
    file(`${root}/admin.tsx`, authRouteContent(options)),
    file(`${root}/admin.users.tsx`, usersRouteContent(options)),
    file(`${root}/admin.users.create.tsx`, createRouteContent()),
  ];
}

export function tanstackAdminDashboardContent(isConvex = false): string {
  return authRouteContent({
    database: isConvex ? "convex" : "postgres",
    framework: "tanstack",
    mode: "monorepo",
    sourceRoot: "apps/web/src",
  });
}

export function tanstackAdminUsersContent(isConvex = false): string {
  return usersRouteContent({
    database: isConvex ? "convex" : "postgres",
    framework: "tanstack",
    mode: "monorepo",
    sourceRoot: "apps/web/src",
  });
}

export function tanstackAdminCreateUserContent(): string {
  return createRouteContent();
}
