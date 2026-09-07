import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function userRowContent(): string {
  return `"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  UserRowConfirmationDialog,
  type UserRowConfirmation,
} from "./user-row-confirmation";
import { useAdminUsersTranslations } from "../translations";
import type { AdminUser, AdminUserRole } from "../types";

export interface UserRowProps {
  user: AdminUser;
  rolePending: boolean;
  banPending: boolean;
  onToggleRole(identityId: string, currentRole: AdminUserRole): Promise<boolean>;
  onToggleBanned(identityId: string, currentlyBanned: boolean): Promise<boolean>;
}

export function UserRow({
  user,
  rolePending,
  banPending,
  onToggleRole,
  onToggleBanned,
}: UserRowProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  const [confirmation, setConfirmation] = React.useState<UserRowConfirmation>(null);
  const canManage = user.identityId !== null;
  const pending = confirmation === "role" ? rolePending : banPending;
  const changingRole = confirmation === "role";

  async function confirmAction(): Promise<void> {
    if (!user.identityId || !confirmation) return;
    const succeeded = changingRole
      ? await onToggleRole(user.identityId, user.role)
      : await onToggleBanned(user.identityId, user.banned);
    if (succeeded) setConfirmation(null);
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">{user.name ?? user.email}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">
            {translate(user.role === "admin" ? "roles.admin" : "roles.user")}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant={user.banned ? "destructive" : "outline"}>
            {translate(user.banned ? "status.suspended" : "status.active")}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canManage || rolePending || banPending}
              onClick={() => setConfirmation("role")}
            >
              {rolePending
                ? translate("actions.updating")
                : translate(user.role === "admin" ? "actions.demote" : "actions.promote")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canManage || rolePending || banPending}
              onClick={() => setConfirmation("ban")}
            >
              {banPending
                ? translate("actions.updating")
                : translate(user.banned ? "actions.restore" : "actions.suspend")}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <UserRowConfirmationDialog
        confirmation={confirmation}
        user={user}
        pending={pending}
        canManage={canManage}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void confirmAction()}
      />
    </>
  );
}
`;
}

function userRowConfirmationContent(): string {
  return `"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAdminUsersTranslations } from "../translations";
import type { AdminUser } from "../types";

export type UserRowConfirmation = "role" | "ban" | null;

export interface UserRowConfirmationDialogProps {
  confirmation: UserRowConfirmation;
  user: AdminUser;
  pending: boolean;
  canManage: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function UserRowConfirmationDialog({
  confirmation,
  user,
  pending,
  canManage,
  onCancel,
  onConfirm,
}: UserRowConfirmationDialogProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  const changingRole = confirmation === "role";
  const nextRole = user.role === "admin" ? "user" : "admin";
  return (
    <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {changingRole
              ? translate(nextRole === "admin" ? "dialogs.grantTitle" : "dialogs.removeTitle")
              : translate(user.banned ? "dialogs.restoreTitle" : "dialogs.suspendTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {changingRole
              ? translate("dialogs.roleDescription", {
                  email: user.email,
                  role: translate(nextRole === "admin" ? "roles.admin" : "roles.user"),
                })
              : translate(user.banned ? "dialogs.restoreDescription" : "dialogs.suspendDescription", {
                  email: user.email,
                  role: translate(user.role === "admin" ? "roles.admin" : "roles.user"),
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            {translate("dialogs.cancel")}
          </Button>
          <Button
            type="button"
            variant={!changingRole && !user.banned ? "destructive" : "default"}
            disabled={!canManage || pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            {pending
              ? translate("dialogs.saving")
              : changingRole
                ? translate("dialogs.confirmRole")
                : translate(user.banned ? "dialogs.restoreAccount" : "dialogs.suspendAccount")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
`;
}

export function adminUserRowFile(options: AdminTemplateOptions): TemplateFile {
  return file(`${adminFeatureRoot(options)}/components/user-row.tsx`, userRowContent());
}

export function adminUserRowConfirmationFile(options: AdminTemplateOptions): TemplateFile {
  return file(
    `${adminFeatureRoot(options)}/components/user-row-confirmation.tsx`,
    userRowConfirmationContent(),
  );
}
