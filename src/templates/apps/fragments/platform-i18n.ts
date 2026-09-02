import { file, type TemplateFile } from "../../shared.js";
import { makeMessagesFile } from "../../i18n/shared.js";
import { AR_MESSAGES, EN_MESSAGES, FR_MESSAGES } from "../../i18n/messages/index.js";

export type PlatformI18nTarget = "expo" | "desktop";
export type PlatformI18nMode = "monorepo" | "single";

function sharedRuntime(imports: string, platformRuntime: string, switcher: string): string {
  return `import * as React from "react";
${imports}
import arMessages from "../i18n/messages/ar.json";
import enMessages from "../i18n/messages/en.json";
import frMessages from "../i18n/messages/fr.json";

export const locales = ["en", "fr", "ar"] as const;
export type Locale = (typeof locales)[number];
export type LocaleDirection = "ltr" | "rtl";
type Messages = typeof enMessages;
type TranslationPath<Value> = {
  [Key in keyof Value & string]: Value[Key] extends string
    ? Key
    : Value[Key] extends Record<string, unknown>
      ? \`\${Key}.\${TranslationPath<Value[Key]>}\`
      : never;
}[keyof Value & string];
export type TranslationKey = TranslationPath<Messages>;
export type TranslationNamespace = keyof Messages & string;
export type NamespaceTranslationKey<Namespace extends TranslationNamespace> =
  TranslationPath<Messages[Namespace]>;
export type NamespaceTranslate<Namespace extends TranslationNamespace> = (
  key: NamespaceTranslationKey<Namespace>,
  values?: TranslationValues,
) => string;
export type TranslationValues = Readonly<Record<string, string | number>>;

const messagesByLocale: Readonly<Record<Locale, Messages>> = {
  en: enMessages,
  fr: frMessages,
  ar: arMessages,
};
export const localeDirection: Readonly<Record<Locale, LocaleDirection>> = {
  en: "ltr",
  fr: "ltr",
  ar: "rtl",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}

function messageAt(messages: Messages, key: string): string | undefined {
  let value: unknown = messages;
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = Reflect.get(value, segment);
  }
  return typeof value === "string" ? value : undefined;
}

function interpolate(message: string, values?: TranslationValues): string {
  if (!values) return message;
  return message.replace(/\\{([a-zA-Z0-9_]+)\\}/g, (token, key: string) =>
    key in values ? String(values[key]) : token
  );
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: TranslationValues,
): string {
  const localized = messageAt(messagesByLocale[locale], key);
  const fallback = messageAt(enMessages, key);
  return interpolate(localized ?? fallback ?? key, values);
}

export interface PlatformI18nContext {
  locale: Locale;
  direction: LocaleDirection;
  setLocale(locale: Locale): Promise<void>;
  t(key: TranslationKey, values?: TranslationValues): string;
}

const I18nContext = React.createContext<PlatformI18nContext | null>(null);

${platformRuntime}

export function usePlatformI18n(): PlatformI18nContext {
  const context = React.useContext(I18nContext);
  if (!context) throw new Error("usePlatformI18n must be used within PlatformI18nProvider");
  return context;
}

export function useTranslations<Namespace extends TranslationNamespace>(
  namespace: Namespace,
): NamespaceTranslate<Namespace> {
  const { t } = usePlatformI18n();
  return React.useCallback(
    (key: NamespaceTranslationKey<Namespace>, values?: TranslationValues) =>
      t((namespace + "." + key) as TranslationKey, values),
    [namespace, t],
  );
}

${switcher}
`;
}

export function expoI18nContent(): string {
  const imports = `import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { I18nManager, View } from "react-native";
import { Button } from "@/components/ui/button";`;
  const runtime = `const STORAGE_KEY = "ghostinit:locale";

function deviceLocale(): Locale {
  const language = Localization.getLocales()[0]?.languageCode;
  return isLocale(language) ? language : "en";
}

function applyNativeDirection(locale: Locale): void {
  const rtl = localeDirection[locale] === "rtl";
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
}

export function PlatformI18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = React.useState<Locale>(deviceLocale);
  const userSelected = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!active || userSelected.current || !isLocale(stored)) return;
      applyNativeDirection(stored);
      setLocaleState(stored);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setLocale = React.useCallback(async (nextLocale: Locale): Promise<void> => {
    userSelected.current = true;
    applyNativeDirection(nextLocale);
    setLocaleState(nextLocale);
    await AsyncStorage.setItem(STORAGE_KEY, nextLocale).catch(() => undefined);
  }, []);

  const t = React.useCallback(
    (key: TranslationKey, values?: TranslationValues) => translate(locale, key, values),
    [locale],
  );
  const direction = localeDirection[locale];
  const value = React.useMemo<PlatformI18nContext>(
    () => ({ locale, direction, setLocale, t }),
    [direction, locale, setLocale, t],
  );
  return (
    <I18nContext.Provider value={value}>
      <View style={{ flex: 1, direction }}>{children}</View>
    </I18nContext.Provider>
  );
}`;
  const switcher = `export function LocaleSwitcher(): React.JSX.Element {
  const { locale, setLocale } = usePlatformI18n();
  const t = useTranslations("localeSwitcher");
  return (
    <View accessibilityRole="radiogroup" className="flex-row items-center gap-1">
      {locales.map((candidate) => (
        <Button
          key={candidate}
          accessibilityRole="radio"
          accessibilityLabel={t(candidate)}
          accessibilityState={{ selected: locale === candidate }}
          size="sm"
          variant={locale === candidate ? "default" : "outline"}
          onPress={() => void setLocale(candidate)}
        >
          {candidate.toUpperCase()}
        </Button>
      ))}
    </View>
  );
}`;
  return sharedRuntime(imports, runtime, switcher);
}

export function desktopI18nContent(): string {
  const imports = 'import { Button } from "@/components/ui/button";';
  const runtime = `function localeFromSystem(value: string): Locale {
  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return isLocale(language) ? language : "en";
}

function syncDocument(locale: Locale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = localeDirection[locale];
}

export function PlatformI18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = React.useState<Locale>("en");
  const userSelected = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    void Promise.all([
      window.desktopBridge.getClientSettings(),
      window.desktopBridge.getSystemLocale(),
    ]).then(([settings, systemLocale]) => {
      if (!active || userSelected.current) return;
      const resolved = isLocale(settings?.locale) ? settings.locale : localeFromSystem(systemLocale);
      syncDocument(resolved);
      setLocaleState(resolved);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setLocale = React.useCallback(async (nextLocale: Locale): Promise<void> => {
    userSelected.current = true;
    syncDocument(nextLocale);
    setLocaleState(nextLocale);
    try {
      const settings = await window.desktopBridge.getClientSettings();
      await window.desktopBridge.setClientSettings({ ...settings, locale: nextLocale });
    } catch {
      // The in-memory locale remains active even if persistence is unavailable.
    }
  }, []);

  const t = React.useCallback(
    (key: TranslationKey, values?: TranslationValues) => translate(locale, key, values),
    [locale],
  );
  const direction = localeDirection[locale];
  const value = React.useMemo<PlatformI18nContext>(
    () => ({ locale, direction, setLocale, t }),
    [direction, locale, setLocale, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}`;
  const switcher = `export function LocaleSwitcher(): React.JSX.Element {
  const { locale, setLocale } = usePlatformI18n();
  const t = useTranslations("localeSwitcher");
  return (
    <div role="radiogroup" aria-label={t("label")} className="flex items-center gap-1">
      {locales.map((candidate) => (
        <Button
          key={candidate}
          type="button"
          role="radio"
          aria-checked={locale === candidate}
          aria-label={t(candidate)}
          size="sm"
          variant={locale === candidate ? "default" : "outline"}
          onClick={() => void setLocale(candidate)}
        >
          {candidate.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}`;
  return sharedRuntime(imports, runtime, switcher);
}

export function platformI18nFiles(
  target: PlatformI18nTarget,
  mode: PlatformI18nMode,
): TemplateFile[] {
  const root =
    target === "expo"
      ? mode === "monorepo"
        ? "apps/mobile/src"
        : "src"
      : mode === "monorepo"
        ? "apps/desktop/src/renderer"
        : "src/renderer";
  return [
    makeMessagesFile(`${root}/i18n/messages/en.json`, EN_MESSAGES),
    makeMessagesFile(`${root}/i18n/messages/fr.json`, FR_MESSAGES),
    makeMessagesFile(`${root}/i18n/messages/ar.json`, AR_MESSAGES),
    file(`${root}/lib/i18n.tsx`, target === "expo" ? expoI18nContent() : desktopI18nContent()),
  ];
}
