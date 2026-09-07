import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function featureIndexContent(): string {
  return `"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CreateUserForm } from "./components/create-user-form";
import { AdminUserFilters } from "./components/filters";
import { AdminUsersResults } from "./components/user-results";
import { useAdminUsers } from "./hooks/use-admin-users";
import { useAdminUserMutations } from "./mutations";
import {
  formatAdminUsersAccountCount,
  translateAdminUsersError,
  useAdminUsersTranslations,
} from "./translations";
import type { AdminUsersInitialData } from "./types";

export interface AdminUsersFeatureProps {
  initialData?: AdminUsersInitialData;
}

export function AdminUsersFeature({ initialData }: AdminUsersFeatureProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  const admin = useAdminUsers(initialData);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{translate("list.title")}</h1>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {translate("list.description")} {formatAdminUsersAccountCount(translate, admin.total, admin.totalIsExact)}
          </p>
        </div>
        <Button render={<a href="/admin/users/create" />} nativeButton={false}>
          {translate("list.create")}
        </Button>
      </header>

      <AdminUserFilters
        search={admin.filters.search}
        isFetching={admin.isFetching}
        onApply={admin.applyFilters}
        onClear={admin.clearFilters}
      />
      <Separator />
      <AdminUsersResults admin={admin} translate={translate} />
    </main>
  );
}

export interface AdminCreateUserFeatureProps {
  onCreated(): void;
}

export function AdminCreateUserFeature({ onCreated }: AdminCreateUserFeatureProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  const mutations = useAdminUserMutations();
  return (
    <CreateUserForm
      error={translateAdminUsersError(mutations.error, translate, "errors.createFailed")}
      pending={mutations.createPending}
      onCreate={mutations.createUser}
      onCreated={onCreated}
    />
  );
}

export { adminUsersFilterSchema, adminUserRoleSchema, createAdminUserSchema } from "./schema";
export {
  formatAdminUsersAccountCount,
  translateAdminUsersError,
  useAdminUsersTranslations,
} from "./translations";
export type { AdminUsersMessageKey, AdminUsersTranslate } from "./translations";
export { DEFAULT_ADMIN_USERS_FILTERS } from "./types";
export type {
  AdminUser,
  AdminUserRole,
  AdminUsersFilterInput,
  AdminUsersFilters,
  AdminUsersInitialData,
  AdminUsersResult,
  CreateAdminUserInput,
} from "./types";
`;
}

function userResultsContent(): string {
  return `"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AdminUsersPagination } from "./filters";
import { UserTable, UserTableSkeleton } from "./user-table";
import type { useAdminUsers } from "../hooks/use-admin-users";
import type { AdminUsersTranslate } from "../translations";

export interface AdminUsersResultsProps {
  admin: ReturnType<typeof useAdminUsers>;
  translate: AdminUsersTranslate;
}

export function AdminUsersResults({ admin, translate }: AdminUsersResultsProps): React.JSX.Element {
  const showEmpty = !admin.isPending && !admin.queryError && admin.users.length === 0;
  return <>
    {admin.queryError ? (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{translate("list.loadErrorTitle")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{admin.queryError}</span>
          {admin.retry ? <Button type="button" size="sm" variant="outline" onClick={() => void admin.retry?.()}>{translate("list.retry")}</Button> : null}
        </AlertDescription>
      </Alert>
    ) : null}
    {admin.mutationError ? (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{translate("list.saveErrorTitle")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{admin.mutationError}</span>
          <Button type="button" size="sm" variant="outline" onClick={admin.resetMutationError}>{translate("list.dismiss")}</Button>
        </AlertDescription>
      </Alert>
    ) : null}
    {admin.isPending ? (
      <UserTableSkeleton />
    ) : showEmpty ? (
      <Empty className="rounded-lg border bg-card">
        <EmptyHeader>
          <EmptyTitle>{translate(admin.filters.search ? "list.emptySearchTitle" : "list.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {admin.filters.search
              ? admin.hasMore
                ? translate("list.emptyLoadedDescription")
                : translate("list.emptySearchDescription")
              : translate("list.emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex justify-center gap-2">
          {admin.filters.search ? (
            admin.hasMore
              ? <Button type="button" variant="outline" onClick={() => admin.nextPage()}>{translate("list.searchNextBatch")}</Button>
              : <Button type="button" variant="outline" onClick={admin.clearFilters}>{translate("list.clearSearch")}</Button>
          ) : (
            <Button render={<a href="/admin/users/create" />} nativeButton={false}>{translate("list.create")}</Button>
          )}
        </EmptyContent>
      </Empty>
    ) : (
      <UserTable
        users={admin.users}
        total={admin.total}
        totalIsExact={admin.totalIsExact}
        rolePendingId={admin.rolePendingId}
        banPendingId={admin.banPendingId}
        onToggleRole={admin.toggleRole}
        onToggleBanned={admin.toggleBanned}
      />
    )}
    {!admin.isPending && !admin.queryError && !showEmpty ? (
      <AdminUsersPagination
        page={admin.filters.page}
        totalPages={admin.totalPages}
        hasMore={admin.hasMore}
        isFetching={admin.isFetching}
        onPrevious={admin.previousPage}
        onNext={admin.nextPage}
      />
    ) : null}
  </>;
}
`;
}

function nextPageContent(options: AdminTemplateOptions): string {
  const applicationModule =
    options.mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "${applicationModule}";
import { AdminUsersFeature } from "@/features/admin-users";
import { DEFAULT_ADMIN_USERS_FILTERS } from "@/features/admin-users/types";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";

async function AdminUsersData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const principal = application.principal;
  if (!principal) redirect("/sign-in");
  const scope = { userId: principal.identityUserId, sessionId: principal.sessionId, tenantId: principal.activeOrganizationId, teamId: principal.activeTeamId };
  const data = await application.admin.listUsers(DEFAULT_ADMIN_USERS_FILTERS);
  const initialData = {
    total: data.total,
    users: data.users.map((user) => ({ ...user, identityId: user.id })),
  };
  return <RequestOwnedSnapshot scope={scope}><AdminUsersFeature initialData={initialData} /></RequestOwnedSnapshot>;
}

export default function AdminUsersPage(): React.JSX.Element {
  return <Suspense fallback={<QueryAuthStatus />}><AdminUsersData /></Suspense>;
}
`;
}

export function adminFeatureIndexFile(options: AdminTemplateOptions): TemplateFile {
  return file(`${adminFeatureRoot(options)}/index.tsx`, featureIndexContent());
}

export function adminUserResultsFile(options: AdminTemplateOptions): TemplateFile {
  return file(`${adminFeatureRoot(options)}/components/user-results.tsx`, userResultsContent());
}

export function nextAdminUsersPage(options: AdminTemplateOptions): TemplateFile {
  const appRoot = options.sourceRoot === "src" ? "src/app" : "apps/web/src/app";
  return file(`${appRoot}/admin/users/page.tsx`, nextPageContent(options));
}
