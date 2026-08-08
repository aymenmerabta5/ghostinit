import type { TemplateFile } from "../../shared.js";
import { pdfFilesWithApps } from "../../pdf/index.js";

export function pdfComposerFiles(
  mode: "monorepo" | "single" = "monorepo",
  hasMobile = false,
  hasDesktop = false,
  framework: string = "nextjs",
  hasWeb = true,
): TemplateFile[] {
  return pdfFilesWithApps(mode, hasMobile, hasDesktop, framework, hasWeb);
}
