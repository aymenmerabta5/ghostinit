import {
  settingsDangerZoneCardContent,
  settingsHookContent,
  settingsLayoutContent,
  settingsPageContent,
  settingsPasskeyCardContent,
  settingsPasskeyListContent,
  settingsPasskeyDataContent,
  settingsPasskeyManagementContent,
  settingsPasswordCardContent,
  settingsProfileCardContent,
  settingsSessionsCardContent,
  settingsSessionsDataContent,
  settingsSessionsListContent,
  settingsTwoFactorCardContent,
  settingsTwoFactorHookContent,
} from "../../../apps/fragments/settings/index.js";

export function settingsLayoutSingle(hasBilling = true, hasIdentityTransport = true): string {
  return settingsLayoutContent(hasBilling, hasIdentityTransport);
}

export function useSettingsHookSingle(): string {
  return settingsHookContent();
}

export function settingsProfileCardSingle(): string {
  return settingsProfileCardContent();
}

export function settingsPasswordCardSingle(): string {
  return settingsPasswordCardContent();
}

export function settingsPasskeyCardSingle(): string {
  return settingsPasskeyCardContent();
}

export function settingsPasskeyListSingle(): string {
  return settingsPasskeyListContent();
}

export function settingsPasskeyDataSingle(): string {
  return settingsPasskeyDataContent();
}

export function settingsPasskeyManagementSingle(): string {
  return settingsPasskeyManagementContent();
}

export function settingsTwoFactorCardSingle(): string {
  return settingsTwoFactorCardContent();
}

export function settingsTwoFactorHookSingle(): string {
  return settingsTwoFactorHookContent();
}

export function settingsSessionsCardSingle(): string {
  return settingsSessionsCardContent();
}

export function settingsSessionsDataSingle(useServerActions = false): string {
  return settingsSessionsDataContent(useServerActions);
}

export function settingsSessionsListSingle(): string {
  return settingsSessionsListContent();
}

export function settingsDangerZoneCardSingle(hasEmail = true): string {
  return settingsDangerZoneCardContent(hasEmail);
}

export function settingsPageSingleContent(
  hasIdentityTransport = true,
  hasEmail = true,
  hasPasskey = true,
  useRsc = false,
): string {
  return settingsPageContent(hasIdentityTransport, hasEmail, hasPasskey, useRsc, "single");
}
