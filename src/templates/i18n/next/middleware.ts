import { file, type TemplateFile } from "../../shared.js";

/** @deprecated Locale selection is request-scoped and does not require middleware. */
export function nextMiddlewareFile(filePath: string, _routingImport: string): TemplateFile {
  return file(
    filePath,
    `/**
 * Locale selection is handled by i18n/request.ts from NEXT_LOCALE and Accept-Language.
 * This compatibility module is intentionally not a Next.js middleware entry point.
 */
export const localeMiddlewareRequired = false as const;
`,
  );
}
