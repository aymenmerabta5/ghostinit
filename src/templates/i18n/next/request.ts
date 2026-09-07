import { file, type TemplateFile } from "../../shared.js";

export function nextRequestFile(filePath: string, messagesBase: string): TemplateFile {
  return file(
    filePath,
    `import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  defaultLocale,
  isValidLocale,
  localeCookieName,
  localeDirection,
  type Locale,
} from "./routing.js";

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

export async function resolveRequestLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(localeCookieName)?.value;
  if (isValidLocale(cookieLocale)) return cookieLocale;

  const acceptedLocale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  return acceptedLocale ?? defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveRequestLocale();
  const messages = (await import(\`${messagesBase}/\${locale}.json\`)).default;

  return {
    locale,
    messages,
    timeZone: "Africa/Algiers",
    formats: {
      dateTime: {
        short: { day: "numeric", month: "short", year: "numeric" },
        long: { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "numeric" },
      },
      number: { precise: { maximumFractionDigits: 5 } },
    },
  };
});

export { localeDirection };
`,
  );
}
