import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectConfigSchema } from "../../src/lib/config.js";
import { platformI18nModelContent } from "../../src/templates/apps/fragments/platform-i18n.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";
type Surface =
  | "auth"
  | "dashboard"
  | "errors"
  | "marketing"
  | "recovery"
  | "settings"
  | "workspace";

function generate(mode: Mode, framework: Framework, i18n: boolean, auth = true): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "i18n-surfaces",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework,
      database: "postgres",
      billing: [],
      features: [],
      apps: ["web"],
      preset: "custom",
      auth,
      api: auth,
      email: auth,
      analytics: false,
      eve: false,
      i18n,
    }),
    { dryRun: false, validate: true },
  );
}

function sourceRoot(mode: Mode): string {
  return mode === "monorepo" ? "apps/web/src" : "src";
}

function read(files: readonly TemplateFile[], path: string): string {
  return files.find((entry) => entry.path === path)?.content ?? "";
}

function surfacePaths(mode: Mode, framework: Framework, surface: Surface): string[] {
  const root = sourceRoot(mode);
  const next = framework === "nextjs";
  const marketingComponents =
    mode === "single"
      ? [
          `${root}/components/marketing/hero.tsx`,
          `${root}/components/marketing/features.tsx`,
          `${root}/components/marketing/closing.tsx`,
        ]
      : [
          `${root}/components/marketing/hero.tsx`,
          `${root}/components/marketing/features.tsx`,
          `${root}/components/marketing/quick-start.tsx`,
          `${root}/components/marketing/footer.tsx`,
        ];
  const paths: Record<Surface, string[]> = next
    ? {
        marketing: [`${root}/app/page.tsx`, ...marketingComponents],
        auth: [
          `${root}/app/sign-in/page.tsx`,
          `${root}/app/sign-in/page.client.tsx`,
          `${root}/app/sign-up/page.tsx`,
          `${root}/app/sign-up/page.client.tsx`,
          `${root}/components/auth/sign-in-form.tsx`,
          `${root}/components/auth/sign-up-form.tsx`,
          `${root}/app/2fa/page.tsx`,
          `${root}/app/2fa/page.client.tsx`,
          `${root}/components/auth/two-factor-form.tsx`,
        ],
        recovery: [
          `${root}/app/forgot-password/page.tsx`,
          `${root}/app/forgot-password/page.client.tsx`,
          `${root}/app/reset-password/page.tsx`,
          `${root}/app/reset-password/page.client.tsx`,
          `${root}/components/auth/reset-password-form.tsx`,
        ],
        dashboard:
          mode === "monorepo"
            ? [
                `${root}/app/dashboard/page.tsx`,
                `${root}/features/dashboard/components/dashboard-header.tsx`,
                `${root}/features/dashboard/components/architecture-card.tsx`,
                `${root}/features/dashboard/components/checks-card.tsx`,
                `${root}/features/dashboard/components/identity-card.tsx`,
                `${root}/features/dashboard/components/actions-card.tsx`,
                `${root}/features/dashboard/components/modules-card.tsx`,
              ]
            : [
                `${root}/app/dashboard/page.tsx`,
                `${root}/features/dashboard/dashboard-overview.tsx`,
                `${root}/features/dashboard/components/identity-card.tsx`,
                `${root}/features/dashboard/components/quick-actions.tsx`,
              ],
        settings: [
          `${root}/app/settings/page.tsx`,
          `${root}/app/settings/components/profile-card.tsx`,
          `${root}/app/settings/components/password-card.tsx`,
          `${root}/app/settings/components/two-factor-card.tsx`,
          `${root}/app/settings/components/sessions-card.tsx`,
          `${root}/app/settings/components/danger-zone-card.tsx`,
        ],
        workspace: [
          `${root}/app/settings/workspace/page.tsx`,
          `${root}/features/identity-workspace/identity-workspace.tsx`,
          `${root}/features/identity-workspace/controller.ts`,
          `${root}/features/identity-workspace/components/organizations-card.tsx`,
          `${root}/features/identity-workspace/components/members-card.tsx`,
          `${root}/features/identity-workspace/components/teams-card.tsx`,
          `${root}/features/identity-workspace/components/invitations-card.tsx`,
          `${root}/features/identity-workspace/components/invitation-row.tsx`,
        ],
        errors: [
          `${root}/features/system/not-found.tsx`,
          `${root}/features/system/route-fallbacks.tsx`,
          `${root}/features/system/unexpected-error.tsx`,
          `${root}/features/system/global-error.tsx`,
          `${root}/features/system/unauthorized.tsx`,
          `${root}/features/system/forbidden.tsx`,
          `${root}/app/error.tsx`,
          `${root}/app/global-error.tsx`,
          `${root}/app/not-found.tsx`,
          `${root}/app/unauthorized.tsx`,
          `${root}/app/forbidden.tsx`,
          `${root}/app/maintenance/page.tsx`,
        ],
      }
    : {
        marketing: [`${root}/routes/index.tsx`, ...marketingComponents],
        auth: [
          `${root}/routes/sign-in.tsx`,
          `${root}/routes/sign-up.tsx`,
          `${root}/components/auth/sign-in-form.tsx`,
          `${root}/components/auth/sign-up-form.tsx`,
          `${root}/routes/2fa.tsx`,
          `${root}/components/auth/two-factor-form.tsx`,
        ],
        recovery: [
          `${root}/routes/forgot-password.tsx`,
          `${root}/routes/reset-password.tsx`,
          `${root}/components/auth/reset-password-form.tsx`,
        ],
        dashboard:
          mode === "single"
            ? [
                `${root}/routes/dashboard.tsx`,
                `${root}/features/dashboard/dashboard-overview.tsx`,
                `${root}/features/dashboard/components/identity-card.tsx`,
                `${root}/features/dashboard/components/quick-actions.tsx`,
              ]
            : [
                `${root}/routes/dashboard.tsx`,
                `${root}/features/dashboard/components/dashboard-header.tsx`,
                `${root}/features/dashboard/components/architecture-card.tsx`,
                `${root}/features/dashboard/components/checks-card.tsx`,
                `${root}/features/dashboard/components/identity-card.tsx`,
                `${root}/features/dashboard/components/actions-card.tsx`,
                `${root}/features/dashboard/components/modules-card.tsx`,
              ],
        settings: [`${root}/routes/settings.tsx`],
        workspace: [
          `${root}/routes/settings.workspace.tsx`,
          `${root}/features/identity-workspace/identity-workspace.tsx`,
          `${root}/features/identity-workspace/controller.ts`,
          `${root}/features/identity-workspace/components/organizations-card.tsx`,
          `${root}/features/identity-workspace/components/members-card.tsx`,
          `${root}/features/identity-workspace/components/teams-card.tsx`,
          `${root}/features/identity-workspace/components/invitations-card.tsx`,
          `${root}/features/identity-workspace/components/invitation-row.tsx`,
        ],
        errors: [
          `${root}/features/system/not-found.tsx`,
          `${root}/features/system/route-fallbacks.tsx`,
          `${root}/features/system/unexpected-error.tsx`,
          `${root}/features/system/global-error.tsx`,
          `${root}/features/system/unauthorized.tsx`,
          `${root}/features/system/forbidden.tsx`,
          `${root}/routes/$notFound.tsx`,
          `${root}/routes/unauthorized.tsx`,
          `${root}/routes/forbidden.tsx`,
        ],
      };
  return paths[surface];
}

function surfaceSource(
  files: readonly TemplateFile[],
  mode: Mode,
  framework: Framework,
  surface: Surface,
): string {
  const featureRoots: Record<Surface, string[]> = {
    marketing: ["marketing"],
    auth: ["auth"],
    recovery: ["auth", "recovery"],
    dashboard: ["dashboard"],
    settings: ["settings", "account-deletion"],
    workspace: ["identity-workspace"],
    errors: ["system"],
  };
  const root = sourceRoot(mode);
  const paths = new Set(surfacePaths(mode, framework, surface));
  for (const { path } of files) {
    if (featureRoots[surface].some((feature) => path.startsWith(`${root}/features/${feature}/`)))
      paths.add(path);
  }
  return [...paths]
    .map((path) => read(files, path))
    .filter(Boolean)
    .join("\n");
}

function translatedValueUses(source: string, surface: Surface): number {
  const hasNamespace = new RegExp(`(?:use|get)SurfaceTranslations\\(\\s*["']${surface}["']`).test(
    source,
  );
  if (!hasNamespace) return 0;
  return source.match(/\b(?:t|[A-Za-z_][A-Za-z0-9_]*T)\(\s*["']/g)?.length ?? 0;
}

const modes = ["monorepo", "single"] as const;
const frameworks = ["nextjs", "tanstack-start"] as const;
const surfaces = [
  "marketing",
  "auth",
  "recovery",
  "dashboard",
  "settings",
  "workspace",
  "errors",
] as const;
const hardcodedEnglish: Readonly<Record<Surface, RegExp>> = {
  marketing: />\s*Start building\s*</,
  auth: />\s*(?:Sign in|Create account|Two-factor authentication)\s*</,
  recovery: />\s*(?:Forgot password|Reset password)\s*</,
  dashboard: />\s*Dashboard\s*</,
  settings: />\s*(?:Settings|Danger zone)\s*</,
  workspace:
    />\s*(?:Organizations and teams|No organizations yet|Create organization|Use this organization)\s*</,
  errors:
    />\s*(?:Page not found|Something went wrong|An unexpected error occurred\. You can try again\.)\s*</,
};
const runtimeImport =
  /(?:from\s+|import\(|require\()\s*["'](?:next-intl(?:\/[^"']*)?|@\/lib\/i18n(?:\.server)?)["']/;

describe("generated surface translation boundary", () => {
  test("web and platform translation types accept leaves and reject object keys", () => {
    const webSource = read(generate("single", "nextjs", true), "src/lib/translations.ts");
    const webTypes = webSource.match(
      /export interface SurfaceMessageKeys \{[\s\S]*?export type SurfaceTranslate<[\s\S]*?\) => string;\n/,
    )?.[0];
    const platformTypes = platformI18nModelContent().match(
      /type TranslationPath<Value> = \{[\s\S]*?\}\[keyof Value & string\];/,
    )?.[0];
    expect(webTypes).toBeDefined();
    expect(platformTypes).toBeDefined();

    const temporaryBase = join(process.cwd(), "Temp");
    mkdirSync(temporaryBase, { recursive: true });
    const temporaryRoot = mkdtempSync(join(temporaryBase, "i18n-leaf-types-"));
    try {
      writeFileSync(
        join(temporaryRoot, "probe.ts"),
        `${webTypes}
declare const webTranslate: SurfaceTranslate<"workspace">;
webTranslate("operationError");
webTranslate("roles.owner");
// @ts-expect-error object-valued keys are not translatable leaves
webTranslate("roles");

const platformMessages = {
  operationError: "failed",
  roles: { owner: "owner" },
} as const;
${platformTypes}
type PlatformWorkspaceKey = TranslationPath<typeof platformMessages>;
const directLeaf: PlatformWorkspaceKey = "operationError";
const nestedLeaf: PlatformWorkspaceKey = "roles.owner";
// @ts-expect-error object-valued keys are not translatable leaves
const intermediateObject: PlatformWorkspaceKey = "roles";
void [directLeaf, nestedLeaf, intermediateObject];
`,
      );
      writeFileSync(
        join(temporaryRoot, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            module: "ESNext",
            noEmit: true,
            skipLibCheck: true,
            strict: true,
            target: "ES2024",
          },
          include: ["probe.ts"],
        }),
      );
      const result = spawnSync(
        process.execPath,
        ["x", "--no-install", "tsc", "-p", join(temporaryRoot, "tsconfig.json")],
        { cwd: process.cwd(), encoding: "utf8", timeout: 60_000, windowsHide: true },
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  test("keeps every workspace catalog leaf meaningful and in EN/FR/AR key parity", () => {
    const flatten = (value: object, prefix = ""): Array<[string, string]> =>
      Object.entries(value).flatMap(([key, entry]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return typeof entry === "string" ? [[path, entry]] : flatten(entry, path);
      });
    const catalogs = [EN_MESSAGES.workspace, FR_MESSAGES.workspace, AR_MESSAGES.workspace].map(
      (catalog) => flatten(catalog),
    );
    const englishKeys = catalogs[0]?.map(([key]) => key) ?? [];

    for (const catalog of catalogs) {
      expect(catalog.map(([key]) => key)).toEqual(englishKeys);
      expect(catalog.filter(([, message]) => message.trim().length === 0)).toEqual([]);
    }
  });

  for (const mode of modes) {
    for (const framework of frameworks) {
      for (const enabled of [false, true] as const) {
        test(`${mode}/${framework}/i18n=${enabled}`, () => {
          const files = generate(mode, framework, enabled);
          const root = sourceRoot(mode);
          const clientAdapter = read(files, `${root}/lib/translations.ts`);
          const serverAdapter = read(files, `${root}/lib/translations.server.ts`);

          expect(clientAdapter).toContain("useSurfaceTranslations");
          expect(serverAdapter).toContain("getSurfaceTranslations");
          for (const surface of surfaces) {
            const source = surfaceSource(files, mode, framework, surface);
            expect(source).not.toBe("");
            expect(source).toContain("@/lib/translations");
            expect(source).toMatch(
              new RegExp(`(?:use|get)SurfaceTranslations\\(\\s*["']${surface}["']`),
            );
            expect(translatedValueUses(source, surface)).toBeGreaterThan(1);
            expect(source).not.toMatch(hardcodedEnglish[surface]);
            expect(source).not.toMatch(runtimeImport);
          }
          expect(surfaceSource(files, mode, framework, "workspace")).toContain(
            enabled
              ? "Workspace copy follows the active runtime locale."
              : "Workspace copy resolves from the English-only fallback catalog.",
          );
          expect(surfaceSource(files, mode, framework, "workspace")).not.toContain("cause.message");

          if (!enabled) {
            expect(clientAdapter).not.toMatch(runtimeImport);
            expect(serverAdapter).not.toMatch(runtimeImport);
          } else if (framework === "nextjs") {
            expect(clientAdapter).toMatch(/from\s+["']next-intl["']/);
            expect(serverAdapter).toMatch(/from\s+["']next-intl\/server["']/);
            expect(clientAdapter).not.toContain('from "@/lib/i18n"');
          } else {
            expect(clientAdapter).toMatch(/from\s+["']@\/lib\/i18n["']/);
            expect(clientAdapter).not.toContain("next-intl");
            expect(serverAdapter).not.toContain("next-intl");
          }
        });
      }
    }
  }
});

describe("generated locale control reachability", () => {
  for (const mode of modes) {
    for (const framework of frameworks) {
      test(`${mode}/${framework}`, () => {
        const files = generate(mode, framework, true);
        const root = sourceRoot(mode);
        const shellPath =
          framework === "nextjs" ? `${root}/app/layout.tsx` : `${root}/routes/__root.tsx`;
        const shell = read(files, shellPath);
        const header = [
          read(files, `${root}/components/header.tsx`),
          read(files, `${root}/components/header-actions.tsx`),
          read(files, `${root}/components/workspace-navigation.tsx`),
          read(files, `${root}/components/workspace-navigation-trigger.tsx`),
          read(files, `${root}/components/workspace-identity-status.tsx`),
        ].join("\n");
        const appShell = read(files, `${root}/features/app-shell/app-shell.tsx`);
        expect(read(files, `${root}/components/app-shell.tsx`)).toContain(
          'export { AppShell } from "@/features/app-shell/app-shell"',
        );
        const marketing = surfaceSource(files, mode, framework, "marketing");

        expect(shell).toMatch(
          /import\s+\{\s*AppShell\s*\}\s+from\s+["'][^"']*components\/app-shell(?:\.js)?["']/,
        );
        expect(shell.match(/<AppShell\b/g) ?? []).toHaveLength(1);
        expect(appShell.match(/<Header\b/g) ?? []).toHaveLength(1);
        expect(header).toMatch(/import\s+\{\s*LocaleSwitcher\s*\}/);
        expect(header).toMatch(/<LocaleSwitcher\b/);
        expect(marketing.match(/<header\b/g) ?? []).toHaveLength(0);
        const providerName = framework === "nextjs" ? "NextIntlClientProvider" : "AppProviders";
        const providerOpen = shell.indexOf(`<${providerName}`);
        const headerUse = shell.indexOf("<AppShell");
        const providerClose = shell.indexOf(`</${providerName}>`);
        expect(providerOpen).toBeGreaterThanOrEqual(0);
        expect(headerUse).toBeGreaterThan(providerOpen);
        expect(providerClose).toBeGreaterThan(headerUse);

        const noAuthFiles = generate(mode, framework, true, false);
        const noAuthPaths = new Set(noAuthFiles.map(({ path }) => path));
        const noAuthShell = read(noAuthFiles, shellPath);
        const noAuthHeader = read(noAuthFiles, `${root}/components/header.tsx`);
        expect(noAuthShell).toMatch(/<AppShell\b/);
        expect(read(noAuthFiles, `${root}/components/app-shell.tsx`)).toMatch(/<Header\b/);
        expect(noAuthHeader).toMatch(/<LocaleSwitcher\b/);
        expect(noAuthHeader).not.toContain("useAuth");
        expect(noAuthHeader).not.toContain("authClient");
        expect(
          noAuthPaths.has(
            framework === "nextjs"
              ? `${root}/app/settings/page.tsx`
              : `${root}/routes/settings.tsx`,
          ),
        ).toBe(false);
        expect(
          noAuthPaths.has(
            framework === "nextjs" ? `${root}/app/sign-in/page.tsx` : `${root}/routes/sign-in.tsx`,
          ),
        ).toBe(false);
      });
    }
  }
});

describe("TanStack Start request locale handoff", () => {
  for (const mode of modes) {
    test(mode, () => {
      const files = generate(mode, "tanstack-start", true);
      const root = sourceRoot(mode);
      const route = read(files, `${root}/routes/__root.tsx`);
      const providers = read(files, `${root}/components/providers.tsx`);
      const serverRuntime = read(files, `${root}/lib/i18n.server.ts`);

      expect(route).toContain("createServerFn");
      expect(route).toContain("getRequestHeaders");
      expect(route).toContain("getLocaleFromHeaders");
      expect(route).toContain("const headers = new Headers()");
      expect(route).toContain(
        "getRequestHeaders().forEach((value, key) => headers.set(key, value))",
      );
      expect(route).toContain("getLocaleFromHeaders(headers)");
      expect(route).not.toContain("getRequestHeaders() as unknown as Headers");
      expect(route).toMatch(
        /loader:\s*(?:async\s*)?\([^)]*\)\s*=>\s*(?:await\s+)?[A-Za-z][A-Za-z0-9_]*\(\)/,
      );
      expect(route).toContain("const locale = Route.useLoaderData()");
      expect(route).toMatch(/<RootDocument\s+locale=\{locale\}>/);
      expect(route).toMatch(/<html\s+lang=\{locale\}\s+dir=\{localeDirection\[locale\]\}/);
      expect(route).toMatch(/<AppProviders\b[^>]*initialLocale=\{locale\}/);
      expect(providers).toMatch(/initialLocale\??:\s*Locale/);
      expect(providers.match(/<I18nProvider\b/g)).toHaveLength(1);
      expect(providers).toMatch(/<I18nProvider\s+initialLocale=\{initialLocale\}>/);

      const preferenceExpression = serverRuntime.slice(
        serverRuntime.indexOf("export function getLocaleFromHeaders"),
      );
      const cookiePreference = preferenceExpression.indexOf("localeFromCookieHeader");
      const headerPreference = preferenceExpression.indexOf("localeFromAcceptLanguage");
      expect(cookiePreference).toBeGreaterThanOrEqual(0);
      expect(headerPreference).toBeGreaterThan(cookiePreference);
    });
  }
});
