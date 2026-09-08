import { file, type TemplateFile } from "../../../shared.js";
import { settingsLayout, settingsLayoutContent } from "./layout.js";
import { settingsHookContent, useSettingsHook } from "./hook.js";
import { settingsProfileCard, settingsProfileCardContent } from "./profile-card.js";
import { settingsPasswordCard, settingsPasswordCardContent } from "./password-card.js";
import {
  settingsPasskeyCard,
  settingsPasskeyCardContent,
  settingsPasskeyList,
  settingsPasskeyListContent,
  settingsPasskeyManagement,
  settingsPasskeyManagementContent,
} from "./passkey-card.js";
import {
  settingsTwoFactorCard,
  settingsTwoFactorCardContent,
  settingsTwoFactorHook,
  settingsTwoFactorHookContent,
} from "./two-factor-card.js";
import { settingsDangerZoneCard, settingsDangerZoneCardContent } from "./danger-card.js";
import {
  settingsSessionsCard,
  settingsSessionsCardContent,
  settingsSessionsList,
  settingsSessionsListContent,
} from "./sessions-card.js";
import { settingsSessionsData, settingsSessionsDataContent } from "./sessions-data.js";
import { settingsPasskeyData, settingsPasskeyDataContent } from "./passkey-data.js";
import { settingsPage, settingsPageContent } from "./page.js";
import { settingsActionsContent } from "./actions.js";
import {
  tanstackSettingsFeatureFiles,
  tanstackSettingsPage,
  tanstackSettingsPageContent,
} from "./tanstack-page.js";

export type RouterType = "next" | "tanstack";

export {
  settingsLayout,
  settingsLayoutContent,
  useSettingsHook,
  settingsProfileCard,
  settingsPasswordCard,
  settingsPasskeyCard,
  settingsPasskeyList,
  settingsPasskeyData,
  settingsPasskeyManagement,
  settingsTwoFactorCard,
  settingsTwoFactorHook,
  settingsDangerZoneCard,
  settingsSessionsCard,
  settingsSessionsList,
  settingsSessionsData,
  settingsPage,
  settingsPageContent,
  settingsHookContent,
  settingsProfileCardContent,
  settingsPasswordCardContent,
  settingsPasskeyCardContent,
  settingsPasskeyListContent,
  settingsPasskeyDataContent,
  settingsPasskeyManagementContent,
  settingsTwoFactorCardContent,
  settingsTwoFactorHookContent,
  settingsDangerZoneCardContent,
  settingsSessionsCardContent,
  settingsSessionsListContent,
  settingsSessionsDataContent,
  tanstackSettingsPage,
  tanstackSettingsPageContent,
  tanstackSettingsFeatureFiles,
};

export function settingsFiles(
  router: RouterType = "next",
  isConvex = false,
  hasIdentityTransport = true,
  hasBilling = true,
  hasEmail = true,
  hasPasskey = !isConvex,
): TemplateFile[] {
  if (router === "tanstack") {
    return [
      tanstackSettingsPage(isConvex, "monorepo", hasIdentityTransport, hasBilling),
      ...tanstackSettingsFeatureFiles("monorepo", hasIdentityTransport, hasEmail, hasPasskey),
    ];
  }
  return [
    settingsLayout(hasBilling, hasIdentityTransport),
    useSettingsHook(),
    ...(hasIdentityTransport
      ? [file("apps/web/src/app/settings/actions.ts", settingsActionsContent("monorepo"))]
      : []),
    settingsProfileCard(),
    ...(hasEmail ? [settingsPasswordCard(), settingsTwoFactorCard(), settingsTwoFactorHook()] : []),
    ...(hasPasskey
      ? [
          settingsPasskeyCard(),
          settingsPasskeyList(),
          settingsPasskeyData(),
          settingsPasskeyManagement(),
        ]
      : []),
    ...(hasIdentityTransport
      ? [settingsSessionsCard(), settingsSessionsList(), settingsSessionsData(true)]
      : []),
    settingsDangerZoneCard(hasEmail),
    settingsPage(hasIdentityTransport, hasEmail, hasPasskey, hasIdentityTransport),
  ];
}
