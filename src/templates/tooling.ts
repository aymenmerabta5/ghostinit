import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import { lintScriptFiles } from "./tooling/lint-scripts.js";

export function toolingFiles(): TemplateFile[] {
  return [
    file(
      "tooling/architecture/package.json",
      packageJson({
        name: "@tooling/architecture",
        scripts: codeScripts(),
        private: true,
      }),
    ),
    file("tooling/architecture/tsconfig.json", tsconfig({ include: ["src/**/*"] })),
    file(
      "tooling/architecture/src/index.ts",
      `export interface PackageRule {\n  name: string;\n  allowedDependencies: string[];\n}\n\nexport function defineArchitecture(rules: PackageRule[]): PackageRule[] {\n  return rules;\n}\n`,
    ),
    ...lintScriptFiles(),
  ];
}

export { lintScriptFiles };
