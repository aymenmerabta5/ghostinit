import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function queriesContent(): string {
  return `"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { resolveRpcError } from "@/lib/query-client";
import type { AdminUsersFilters, AdminUsersInitialData, AdminUsersQueryState } from "./types";

export interface AdminUsersQueryOptionsConfig { initialData?: AdminUsersInitialData; }
export function resolveAdminUsersError(error: unknown) { return error ? resolveRpcError(error) ?? {} : null; }
export function adminUsersQueryOptions(input: AdminUsersFilters, config: AdminUsersQueryOptionsConfig = {}) {
  return orpc.adminUsers.list.queryOptions({
    input,
    ...(config.initialData ? { initialData: config.initialData } : {}),
    select: (data) => ({ total: data.total, users: data.users.map((user) => ({ ...user, identityId: user.id })) }),
  });
}
export function adminUsersQueryKey() { return orpc.adminUsers.list.key({ type: "query" }); }
export function useAdminUsersData(input: AdminUsersFilters, initialData?: AdminUsersInitialData): AdminUsersQueryState {
  const query = useQuery(adminUsersQueryOptions(input, initialData ? { initialData } : undefined));
  return { data: query.data, error: query.error, isFetching: query.isFetching, isPending: query.isPending, hasMore: false, totalIsExact: true, retry: async () => { await query.refetch(); } };
}
`;
}

function tanstackQueriesContent(): string {
  return `"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import {
  adminUsersQueryKey,
  currentQueryAuthScope,
  resolveRpcError,
  type QueryAuthScope,
} from "@/lib/query-client";
import type { AdminUsersFilters, AdminUsersInitialData, AdminUsersQueryState } from "./types";

export { adminUsersQueryKey } from "@/lib/query-client";
export function resolveAdminUsersError(error: unknown) { return error ? resolveRpcError(error) ?? {} : null; }

export interface AdminUsersQueryOptionsConfig { initialData?: AdminUsersInitialData; }
export function adminUsersQueryOptions(input: AdminUsersFilters, scope: QueryAuthScope | null, config: AdminUsersQueryOptionsConfig = {}) {
  const options = orpc.adminUsers.list.queryOptions({
    input,
    ...(config.initialData ? { initialData: config.initialData } : {}),
    select: (data) => ({ total: data.total, users: data.users.map((user) => ({ ...user, identityId: user.id })) }),
  });
  return {
    ...options,
    queryKey: scope ? adminUsersQueryKey(scope, input) : ["auth", "anonymous", "admin-users"],
    enabled: Boolean(scope) && typeof window !== "undefined",
  };
}
export function useAdminUsersData(input: AdminUsersFilters, initialData?: AdminUsersInitialData): AdminUsersQueryState {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const query = useQuery(adminUsersQueryOptions(input, scope, initialData ? { initialData } : undefined));
  return { data: query.data, error: query.error, isFetching: query.isFetching, isPending: query.isPending, hasMore: false, totalIsExact: true, retry: async () => { await query.refetch(); } };
}
`;
}

function browserMutationsContent(): string {
  return `"use client";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { currentQueryAuthScope } from "@/lib/query-client";
import { adminUsersQueryKey } from "./queries";
import type { AdminUserRole, CreateAdminUserInput } from "./types";

async function invalidateAdminUsers(queryClient: QueryClient): Promise<void> {
  const scope = currentQueryAuthScope(queryClient);
  if (!scope) return;
  await queryClient.invalidateQueries({ queryKey: adminUsersQueryKey(scope) });
}
export function adminCreateUserMutationOptions(queryClient: QueryClient) { return orpc.adminUsers.create.mutationOptions({ onSuccess: async () => invalidateAdminUsers(queryClient) }); }
export function adminChangeRoleMutationOptions(queryClient: QueryClient) { return orpc.adminUsers.changeRole.mutationOptions({ onSuccess: async () => invalidateAdminUsers(queryClient) }); }
export function adminSetBannedMutationOptions(queryClient: QueryClient) { return orpc.adminUsers.setBanned.mutationOptions({ onSuccess: async () => invalidateAdminUsers(queryClient) }); }

export function useAdminUserMutations() {
  const queryClient = useQueryClient();
  const create = useMutation(adminCreateUserMutationOptions(queryClient));
  const changeRole = useMutation(adminChangeRoleMutationOptions(queryClient));
  const setBanned = useMutation(adminSetBannedMutationOptions(queryClient));
  function resetErrors(): void { create.reset(); changeRole.reset(); setBanned.reset(); }
  return {
    async createUser(input: CreateAdminUserInput): Promise<boolean> { resetErrors(); try { await create.mutateAsync(input); return true; } catch { return false; } },
    async updateRole(userId: string, role: AdminUserRole): Promise<boolean> { resetErrors(); try { await changeRole.mutateAsync({ userId, role }); return true; } catch { return false; } },
    async updateBanned(userId: string, banned: boolean): Promise<boolean> { resetErrors(); try { await setBanned.mutateAsync({ userId, banned }); return true; } catch { return false; } },
    error: create.error ?? changeRole.error ?? setBanned.error,
    createPending: create.isPending,
    rolePendingId: changeRole.isPending ? changeRole.variables?.userId ?? null : null,
    banPendingId: setBanned.isPending ? setBanned.variables?.userId ?? null : null,
    resetErrors,
  };
}
`;
}

function nextMutationsContent(): string {
  return `"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { adminUsersQueryKey } from "./queries";
import { changeAdminUserRoleAction, createAdminUserAction, setAdminUserBannedAction } from "@/app/admin/users/actions";
import type { AdminUserRole, CreateAdminUserInput } from "./types";

export function useAdminUserMutations() {
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<Error | null>(null);
  const [createPending, setCreatePending] = React.useState(false);
  const [rolePendingId, setRolePendingId] = React.useState<string | null>(null);
  const [banPendingId, setBanPendingId] = React.useState<string | null>(null);
  function resetErrors(): void { setError(null); }
  async function finish(result: { ok: true } | { ok: false; error: string }): Promise<boolean> {
    if (!result.ok) { setError(new Error(result.error)); return false; }
    await queryClient.invalidateQueries({ queryKey: adminUsersQueryKey() });
    return true;
  }
  return {
    async createUser(input: CreateAdminUserInput): Promise<boolean> { resetErrors(); setCreatePending(true); try { return await finish(await createAdminUserAction(input)); } catch (cause) { setError(cause instanceof Error ? cause : new Error("Create failed")); return false; } finally { setCreatePending(false); } },
    async updateRole(userId: string, role: AdminUserRole): Promise<boolean> { resetErrors(); setRolePendingId(userId); try { return await finish(await changeAdminUserRoleAction({ userId, role })); } catch (cause) { setError(cause instanceof Error ? cause : new Error("Role update failed")); return false; } finally { setRolePendingId(null); } },
    async updateBanned(userId: string, banned: boolean): Promise<boolean> { resetErrors(); setBanPendingId(userId); try { return await finish(await setAdminUserBannedAction({ userId, banned })); } catch (cause) { setError(cause instanceof Error ? cause : new Error("Ban update failed")); return false; } finally { setBanPendingId(null); } },
    error, createPending, rolePendingId, banPendingId, resetErrors,
  };
}
`;
}

function nextActionsContent(options: AdminTemplateOptions): string {
  const applicationModule =
    options.mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "${applicationModule}";

const roleSchema = z.enum(["user", "admin"]);
const createSchema = z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().email(), password: z.string().min(8).max(128), role: roleSchema });
const roleChangeSchema = z.object({ userId: z.string().min(1), role: roleSchema });
const bannedChangeSchema = z.object({ userId: z.string().min(1), banned: z.boolean() });
type AdminActionResult = { ok: true } | { ok: false; error: string };
async function actionApplication() { return createRequestApplicationForRequest(new Headers(await headers())); }
function failure(): AdminActionResult { return { ok: false, error: "Admin operation failed" }; }

export async function createAdminUserAction(input: unknown): Promise<AdminActionResult> {
  const parsed = createSchema.safeParse(input); if (!parsed.success) return { ok: false, error: "Invalid admin user input" };
  try { await (await actionApplication()).admin.createUser(parsed.data); revalidatePath("/admin/users"); return { ok: true }; } catch { return failure(); }
}
export async function changeAdminUserRoleAction(input: unknown): Promise<AdminActionResult> {
  const parsed = roleChangeSchema.safeParse(input); if (!parsed.success) return { ok: false, error: "Invalid role update" };
  try { await (await actionApplication()).admin.changeRole(parsed.data); revalidatePath("/admin/users"); return { ok: true }; } catch { return failure(); }
}
export async function setAdminUserBannedAction(input: unknown): Promise<AdminActionResult> {
  const parsed = bannedChangeSchema.safeParse(input); if (!parsed.success) return { ok: false, error: "Invalid ban update" };
  try { await (await actionApplication()).admin.setBanned(parsed.data); revalidatePath("/admin/users"); return { ok: true }; } catch { return failure(); }
}
`;
}

export function adminDataFiles(options: AdminTemplateOptions): TemplateFile[] {
  const root = adminFeatureRoot(options);
  const appRoot = options.sourceRoot === "src" ? "src/app" : "apps/web/src/app";
  return [
    file(
      `${root}/queries.ts`,
      options.framework === "next" ? queriesContent() : tanstackQueriesContent(),
    ),
    file(
      `${root}/mutations.ts`,
      options.framework === "next" ? nextMutationsContent() : browserMutationsContent(),
    ),
    ...(options.framework === "next"
      ? [file(`${appRoot}/admin/users/actions.ts`, nextActionsContent(options))]
      : []),
  ];
}
