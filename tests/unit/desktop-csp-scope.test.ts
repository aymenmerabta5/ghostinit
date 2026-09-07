import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type CspScope = (
  resourceType: string,
  responseWebContentsId: number | undefined,
  rendererWebContentsId: number | undefined,
  trustedRendererUrl: boolean,
) => boolean;

type CspHeaders = (
  responseHeaders: Record<string, string[]> | undefined,
) => Record<string, string[]>;
type TrustedRendererUrl = (rawUrl: string) => boolean;

function config(mode: "monorepo" | "single"): ProjectConfig {
  return projectConfigSchema.parse({
    name: `desktop-csp-${mode}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework: "nextjs",
    database: mode === "monorepo" ? "postgres" : "none",
    apps: mode === "monorepo" ? ["web", "desktop"] : ["desktop"],
    preset: mode === "monorepo" ? "custom" : "frontend",
    auth: mode === "monorepo",
    api: mode === "monorepo",
    email: false,
    analytics: false,
    billing: [],
    features: [],
  });
}

function mainSource(mode: "monorepo" | "single"): string {
  const path = mode === "monorepo" ? "apps/desktop/src/main.ts" : "src/main.ts";
  const files = generateProjectFiles(config(mode), { dryRun: true });
  const source = files.find((entry: TemplateFile) => entry.path === path)?.content;
  if (!source) throw new Error(`Missing generated Electron main source: ${path}`);
  return source;
}

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing generated helper: ${name}`);
  const end = source.indexOf("\n}\n", start);
  if (end < 0) throw new Error(`Unterminated generated helper: ${name}`);
  return source.slice(start, end + 3).replace(/^function /, "export function ");
}

async function policyHelpers(source: string): Promise<{ scope: CspScope; headers: CspHeaders }> {
  const moduleSource = [
    'const desktopCsp = () => "generated-renderer-csp";',
    extractFunction(source, "shouldInjectDesktopRendererCsp"),
    extractFunction(source, "responseHeadersWithDesktopCsp"),
  ].join("\n");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(moduleSource);
  const uniqueJavascript = `${javascript}\n// ${crypto.randomUUID()}\n`;
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(uniqueJavascript).toString("base64")}`
  )) as {
    shouldInjectDesktopRendererCsp: CspScope;
    responseHeadersWithDesktopCsp: CspHeaders;
  };
  return {
    scope: module.shouldInjectDesktopRendererCsp,
    headers: module.responseHeadersWithDesktopCsp,
  };
}

async function trustedRendererUrlHelper(
  source: string,
  devUrl: string | null,
  virtualDirectory: string,
): Promise<TrustedRendererUrl> {
  const moduleSource = [
    'import { join, resolve } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    `const __dirname = ${JSON.stringify(virtualDirectory)};`,
    `const devRendererUrl = ${devUrl ? `new URL(${JSON.stringify(devUrl)})` : "null"};`,
    extractFunction(source, "comparablePath"),
    extractFunction(source, "isTrustedRendererUrl"),
  ].join("\n");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(moduleSource);
  const uniqueJavascript = `${javascript}\n// ${crypto.randomUUID()}\n`;
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(uniqueJavascript).toString("base64")}`
  )) as { isTrustedRendererUrl: TrustedRendererUrl };
  return module.isTrustedRendererUrl;
}

describe("generated Electron CSP response boundary", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} scopes CSP to the trusted renderer main frame`, async () => {
      const source = mainSource(mode);
      expect(parseSync(`${mode}-desktop-main.ts`, source).errors).toEqual([]);
      expect(source).toContain(
        "if (devRendererUrl) return parsed.origin === devRendererUrl.origin",
      );
      expect(source).toContain(
        'comparablePath(fileURLToPath(parsed)) === comparablePath(join(__dirname, "renderer/index.html"))',
      );

      const listener = source.slice(
        source.indexOf("session.defaultSession.webRequest.onHeadersReceived"),
        source.indexOf("session.defaultSession.setPermissionCheckHandler"),
      );
      expect(listener).toContain("details.resourceType");
      expect(listener).toContain("details.webContentsId");
      expect(listener).toContain("mainWindow?.webContents.id");
      expect(listener).toContain("isTrustedRendererUrl(details.url)");
      expect(listener).toMatch(/callback\(\{\}\);\s*return;/);
      expect(listener.indexOf("callback({});")).toBeLessThan(
        listener.indexOf("responseHeadersWithDesktopCsp"),
      );

      const { scope, headers } = await policyHelpers(source);
      const rendererId = 41;
      expect(scope("mainFrame", rendererId, rendererId, true), "development renderer").toBe(true);
      expect(scope("mainFrame", rendererId, rendererId, true), "packaged renderer").toBe(true);
      expect(scope("mainFrame", 99, rendererId, false), "external OAuth main frame").toBe(false);
      expect(scope("script", rendererId, rendererId, true), "renderer subresource").toBe(false);
      expect(scope("mainFrame", rendererId, rendererId, false), "external navigation").toBe(false);

      const virtualDirectory = resolve(".desktop-csp-runtime");
      const trustDevUrl = await trustedRendererUrlHelper(
        source,
        "http://localhost:5173",
        virtualDirectory,
      );
      expect(trustDevUrl("http://localhost:5173/dashboard")).toBe(true);
      expect(trustDevUrl("https://accounts.google.com/o/oauth2/auth")).toBe(false);
      const trustPackagedUrl = await trustedRendererUrlHelper(source, null, virtualDirectory);
      const packagedRendererUrl = pathToFileURL(
        join(virtualDirectory, "renderer/index.html"),
      ).toString();
      expect(trustPackagedUrl(packagedRendererUrl)).toBe(true);
      expect(trustPackagedUrl(new URL("other.html", packagedRendererUrl).toString())).toBe(false);
      expect(trustPackagedUrl("https://github.com/login/oauth/authorize")).toBe(false);

      const providerHeaders = {
        "Content-Security-Policy": ["provider-csp"],
        "X-Provider": ["preserved"],
      };
      expect(scope("mainFrame", 99, rendererId, false)).toBe(false);
      expect(providerHeaders).toEqual({
        "Content-Security-Policy": ["provider-csp"],
        "X-Provider": ["preserved"],
      });

      expect(
        headers({
          "content-security-policy": ["stale-local-csp"],
          "X-Local": ["preserved"],
        }),
      ).toEqual({
        "Content-Security-Policy": ["generated-renderer-csp"],
        "X-Local": ["preserved"],
      });
    });
  }
});
