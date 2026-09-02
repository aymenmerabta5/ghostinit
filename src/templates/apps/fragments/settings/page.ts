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
    ? `import { SessionsCard } from "./components/sessions-card.js";`
    : "";
  const sessionsCard = hasIdentityTransport ? "      <SessionsCard />" : "";
  const passwordImports = hasEmail
    ? `import { PasswordCard } from "./components/password-card.js";
import { TwoFactorCard } from "./components/two-factor-card.js";`
    : "";
  const passwordCards = hasEmail ? "      <PasswordCard />\n      <TwoFactorCard />" : "";
  const passkeyImport = hasPasskey
    ? `import { PasskeyCard } from "./components/passkey-card.js";`
    : "";
  const passkeyCard = hasPasskey ? "      <PasskeyCard />" : "";
  if (useRsc && hasIdentityTransport) {
    return `import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "${applicationModule}";
import { ProfileCard } from "./components/profile-card.js";
${passwordImports}
${passkeyImport}
import { DangerZoneCard } from "./components/danger-zone-card.js";
${sessionsImport}

async function SettingsData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  if (!me.user) redirect("/sign-in");
  const initialSessions = await application.identity.sessions.list();
  return <div className="flex flex-col gap-6 max-w-2xl">
    <ProfileCard initialUser={me.user} />
${passwordCards}
${passkeyCard}
    <SessionsCard initialSessions={initialSessions} />
    <DangerZoneCard />
  </div>;
}

export default function SettingsPage(): React.JSX.Element {
  return <Suspense fallback={<div className="min-h-64" aria-busy="true" />}><SettingsData /></Suspense>;
}
`;
  }
  return `"use client";
import * as React from "react";
import { ProfileCard } from "./components/profile-card.js";
${passwordImports}
${passkeyImport}
import { DangerZoneCard } from "./components/danger-zone-card.js";
${sessionsImport}
export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
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
