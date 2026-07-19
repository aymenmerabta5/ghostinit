import { file, type TemplateFile } from "../../shared.js";

export function nextLegacyI18nBarrel(filePath: string): TemplateFile {
  const requestImport = "./i18n/request.js";
  const routingImport = "./i18n/routing.js";
  const navigationImport = "./i18n/navigation.js";
  const configImport = "./i18n/config.js";
  return file(
    filePath,
    `export { default } from "${requestImport}";
export { routing, type Locale, localeDirection } from "${routingImport}";
export { Link, redirect, usePathname, useRouter, getPathname } from "${navigationImport}";
export { locales, defaultLocale, localeNames, localeLabels } from "${configImport}";
`,
  );
}
