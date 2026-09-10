import { settingsLayoutContent } from "../../../apps/fragments/settings/layout.js";
import { settingsPageContent } from "../../../apps/fragments/settings/page.js";
export function settingsLayoutSingle(hasBilling = true, hasIdentityTransport = true): string {
  return settingsLayoutContent(hasBilling, hasIdentityTransport);
}
export function settingsPageSingleContent(
  hasIdentityTransport = true,
  hasEmail = true,
  hasPasskey = true,
  useRsc = false,
): string {
  return settingsPageContent(hasIdentityTransport, hasEmail, hasPasskey, useRsc, "single");
}
