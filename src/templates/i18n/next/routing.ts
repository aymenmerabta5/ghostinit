import { file, type TemplateFile } from "../../shared.js";

export function nextRoutingFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `import { defineRouting } from "next-intl/routing";

export const locales = ["en", "fr", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "NEXT_LOCALE" as const;
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "never",
  localeDetection: false,
});

export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  fr: "ltr",
  ar: "rtl",
};

export function isValidLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}
`,
  );
}
