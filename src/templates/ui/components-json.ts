import { file, type TemplateFile } from "../shared.js";
import type { ResolvedDesignSystemApp, ResolvedUiLayout, UiAdapterId } from "./layout.js";

function cssPath(target: UiAdapterId): string {
  if (target === "next") return "src/app/globals.css";
  if (target === "tanstack") return "src/styles/app.css";
  if (target === "electron") return "src/renderer/index.css";
  return "global.css";
}

export function componentsJsonData(target: UiAdapterId): Record<string, unknown> {
  const native = target === "expo";
  return {
    $schema: "https://ui.shadcn.com/schema.json",
    style: native ? "radix-nova" : "base-nova",
    rsc: target === "next",
    tsx: true,
    rtl: true,
    tailwind: {
      config: "",
      css: cssPath(target),
      baseColor: "zinc",
      cssVariables: true,
      prefix: "",
    },
    iconLibrary: "lucide",
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
    registries: native ? { "@rnr": "https://reactnativereusables.com/r/{name}.json" } : {},
  };
}

export function componentsJsonContent(target: UiAdapterId): string {
  return `${JSON.stringify(componentsJsonData(target), null, 2)}\n`;
}

export function componentsJsonFiles(
  layout: ResolvedUiLayout,
  apps: readonly ResolvedDesignSystemApp[],
): TemplateFile[] {
  if (layout.mode === "single" && apps.length !== 1) {
    throw new Error("Single mode requires exactly one resolved design-system app");
  }
  return apps.map((app) =>
    file(
      layout.mode === "monorepo" ? `apps/${app.id}/components.json` : "components.json",
      componentsJsonContent(app.target),
    ),
  );
}
