import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function userRowContent(): string {
  return `"use client";

import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  UserRowConfirmationDialog,
} from "./user-row-confirmation";
import type { AdminUsersTranslate } from "../translations";
import type { AdminUserActionOptions, useAdminUserAction } from "../use-admin-user-action";

export interface UserRowProps extends Pick<AdminUserActionOptions, "user" | "rolePending" | "banPending">, ReturnType<typeof useAdminUserAction> {
  translate: AdminUsersTranslate;
}

export function UserRow({
  user,
  rolePending,
  banPending,
  confirmation,
  canManage,
  pending,
  chooseRole,
  chooseBan,
  cancel,
  confirmAction,
  translate,
}: UserRowProps): React.JSX.Element {

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
          <div
            className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end"
            onFocusCapture={(event) => event.target.scrollIntoView({ block: "nearest", inline: "nearest" })}
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canManage || rolePending || banPending}
              onClick={chooseRole}
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
              onClick={chooseBan}
            >
              {banPending
                ? translate("actions.updating")
                : translate(user.banned ? "actions.restore" : "actions.suspend")}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <UserRowConfirmationDialog
        translate={translate}
        confirmation={confirmation}
        user={user}
        pending={pending}
        canManage={canManage}
        onCancel={cancel}
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
import type { AdminUsersTranslate } from "../translations";
import type { AdminUser } from "../types";
import type { UserRowConfirmation } from "../use-admin-user-action";
export type { UserRowConfirmation } from "../use-admin-user-action";

export interface UserRowConfirmationDialogProps {
  translate: AdminUsersTranslate;
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
  translate,
}: UserRowConfirmationDialogProps): React.JSX.Element {
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

export function adminUserRowControllerFile(options: AdminTemplateOptions): TemplateFile {
  return file(
    `${adminFeatureRoot(options)}/user-row.tsx`,
    `"use client";
import { UserRow as UserRowView } from "./components/user-row";
import { useAdminUserAction, type AdminUserActionOptions } from "./use-admin-user-action";
import type { AdminUsersTranslate } from "./translations";
export function UserRow(props: AdminUserActionOptions & { translate: AdminUsersTranslate }): React.JSX.Element {
  const action = useAdminUserAction(props);
  return <UserRowView user={props.user} rolePending={props.rolePending} banPending={props.banPending} translate={props.translate} {...action} />;
}
`,
  );
}

export function adminUserRowConfirmationFile(options: AdminTemplateOptions): TemplateFile {
  return file(
    `${adminFeatureRoot(options)}/components/user-row-confirmation.tsx`,
    userRowConfirmationContent(),
  );
}
