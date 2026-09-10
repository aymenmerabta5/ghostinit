import { file, type TemplateFile } from "../../shared.js";
import { surfaceTranslationFiles } from "../../i18n/surface.js";

/** Framework-free surface translation bridge for Expo and Electron. */
export function platformSurfaceTranslationFiles(
  sourceRoot: string,
  enabled: boolean,
): TemplateFile[] {
  return surfaceTranslationFiles({ sourceRoot, framework: "tanstack", enabled })
    .filter(
      (entry) =>
        entry.path.endsWith("translations.ts") || entry.path.endsWith("translations.en.json"),
    )
    .map((entry) => {
      if (!entry.path.endsWith("translations.ts") || !enabled) return entry;
      let content = entry.content
        .replace("useLocale as useFrameworkLocale", "usePlatformI18n")
        .replace("return useFrameworkLocale();", "return usePlatformI18n().locale;");
      if (sourceRoot === "src/renderer")
        content = content.replaceAll('"@/lib/i18n"', '"@/renderer/lib/i18n"');
      return file(entry.path, content);
    });
}
