import { file, type TemplateFile } from "../../../shared.js";

export function settingsPageContent(
  hasIdentityTransport = true,
  hasEmail = true,
  hasPasskey = true,
  useRsc = false,
  mode: "monorepo" | "single" = "monorepo",
): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  const sessionsImport = hasIdentityTransport
    ? `import { SessionsCard } from "@/features/settings/sessions-card";`
    : "";
  const sessionsCard = hasIdentityTransport ? "      <SessionsCard />" : "";
  const passwordImports = hasEmail
    ? `import { PasswordCard } from "@/features/settings/password-card";
import { TwoFactorCard } from "@/features/settings/two-factor-card";`
    : "";
  const passwordCards = hasEmail
    ? '<div className="grid items-start gap-6 xl:grid-cols-2"><PasswordCard /><TwoFactorCard /></div>'
    : "";
  const passkeyImport = hasPasskey
    ? `import { PasskeyCard } from "@/features/settings/passkey-card";`
    : "";
  const passkeyCard = hasPasskey ? "      <PasskeyCard />" : "";
  if (useRsc && hasIdentityTransport) {
    return `import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "${applicationModule}";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
import { ProfileCard } from "@/features/settings/profile-card";
${passwordImports}
${passkeyImport}
import { DangerZoneCard } from "@/features/account-deletion/account-deletion";
${sessionsImport}

async function SettingsData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  const principal = application.principal;
  if (!me.user || !principal) redirect("/sign-in");
  const initialScope = {
    userId: principal.identityUserId,
    sessionId: principal.sessionId,
    tenantId: principal.activeOrganizationId,
    teamId: principal.activeTeamId,
  };
  const initialSessions = await application.identity.sessions.list();
  return <RequestOwnedSnapshot scope={initialScope}><div className="flex min-w-0 flex-col gap-6">
    <ProfileCard initialUser={me.user} />
${passwordCards}
${passkeyCard}
    <SessionsCard initialSessions={initialSessions} initialScope={initialScope} />
    <DangerZoneCard />
  </div></RequestOwnedSnapshot>;
}

export default function SettingsPage(): React.JSX.Element {
  return <Suspense fallback={<QueryAuthStatus />}><SettingsData /></Suspense>;
}
`;
  }
  return `"use client";
import * as React from "react";
import { ProfileCard } from "@/features/settings/profile-card";
${passwordImports}
${passkeyImport}
import { DangerZoneCard } from "@/features/account-deletion/account-deletion";
${sessionsImport}
export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ProfileCard />
${passwordCards}
${passkeyCard}
${sessionsCard}
      <DangerZoneCard />
    </div>
  );
}
`;
}

export function settingsPage(
  hasIdentityTransport = true,
  hasEmail = true,
  hasPasskey = true,
  useRsc = false,
  mode: "monorepo" | "single" = "monorepo",
): TemplateFile {
  return file(
    "apps/web/src/app/settings/page.tsx",
    settingsPageContent(hasIdentityTransport, hasEmail, hasPasskey, useRsc, mode),
  );
}
