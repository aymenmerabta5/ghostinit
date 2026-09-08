import type { AddonInstallerMap, BillingProviderName } from "../../../lib/addons.js";
import { packageJson } from "../../shared.js";
import * as v from "../../versions.js";
import { resolveDesktopCapabilities, type DesktopMode } from "./model.js";

export function desktopPackageJsonContent(
  runtime: "node" | "bun" = "bun",
  addons?: AddonInstallerMap,
  mode: DesktopMode = "monorepo",
  selectedBilling: readonly BillingProviderName[] = [],
): string {
  const capabilities = resolveDesktopCapabilities(addons, selectedBilling, mode === "monorepo");
  const { hasApi, hasAuth, hasAdmin, hasAnalytics, isConvex } = capabilities;
  const hasConvexAuth = isConvex && hasAuth;
  const typecheck = "tsr generate && tsc --noEmit";
  return packageJson({
    name: "desktop",
    version: v.ghostinitVersion,
    private: true,
    type: "module",
    main: "dist/main.js",
    engines: { bun: v.runtime.bun },
    packageManager: `bun@${v.runtime.bun}`,
    scripts: {
      dev: "electron-vite dev",
      build: "electron-vite build && electron-builder --publish never",
      preview: "electron-vite preview",
      typecheck,
      test: "bun test tests",
      lint: "oxlint --deny-warnings .",
      "lint:all": "bun run lint && bun run typecheck",
      format: "oxfmt --write .",
      "format:check": "oxfmt --check .",
      ...(isConvex
        ? {
            "convex:codegen": mode === "monorepo" ? "cd ../.. && convex codegen" : "convex codegen",
          }
        : {}),
    },
    dependencies: {
      ...(mode === "single"
        ? {
            "@fontsource-variable/geist": v.ui["@fontsource-variable/geist"],
            "@fontsource-variable/geist-mono": v.ui["@fontsource-variable/geist-mono"],
            "@fontsource-variable/noto-sans-arabic": v.ui["@fontsource-variable/noto-sans-arabic"],
          }
        : {}),
      react: `^${v.nextStack.react}`,
      "react-dom": `^${v.nextStack["react-dom"]}`,
      "@tanstack/react-router": `^${v.tanstackStart["@tanstack/react-router"]}`,
      ...(hasApi
        ? {
            "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
            "@orpc/client": `^${v.orpc["@orpc/client"]}`,
            "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
            ...(mode === "single"
              ? {
                  "@orpc/contract": `^${v.orpc["@orpc/contract"]}`,
                }
              : {
                  "@orpc/server": `^${v.orpc["@orpc/server"]}`,
                  "@repo/api": "workspace:*",
                }),
          }
        : {}),
      ...(hasAuth
        ? {
            "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
            "better-auth": `^${v.auth["better-auth"]}`,
          }
        : {}),
      ...(hasAnalytics ? { "posthog-js": `^${v.analytics["posthog-js"]}` } : {}),
      zod: `^${v.validation.zod}`,
      "@t3-oss/env-core": `^${v.validation["@t3-oss/env-core"]}`,
      "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
      ...(hasConvexAuth
        ? {
            convex: `^${v.convex.convex}`,
            "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
          }
        : {}),
      "electron-store": v.electron["electron-store"],
      "electron-updater": `^${v.electron["electron-updater"]}`,
      "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
      "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
      "lucide-react": `^${v.ui["lucide-react"]}`,
      ...(mode === "monorepo"
        ? {
            ...(hasAdmin ? { "@repo/kernel": "workspace:*" } : {}),
            "@repo/config": "workspace:*",
            "@repo/ui": "workspace:*",
          }
        : {}),
    },
    devDependencies: {
      "bun-types": `^${v.runtime.bun}`,
      electron: v.electron.electron,
      "electron-vite": `^${v.electron["electron-vite"]}`,
      "electron-builder": `^${v.electron["electron-builder"]}`,
      vite: `^${v.tanstackStart.vite}`,
      "@vitejs/plugin-react": `^${v.tanstackStart["@vitejs/plugin-react"]}`,
      "@tailwindcss/vite": `^${v.tanstackStart["@tailwindcss/vite"]}`,
      "@tanstack/router-cli": `^${v.tanstackStart["@tanstack/router-cli"]}`,
      "@tanstack/router-plugin": `^${v.tanstackStart["@tanstack/router-plugin"]}`,
      typescript: `^${v.typescript.typescript}`,
      "@types/react": v.nextStack["@types/react"],
      "@types/react-dom": v.nextStack["@types/react-dom"],
      "@types/node": v.runtime["@types/node"],
      tailwindcss: `^${v.styling.tailwindcss}`,
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      "oxc-parser": v.tooling["oxc-parser"],
    },
  });
}

export function desktopSmokeTestContent(): string {
  return `import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("declares an Electron main artifact and native quality scripts", () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, "../package.json"), "utf8"));
  expect(manifest.main).toBe("dist/main.js");
  expect(manifest.scripts.typecheck).toContain("tsc --noEmit");
  expect(manifest.scripts.lint).toBe("oxlint --deny-warnings .");
});
`;
}
