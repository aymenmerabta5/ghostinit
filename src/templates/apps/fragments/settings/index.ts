import { file, type TemplateFile } from "../../../shared.js";
import { settingsLayout } from "./layout.js";
import { settingsPage } from "./page.js";
import { settingsActionsContent } from "./actions.js";
import { webSettingsFeatureFiles } from "./feature.js";
import { tanstackSettingsPage, tanstackSettingsFeatureFiles } from "./tanstack-page.js";

export type RouterType = "next" | "tanstack";
export { settingsLayout, settingsLayoutContent } from "./layout.js";
export { settingsPage, settingsPageContent } from "./page.js";
export {
  tanstackSettingsPage,
  tanstackSettingsPageContent,
  tanstackSettingsFeatureFiles,
} from "./tanstack-page.js";
export { webSettingsFeatureFiles } from "./feature.js";

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
    ...webSettingsFeatureFiles("apps/web/src", "next", hasIdentityTransport, hasEmail, hasPasskey),
    ...(hasIdentityTransport
      ? [file("apps/web/src/app/settings/actions.ts", settingsActionsContent("monorepo"))]
      : []),
    settingsPage(hasIdentityTransport, hasEmail, hasPasskey, hasIdentityTransport),
  ];
}
