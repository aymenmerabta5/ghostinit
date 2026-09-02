import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import * as compatibility from "../../src/templates/apps/desktop-core.js";
import * as modular from "../../src/templates/apps/desktop/index.js";

const workspaceRoot = resolve(import.meta.dir, "../..");
const desktopRoot = join(workspaceRoot, "src/templates/apps/desktop");
const compatibilityPath = join(workspaceRoot, "src/templates/apps/desktop-core.ts");

const publicRuntimeExports = [
  "desktopApiContractContent",
  "desktopApiTransportContent",
  "desktopAuthContent",
  "desktopAuthStubContent",
  "desktopCoreFiles",
  "desktopElectronBuilderYmlContent",
  "desktopGitignoreContent",
  "desktopMainContent",
  "desktopOrpcContent",
  "desktopPackageJsonContent",
  "desktopPackagingReadmeContent",
  "desktopSmokeTestContent",
  "desktopPreloadContent",
  "desktopProvidersContent",
  "desktopQueryClientContent",
  "desktopRendererCssContent",
  "desktopRendererFetchContent",
  "desktopRendererHtmlContent",
  "desktopRendererMainContent",
  "desktopRouteAdminContent",
  "desktopRouteAdminCreateUserContent",
  "desktopRouteAdminUsersContent",
  "desktopRouteBillingContent",
  "desktopRouteDashboardContent",
  "desktopRouteForgotPasswordContent",
  "desktopRouteIndexContent",
  "desktopRouteResetPasswordContent",
  "desktopRouteRootContent",
  "desktopRouteSettingsContent",
  "desktopRouteSignInContent",
  "desktopRouteSignUpContent",
  "desktopRouteTreeGenContent",
  "desktopRouteTwoFactorContent",
  "desktopRouterConfigContent",
  "desktopRuntimeConfigContent",
  "desktopThemeProviderContent",
  "desktopThemeToggleContent",
  "desktopTsconfigContent",
  "desktopUiAlertContent",
  "desktopUiBadgeContent",
  "desktopUiButtonContent",
  "desktopUiCardContent",
  "desktopUiChatContent",
  "desktopUiEmptyContent",
  "desktopUiFieldContent",
  "desktopUiInputContent",
  "desktopUiLabelContent",
  "desktopUiSelectContent",
  "desktopUiSeparatorContent",
  "desktopUiSkeletonContent",
  "desktopUiTextareaContent",
  "desktopUseAuthContent",
  "desktopUseAuthStubContent",
  "desktopViteConfigContent",
  "resolveDesktopBillingProviders",
  "resolveDesktopCapabilities",
] as const;

function typeScriptFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? typeScriptFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

function relativeSpecifiers(body: readonly unknown[]): string[] {
  const specifiers: string[] = [];
  for (const node of body) {
    if (!node || typeof node !== "object") continue;
    const type = Reflect.get(node, "type");
    if (type !== "ImportDeclaration" && type !== "ExportNamedDeclaration") continue;
    const source = Reflect.get(node, "source");
    if (!source || typeof source !== "object") continue;
    const value = Reflect.get(source, "value");
    if (typeof value === "string" && value.startsWith(".")) specifiers.push(value);
  }
  return specifiers;
}

function sourcePath(importer: string, specifier: string): string {
  const resolved = resolve(dirname(importer), specifier);
  return resolved.endsWith(".js") ? `${resolved.slice(0, -3)}.ts` : resolved;
}

describe("modular desktop template ownership", () => {
  test("keeps the legacy facade thin and preserves its exact runtime export surface", () => {
    const source = readFileSync(compatibilityPath, "utf8");
    const parsed = parseSync(compatibilityPath, source);

    expect(parsed.errors).toEqual([]);
    expect(source).not.toContain("@allow-long");
    expect(source).not.toMatch(/export\s+\*/);
    expect(source.split(/\r?\n/).length).toBeLessThan(70);
    expect(parsed.program.body.every((node) => node.type === "ExportNamedDeclaration")).toBe(true);
    expect(Object.keys(compatibility).sort()).toEqual([...publicRuntimeExports].sort());
    expect(Object.keys(modular).sort()).toEqual([...publicRuntimeExports].sort());
    for (const name of publicRuntimeExports) expect(compatibility[name], name).toBe(modular[name]);
  });

  test("keeps every cohesive module bounded, explicit, and import-closed", () => {
    const files = typeScriptFiles(desktopRoot);
    const moduleSet = new Set(files.map((path) => resolve(path)));
    const graph = new Map<string, string[]>();

    expect(files.length).toBeGreaterThan(20);
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const label = relative(workspaceRoot, path);
      const parsed = parseSync(path, source);
      expect(parsed.errors, label).toEqual([]);
      expect(source.split(/\r?\n/).length, label).toBeLessThanOrEqual(300);
      expect(source, label).not.toContain("@allow-long");
      expect(source, label).not.toMatch(/export\s+\*/);
      expect(source, label).not.toContain("desktop-core");

      const localDependencies: string[] = [];
      for (const specifier of relativeSpecifiers(parsed.program.body)) {
        const dependency = sourcePath(path, specifier);
        expect(existsSync(dependency), `${label}: ${specifier}`).toBe(true);
        if (moduleSet.has(dependency)) localDependencies.push(dependency);
      }
      graph.set(resolve(path), localDependencies);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (path: string, trail: readonly string[]): void => {
      if (visiting.has(path)) {
        throw new Error(
          `Desktop template import cycle: ${[...trail, path].map((item) => relative(desktopRoot, item)).join(" -> ")}`,
        );
      }
      if (visited.has(path)) return;
      visiting.add(path);
      for (const dependency of graph.get(path) ?? []) visit(dependency, [...trail, path]);
      visiting.delete(path);
      visited.add(path);
    };
    for (const path of graph.keys()) visit(path, []);
  });

  test("routes production composers through the modular entrypoint", () => {
    for (const path of [
      "src/templates/modes/monorepo/apps-composer.ts",
      "src/templates/modes/single/composers/desktop.ts",
    ]) {
      const source = readFileSync(join(workspaceRoot, path), "utf8");
      expect(source, path).toContain("apps/desktop/index.js");
      expect(source, path).not.toContain("apps/desktop-core.js");
    }
  });

  test("keeps email-off desktop OAuth actions explicit without emitting password calls", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const signIn = modular.desktopRouteSignInContent(false, true, mode);
      const signUp = modular.desktopRouteSignUpContent(true, mode, false);
      expect(signIn, `${mode}/sign-in`).toContain('t("signIn.emailDisabled")');
      expect(signUp, `${mode}/sign-up`).toContain('t("signUp.emailDisabled")');
      expect(signIn, `${mode}/sign-in`).not.toContain("authClient.signIn.email");
      expect(signUp, `${mode}/sign-up`).not.toContain("authClient.signUp.email");
      for (const [source, helper] of [
        [signIn, "signInWithOAuth"],
        [signUp, "signUpWithOAuth"],
      ] as const) {
        expect(source).toContain('from "../lib/auth"');
        expect(source).toContain("identityClient.signInWithOAuth");
        expect(source).toContain(`${helper}("google")`);
        expect(source).toContain(`${helper}("github")`);
        expect(source).toContain("<Button");
        expect(source).not.toMatch(/<(?:button|input|select)\b/);
      }

      expect(modular.desktopRouteSignInContent(true, true, mode)).toContain(
        "identityClient.signInWithEmail",
      );
      expect(modular.desktopRouteSignUpContent(true, mode, true)).toContain(
        "identityClient.signUpWithEmail",
      );
      expect(modular.desktopRouteSignInContent(true, true, mode)).toContain(
        'requiresTwoFactor(res.data) ? "/2fa" : "/dashboard"',
      );
    }
  });
});
