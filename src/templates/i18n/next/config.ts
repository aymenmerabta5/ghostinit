import { file, type TemplateFile } from "../../shared.js";
import * as v from "../../versions.js";

export function nextI18nConfigFile(filePath: string, routingImport: string): TemplateFile {
  return file(
    filePath,
    `import {
  defaultLocale,
  isValidLocale,
  localeCookieMaxAge,
  localeCookieName,
  localeDirection,
  locales,
  routing,
  type Locale,
} from "${routingImport}";

export {
  defaultLocale,
  isValidLocale,
  localeCookieMaxAge,
  localeCookieName,
  localeDirection,
  locales,
  routing,
};
export type { Locale };

export const localeNames: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

export const localeLabels: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
  ar: "AR",
};

export const localeDisplay: Record<Locale, string> = {
  en: "English (Algeria)",
  fr: "Français (Algérie)",
  ar: "العربية (الجزائر)",
};

export const timeZone = "Africa/Algiers" as const;

export function isRtl(locale: string): boolean {
  return isValidLocale(locale) && localeDirection[locale] === "rtl";
}

export const nextIntlVersion = "${v.i18n["next-intl"]}" as const;
`,
  );
}
