import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export function configFiles(): TemplateFile[] {
  return [
    file(
      "packages/ui/package.json",
      packageJson({
        name: "@repo/ui",
        scripts: codeScripts(),
        exports: {
          ".": "./src/index.ts",
          "./theme.css": "./src/theme.css",
        },
        dependencies: {
          clsx: `^${v.ui.clsx}`,
          "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        },
        devDependencies: {
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/ui/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        // @repo/ui is tokens-only (theme.css + a clsx/tailwind-merge helper): no
        // React and no node globals, so it declares no ambient @types. Listing any
        // here fails with TS2688 because the package does not depend on them.
        compilerOptions: { types: [], jsx: "react-jsx" },
      }),
    ),
  ];
}

export function barrelContent(): string {
  return `export { cn } from "./lib/utils.js";
export const themePath = "./theme.css";
`;
}

export function barrelFile(): TemplateFile {
  return file("packages/ui/src/index.ts", barrelContent());
}
