import { uiUtilsContent } from "./utils.js";
import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { ResolvedUiLayout, UiAdapterId } from "./layout.js";
import { compatibilityThemeCssContent } from "./styles.js";

const webAdapters = new Set<UiAdapterId>(["next", "tanstack", "electron"]);

export function designSystemExports(adapters: readonly UiAdapterId[]): Record<string, string> {
  const exports: Record<string, string> = {
    ".": "./src/index.ts",
    "./component-registry.json": "./src/component-registry.json",
    "./contract": "./src/contract.ts",
    "./lib/utils": "./src/lib/utils.ts",
    "./styles/base.contract.css": "./src/styles/base.contract.css",
    "./styles/theme.css": "./src/styles/theme.css",
    "./styles/utilities.css": "./src/styles/utilities.css",
    "./theme.css": "./src/theme.css",
  };

  if (adapters.some((adapter) => webAdapters.has(adapter))) {
    exports["./styles/web-base.css"] = "./src/styles/web-base.css";
    exports["./styles/web.css"] = "./src/styles/web.css";
  }
  if (adapters.includes("expo")) {
    exports["./styles/native-base"] = "./src/styles/native-base.ts";
    exports["./styles/native.css"] = "./src/styles/native.css";
  }
  for (const adapter of adapters) {
    exports[`./styles/adapters/${adapter}/v1.css`] = `./src/styles/adapters/${adapter}/v1.css`;
  }

  return Object.fromEntries(
    Object.entries(exports).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function packageManifestContent(adapters: readonly UiAdapterId[]): string {
  const hasWeb = adapters.some((adapter) => webAdapters.has(adapter));
  const manifest = JSON.parse(
    packageJson({
      name: "@repo/ui",
      scripts: codeScripts(),
      exports: designSystemExports(adapters),
      dependencies: {
        clsx: `^${v.ui.clsx}`,
        tailwindcss: `^${v.styling.tailwindcss}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        ...(hasWeb
          ? {
              "tw-animate-css": `^${v.uniwind["tw-animate-css"]}`,
              "@fontsource-variable/geist": v.ui["@fontsource-variable/geist"],
              "@fontsource-variable/geist-mono": v.ui["@fontsource-variable/geist-mono"],
              "@fontsource-variable/noto-sans-arabic":
                v.ui["@fontsource-variable/noto-sans-arabic"],
            }
          : {}),
      },
      devDependencies: { typescript: `^${v.typescript.typescript}` },
    }),
  ) as Record<string, unknown>;
  manifest.types = "./src/index.ts";
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function designSystemIndexContent(): string {
  return `export { designSystemContract, designSystemContractVersion } from "./contract.js";
export type { DesignSystemContract } from "./contract.js";
export { cn } from "./lib/utils.js";

export const componentRegistryPath = "./component-registry.json";
export const themePath = "./styles/theme.css";
`;
}

export function designSystemModuleFiles(
  layout: ResolvedUiLayout,
  adapters: readonly UiAdapterId[],
): TemplateFile[] {
  const files = [
    file(`${layout.sourceRoot}/index.ts`, designSystemIndexContent()),
    file(`${layout.sourceRoot}/lib/utils.ts`, uiUtilsContent()),
    file(`${layout.sourceRoot}/theme.css`, compatibilityThemeCssContent()),
  ];

  if (layout.mode === "monorepo") {
    files.push(
      file(`${layout.moduleRoot}/package.json`, packageManifestContent(adapters)),
      file(
        `${layout.moduleRoot}/tsconfig.json`,
        tsconfig({
          include: ["src/**/*"],
          compilerOptions: { types: [], jsx: "react-jsx" },
        }),
      ),
    );
  }

  return files;
}
