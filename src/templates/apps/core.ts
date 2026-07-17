import { codeScripts, file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export function coreFiles(runtime: "node" | "bun" = "bun"): TemplateFile[] {
  return [
    webPackage(runtime),
    nextConfig(),
    postcssConfig(),
    globalCss(runtime),
    webTsconfig(runtime),
  ];
}

function webPackage(runtime: "node" | "bun"): TemplateFile {
  return file(
    "apps/web/package.json",
    packageJson({
      name: "web",
      packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10`,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        ...codeScripts({
          test: runtime === "bun" ? "bun test tests" : "npm run test:unit",
          e2e: true,
        }),
      },
      dependencies: {
        "@orpc/client": `^${v.orpc["@orpc/client"]}`,
        "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
        "@orpc/server": `^${v.orpc["@orpc/server"]}`,
        "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
        "@repo/api": "workspace:*",
        "@repo/auth": "workspace:*",
        "@repo/config": "workspace:*",
        "@repo/contracts": "workspace:*",
        "@repo/database": "workspace:*",
        "@repo/modules": "workspace:*",
        "@repo/observability": "workspace:*",
        "@repo/ui": "workspace:*",
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        next: `^${v.nextStack.next}`,
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        zod: `^${v.validation.zod}`,
      },
      devDependencies: {
        "@playwright/test": `^${v.testing.playwright}`,
        oxfmt: `^${v.tooling.oxfmt}`,
        oxlint: `^${v.tooling.oxlint}`,
        "@repo/typescript-config": "workspace:*",
        "@types/node": `^${v.runtime["@types/node"]}`,
        "@types/react": `^${v.nextStack["@types/react"]}`,
        "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
        "@typescript/native-preview": `^${v.typescript["@typescript/native-preview"]}`,
        "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
        postcss: `^${v.styling.postcss}`,
        tailwindcss: `^${v.styling.tailwindcss}`,
        typescript: `^${v.typescript.typescript}`,
      },
    }),
  );
}

function nextConfig(): TemplateFile {
  return file(
    "apps/web/next.config.ts",
    `import type { NextConfig } from "next";\n\nconst config: NextConfig = {\n  reactStrictMode: true,\n\n  transpilePackages: ["@repo/api", "@repo/auth", "@repo/config", "@repo/database", "@repo/ui", "@repo/observability", "@repo/modules"],\n};\n\nexport default config;\n`,
  );
}

function postcssConfig(): TemplateFile {
  return file(
    "apps/web/postcss.config.mjs",
    `/** @type {import('postcss-load-config').Config} */\nconst config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n`,
  );
}

function globalCss(_runtime: "node" | "bun"): TemplateFile {
  return file(
    "apps/web/src/app/globals.css",
    `@import "tailwindcss";\n\n:root {\n  --background: #ffffff;\n  --foreground: #0f172a;\n}\n\nbody {\n  color: var(--foreground);\n  background: var(--background);\n}\n`,
  );
}

function webTsconfig(_runtime: "node" | "bun"): TemplateFile {
  return file(
    "apps/web/tsconfig.json",
    JSON.stringify(
      {
        extends: "@repo/typescript-config/nextjs.json",
        compilerOptions: {
          paths: { "@/*": ["./src/*"] },
          noEmit: true,
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules", ".next"],
      },
      null,
      2,
    ) + "\n",
  );
}
