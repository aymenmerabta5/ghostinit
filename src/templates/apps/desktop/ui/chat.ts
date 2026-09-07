import { chatPrimitivesContent } from "../../fragments/chat-primitives.js";
import { chatPrimitiveModuleContents } from "../../fragments/chat-primitives.js";
import { file, type TemplateFile } from "../../../shared.js";
import type { DesktopMode } from "../model.js";
import { nativeI18nImportPath } from "../../fragments/native-i18n.js";

export function desktopUiChatContent(mode: DesktopMode = "monorepo"): string {
  const utilitiesSpecifier = mode === "monorepo" ? "@repo/ui/lib/utils" : "@/platform/ui/lib/utils";
  return chatPrimitivesContent(utilitiesSpecifier);
}

function localizeScroller(content: string, mode: DesktopMode): string {
  const importPath = nativeI18nImportPath("desktop", mode);
  return content
    .replace(
      'import * as React from "react";',
      `import * as React from "react";\nimport { useTranslations } from ${JSON.stringify(importPath)};`,
    )
    .replace(
      "export function MessageScrollerButton(): React.JSX.Element {\n  const viewportRef",
      'export function MessageScrollerButton(): React.JSX.Element {\n  const t = useTranslations("messaging");\n  const viewportRef',
    )
    .replace('aria-label="Jump to latest message"', 'aria-label={t("jumpToLatest")}');
}

export function desktopUiChatFiles(
  mode: DesktopMode = "monorepo",
  hasI18n = false,
): TemplateFile[] {
  const utilitiesSpecifier = mode === "monorepo" ? "@repo/ui/lib/utils" : "@/platform/ui/lib/utils";
  const root =
    mode === "monorepo" ? "apps/desktop/src/renderer/components/ui" : "src/components/ui";
  return chatPrimitiveModuleContents(utilitiesSpecifier).map(({ content, path }) =>
    file(
      `${root}/${path}`,
      hasI18n && path === "chat/scroller.tsx" ? localizeScroller(content, mode) : content,
    ),
  );
}
