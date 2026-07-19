import { file, type TemplateFile } from "../../shared.js";

export function tanstackLibFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `import * as React from "react";
import enMessages from "../i18n/messages/en.json";
import frMessages from "../i18n/messages/fr.json";
import arMessages from "../i18n/messages/ar.json";

export const locales = ["en", "fr", "ar"] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = "en";
export const localeDirection: Record<Locale, "ltr" | "rtl"> = { en: "ltr", fr: "ltr", ar: "rtl" };
export const localeNames: Record<Locale, string> = { en: "English", fr: "Français", ar: "العربية" };
export const localeLabels: Record<Locale, string> = { en: "EN", fr: "FR", ar: "AR" };
type MessagesRecord = Record<string, unknown>;
const messagesMap: Record<Locale, MessagesRecord> = { en: enMessages as MessagesRecord, fr: frMessages as MessagesRecord, ar: arMessages as MessagesRecord };
function getNested(obj: MessagesRecord, path: string): unknown { const parts = path.split("."); let cur: unknown = obj; for (const p of parts) { if (cur == null || typeof cur !== "object") return undefined; cur = (cur as MessagesRecord)[p]; } return cur; }
function interpolate(template: string, vars?: Record<string, string | number>): string { if (!vars) return template; return template.replace(/\\{(\\w+)\\}/g, (_: string, k: string) => { const v = vars[k]; return v !== undefined ? String(v) : "{" + k + "}"; }); }
export function getMessages(locale: Locale): MessagesRecord { return messagesMap[locale] ?? messagesMap[defaultLocale]; }
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string { const msgs = messagesMap[locale] ?? messagesMap[defaultLocale]; const val = getNested(msgs, key); if (typeof val === "string") return interpolate(val, vars); if (locale !== defaultLocale) { const fb = getNested(messagesMap[defaultLocale], key); if (typeof fb === "string") return interpolate(fb, vars); } if (val == null) return key; return typeof val === "string" ? val : key; }
export function t(key: string, vars?: Record<string, string | number>, locale: Locale = defaultLocale): string { return translate(locale, key, vars); }
export const STORAGE_KEY = "ghostinit:locale"; export const COOKIE_KEY = "NEXT_LOCALE";
function canUseStorage(): boolean { if (typeof window === "undefined") return false; try { const k = "__i18n_test__"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return true; } catch { return false; } }
function readCookie(name: string): string | null { if (typeof document === "undefined") return null; const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)")); return match ? decodeURIComponent(match[2]) : null; }
function writeCookie(name: string, value: string, days = 365): void { if (typeof document === "undefined") return; const expires = new Date(Date.now() + days * 864e5).toUTCString(); const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : ""; document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax" + secure; }
export function getStoredLocale(): Locale | null { if (!canUseStorage()) { const c = readCookie(COOKIE_KEY); if (c && (locales as readonly string[]).includes(c)) return c as Locale; return null; } try { const raw = window.localStorage.getItem(STORAGE_KEY); if (raw && (locales as readonly string[]).includes(raw)) return raw as Locale; const cookieVal = readCookie(COOKIE_KEY); if (cookieVal && (locales as readonly string[]).includes(cookieVal)) return cookieVal as Locale; return null; } catch { return null; } }
export function setLocaleStorage(locale: Locale): void { if (canUseStorage()) { try { window.localStorage.setItem(STORAGE_KEY, locale); } catch {} } writeCookie(COOKIE_KEY, locale); }
export function getLocaleFromCookieString(cookieHeader?: string): Locale | null { if (!cookieHeader) return null; try { const cookies = cookieHeader.split(";").map((c) => c.trim()); for (const c of cookies) { const [k, v] = c.split("="); if (k === COOKIE_KEY || k === STORAGE_KEY) { const decoded = decodeURIComponent(v ?? ""); if ((locales as readonly string[]).includes(decoded)) return decoded as Locale; } } return null; } catch { return null; } }
export function getLocale(): Locale { if (typeof window === "undefined") return defaultLocale; const stored = getStoredLocale(); if (stored) return stored; try { const nav = window.navigator.language?.split("-")[0]; if (nav && (locales as readonly string[]).includes(nav)) return nav as Locale; } catch {} return defaultLocale; }
export function isValidLocale(value: unknown): value is Locale { return typeof value === "string" && (locales as readonly string[]).includes(value); }
export function isRtl(locale: string): boolean { return localeDirection[locale as Locale] === "rtl"; }
export interface I18nContextValue { locale: Locale; setLocale: (l: Locale) => void; t: (key: string, vars?: Record<string, string | number>) => string; messages: MessagesRecord; }
export const I18nContext = React.createContext<I18nContextValue | null>(null);
export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale; }): React.JSX.Element {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale ?? defaultLocale);
  React.useEffect(() => { const stored = getStoredLocale(); if (stored && stored !== locale) setLocaleState(stored); }, []);
  const setLocale = React.useCallback((l: Locale) => { setLocaleState(l); try { setLocaleStorage(l); } catch {} try { if (typeof document !== "undefined") { document.documentElement.lang = l; document.documentElement.dir = localeDirection[l]; } } catch {} }, []);
  const translateFn = React.useCallback((key: string, vars?: Record<string, string | number>) => { const msgs = messagesMap[locale] ?? messagesMap[defaultLocale]; const v = getNested(msgs, key); if (typeof v === "string") return interpolate(v, vars); const fb = getNested(messagesMap[defaultLocale], key); if (typeof fb === "string") return interpolate(fb, vars); return key; }, [locale]);
  const value = React.useMemo(() => ({ locale, setLocale, t: translateFn, messages: getMessages(locale), }), [locale, setLocale, translateFn]);
  return React.createElement(I18nContext.Provider, { value }, children);
}
export function useI18n(): I18nContextValue { const ctx = React.useContext(I18nContext); if (!ctx) throw new Error("useI18n must be used within I18nProvider"); return ctx; }
export function useLocale(): Locale { return useI18n().locale; }
export function useTranslations(namespace?: string) { const { t } = useI18n(); return React.useCallback((key: string, vars?: Record<string, string | number>) => { const fullKey = namespace ? namespace + "." + key : key; return t(fullKey, vars); }, [t, namespace]); }
`,
  );
}
