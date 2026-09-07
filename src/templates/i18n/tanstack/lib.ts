import { file, type TemplateFile } from "../../shared.js";

export function tanstackLibFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `import * as React from "react";
import arMessages from "../i18n/messages/ar.json";
import enMessages from "../i18n/messages/en.json";
import frMessages from "../i18n/messages/fr.json";
import {
  defaultLocale,
  isValidLocale,
  localeCookieMaxAge,
  localeCookieName,
  localeDirection,
  localeStorageKey,
  type Locale,
} from "../i18n/config.js";

export {
  defaultLocale,
  i18nVersion,
  isRtl,
  isValidLocale,
  localeCookieMaxAge,
  localeCookieName,
  localeDirection,
  localeDisplay,
  localeLabels,
  localeNames,
  locales,
  localeStorageKey,
  timeZone,
} from "../i18n/config.js";
export type { Locale } from "../i18n/config.js";

type Messages = typeof enMessages;
type TranslationPath<T> = {
  [Key in keyof T & string]: T[Key] extends string
    ? Key
    : T[Key] extends Record<string, unknown>
      ? \`\${Key}.\${TranslationPath<T[Key]>}\`
      : never;
}[keyof T & string];

export type MessageCatalog = Messages;
export type TranslationKey = TranslationPath<Messages>;
export type TranslationNamespace = keyof Messages & string;
export type NamespacedTranslationKey<Namespace extends TranslationNamespace> = TranslationPath<
  Messages[Namespace]
>;
export type TranslationValues = Readonly<Record<string, string | number>>;
export type TranslationFunction<Key extends string = TranslationKey> = (
  key: Key,
  values?: TranslationValues,
) => string;

const messagesByLocale: Readonly<Record<Locale, Messages>> = {
  en: enMessages,
  fr: frMessages,
  ar: arMessages,
};

export interface LocaleMetadata {
  readonly title: string;
  readonly description: string;
}

export const localeMetadata: Readonly<Record<Locale, LocaleMetadata>> = {
  en: {
    title: enMessages.metadata.siteTitle,
    description: enMessages.metadata.siteDescription,
  },
  fr: {
    title: frMessages.metadata.siteTitle,
    description: frMessages.metadata.siteDescription,
  },
  ar: {
    title: arMessages.metadata.siteTitle,
    description: arMessages.metadata.siteDescription,
  },
};

function isMessageObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readMessage(catalog: Messages, key: string): string | undefined {
  let value: unknown = catalog;
  for (const segment of key.split(".")) {
    if (!isMessageObject(value)) return undefined;
    value = value[segment];
  }
  return typeof value === "string" ? value : undefined;
}

function interpolate(message: string, values?: TranslationValues): string {
  if (!values) return message;
  return message.replace(/\\{(\\w+)\\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}

function resolveTranslation(
  locale: Locale,
  key: string,
  values?: TranslationValues,
): string {
  const localized = readMessage(messagesByLocale[locale], key);
  const fallback = locale === defaultLocale ? undefined : readMessage(enMessages, key);
  return interpolate(localized ?? fallback ?? key, values);
}

export function getMessages(locale: Locale): Messages {
  return messagesByLocale[locale];
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: TranslationValues,
): string {
  return resolveTranslation(locale, key, values);
}

export function t(
  key: TranslationKey,
  values?: TranslationValues,
  locale: Locale = defaultLocale,
): string {
  return resolveTranslation(locale, key, values);
}

function readCookieValue(cookieHeader: string, name: string): string | null {
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function getLocaleFromCookieString(cookieHeader?: string): Locale | null {
  if (!cookieHeader) return null;
  const value = readCookieValue(cookieHeader, localeCookieName);
  return isValidLocale(value) ? value : null;
}

function browserLocale(): Locale | null {
  if (typeof navigator === "undefined") return null;
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const candidate = language.split("-")[0]?.toLowerCase();
    if (isValidLocale(candidate)) return candidate;
  }
  return null;
}

export function getStoredLocale(): Locale | null {
  if (typeof document === "undefined") return null;

  const cookieLocale = getLocaleFromCookieString(document.cookie);
  if (cookieLocale) return cookieLocale;

  if (typeof window === "undefined") return null;
  try {
    const storedLocale = window.localStorage.getItem(localeStorageKey);
    return isValidLocale(storedLocale) ? storedLocale : null;
  } catch {
    return null;
  }
}

function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    localeCookieName +
    "=" +
    encodeURIComponent(locale) +
    "; Path=/; Max-Age=" +
    localeCookieMaxAge +
    "; SameSite=Lax" +
    secure;
}

export function setLocaleStorage(locale: Locale): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(localeStorageKey, locale);
    } catch {
      // Cookies remain the durable fallback when storage is unavailable.
    }
  }
  writeLocaleCookie(locale);
}

export function getLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  return getStoredLocale() ?? browserLocale() ?? defaultLocale;
}

function syncDocumentLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = localeDirection[locale];
}

export interface I18nContextValue {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
  t: TranslationFunction;
}

export interface I18nProviderProps {
  children: React.ReactNode;
  initialLocale?: Locale;
}

export const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLocale = defaultLocale,
}: I18nProviderProps): React.JSX.Element {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);

  React.useEffect(() => {
    setLocaleState(initialLocale);
    syncDocumentLocale(initialLocale);
  }, [initialLocale]);

  React.useEffect(() => {
    function handleStorage(event: StorageEvent): void {
      if (event.key === localeStorageKey && isValidLocale(event.newValue)) {
        syncDocumentLocale(event.newValue);
        setLocaleState(event.newValue);
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setLocale = React.useCallback((nextLocale: Locale) => {
    setLocaleStorage(nextLocale);
    syncDocumentLocale(nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const translateCurrent: TranslationFunction = React.useCallback(
    (key, values) => resolveTranslation(locale, key, values),
    [locale],
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      messages: getMessages(locale),
      setLocale,
      t: translateCurrent,
    }),
    [locale, setLocale, translateCurrent],
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

export function useTranslations(): TranslationFunction;
export function useTranslations<Namespace extends TranslationNamespace>(
  namespace: Namespace,
): TranslationFunction<NamespacedTranslationKey<Namespace>>;
export function useTranslations(
  namespace?: TranslationNamespace,
): (key: string, values?: TranslationValues) => string {
  const { locale } = useI18n();
  return React.useCallback(
    (key: string, values?: TranslationValues) =>
      resolveTranslation(locale, namespace ? namespace + "." + key : key, values),
    [locale, namespace],
  );
}
`,
  );
}
