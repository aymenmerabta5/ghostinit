export function desktopRendererHtmlContent(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- CSP is set by the Electron main process (main.ts desktopCsp) so connect-src
         follows DESKTOP_API_URL automatically. No static CSP here. -->
    <title>GhostInit Desktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`;
}

export function desktopRendererMainContent(): string {
  return `import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Providers } from "./lib/providers";

import "./index.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </React.StrictMode>,
  );
}
`;
}

export function desktopRendererCssContent(themeImport = "@repo/ui/theme.css"): string {
  return `@import "tailwindcss";
@import "${themeImport}";
@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));

html, body, #root {
  height: 100%;
}

* {
  border-color: var(--border);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
`;
}
