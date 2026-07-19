import { file, type TemplateFile } from "../../shared.js";

export function nextRoutingFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "fr", "ar"] as const,
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  fr: "ltr",
  ar: "rtl",
};
`,
  );
}
