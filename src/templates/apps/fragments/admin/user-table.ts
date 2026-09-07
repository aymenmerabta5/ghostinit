import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function tableContent(): string {
  return `"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRow } from "./user-row";
import {
  formatAdminUsersAccountCount,
  useAdminUsersTranslations,
} from "../translations";
import type { AdminUser, AdminUserRole } from "../types";

export interface UserTableProps {
  users: readonly AdminUser[];
  total: number;
  totalIsExact: boolean;
  rolePendingId: string | null;
  banPendingId: string | null;
  onToggleRole(identityId: string, currentRole: AdminUserRole): Promise<boolean>;
  onToggleBanned(identityId: string, currentlyBanned: boolean): Promise<boolean>;
}

export function UserTable({
  users,
  total,
  totalIsExact,
  rolePendingId,
  banPendingId,
  onToggleRole,
  onToggleBanned,
}: UserTableProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  return (
    <Table className="bg-card">
        <TableCaption>{formatAdminUsersAccountCount(translate, total, totalIsExact)}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{translate("table.account")}</TableHead>
            <TableHead scope="col">{translate("table.role")}</TableHead>
            <TableHead scope="col">{translate("table.status")}</TableHead>
            <TableHead scope="col" className="text-end">{translate("table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              rolePending={user.identityId !== null && rolePendingId === user.identityId}
              banPending={user.identityId !== null && banPendingId === user.identityId}
              onToggleRole={onToggleRole}
              onToggleBanned={onToggleBanned}
            />
          ))}
        </TableBody>
    </Table>
  );
}

export function UserTableSkeleton(): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  return (
    <div className="overflow-hidden rounded-lg border bg-card" aria-busy="true" aria-label={translate("table.loading")}>
      <div className="grid grid-cols-[minmax(12rem,1fr)_6rem_6rem_10rem] gap-4 border-b px-4 py-3">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}
      </div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[minmax(12rem,1fr)_6rem_6rem_10rem] items-center gap-4 px-4 py-4">
          <div className="flex min-w-0 flex-col gap-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-52" /></div>
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-8 w-36 justify-self-end" />
        </div>
      ))}
    </div>
  );
}
`;
}

export function adminUserTableFile(options: AdminTemplateOptions): TemplateFile {
  return file(`${adminFeatureRoot(options)}/components/user-table.tsx`, tableContent());
}
