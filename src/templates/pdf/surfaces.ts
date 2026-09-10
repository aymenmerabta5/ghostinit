import {
  pdfFeatureScreenContent,
  pdfWebRouteContent,
  pdfMobileRouteContent,
  pdfDesktopRouteContent,
} from "./surface-features.js";

type PdfMode = "monorepo" | "single";
type PdfFramework = "nextjs" | "tanstack-start";

export function pdfWebWorkspaceContent(_mode: PdfMode): string {
  return pdfFeatureScreenContent();
}
export function pdfWebPageContent(_mode: PdfMode, framework: PdfFramework): string {
  return pdfWebRouteContent(framework);
}
export function pdfExpoPageContent(
  _hookImport = "@/hooks/usePdf",
  _hasI18n = false,
  _i18nImport = "@/lib/i18n",
): string {
  return pdfMobileRouteContent();
}
export function pdfDesktopPageContent(_hasI18n = false, _i18nImport = "@/lib/i18n"): string {
  return pdfDesktopRouteContent();
}
