import { identityWorkspaceWebI18n } from "./web-i18n.js";

export function identityWorkspaceMemberIdentityContent(hasI18n = false): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  return `"use client";
import type * as React from "react";
import { compactIdentityId } from "../access";
${i18n.importLine}

export function MemberIdentity({ userId, currentUser }: { userId: string; currentUser: { id: string; name: string | null } | null }): React.JSX.Element {
${i18n.hookLine}
  const isCurrentUser = currentUser?.id === userId;
  const name = isCurrentUser ? currentUser?.name?.trim() : undefined;
  return <div className="min-w-0 space-y-1">
    <p className="truncate text-sm font-medium">{name || (isCurrentUser ? t("you") : t("memberLabel"))}{name ? <span className="ms-2 text-xs font-normal text-muted-foreground">{t("you")}</span> : null}</p>
    <code dir="ltr" title={userId} className="block text-xs text-muted-foreground">{compactIdentityId(userId)}</code>
  </div>;
}
`;
}
