import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceInvitationRowContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
${i18n.importLine}
import type { IdentityInvitation } from "../types";

interface InvitationRowProps {
  invitation: IdentityInvitation;
  pending: boolean;
  canAccept: boolean;
  canCancel: boolean;
  onAccept(): void;
  onCancel(): void;
}

export function InvitationRow({
  invitation,
  pending,
  canAccept,
  canCancel,
  onAccept,
  onCancel,
}: InvitationRowProps): React.JSX.Element {
${i18n.hookLine}
  const role = t(
    invitation.role === "owner"
      ? "roles.owner"
      : invitation.role === "admin"
        ? "roles.admin"
        : "roles.member",
  );
  const status = t(
    invitation.status === "pending"
      ? "statuses.pending"
      : invitation.status === "accepted"
        ? "statuses.accepted"
        : invitation.status === "expired"
          ? "statuses.expired"
          : "statuses.cancelled",
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{invitation.email}</p>
        <p className="text-xs text-muted-foreground">{role} · {status}</p>
      </div>
      {invitation.status === "pending" ? (
        <div className="flex gap-2">
          {canAccept ? <Button size="sm" variant="outline" disabled={pending} onClick={onAccept}>
            ${i18n.child("accept")}
          </Button> : null}
          {canCancel ? <Button size="sm" variant="destructive" disabled={pending} onClick={onCancel}>
            ${i18n.child("cancel")}
          </Button> : null}
        </div>
      ) : null}
    </div>
  );
}
`;
}
