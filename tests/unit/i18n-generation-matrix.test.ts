import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

function generate(mode: Mode, framework: Framework, i18n: boolean): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "i18n-matrix",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework,
      database: "postgres",
      billing: [],
      features: [],
      apps: ["web"],
      preset: "custom",
      auth: true,
      api: true,
      email: false,
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

function manifestPath(mode: Mode): string {
  return mode === "monorepo" ? "apps/web/package.json" : "package.json";
}

function nextConfigPath(mode: Mode): string {
  return mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
}

function messagePath(mode: Mode, framework: Framework, locale: string): string {
  if (framework === "tanstack-start") {
    return `${sourceRoot(mode)}/i18n/messages/${locale}.json`;
  }
  return mode === "monorepo" ? `apps/web/messages/${locale}.json` : `src/messages/${locale}.json`;
}

function read(files: readonly TemplateFile[], path: string): string {
  return files.find((entry) => entry.path === path)?.content ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function leafMessages(value: unknown, prefix = ""): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof child === "string"
        ? [[path, child] as const]
        : Object.entries(leafMessages(child, path));
    }),
  );
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
    .map((match) => match[1] ?? "")
    .sort();
}

function unmatchedPlaceholderBraces(message: string): string {
  return message.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "").replace(/[^{}]/g, "");
}

const modes = ["monorepo", "single"] as const;
const frameworks = ["nextjs", "tanstack-start"] as const;
const states = [false, true] as const;
const representativeLocalizedKeys = [
  "common.retry",
  "navigation.dashboard",
  "header.userMenu",
  "theme.toggle",
  "auth.signIn.title",
  "dashboard.title",
  "recovery.forgotPassword.title",
  "localeSwitcher.label",
  "marketing.hero.title",
  "settings.title",
  "errors.notFound.title",
  "metadata.marketingTitle",
  "adminUsers.list.title",
] as const;
const nextIntlImport = /(?:from\s+|import\(|require\()\s*["']next-intl(?:\/[^"']*)?["']/;
const tanstackRuntimeImport = /(?:from\s+|import\(|require\()\s*["']@\/lib\/i18n(?:\.server)?["']/;

describe("generated i18n runtime matrix", () => {
  for (const mode of modes) {
    for (const framework of frameworks) {
      for (const enabled of states) {
        test(`${mode}/${framework}/i18n=${enabled}`, () => {
          const files = generate(mode, framework, enabled);
          const root = sourceRoot(mode);
          const paths = new Set(files.map(({ path }) => path));
          const manifest = JSON.parse(read(files, manifestPath(mode))) as {
            dependencies?: Record<string, string>;
          };
          const adapter = read(files, `${root}/features/admin-users/translations.ts`);
          const surfaceAdapter = read(files, `${root}/lib/translations.ts`);
          const header = [
            read(files, `${root}/components/header.tsx`),
            read(files, `${root}/components/header-actions.tsx`),
            read(files, `${root}/components/header-user-menu.tsx`),
          ].join("\n");
          const switcherPath = `${root}/components/locale-switcher.tsx`;
          const switcher = read(files, switcherPath);

          expect(adapter).not.toBe("");
          expect(surfaceAdapter).toContain("useSurfaceTranslations");
          expect(header).toContain('from "@/lib/translations"');
          expect(header).toContain('useSurfaceTranslations("header")');
          expect(paths.has(`${root}/i18n/config.ts`)).toBe(enabled);
          expect(paths.has(switcherPath)).toBe(enabled);
          for (const locale of ["en", "fr", "ar"]) {
            expect(paths.has(messagePath(mode, framework, locale))).toBe(enabled);
          }

          if (!enabled) {
            expect(adapter).toContain("ENGLISH_ADMIN_USERS_MESSAGES");
            expect(adapter).not.toContain('from "next-intl"');
            expect(adapter).not.toContain('from "@/lib/i18n"');
            expect(surfaceAdapter).not.toMatch(nextIntlImport);
            expect(surfaceAdapter).not.toMatch(tanstackRuntimeImport);
            expect(header).not.toContain("<LocaleSwitcher");
            const maintainedSource = files
              .filter(({ path }) => path.endsWith(".ts") || path.endsWith(".tsx"))
              .map(({ content }) => content)
              .join("\n");
            expect(maintainedSource).not.toMatch(nextIntlImport);
            expect(maintainedSource).not.toMatch(tanstackRuntimeImport);
          } else {
            const catalogs = ["en", "fr", "ar"].map((locale) =>
              leafMessages(JSON.parse(read(files, messagePath(mode, framework, locale)))),
            );
            const englishCatalog = catalogs[0] ?? {};
            const englishKeys = Object.keys(englishCatalog).sort();
            for (const localizedCatalog of catalogs.slice(1)) {
              expect(Object.keys(localizedCatalog).sort()).toEqual(englishKeys);
              for (const key of englishKeys) {
                expect(unmatchedPlaceholderBraces(englishCatalog[key] ?? "")).toBe("");
                expect(unmatchedPlaceholderBraces(localizedCatalog[key] ?? "")).toBe("");
                expect(placeholders(localizedCatalog[key] ?? "")).toEqual(
                  placeholders(englishCatalog[key] ?? ""),
                );
              }
              for (const key of representativeLocalizedKeys) {
                expect(localizedCatalog[key]).not.toBe(englishCatalog[key]);
              }
            }
            const adminKeys = englishKeys.filter((key) => key.startsWith("adminUsers."));
            expect(adminKeys.length).toBeGreaterThan(50);
            for (const key of adminKeys.map((key) => key.slice("adminUsers.".length))) {
              expect(adapter).toContain(JSON.stringify(key));
            }
            const english = JSON.parse(read(files, messagePath(mode, framework, "en"))) as {
              adminUsers: {
                counts: { accountOne: string; accountMany: string };
                dialogs: {
                  roleDescription: string;
                  restoreDescription: string;
                  suspendDescription: string;
                };
              };
            };
            expect(english.adminUsers.counts.accountOne).toContain("{count}");
            expect(english.adminUsers.counts.accountMany).toContain("{count}");
            for (const key of [
              "roleDescription",
              "restoreDescription",
              "suspendDescription",
            ] as const) {
              expect(english.adminUsers.dialogs[key]).toContain("{email}");
              expect(english.adminUsers.dialogs[key]).toContain("{role}");
            }

            expect(header).toContain("<LocaleSwitcher");
            expect(header).toContain('className="w-20 shrink-0 sm:w-32"');
            expect(header).not.toContain('<LocaleSwitcher className="hidden');
            for (const key of [
              "dashboard",
              "settings",
              "admin",
              "users",
              "signIn",
              "signUp",
              "signOut",
            ]) {
              expect(header).toContain(`t(${JSON.stringify(key)})`);
            }
            expect(switcher).toContain("<Select");
            expect(switcher).toContain("<SelectGroup>");
            expect(switcher).not.toContain("<select");
            expect(switcher).not.toContain("<button");
          }

          const schema = read(files, `${root}/features/admin-users/schema.ts`);
          const presentation = [
            `${root}/features/admin-users/index.tsx`,
            `${root}/features/admin-users/components/create-user-form.tsx`,
            `${root}/features/admin-users/components/filters.tsx`,
            `${root}/features/admin-users/components/user-row.tsx`,
            `${root}/features/admin-users/components/user-row-confirmation.tsx`,
            `${root}/features/admin-users/components/user-results.tsx`,
            `${root}/features/admin-users/components/user-table.tsx`,
            framework === "nextjs"
              ? `${root}/app/admin/users/create/page.tsx`
              : `${root}/routes/admin.users.create.tsx`,
          ]
            .map((path) => read(files, path))
            .join("\n");
          expect(schema).toContain('translate("validation.searchTooLong")');
          expect(schema).toContain('translate("validation.emailInvalid")');
          expect(presentation).not.toContain("Users could not be loaded");
          expect(presentation).not.toContain("Grant administrator access?");
          expect(presentation).not.toContain("Create the identity");
          const row = [
            read(files, `${root}/features/admin-users/components/user-row.tsx`),
            read(files, `${root}/features/admin-users/components/user-row-confirmation.tsx`),
          ].join("\n");
          expect(row.match(/role:\s*translate\(/g)).toHaveLength(2);
          expect(row).toContain('"dialogs.restoreDescription"');
          expect(row).toContain('"dialogs.suspendDescription"');

          if (framework === "nextjs") {
            expect(Boolean(manifest.dependencies?.["next-intl"])).toBe(enabled);
            expect(paths.has(`${root}/lib/i18n.ts`)).toBe(false);
            expect(paths.has(`${root}/lib/i18n.server.ts`)).toBe(false);
            const nextConfig = read(files, nextConfigPath(mode));
            expect(nextConfig.includes("next-intl/plugin")).toBe(enabled);
            const layout = read(files, `${root}/app/layout.tsx`);
            expect(layout.includes("NextIntlClientProvider")).toBe(enabled);
            expect(layout.includes("getLocale")).toBe(enabled);
            expect(layout.includes("getMessages")).toBe(enabled);
            const proxy = read(files, `${root}/proxy.ts`);
            expect(proxy).toContain('new URL("/sign-in", request.url)');
            expect(proxy).not.toContain("next-intl/middleware");
            expect(proxy).not.toContain("[locale]");
            const maintainedSource = files
              .filter(({ path }) => path.endsWith(".ts") || path.endsWith(".tsx"))
              .map(({ content }) => content)
              .join("\n");
            expect(maintainedSource).not.toMatch(tanstackRuntimeImport);
            if (enabled) {
              expect(adapter).toContain('from "next-intl"');
              expect(adapter).not.toContain('from "@/lib/i18n"');
              expect(surfaceAdapter).toContain('from "next-intl"');
              expect(header).not.toMatch(nextIntlImport);
              const request = read(files, `${root}/i18n/request.ts`);
              expect(request).toContain("localeCookieName");
              expect(request).toContain('get("accept-language")');
              expect(request.indexOf("cookieLocale")).toBeLessThan(
                request.indexOf("acceptedLocale"),
              );
              expect(read(files, `${root}/i18n/routing.ts`)).toContain('localePrefix: "never"');
              expect(switcher).toContain("document.cookie");
              expect(switcher).toContain("router.refresh()");
            }
          } else {
            expect(manifest.dependencies?.["next-intl"]).toBeUndefined();
            expect(paths.has(`${root}/i18n/routing.ts`)).toBe(false);
            expect(paths.has(`${root}/i18n/request.ts`)).toBe(false);
            expect(paths.has(`${root}/i18n/navigation.ts`)).toBe(false);
            expect(paths.has(`${root}/i18n.ts`)).toBe(false);
            const maintainedSource = files
              .filter(({ path }) => path.endsWith(".ts") || path.endsWith(".tsx"))
              .map(({ content }) => content)
              .join("\n");
            expect(maintainedSource).not.toContain("next-intl");
            expect(paths.has(`${root}/lib/i18n.ts`)).toBe(enabled);
            const providers = read(files, `${root}/components/providers.tsx`);
            expect((providers.match(/<I18nProvider\b/g) ?? []).length).toBe(enabled ? 1 : 0);
            if (enabled) {
              expect(adapter).toContain('from "@/lib/i18n"');
              expect(adapter).not.toContain('from "next-intl"');
              expect(surfaceAdapter).toContain('from "@/lib/i18n"');
              expect(header).not.toMatch(tanstackRuntimeImport);
              const runtime = read(files, `${root}/lib/i18n.ts`);
              expect(runtime).toContain("document.documentElement.lang = locale");
              expect(runtime).toContain("document.documentElement.dir = localeDirection[locale]");
              expect(runtime).toContain("React.useState<Locale>(initialLocale)");
              expect(runtime).toContain("syncDocumentLocale(initialLocale)");
              expect(runtime).toContain("setLocaleStorage(nextLocale)");
              expect(runtime).not.toContain("setLocaleState(getStoredLocale()");
            }
          }
        });
      }
    }
  }
});
