import type { TemplateFile } from "../../../shared.js";
import { settingsLayout } from "./layout.js";
import { useSettingsHook } from "./hook.js";
import { settingsProfileCard } from "./profile-card.js";
import { settingsPasswordCard } from "./password-card.js";
import { settingsTwoFactorCard } from "./two-factor-card.js";
import { settingsDangerZoneCard } from "./danger-card.js";
import { settingsSessionsCard } from "./sessions-card.js";
import { settingsPage } from "./page.js";
import { tanstackSettingsPage, tanstackSettingsPageContent } from "./tanstack-page.js";

export type RouterType = "next" | "tanstack";

export {
  settingsLayout,
  useSettingsHook,
  settingsProfileCard,
  settingsPasswordCard,
  settingsTwoFactorCard,
  settingsDangerZoneCard,
  settingsSessionsCard,
  settingsPage,
  tanstackSettingsPage,
  tanstackSettingsPageContent,
};

export function settingsFiles(router: RouterType = "next"): TemplateFile[] {
  if (router === "tanstack") {
    return [tanstackSettingsPage()];
  }
  return [
    settingsLayout(),
    useSettingsHook(),
    settingsProfileCard(),
    settingsPasswordCard(),
    settingsTwoFactorCard(),
    settingsSessionsCard(),
    settingsDangerZoneCard(),
    settingsPage(),
  ];
}
