import { file, type TemplateFile } from "../../shared.js";

export function nextLegacyI18nBarrel(filePath: string): TemplateFile {
  const requestImport = "./i18n/request.js";
  const routingImport = "./i18n/routing.js";
  const navigationImport = "./i18n/navigation.js";
  const configImport = "./i18n/config.js";
  return file(
    filePath,
    `export { default } from "${requestImport}";
export {
  defaultLocale,
  isValidLocale,
  localeCookieMaxAge,
  localeCookieName,
  localeDirection,
  locales,
  routing,
  type Locale,
} from "${routingImport}";
export { Link, redirect, usePathname, useRouter } from "${navigationImport}";
export {
  isRtl,
  localeDisplay,
  localeLabels,
  localeNames,
  nextIntlVersion,
  timeZone,
} from "${configImport}";
`,
  );
}
