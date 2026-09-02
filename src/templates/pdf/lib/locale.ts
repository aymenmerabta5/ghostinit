import { AR_MESSAGES } from "../../i18n/messages/ar.js";
import { EN_MESSAGES } from "../../i18n/messages/en.js";
import { FR_MESSAGES } from "../../i18n/messages/fr.js";

export function pdfLocaleContent(): string {
  const catalogs = {
    en: EN_MESSAGES.pdf.document,
    fr: FR_MESSAGES.pdf.document,
    ar: AR_MESSAGES.pdf.document,
  };
  return `export const pdfLocales = ["en", "fr", "ar"] as const;
export type PdfLocale = (typeof pdfLocales)[number];

const ENGLISH_PDF_MESSAGES = ${JSON.stringify(catalogs.en, null, 2)} as const;
export type PdfMessageKey = keyof typeof ENGLISH_PDF_MESSAGES;

const PDF_MESSAGES: Readonly<Record<PdfLocale, Readonly<Record<PdfMessageKey, string>>>> = {
  en: ENGLISH_PDF_MESSAGES,
  fr: ${JSON.stringify(catalogs.fr, null, 2)},
  ar: ${JSON.stringify(catalogs.ar, null, 2)},
};

export function normalizePdfLocale(locale?: string): PdfLocale {
  const candidate = locale?.trim().toLowerCase().split(/[-_]/, 1)[0];
  return candidate === "fr" || candidate === "ar" ? candidate : "en";
}

export function pdfLocaleTag(locale?: string): "en-US" | "fr-FR" | "ar-DZ" {
  const normalized = normalizePdfLocale(locale);
  return normalized === "fr" ? "fr-FR" : normalized === "ar" ? "ar-DZ" : "en-US";
}

export function pdfMessage(locale: string | undefined, key: PdfMessageKey): string {
  return PDF_MESSAGES[normalizePdfLocale(locale)][key];
}

export function pdfTextAlign(locale?: string): "left" | "right" {
  return normalizePdfLocale(locale) === "ar" ? "right" : "left";
}

export function pdfRowDirection(locale?: string): "row" | "row-reverse" {
  return normalizePdfLocale(locale) === "ar" ? "row-reverse" : "row";
}
`;
}
