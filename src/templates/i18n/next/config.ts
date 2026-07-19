import { file, type TemplateFile } from "../../shared.js";
import * as v from "../../versions.js";

export function nextI18nConfigFile(filePath: string, routingImport: string): TemplateFile {
  return file(
    filePath,
    `import { routing, localeDirection, type Locale } from "${routingImport}";

export { routing, localeDirection };
export type { Locale };

export const defaultLocale: Locale = routing.defaultLocale;
export const locales: readonly Locale[] = routing.locales;

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
  return (localeDirection as Record<string, string>)[locale] === "rtl";
}

export function isValidLocale(value: unknown): value is Locale {
  return typeof value === "string" && (routing.locales as readonly string[]).includes(value);
}

export const nextIntlVersion = "${v.i18n["next-intl"]}" as const;
`,
  );
}
