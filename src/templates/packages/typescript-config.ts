import { file, packageJson, type TemplateFile } from "../shared.js";

export function tsConfigFiles(): TemplateFile[] {
  return [
    file(
      "packages/typescript-config/package.json",
      packageJson({ name: "@repo/typescript-config", scripts: {}, private: true }),
    ),
    file(
      "packages/typescript-config/base.json",
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2024",
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2024"],
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            declaration: true,
            declarationMap: true,
            sourceMap: true,
            incremental: true,
            composite: false,
            paths: {
              "@/*": ["./src/*"],
              "@repo/*": ["../../packages/*/src", "../../tooling/*/src"],
            },
          },
        },
        null,
        2,
      ) + "\n",
    ),
    file(
      "packages/typescript-config/nextjs.json",
      JSON.stringify(
        {
          extends: "./base.json",
          compilerOptions: {
            jsx: "preserve",
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            incremental: true,
            composite: false,
            noEmit: true,
            types: ["bun-types", "node"],
            paths: { "@/*": ["./src/*"], "@repo/*": ["../../packages/*/src"] },
          },
        },
        null,
        2,
      ) + "\n",
    ),
    file(
      "packages/typescript-config/tanstack.json",
      JSON.stringify(
        {
          extends: "./base.json",
          compilerOptions: {
            jsx: "react-jsx",
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            types: ["vite/client", "bun-types", "node"],
            noEmit: true,
            incremental: true,
            composite: false,
            verbatimModuleSyntax: false,
            paths: { "~/*": ["./src/*"], "@/*": ["./src/*"], "@repo/*": ["../../packages/*/src"] },
          },
        },
        null,
        2,
      ) + "\n",
    ),
    file(
      "packages/typescript-config/react-library.json",
      JSON.stringify(
        {
          extends: "./base.json",
          compilerOptions: {
            jsx: "react-jsx",
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            noEmit: true,
            incremental: true,
            composite: false,
            paths: { "@/*": ["./src/*"] },
          },
        },
        null,
        2,
      ) + "\n",
    ),
  ];
}
