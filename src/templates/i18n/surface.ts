import { file, type TemplateFile } from "../shared.js";
import { AR_MESSAGES } from "./messages/ar.js";
import { EN_MESSAGES } from "./messages/en.js";
import { FR_MESSAGES } from "./messages/fr.js";

export type SurfaceFramework = "next" | "tanstack";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") paths.push(path);
    else paths.push(...leafPaths(child, path));
  }
  return paths;
}

function sharedCatalogTypes(): string {
  const entries = Object.entries(EN_MESSAGES).map(([namespace, messages]) => {
    const keys = leafPaths(messages).sort();
    const union = keys.length > 0 ? keys.map((key) => JSON.stringify(key)).join(" | ") : "never";
    return `  ${JSON.stringify(namespace)}: ${union};`;
  });
  return `export interface SurfaceMessageKeys {
${entries.join("\n")}
}

export type SurfaceNamespace = keyof SurfaceMessageKeys & string;
export type SurfaceMessageKey<Namespace extends SurfaceNamespace> =
  SurfaceMessageKeys[Namespace];
export type SurfaceTranslationValues = Readonly<Record<string, string | number>>;
export type SurfaceTranslate<Namespace extends SurfaceNamespace> = (
  key: SurfaceMessageKey<Namespace>,
  values?: SurfaceTranslationValues,
) => string;
`;
}

function fallbackHelpers(): string {
  return `function isMessageObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readEnglishMessage(namespace: SurfaceNamespace, key: string): string {
  let value: unknown = ENGLISH_MESSAGES[namespace];
  for (const segment of key.split(".")) {
    if (!isMessageObject(value)) return namespace + "." + key;
    value = value[segment];
  }
  return typeof value === "string" ? value : namespace + "." + key;
}

function interpolate(message: string, values?: SurfaceTranslationValues): string {
  if (!values) return message;
  return message.replace(/\\{(\\w+)\\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}`;
}

function frameworkInvoker(): string {
  return `function invokeFrameworkTranslation(
  translate: unknown,
  key: string,
  values?: SurfaceTranslationValues,
): string {
  if (typeof translate !== "function") return key;
  const args: readonly unknown[] = values ? [key, values] : [key];
  const result: unknown = Reflect.apply(translate, undefined, args);
  return typeof result === "string" ? result : String(result);
}`;
}

function clientContent(framework: SurfaceFramework, enabled: boolean): string {
  const frameworkImport = !enabled
    ? 'import ENGLISH_MESSAGES from "./translations.en.json";'
    : framework === "next"
      ? 'import { useLocale as useFrameworkLocale, useTranslations as useFrameworkTranslations } from "next-intl";'
      : 'import { useLocale as useFrameworkLocale, useTranslations as useFrameworkTranslations } from "@/lib/i18n";';
  const hook = enabled
    ? `export function useSurfaceTranslations<Namespace extends SurfaceNamespace>(
  namespace: Namespace,
): SurfaceTranslate<Namespace> {
  const translate = useFrameworkTranslations(namespace);
  return (key, values) => invokeFrameworkTranslation(translate, key, values);
}

export function useSurfaceLocale(): string {
  return useFrameworkLocale();
}`
    : `export function useSurfaceTranslations<Namespace extends SurfaceNamespace>(
  namespace: Namespace,
): SurfaceTranslate<Namespace> {
  return (key, values) => interpolate(readEnglishMessage(namespace, key), values);
}

export function useSurfaceLocale(): string {
  return "en";
}`;

  return `${frameworkImport}

${sharedCatalogTypes()}${enabled ? frameworkInvoker() : fallbackHelpers()}

${hook}
`;
}

function serverContent(framework: SurfaceFramework, enabled: boolean): string {
  const frameworkImport =
    enabled && framework === "next"
      ? `import { connection } from "next/server";
import { getTranslations as getFrameworkTranslations } from "next-intl/server";`
      : 'import ENGLISH_MESSAGES from "./translations.en.json";';
  const implementation =
    enabled && framework === "next"
      ? `export async function getSurfaceTranslations<Namespace extends SurfaceNamespace>(
  namespace: Namespace,
): Promise<SurfaceTranslate<Namespace>> {
  // Locale selection reads cookies/headers. Make the request-time boundary
  // explicit so Cache Components never shares translated user context.
  await connection();
  const translate = await getFrameworkTranslations(namespace);
  return (key, values) => invokeFrameworkTranslation(translate, key, values);
}`
      : `export function getSurfaceTranslations<Namespace extends SurfaceNamespace>(
  namespace: Namespace,
): Promise<SurfaceTranslate<Namespace>> {
  return Promise.resolve((key, values) =>
    interpolate(readEnglishMessage(namespace, key), values),
  );
}`;

  return `${frameworkImport}

${sharedCatalogTypes()}${enabled && framework === "next" ? frameworkInvoker() : fallbackHelpers()}

${implementation}
`;
}

function standaloneContent(enabled: boolean): string {
  const imports = enabled
    ? `import * as React from "react";
import AR_MESSAGES from "./translations.ar.json";
import EN_MESSAGES from "./translations.en.json";
import FR_MESSAGES from "./translations.fr.json";`
    : `import * as React from "react";
import EN_MESSAGES from "./translations.en.json";`;
  const catalog = enabled
    ? `type StandaloneLocale = "en" | "fr" | "ar";
const STANDALONE_MESSAGES = {
  ar: AR_MESSAGES,
  en: EN_MESSAGES,
  fr: FR_MESSAGES,
} as const;

function readCookieLocale(): StandaloneLocale {
  if (typeof document === "undefined") return "en";
  for (const entry of document.cookie.split(";")) {
    const [name, ...value] = entry.trim().split("=");
    if (name !== "NEXT_LOCALE") continue;
    const locale = decodeURIComponent(value.join("="));
    if (locale === "en" || locale === "fr" || locale === "ar") return locale;
  }
  return "en";
}`
    : `type StandaloneLocale = "en";
const STANDALONE_MESSAGES = { en: EN_MESSAGES } as const;`;
  const localeHook = enabled
    ? `export function useStandaloneSurfaceLocale(): StandaloneLocale {
  const [locale, setLocale] = React.useState<StandaloneLocale>("en");
  React.useEffect(() => setLocale(readCookieLocale()), []);
  return locale;
}`
    : `export function useStandaloneSurfaceLocale(): StandaloneLocale {
  return "en";
}`;

  return `"use client";

${imports}

${sharedCatalogTypes()}

${catalog}

function isStandaloneMessageObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStandaloneMessage(
  locale: StandaloneLocale,
  namespace: SurfaceNamespace,
  key: string,
): string {
  let value: unknown = STANDALONE_MESSAGES[locale];
  if (!isStandaloneMessageObject(value)) return namespace + "." + key;
  value = value[namespace];
  for (const segment of key.split(".")) {
    if (!isStandaloneMessageObject(value)) return namespace + "." + key;
    value = value[segment];
  }
  return typeof value === "string" ? value : namespace + "." + key;
}

function interpolateStandalone(
  message: string,
  values?: SurfaceTranslationValues,
): string {
  if (!values) return message;
  return message.replace(/\\{(\\w+)\\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}

${localeHook}

export function standaloneSurfaceDirection(locale: string): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function useStandaloneSurfaceTranslations<Namespace extends SurfaceNamespace>(
  namespace: Namespace,
): SurfaceTranslate<Namespace> {
  const locale = useStandaloneSurfaceLocale();
  return (key, values) =>
    interpolateStandalone(readStandaloneMessage(locale, namespace, key), values);
}

export function StandaloneLocaleLoadingFallback(): React.JSX.Element {
  const t = useStandaloneSurfaceTranslations("common");
  return React.createElement("div", {
    "aria-busy": true,
    "aria-label": t("loadingLocale"),
    className: "min-h-screen bg-background",
  });
}
`;
}

export function surfaceTranslationFiles(options: {
  enabled: boolean;
  framework: SurfaceFramework;
  sourceRoot: string;
}): TemplateFile[] {
  return [
    file(
      `${options.sourceRoot}/lib/translations.en.json`,
      JSON.stringify(EN_MESSAGES, null, 2) + "\n",
    ),
    ...(options.enabled
      ? [
          file(
            `${options.sourceRoot}/lib/translations.fr.json`,
            JSON.stringify(FR_MESSAGES, null, 2) + "\n",
          ),
          file(
            `${options.sourceRoot}/lib/translations.ar.json`,
            JSON.stringify(AR_MESSAGES, null, 2) + "\n",
          ),
        ]
      : []),
    file(
      `${options.sourceRoot}/lib/translations.ts`,
      clientContent(options.framework, options.enabled),
    ),
    file(
      `${options.sourceRoot}/lib/translations.server.ts`,
      serverContent(options.framework, options.enabled),
    ),
    file(
      `${options.sourceRoot}/lib/translations.standalone.ts`,
      standaloneContent(options.enabled),
    ),
  ];
}
