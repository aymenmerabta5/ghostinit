import { AR_MESSAGES } from "./messages/ar.js";
import { EN_MESSAGES } from "./messages/en.js";
import { FR_MESSAGES } from "./messages/fr.js";

export function transactionalEmailCatalogLiteral(i18nEnabled: boolean): string {
  const catalogs = i18nEnabled
    ? {
        en: EN_MESSAGES.transactionalEmail,
        fr: FR_MESSAGES.transactionalEmail,
        ar: AR_MESSAGES.transactionalEmail,
      }
    : { en: EN_MESSAGES.transactionalEmail };
  return JSON.stringify(catalogs, null, 2);
}

export function transactionalEmailLocaleContent(i18nEnabled: boolean): string {
  const localeUnion = i18nEnabled ? '"en" | "fr" | "ar"' : '"en"';
  const localeList = i18nEnabled ? '["en", "fr", "ar"]' : '["en"]';
  const directionBody = i18nEnabled
    ? 'return locale === "ar" ? "rtl" : "ltr";'
    : 'void locale;\n  return "ltr";';
  return `export const EMAIL_LOCALES = ${localeList} as const;
export type EmailLocale = ${localeUnion};
export type TransactionalEmailKind =
  | "verification"
  | "password-reset"
  | "welcome"
  | "magic-link";

export interface TransactionalEmailCopy {
  readonly subject: string;
  readonly title: string;
  readonly titleWithName?: string;
  readonly body: string;
  readonly action: string;
  readonly detail: string;
}

const EMAIL_MESSAGES = ${transactionalEmailCatalogLiteral(i18nEnabled)} as const;

export function normalizeEmailLocale(value: unknown): EmailLocale | null {
  if (typeof value !== "string") return null;
  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return EMAIL_LOCALES.find((locale) => locale === language) ?? null;
}

function localeFromCookie(cookieHeader: string | null): EmailLocale | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== "NEXT_LOCALE") continue;
    try {
      return normalizeEmailLocale(decodeURIComponent(entry.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

function localeFromAcceptLanguage(header: string | null): EmailLocale | null {
  if (!header) return null;
  const preferences: Array<{ locale: EmailLocale; quality: number; order: number }> = [];
  header.split(",").forEach((entry, order) => {
    const [tag = "", ...parameters] = entry.trim().split(";");
    const locale = normalizeEmailLocale(tag);
    if (!locale) return;
    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
    const parsedQuality = qualityParameter
      ? Number.parseFloat(qualityParameter.trim().slice(2))
      : 1;
    const quality = Number.isFinite(parsedQuality) ? parsedQuality : 0;
    if (quality > 0) preferences.push({ locale, quality, order });
  });
  preferences.sort((left, right) => right.quality - left.quality || left.order - right.order);
  return preferences[0]?.locale ?? null;
}

export function resolveEmailLocale(headers?: Headers | null): EmailLocale {
  return (
    localeFromCookie(headers?.get("cookie") ?? null) ??
    localeFromAcceptLanguage(headers?.get("accept-language") ?? null) ??
    "en"
  );
}

export function emailDirection(locale: EmailLocale): "ltr" | "rtl" {
  ${directionBody}
}

function emailCopyKey(
  kind: TransactionalEmailKind,
): "verification" | "passwordReset" | "welcome" | "magicLink" {
  if (kind === "password-reset") return "passwordReset";
  if (kind === "magic-link") return "magicLink";
  return kind;
}

export function getTransactionalEmailCopy(
  locale: EmailLocale,
  kind: TransactionalEmailKind,
): TransactionalEmailCopy {
  return EMAIL_MESSAGES[locale][emailCopyKey(kind)];
}

export function getTransactionalEmailFallbackLink(locale: EmailLocale): string {
  return EMAIL_MESSAGES[locale].fallbackLink;
}

export function formatTransactionalEmailMessage(
  message: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return message.replace(/\\{([A-Za-z][A-Za-z0-9_]*)\\}/g, (placeholder, key: string) =>
    key in values ? String(values[key]) : placeholder,
  );
}

export function transactionalEmailSubject(
  kind: TransactionalEmailKind,
  locale: EmailLocale,
  appName: string,
): string {
  return formatTransactionalEmailMessage(getTransactionalEmailCopy(locale, kind).subject, {
    appName,
  });
}
`;
}
