import type { TemplateFile } from "../shared.js";
import { EN_MESSAGES } from "./messages/en.js";
import { FR_MESSAGES } from "./messages/fr.js";
import { AR_MESSAGES } from "./messages/ar.js";
import { resolveI18nParams } from "./resolver.js";
import { makeMessagesFile } from "./shared.js";
import { nextRoutingFile } from "./next/routing.js";
import { nextRequestFile } from "./next/request.js";
import { nextNavigationFile } from "./next/navigation.js";
import { nextI18nConfigFile } from "./next/config.js";
import { nextLegacyI18nBarrel } from "./next/barrel.js";
import { nextLocaleSwitcherComponent } from "./next/switcher.js";
import { nextIntlPluginReadme } from "./next/readme.js";
import { tanstackConfigFile } from "./tanstack/config.js";
import { tanstackLibFile } from "./tanstack/lib.js";
import { tanstackLocaleSwitcherFile } from "./tanstack/switcher.js";
import { tanstackReadmeFile } from "./tanstack/readme.js";

export function i18nFiles(a?: unknown, b?: unknown, c?: unknown, d?: unknown): TemplateFile[] {
  const { mode, framework } = resolveI18nParams(a, b, c, d);
  const isTanstack = framework === "tanstack-start";
  const isMonorepo = mode === "monorepo";

  if (isTanstack) {
    if (isMonorepo) {
      return [
        tanstackConfigFile("apps/web/src/i18n/config.ts"),
        makeMessagesFile("apps/web/src/i18n/messages/en.json", EN_MESSAGES),
        makeMessagesFile("apps/web/src/i18n/messages/fr.json", FR_MESSAGES),
        makeMessagesFile("apps/web/src/i18n/messages/ar.json", AR_MESSAGES),
        tanstackLibFile("apps/web/src/lib/i18n.ts"),
        tanstackLocaleSwitcherFile("apps/web/src/components/locale-switcher.tsx"),
        tanstackReadmeFile("apps/web/src/i18n/README.md"),
      ];
    }
    return [
      tanstackConfigFile("src/i18n/config.ts"),
      makeMessagesFile("src/i18n/messages/en.json", EN_MESSAGES),
      makeMessagesFile("src/i18n/messages/fr.json", FR_MESSAGES),
      makeMessagesFile("src/i18n/messages/ar.json", AR_MESSAGES),
      tanstackLibFile("src/lib/i18n.ts"),
      tanstackLocaleSwitcherFile("src/components/locale-switcher.tsx"),
      tanstackReadmeFile("src/i18n/README.md"),
    ];
  }

  if (isMonorepo) {
    return [
      nextRoutingFile("apps/web/src/i18n/routing.ts"),
      nextRequestFile("apps/web/src/i18n/request.ts", "../../messages"),
      nextNavigationFile("apps/web/src/i18n/navigation.ts"),
      nextI18nConfigFile("apps/web/src/i18n/config.ts", "./routing.js"),
      nextLegacyI18nBarrel("apps/web/src/i18n.ts"),
      makeMessagesFile("apps/web/messages/en.json", EN_MESSAGES),
      makeMessagesFile("apps/web/messages/fr.json", FR_MESSAGES),
      makeMessagesFile("apps/web/messages/ar.json", AR_MESSAGES),
      nextLocaleSwitcherComponent("apps/web/src/components/locale-switcher.tsx"),
      nextIntlPluginReadme("apps/web/src/i18n/README.md"),
    ];
  }
  return [
    nextRoutingFile("src/i18n/routing.ts"),
    nextRequestFile("src/i18n/request.ts", "../messages"),
    nextNavigationFile("src/i18n/navigation.ts"),
    nextI18nConfigFile("src/i18n/config.ts", "./routing.js"),
    nextLegacyI18nBarrel("src/i18n.ts"),
    makeMessagesFile("src/messages/en.json", EN_MESSAGES),
    makeMessagesFile("src/messages/fr.json", FR_MESSAGES),
    makeMessagesFile("src/messages/ar.json", AR_MESSAGES),
    nextLocaleSwitcherComponent("src/components/locale-switcher.tsx"),
    nextIntlPluginReadme("src/i18n/README.md"),
  ];
}

export { resolveI18nParams } from "./resolver.js";
export { EN_MESSAGES, FR_MESSAGES, AR_MESSAGES } from "./messages/index.js";
