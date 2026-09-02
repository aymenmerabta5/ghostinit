import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { electron as electronVersions, runtime } from "../../packages/versions/src/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { analyzeProject } from "../../src/lib/architecture/index.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { buildProjectGenerationPlan, generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function desktopFiles(partial: Partial<ProjectConfig>): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "desktop-fixture",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      database: "postgres",
      preset: "saas",
      billing: [],
      features: [],
      apps: ["desktop"],
      ...partial,
    }),
  );
}

function packageName(specifier: string): string {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : (specifier.split("/")[0] ?? specifier);
}

const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function undeclaredSingleImports(files: TemplateFile[]): string[] {
  const manifest = JSON.parse(
    files.find(({ path }) => path === "package.json")?.content ?? "{}",
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  const missing = new Set<string>();
  for (const file of files) {
    if (!/\.(?:[cm]?[jt]sx?)$/.test(file.path)) continue;
    for (const specifier of parseFile(file.content, extname(file.path)).imports) {
      if (specifier.startsWith(".") || specifier.startsWith("@/") || builtins.has(specifier))
        continue;
      const dependency = packageName(specifier);
      if (!declared.has(dependency)) missing.add(`${file.path} -> ${dependency}`);
    }
  }
  return [...missing].toSorted();
}

function unresolvedDesktopAliasImports(files: TemplateFile[], mode: "monorepo" | "single") {
  const appRoot = mode === "monorepo" ? "apps/desktop/" : "";
  const aliasRoot = mode === "monorepo" ? `${appRoot}src/renderer` : "src";
  const emitted = new Set(files.map(({ path }) => path));
  const unresolved = new Set<string>();
  for (const file of files) {
    if (!file.path.startsWith(`${appRoot}src/`) || !/\.(?:[cm]?[jt]sx?)$/.test(file.path)) continue;
    for (const specifier of parseFile(file.content, extname(file.path)).imports) {
      if (!specifier.startsWith("@/")) continue;
      const target = `${aliasRoot}/${specifier.slice(2)}`;
      const candidates = [
        target,
        `${target}.ts`,
        `${target}.tsx`,
        `${target}.json`,
        `${target}.css`,
        `${target}/index.ts`,
        `${target}/index.tsx`,
      ];
      if (!candidates.some((candidate) => emitted.has(candidate))) {
        unresolved.add(`${file.path} -> ${specifier}`);
      }
    }
  }
  return [...unresolved].toSorted();
}

describe("generated desktop capability foundation", () => {
  test("configures the build alias and emits every referenced desktop source", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = desktopFiles({ mode, apps: ["desktop"], email: true });
      const appRoot = mode === "monorepo" ? "apps/desktop/" : "";
      const aliasRoot = mode === "monorepo" ? "./src/renderer" : "./src";
      const vite = files.find(({ path }) => path === `${appRoot}electron.vite.config.ts`)?.content;
      const magicLink = files.find(
        ({ path }) => path === `${appRoot}src/renderer/routes/magic-link.tsx`,
      )?.content;

      expect(vite, mode).toContain('import { fileURLToPath } from "node:url"');
      expect(vite, mode).toContain(
        `const sourceRoot = fileURLToPath(new URL("${aliasRoot}", import.meta.url))`,
      );
      expect(vite, mode).toContain('alias: { "@": sourceRoot }');
      expect(vite, mode).not.toContain("`nimport");
      expect(parseFile(vite ?? "", ".ts").diagnostics, mode).toEqual([]);
      expect(magicLink, mode).toContain('from "@/components/ui/button"');
      expect(unresolvedDesktopAliasImports(files, mode), mode).toEqual([]);
    }
  });

  test("emits production endpoint packaging guidance in every desktop shape", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const mode of ["monorepo", "single"] as const) {
        const files = desktopFiles({
          mode,
          framework,
          apps: ["desktop"],
          preset: "frontend",
          database: "none",
          auth: false,
          api: false,
          email: false,
          analytics: false,
        });
        const prefix = mode === "monorepo" ? "apps/desktop/" : "";
        const guidePath = mode === "monorepo" ? `${prefix}PACKAGING.md` : "DESKTOP_PACKAGING.md";
        const guide = files.find(({ path }) => path === guidePath)?.content ?? "";
        const runtimeConfig =
          files.find(({ path }) => path === `${prefix}src/server/transport/runtime-config.ts`)
            ?.content ?? "";
        const manifest = JSON.parse(
          files.find(({ path }) => path === `${prefix}package.json`)?.content ?? "{}",
        ) as { scripts?: Record<string, string> };

        expect(guide, `${mode}/${framework}`).toContain("DESKTOP_API_URL=https://api.example.com");
        expect(guide, `${mode}/${framework}`).toContain("runtime `DESKTOP_API_URL` to override");
        expect(guide, `${mode}/${framework}`).toContain("never falls back to localhost");
        expect(guide, `${mode}/${framework}`).toContain("Never put an API key, token");
        expect(runtimeConfig, `${mode}/${framework}`).toContain("app.isPackaged");
        expect(runtimeConfig, `${mode}/${framework}`).toContain(
          "__GHOSTINIT_DESKTOP_EMBEDDED_API_URL__",
        );
        expect(manifest.scripts?.build, `${mode}/${framework}`).toBe(
          "electron-vite build && electron-builder --publish never",
        );
      }
    }
  });

  test("keeps packaged endpoint imports inside the generated Transport layer", async () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = desktopFiles({
        mode,
        framework: "tanstack-start",
        apps: mode === "monorepo" ? ["web", "desktop"] : ["desktop"],
        preset: "custom",
        database: "none",
        auth: false,
        api: true,
        email: false,
        analytics: false,
        billing: [],
      });
      const root = mkdtempSync(join(tmpdir(), `ghostinit-desktop-endpoint-${mode}-`));
      try {
        for (const generated of files) {
          const target = join(root, ...generated.path.split("/"));
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, generated.content, "utf8");
        }
        const findings = await analyzeProject(root);
        const endpointLayerViolations = findings.filter(
          ({ file, id }) =>
            id === "layered-dependency-violation" &&
            /(?:src\/main|server\/transport\/(?:api-fetch|runtime-config))\.ts$/.test(
              file.replaceAll("\\", "/"),
            ),
        );
        expect(endpointLayerViolations, mode).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("keeps the desktop packaging endpoint in the production generation plan", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const mode of ["monorepo", "single"] as const) {
        const resolution = resolveCreateConfig({
          name: `desktop-${mode}-${framework}`,
          runtime: "bun",
          mode,
          framework,
          billing: [],
          features: [],
          database: "none",
          databaseWasExplicit: true,
          apps: ["desktop"],
          preset: "frontend",
          cache: "none",
          deploy: "none",
        });
        expect(resolution.ok, `${mode}/${framework}`).toBe(true);
        if (!resolution.ok) throw new Error(resolution.reason);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
          desiredConfig: resolution.desiredConfig,
        });
        const example = plan.files.find(({ physicalPath }) => physicalPath === ".env.example");
        const local = plan.files.find(({ physicalPath }) => physicalPath === ".env.local");
        expect(example?.content, `${mode}/${framework}: example`).toContain(
          "DESKTOP_API_URL=http://localhost:3000",
        );
        expect(local?.content, `${mode}/${framework}: local guidance`).toContain(
          "# Set DESKTOP_API_URL=https://api.example.com in .env.production.local before packaging",
        );
        expect(local?.content, `${mode}/${framework}: local runtime assignment`).not.toMatch(
          /^DESKTOP_API_URL=/m,
        );
      }
    }
  });

  test("pins the Electron 44 ESM runtime and electron-store 11 contract in both modes", () => {
    expect(electronVersions.electron).toBe("44.0.0");
    expect(electronVersions["electron-store"]).toBe("11.0.2");
    for (const mode of ["monorepo", "single"] as const) {
      const files = desktopFiles({ mode, apps: ["desktop"] });
      const prefix = mode === "monorepo" ? "apps/desktop/" : "";
      const manifest = JSON.parse(
        files.find(({ path }) => path === `${prefix}package.json`)?.content ?? "{}",
      ) as {
        type?: string;
        main?: string;
        engines?: { bun?: string };
        packageManager?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      expect(manifest.type, mode).toBe("module");
      expect(manifest.main, mode).toBe("dist/main.js");
      expect(manifest.engines?.bun, mode).toBe(runtime.bun);
      expect(manifest.packageManager, mode).toBe(`bun@${runtime.bun}`);
      expect(manifest.dependencies?.["electron-store"], mode).toBe("11.0.2");
      expect(manifest.devDependencies?.electron, mode).toBe("44.0.0");
    }
  });

  test("emits a lint-clean client settings theme merge", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = desktopFiles({ mode, apps: ["desktop"] });
      const prefix = mode === "monorepo" ? "apps/desktop/" : "";
      const theme =
        files.find(({ path }) => path === `${prefix}src/renderer/lib/theme.tsx`)?.content ?? "";
      expect(theme, mode).not.toContain("type ClientSettings");
      expect(theme, mode).not.toContain("previous ?? {}");
      expect(theme, mode).toContain("setClientSettings({ ...previous, theme })");
    }
  });

  test("frontend output omits auth, API, admin, and billing closure", () => {
    const files = desktopFiles({
      preset: "frontend",
      database: "none",
      auth: false,
      api: false,
      email: false,
      analytics: false,
    });
    const paths = new Set(files.map(({ path }) => path));
    const prefix = "apps/desktop/";
    const manifest = JSON.parse(
      files.find(({ path }) => path === `${prefix}package.json`)?.content ?? "{}",
    ) as { dependencies?: Record<string, string> };

    for (const path of [
      "src/renderer/lib/auth.ts",
      "src/renderer/lib/orpc.ts",
      "src/renderer/lib/query-client.ts",
      "src/renderer/hooks/useAuth.ts",
      "src/renderer/routes/dashboard.tsx",
      "src/renderer/routes/settings.tsx",
      "src/renderer/routes/billing.tsx",
      "src/renderer/routes/admin.tsx",
      "src/renderer/routes/sign-in.tsx",
    ]) {
      expect(paths.has(`${prefix}${path}`), path).toBe(false);
    }
    for (const dependency of [
      "@orpc/client",
      "@orpc/react-query",
      "@orpc/server",
      "@repo/api",
      "better-auth",
      "@tanstack/react-query",
    ]) {
      expect(manifest.dependencies?.[dependency], dependency).toBeUndefined();
    }

    const root =
      files.find(({ path }) => path === `${prefix}src/renderer/routes/__root.tsx`)?.content ?? "";
    const routeTree =
      files.find(({ path }) => path === `${prefix}src/renderer/routeTree.gen.ts`)?.content ?? "";
    const providers =
      files.find(({ path }) => path === `${prefix}src/renderer/lib/providers.tsx`)?.content ?? "";
    expect(`${root}\n${routeTree}`).not.toMatch(/\/(?:dashboard|settings|billing|admin|sign-in)/);
    expect(providers).not.toContain("QueryClientProvider");
    const desktopSource = files
      .filter(({ path }) => path.startsWith(prefix))
      .map(({ content }) => content)
      .join("\n");
    expect(desktopSource).not.toContain("@repo/api");
    expect(desktopSource).not.toContain("safeStorage");
    expect(desktopSource).not.toContain("desktop:auth-get-session");
    expect(desktopSource).not.toContain("desktop:auth-set-session");
    expect(
      files.find(({ path }) => path === `${prefix}src/renderer/index.html`)?.content,
    ).toContain('class="dark"');
    expect(
      files.find(({ path }) => path === `${prefix}src/renderer/lib/theme.tsx`)?.content,
    ).toContain('useState<Theme>("dark")');
    expect(`${root}\n${desktopSource}`).not.toMatch(/\b(?:ml|mr|pl|pr)-|text-left/);
  });

  test("auth-only output keeps identity routes without inventing an API or admin surface", () => {
    const files = desktopFiles({
      preset: "custom",
      auth: true,
      api: false,
      email: false,
      analytics: false,
    });
    const paths = new Set(files.map(({ path }) => path));
    const prefix = "apps/desktop/";
    const manifest = JSON.parse(
      files.find(({ path }) => path === `${prefix}package.json`)?.content ?? "{}",
    ) as { dependencies?: Record<string, string> };

    expect(paths.has(`${prefix}src/renderer/lib/auth.ts`)).toBe(true);
    expect(paths.has(`${prefix}src/renderer/routes/sign-in.tsx`)).toBe(true);
    expect(paths.has(`${prefix}src/renderer/routes/dashboard.tsx`)).toBe(true);
    expect(paths.has(`${prefix}src/renderer/lib/orpc.ts`)).toBe(false);
    expect(paths.has(`${prefix}src/renderer/routes/admin.tsx`)).toBe(false);
    expect(paths.has(`${prefix}src/renderer/routes/billing.tsx`)).toBe(false);
    expect(manifest.dependencies?.["better-auth"]).toBeDefined();
    expect(manifest.dependencies?.["@orpc/react-query"]).toBeUndefined();
    expect(manifest.dependencies?.["@repo/api"]).toBeUndefined();
    expect(
      files.find(({ path }) => path === `${prefix}src/renderer/lib/auth.ts`)?.content,
    ).not.toContain("adminClient");
    expect(files.map(({ content }) => content).join("\n")).not.toContain("auth is disabled");
    const root = files.find(
      ({ path }) => path === `${prefix}src/renderer/routes/__root.tsx`,
    )?.content;
    expect(root).toContain("requireAuthenticatedDesktopRoute");
    expect(root).toContain('new Set(["/dashboard","/settings"])');
    expect(root).toContain('throw redirect({ to: "/sign-in" })');
    expect(root).toContain("{isAuthenticated ? <>");
  });

  test("API-only output keeps transport without inventing identity", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = desktopFiles({
        mode,
        preset: "custom",
        auth: false,
        api: true,
        email: false,
        analytics: false,
        billing: [],
      });
      const prefix = mode === "monorepo" ? "apps/desktop/" : "";
      const paths = new Set(files.map(({ path }) => path));
      const manifest = JSON.parse(
        files.find(({ path }) => path === `${prefix}package.json`)?.content ?? "{}",
      ) as { dependencies?: Record<string, string> };

      expect(paths.has(`${prefix}src/renderer/lib/orpc.ts`), mode).toBe(true);
      expect(paths.has(`${prefix}src/renderer/lib/query-client.ts`), mode).toBe(true);
      expect(paths.has(`${prefix}src/renderer/lib/auth.ts`), mode).toBe(false);
      expect(paths.has(`${prefix}src/renderer/routes/sign-in.tsx`), mode).toBe(false);
      expect(paths.has(`${prefix}src/renderer/routes/dashboard.tsx`), mode).toBe(false);
      expect(paths.has(`${prefix}src/renderer/routes/admin.tsx`), mode).toBe(false);
      expect(manifest.dependencies?.["@orpc/react-query"], mode).toBeDefined();
      expect(manifest.dependencies?.["better-auth"], mode).toBeUndefined();
      expect(manifest.dependencies?.["@tanstack/react-form"], mode).toBeUndefined();

      const orpc = files.find(({ path }) => path === `${prefix}src/renderer/lib/orpc.ts`)?.content;
      expect(orpc, mode).not.toContain("orpc.me");
      if (mode === "single") {
        const contract =
          files.find(({ path }) => path === "src/renderer/lib/api-contract.ts")?.content ?? "";
        expect(contract).not.toContain('path: "/me"');
        expect(manifest.dependencies?.zod).toBeDefined();
        expect(undeclaredSingleImports(files)).toEqual([]);
      }
    }
  });

  test("keeps the dormant single desktop remote-client branch closed but not CLI-reachable", () => {
    const unsupported = resolveCreateConfig({
      name: "desktop-remote-client",
      runtime: "bun",
      mode: "single",
      framework: "nextjs",
      billing: ["stripe"],
      features: [],
      database: "postgres",
      databaseWasExplicit: true,
      apps: ["desktop"],
      preset: "custom",
      cache: "none",
      deploy: "none",
    });
    expect(unsupported.ok).toBe(false);
    if (unsupported.ok) throw new Error("single desktop server capabilities must remain blocked");
    expect(unsupported.reason).toBe("single-native-server-capabilities-unsupported");

    const derived = desktopFiles({
      mode: "single",
      preset: "custom",
      auth: false,
      api: false,
      billing: ["stripe"],
    });
    const paths = new Set(derived.map(({ path }) => path));
    const manifest = JSON.parse(
      derived.find(({ path }) => path === "package.json")?.content ?? "{}",
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(paths.has("src/renderer/lib/auth.ts")).toBe(true);
    expect(paths.has("src/renderer/lib/orpc.ts")).toBe(true);
    expect(paths.has("src/renderer/lib/query-client.ts")).toBe(true);
    expect(paths.has("src/renderer/lib/api-contract.ts")).toBe(true);
    expect(paths.has("src/renderer/routes/billing.tsx")).toBe(true);
    expect(paths.has("src/platform/ui/styles/theme.css")).toBe(true);
    expect(paths.has("src/renderer/styles/theme.css")).toBe(false);
    expect(paths.has("tsr.config.json")).toBe(true);
    expect(manifest.dependencies?.["@orpc/react-query"]).toBeDefined();
    expect(manifest.dependencies?.["better-auth"]).toBeDefined();

    const allDependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };
    expect(Object.keys(allDependencies).filter((name) => name.startsWith("@repo/"))).toEqual([]);
    expect(Object.values(allDependencies)).not.toContain("workspace:*");
    expect(undeclaredSingleImports(derived)).toEqual([]);
    for (const file of derived.filter(({ path }) => /\.(?:[cm]?[jt]sx?)$/.test(path))) {
      expect(file.content, file.path).not.toMatch(/(?:from|import\s*\()\s*["']@repo\//);
    }
    expect(derived.find(({ path }) => path === "src/renderer/index.css")?.content).toContain(
      '@import "../platform/ui/styles/adapters/electron/v1.css"',
    );

    const orpc = derived.find(({ path }) => path === "src/renderer/lib/orpc.ts")?.content ?? "";
    const queryClient =
      derived.find(({ path }) => path === "src/renderer/lib/query-client.ts")?.content ?? "";
    expect(orpc).toContain("export const orpcClient = createORPCClient");
    expect(orpc).toContain("export const orpc = createORPCReactQueryUtils(orpcClient)");
    expect(orpc).toContain('health: () => orpc.health.key({ type: "query" })');
    expect(orpc).toContain('me: () => orpc.me.key({ type: "query" })');
    expect(orpc).not.toContain("as unknown as");
    expect(orpc).not.toMatch(/queryKey:\s*\[/);
    expect(queryClient).toContain("export function makeQueryClient()");
    expect(queryClient).toContain("refetchOnWindowFocus: false");

    const vite = derived.find(({ path }) => path === "electron.vite.config.ts")?.content ?? "";
    const main = derived.find(({ path }) => path === "src/main.ts")?.content ?? "";
    expect(vite).toContain('input: "src/main.ts"');
    expect(vite).toContain('input: "src/preload.ts"');
    expect(vite).toContain("emptyOutDir: false");
    expect(vite).toContain('envPrefix: "VITE_"');
    expect(vite).not.toContain('envPrefix: ["VITE_", "DESKTOP_"]');
    expect(vite).toContain('format: "cjs"');
    expect(vite).toContain('entryFileNames: "preload.cjs"');
    expect(vite).toContain('routesDirectory: "routes"');
    expect(main).toContain('preload: join(__dirname, "preload.cjs")');
    expect(main).toContain("const __filename = fileURLToPath(import.meta.url)");
    expect(main).toContain("const __dirname = dirname(__filename)");
    expect(main).toContain('import Store, { type Schema } from "electron-store"');
    expect(main).toContain('import electronUpdater from "electron-updater"');
    expect(main).toContain("const { autoUpdater } = electronUpdater");
    expect(main).not.toContain('import { autoUpdater } from "electron-updater"');
    expect(main).toContain("const desktopStoreSchema: Schema<DesktopStore>");
    expect(main).toContain('"auth:session": { type: "string", maxLength: 8192 }');
    expect(main).toContain('rootSchema: { type: "object", additionalProperties: false }');
    expect(main).toContain("clearInvalidConfig: true");
    expect(main).toContain('desktopStore().set("clientSettings", val as DesktopClientSettings)');
    expect(main).not.toContain("val as never");
    expect(main).toContain("storeInstance ??= new Store<DesktopStore>");
    expect(main.indexOf("requestSingleInstanceLock()")).toBeLessThan(
      main.indexOf("desktopStore();"),
    );
    expect(main).toContain("isUpdateAvailable: result?.isUpdateAvailable ?? false");
    expect(main).toContain('releaseNotes: typeof updateInfo.releaseNotes === "string"');
    expect(main).toContain("return { downloaded: true as const }");
    expect(main).not.toContain("return await autoUpdater.checkForUpdates()");
    expect(main).not.toContain("return await autoUpdater.downloadUpdate()");
    expect(main).toContain('loadFile(join(__dirname, "renderer/index.html"))');
    expect(main).toContain("process.env.ELECTRON_RENDERER_URL ||");
    expect(main).toContain('(process.env.ELECTRON_IS_DEV === "1" ? DEFAULT_DEV_RENDERER_URL');
    expect(main).toContain("if (devRendererUrl) return parsed.origin === devRendererUrl.origin");
    expect(main).toContain("mainWindow.loadURL(devRendererUrl.toString())");
    expect(main).toContain("if (devRendererUrl) {");
    expect(main).toContain('new Set(["localhost", "127.0.0.1", "::1", "[::1]"])');
    expect(main).toContain("comparablePath(fileURLToPath(parsed))");
    expect(main).toContain("event.sender !== mainWindow.webContents");
    expect(main).toContain("assertTrustedIpc(event)");
    expect(main).toContain("const hasSingleInstanceLock = app.requestSingleInstanceLock()");
    expect(main.indexOf("requestSingleInstanceLock()")).toBeLessThan(
      main.indexOf("app.whenReady()"),
    );
    expect(main).toContain('mainWindow.on("closed"');
    expect(main).toContain('dialog.showErrorBox("Desktop startup failed"');
    expect(main).toContain(
      'process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"',
    );
    expect(main).toContain('webContents.on("will-redirect"');
    expect(main).toContain("setPermissionCheckHandler(() => false)");
    expect(main).toContain("setPermissionRequestHandler");
    expect(main).toContain("JSON.stringify(val).length > 16_384");
    expect(main).toContain("Array.isArray(val)");
    expect(main).toContain("token.length < 16");
    expect(main).toContain("!isAsciiCredential(token)");
    expect(main).not.toContain('url.startsWith("http://localhost:5173")');
    expect(main).not.toContain("storing plaintext fallback");
    expect(main).not.toContain("store.set(key, value)");

    const convex = desktopFiles({
      mode: "single",
      database: "convex",
      preset: "saas",
      billing: [],
    });
    const convexManifest = JSON.parse(
      convex.find(({ path }) => path === "package.json")?.content ?? "{}",
    ) as { scripts?: Record<string, string> };
    expect(convexManifest.scripts?.["convex:codegen"]).toBe("convex codegen");
    expect(convexManifest.scripts?.typecheck).toBe("tsr generate && tsc --noEmit");
    expect(convexManifest.scripts?.build).toBe(
      "electron-vite build && electron-builder --publish never",
    );
    expect(convexManifest.scripts?.start).toBe("electron-vite preview");
  });
});
