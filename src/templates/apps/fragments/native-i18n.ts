export interface NativeI18nTemplate {
  readonly importLine: string;
  readonly hookLine: string;
  value(key: string, english: string): string;
  child(key: string, english: string): string;
}

/**
 * Keeps capability-off native output dependency-free while making every
 * capability-on call site a literal, catalog-checked translation key.
 */
export function nativeI18nTemplate(
  enabled: boolean,
  namespace: string,
  importPath = "@/lib/i18n",
): NativeI18nTemplate {
  const value = (key: string, english: string): string =>
    enabled ? `t(${JSON.stringify(key)})` : JSON.stringify(english);
  return {
    importLine: enabled ? `import { useTranslations } from ${JSON.stringify(importPath)};` : "",
    hookLine: enabled ? `  const t = useTranslations(${JSON.stringify(namespace)});` : "",
    value,
    child: (key, english) => `{${value(key, english)}}`,
  };
}

/** Web apps always emit the surface adapter. With i18n disabled it resolves
 * the English catalog locally and does not import a framework i18n runtime. */
export function webSurfaceI18nTemplate(namespace: string): NativeI18nTemplate {
  const value = (key: string, _english: string): string => `t(${JSON.stringify(key)})`;
  return {
    importLine: 'import { useSurfaceTranslations } from "@/lib/translations";',
    hookLine: `  const t = useSurfaceTranslations(${JSON.stringify(namespace)});`,
    value,
    child: (key, english) => `{${value(key, english)}}`,
  };
}

export function nativeI18nImportPath(
  target: "mobile" | "desktop",
  mode: "monorepo" | "single",
): string {
  if (target === "mobile" || mode === "monorepo") return "@/lib/i18n";
  return "@/renderer/lib/i18n";
}
