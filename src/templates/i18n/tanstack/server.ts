import { file, type TemplateFile } from "../../shared.js";

export function tanstackI18nServerContent(configImport = "../i18n/config.js"): string {
  return `import {
  defaultLocale,
  isValidLocale,
  localeCookieName,
  type Locale,
} from "${configImport}";

interface LocalePreference {
  locale: Locale;
  order: number;
  quality: number;
}

function preferenceQuality(parameters: readonly string[]): number {
  const qualityParameter = parameters.find((parameter) =>
    parameter.trim().toLowerCase().startsWith("q="),
  );
  if (!qualityParameter) return 1;
  const quality = Number(qualityParameter.trim().slice(2));
  return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0;
}

export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const preferences: LocalePreference[] = [];

  header.split(",").forEach((entry, order) => {
    const [languageTag, ...parameters] = entry.trim().split(";");
    const language = languageTag?.split("-")[0]?.toLowerCase();
    if (!isValidLocale(language)) return;
    const quality = preferenceQuality(parameters);
    if (quality === 0) return;
    preferences.push({
      locale: language,
      order,
      quality,
    });
  });

  preferences.sort((left, right) => right.quality - left.quality || left.order - right.order);
  return preferences[0]?.locale ?? null;
}

export function localeFromCookieHeader(cookieHeader: string | null): Locale | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== localeCookieName) continue;
    try {
      const value = decodeURIComponent(entry.slice(separator + 1).trim());
      return isValidLocale(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function getLocaleFromHeaders(headers: Headers): Locale {
  return (
    localeFromCookieHeader(headers.get("cookie")) ??
    localeFromAcceptLanguage(headers.get("accept-language")) ??
    defaultLocale
  );
}

export function getLocaleFromRequest(request: Request): Locale {
  return getLocaleFromHeaders(request.headers);
}
`;
}

export function tanstackServerFile(
  filePath: string,
  configImport = "../i18n/config.js",
): TemplateFile {
  return file(filePath, tanstackI18nServerContent(configImport));
}
