import { file, type TemplateFile } from "../../../shared.js";
export function settingsPage(): TemplateFile {
  return file(
    "apps/web/src/app/settings/page.tsx",
    `"use client";
import * as React from "react";
import { ProfileCard } from "./components/profile-card.js";
import { PasswordCard } from "./components/password-card.js";
import { TwoFactorCard } from "./components/two-factor-card.js";
import { DangerZoneCard } from "./components/danger-zone-card.js";
import { SessionsCard } from "./components/sessions-card.js";
export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <ProfileCard />
      <PasswordCard />
      <TwoFactorCard />
      <SessionsCard />
      <DangerZoneCard />
    </div>
  );
}
`,
  );
}
