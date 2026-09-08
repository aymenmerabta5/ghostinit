import { file, packageJson, type TemplateFile } from "../shared.js";
import { NEXT_COMPILER_OPTIONS } from "../tooling/next-typescript.js";

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
              "@repo/services/application": ["../../packages/services/src/application/index.ts"],
              "@repo/*": ["../../packages/*/src", "../../tooling/*/src"],
              "@repo/config": ["../../packages/config/src/index.ts"],
              "@repo/config/server": ["../../packages/config/src/server.ts"],
              "@repo/config/desktop-main": ["../../packages/config/src/desktop-main.ts"],
              "@repo/config/next": ["../../packages/config/src/next.ts"],
              "@repo/config/vite": ["../../packages/config/src/vite.ts"],
              "@repo/config/expo": ["../../packages/config/src/expo.ts"],
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
            ...NEXT_COMPILER_OPTIONS,
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            incremental: true,
            composite: false,
            types: ["bun-types", "node"],
            paths: {
              "@/*": ["./src/*"],
              "@repo/services/application": ["../../packages/services/src/application/index.ts"],
              "@repo/*": ["../../packages/*/src"],
              "@repo/config": ["../../packages/config/src/index.ts"],
              "@repo/config/server": ["../../packages/config/src/server.ts"],
              "@repo/config/desktop-main": ["../../packages/config/src/desktop-main.ts"],
              "@repo/config/next": ["../../packages/config/src/next.ts"],
              "@repo/config/vite": ["../../packages/config/src/vite.ts"],
              "@repo/config/expo": ["../../packages/config/src/expo.ts"],
            },
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
            paths: {
              "~/*": ["./src/*"],
              "@/*": ["./src/*"],
              "@repo/services/application": ["../../packages/services/src/application/index.ts"],
              "@repo/*": ["../../packages/*/src"],
              "@repo/config": ["../../packages/config/src/index.ts"],
              "@repo/config/server": ["../../packages/config/src/server.ts"],
              "@repo/config/desktop-main": ["../../packages/config/src/desktop-main.ts"],
              "@repo/config/next": ["../../packages/config/src/next.ts"],
              "@repo/config/vite": ["../../packages/config/src/vite.ts"],
              "@repo/config/expo": ["../../packages/config/src/expo.ts"],
            },
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
