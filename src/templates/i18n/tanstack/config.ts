import { file, type TemplateFile } from "../../shared.js";

export function tanstackConfigFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `export const locales = ["en", "fr", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "NEXT_LOCALE" as const;
export const localeStorageKey = "ghostinit:locale" as const;
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  fr: "ltr",
  ar: "rtl",
};

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

export function isValidLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}

export function isRtl(locale: string): boolean {
  return isValidLocale(locale) && localeDirection[locale] === "rtl";
}

export const i18nVersion = "tanstack-custom" as const;
`,
  );
}
