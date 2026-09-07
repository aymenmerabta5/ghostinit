import { generatedGitignoreContent } from "../../gitignore.js";
import type { DesktopMode } from "./model.js";

export function desktopViteConfigContent(
  mode: DesktopMode = "monorepo",
  hasConvex = false,
): string {
  const aliasRoot = mode === "monorepo" ? "./src/renderer" : "./src";
  const environmentRoot = mode === "monorepo" ? "../../" : "./";
  const configImport =
    mode === "monorepo" ? "@repo/config/desktop-main" : "./src/lib/env/desktop-main.js";
  const mainWorkspaceBundle =
    mode === "monorepo"
      ? `      // electron-vite 5 externalizes package dependencies by default. Bundle the
      // source-only workspace config so packaged Electron never imports TypeScript
      // from node_modules; the selected subpath resolves public desktop origins only.
      externalizeDeps: { exclude: ["@repo/config"] },
`
      : "";
  return `import { fileURLToPath } from "node:url";
import { defineConfig } from "electron-vite";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { resolveDesktopMainEnv${hasConvex ? ", resolveDesktopConvexUrl" : ""} } from "${configImport}";

const sourceRoot = fileURLToPath(new URL("${aliasRoot}", import.meta.url));
const environmentRoot = fileURLToPath(new URL("${environmentRoot}", import.meta.url));

function resolveEmbeddedDesktopApiUrl(mode: string): string {
  const loadedEnvironment = loadEnv(mode, environmentRoot, "DESKTOP_API_URL");
  const configured = process.env.DESKTOP_API_URL?.trim() || loadedEnvironment.DESKTOP_API_URL?.trim();
  return resolveDesktopMainEnv(
    configured ? { DESKTOP_API_URL: configured } : {},
    { isPackaged: true },
  ).DESKTOP_API_URL;
}

export default defineConfig(({ command, mode }) => {
  const embeddedApiUrl = command === "build" ? resolveEmbeddedDesktopApiUrl(mode) : "";
${
  hasConvex
    ? `  const loadedConvex = loadEnv(mode, environmentRoot, "VITE_CONVEX_URL");
  const embeddedConvexUrl = resolveDesktopConvexUrl(process.env.VITE_CONVEX_URL?.trim() || loadedConvex.VITE_CONVEX_URL);
`
    : ""
}  return {
    main: {
      define: {
        __GHOSTINIT_DESKTOP_EMBEDDED_API_URL__: JSON.stringify(embeddedApiUrl),
${hasConvex ? "        __GHOSTINIT_DESKTOP_EMBEDDED_CONVEX_URL__: JSON.stringify(embeddedConvexUrl),\n" : ""}
      },
      build: {
${mainWorkspaceBundle}      outDir: "dist",
        rollupOptions: {
          input: "src/main.ts",
        },
      },
    },
    preload: {
      build: {
        outDir: "dist",
        emptyOutDir: false,
        rollupOptions: {
          input: "src/preload.ts",
          output: {
            format: "cjs",
            entryFileNames: "preload.cjs",
          },
        },
      },
    },
    renderer: {
      root: "src/renderer",
      envPrefix: "VITE_",
      resolve: {
        alias: { "@": sourceRoot },
      },
      build: {
        outDir: "dist/renderer",
      },
      plugins: [TanStackRouterVite({ routesDirectory: "routes", generatedRouteTree: "routeTree.gen.ts" }), react(), tailwindcss()],
    },
  };
});
`;
}

export function desktopRouterConfigContent(): string {
  return `${JSON.stringify(
    {
      routesDirectory: "./src/renderer/routes",
      generatedRouteTree: "./src/renderer/routeTree.gen.ts",
    },
    null,
    2,
  )}\n`;
}

export function desktopTsconfigContent(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        // @repo imports intentionally resolve through package exports only;
        // direct source paths plus workspace links are case-unstable on Windows.
        paths: {
          "@/*": ["./src/renderer/*"],
        },
        types: ["node", "vite/client"],
      },
      include: ["src/**/*", "electron.vite.config.ts"],
    },
    null,
    2,
  );
}

export function desktopElectronBuilderYmlContent(projectName: string): string {
  return `appId: com.ghostinit.${projectName}
productName: ${projectName}
files:
  - dist/**/*
  - "!**/*.tsbuildinfo"
directories:
  buildResources: resources
  output: out
win:
  target: nsis
mac:
  target: dmg
linux:
  target: AppImage
  executableName: ${projectName}
publish:
  # TODO: Replace with your update server URL or remove publish section until configured
  # url: REPLACE_WITH_UPDATE_URL
`;
}

export function desktopGitignoreContent(): string {
  return generatedGitignoreContent();
}

export function desktopPackagingReadmeContent(
  mode: DesktopMode = "monorepo",
  hasConvex = false,
): string {
  const environmentLocation = mode === "monorepo" ? "the workspace root" : "this project root";
  return `# Desktop packaging

The Electron main process needs a production API origin before it can be packaged. Set
\`DESKTOP_API_URL\` to an HTTPS origin in \`.env.production.local\` at ${environmentLocation}
or in the environment of \`bun run build\`:

\`\`\`dotenv
DESKTOP_API_URL=https://api.example.com
\`\`\`

electron-vite validates the value and embeds only this non-secret origin in the main-process
bundle before electron-builder creates the installer. Credentials, query strings, fragments,
non-HTTP protocols, and HTTP production origins are rejected. Never put an API key, token,
cookie, database URL, or other server secret in this value or any \`VITE_*\` variable.

At launch, a managed deployment may set a runtime \`DESKTOP_API_URL\` to override the embedded origin.
Normal Explorer/Finder launches use the embedded origin because they do not inherit a deployment
shell environment. Development may omit the variable and uses \`http://localhost:3000\`; a
packaged application never falls back to localhost and fails closed when no endpoint was embedded.
${
  hasConvex
    ? `
For Convex, configure the existing public \`VITE_CONVEX_URL\` in the same build environment.
The main process validates and embeds that exact HTTPS origin, passes it to the renderer,
and permits only its HTTPS/WebSocket connections in the renderer policy. A runtime
\`VITE_CONVEX_URL\` override updates both the client and policy together.
Attachment URLs returned by Convex \`storage.getUrl()\` are bearer capabilities, not
automatically expiring URLs: anyone with the URL can download until the file is deleted.
The desktop downloader accepts only \`/api/storage/<id>\` on the configured Convex origin,
sends no application credentials, and refuses redirects. Backend attachment routes keep
their authenticated application transport.
`
    : ""
}
`;
}
