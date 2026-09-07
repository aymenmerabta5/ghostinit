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
  settingsTwoFactorCard,
  settingsTwoFactorHook,
  settingsDangerZoneCard,
  settingsSessionsCard,
  settingsSessionsList,
  settingsPage,
  settingsPageContent,
  settingsHookContent,
  settingsProfileCardContent,
  settingsPasswordCardContent,
  settingsPasskeyCardContent,
  settingsPasskeyListContent,
  settingsTwoFactorCardContent,
  settingsTwoFactorHookContent,
  settingsDangerZoneCardContent,
  settingsSessionsCardContent,
  settingsSessionsListContent,
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
  const useBetterAuthServerActions = !isConvex;
  return [
    settingsLayout(hasBilling, hasIdentityTransport),
    useSettingsHook(),
    ...(useBetterAuthServerActions || hasIdentityTransport
      ? [
          file(
            "apps/web/src/app/settings/actions.ts",
            settingsActionsContent("monorepo", hasIdentityTransport, useBetterAuthServerActions),
          ),
        ]
      : []),
    settingsProfileCard(useBetterAuthServerActions),
    ...(hasEmail ? [settingsPasswordCard(), settingsTwoFactorCard(), settingsTwoFactorHook()] : []),
    ...(hasPasskey ? [settingsPasskeyCard(), settingsPasskeyList()] : []),
    ...(hasIdentityTransport ? [settingsSessionsCard(true), settingsSessionsList()] : []),
    settingsDangerZoneCard(hasEmail, useBetterAuthServerActions),
    settingsPage(hasIdentityTransport, hasEmail, hasPasskey, hasIdentityTransport),
  ];
}
