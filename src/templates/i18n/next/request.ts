import { file, type TemplateFile } from "../../shared.js";

export function nextRequestFile(filePath: string, messagesBase: string): TemplateFile {
  return file(
    filePath,
    `import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing, type Locale, localeDirection } from "./routing.js";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = hasLocale(routing.locales, requested)
    ? (requested as Locale)
    : routing.defaultLocale;

  const messages = (await import(\`${messagesBase}/\${locale}.json\`)).default as Record<string, unknown>;

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
