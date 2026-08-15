/**
 * TanStack i18n server helpers — locale detection from request headers
 * Mirrors Next.js next-intl middleware but for TanStack Start Nitro
 */

export function tanstackI18nServerContent(): string {
  return `import { routing } from "@/i18n/routing";

const LOCALES = routing.locales as readonly string[];

export function getLocaleFromHeaders(headers: Headers): string {
  const cookieLocale = headers.get("cookie")?.match(/(?:^|; )NEXT_LOCALE=([^;]+)/)?.[1];
  if (cookieLocale && (LOCALES as readonly string[]).includes(cookieLocale)) return cookieLocale;
  const accept = headers.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const lang = part.split(";")[0]?.trim().split("-")[0]?.toLowerCase();
    if (lang && (LOCALES as readonly string[]).includes(lang)) return lang;
  }
  return routing.defaultLocale;
}

export function getLocaleFromRequest(request: Request): string {
  return getLocaleFromHeaders(request.headers);
}
`;
}
