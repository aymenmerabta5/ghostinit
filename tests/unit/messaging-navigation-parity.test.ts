import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Mode = "monorepo" | "single";
type Target = "web" | "mobile" | "desktop";
type WebFramework = "nextjs" | "tanstack-start";

function resolveMessagingProject(
  mode: Mode,
  target: Target,
  messaging: boolean,
  framework: WebFramework = "nextjs",
) {
  const isSingleNative = mode === "single" && target !== "web";
  return resolveCreateConfig({
    name: `messaging-navigation-${mode}-${target}`,
    runtime: "bun",
    mode,
    framework,
    database: isSingleNative ? "none" : "postgres",
    databaseWasExplicit: !isSingleNative,
    apps: mode === "monorepo" && target !== "web" ? ["web", target] : [target],
    preset: isSingleNative && !messaging ? "frontend" : "custom",
    cache: "none",
    deploy: "none",
    billing: [],
    features: [],
    withAuth: !isSingleNative,
    withApi: !isSingleNative,
    withAnalytics: isSingleNative && !messaging,
    withI18n: true,
    withMessaging: messaging,
  });
}

function generated(mode: Mode, target: Target, messaging: boolean, framework?: WebFramework) {
  const result = resolveMessagingProject(mode, target, messaging, framework);
  if (!result.ok) throw new Error(result.message);
  return generateProjectFiles(result.config, { dryRun: true });
}

function source(files: ReturnType<typeof generated>, path: string): string {
  const file = files.find((entry) => entry.path === path);
  expect(file, path).toBeDefined();
  return file?.content ?? "";
}

function expectParses(content: string, path: string): void {
  expect(parseFile(content, ".tsx").diagnostics, path).toEqual([]);
}

describe("messaging navigation discoverability", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} workspace navigation links to the emitted messages route only when enabled`, () => {
        const root = mode === "monorepo" ? "apps/web/" : "";
        const headerPath = `${root}src/components/workspace-navigation.tsx`;
        const userMenuPath = `${root}src/components/header-user-menu.tsx`;
        const routePath =
          framework === "nextjs"
            ? `${root}src/app/(app)/messages/page.tsx`
            : `${root}src/routes/messages.tsx`;
        const on = generated(mode, "web", true, framework);
        const off = generated(mode, "web", false, framework);
        const header = source(on, headerPath);
        const userMenu = source(on, userMenuPath);
        const linkAttribute = framework === "nextjs" ? "href={path}" : "to={path}";
        const menuNavigation =
          framework === "nextjs"
            ? 'router.push("/messages")'
            : 'router.navigate({ to: "/messages" })';

        expect(header).toContain(linkAttribute);
        expect(header).toContain('path: "/messages", label: "messages"');
        expect(header).toContain("{t(label)}");
        expect(userMenu).toContain(menuNavigation);
        expect(userMenu).toContain('t("messages")');
        expect(on.some(({ path }) => path === routePath)).toBe(true);
        expect(off.find(({ path }) => path === headerPath)?.content ?? "").not.toContain(
          'path: "/messages"',
        );
        expect(off.some(({ path }) => path === routePath)).toBe(false);
        expect(off.find(({ path }) => path === userMenuPath)?.content ?? "").not.toContain(
          menuNavigation,
        );
        expectParses(header, headerPath);
        expectParses(userMenu, userMenuPath);
        expectParses(source(on, routePath), routePath);
      });
    }
  }

  test("monorepo/Expo dashboard links to its typed messages screen only when enabled", () => {
    const root = "apps/mobile/";
    const dashboardPath = `${root}app/dashboard.tsx`;
    const routePath = `${root}app/(app)/messages.tsx`;
    const on = generated("monorepo", "mobile", true);
    const off = generated("monorepo", "mobile", false);
    const dashboard = source(on, dashboardPath);

    expect(dashboard).toContain('<Link href="/(app)/messages"');
    expect(on.some(({ path }) => path === routePath)).toBe(true);
    expect(off.find(({ path }) => path === dashboardPath)?.content ?? "").not.toContain(
      'href="/(app)/messages"',
    );
    expect(off.some(({ path }) => path === routePath)).toBe(false);
    expectParses(dashboard, dashboardPath);
    expectParses(source(on, routePath), routePath);
  });

  test("monorepo/Electron header links to its typed messages route only when enabled", () => {
    const root = "apps/desktop/";
    const headerPath = `${root}src/renderer/routes/__root.tsx`;
    const routePath = `${root}src/renderer/routes/messages.tsx`;
    const on = generated("monorepo", "desktop", true);
    const off = generated("monorepo", "desktop", false);
    const header = source(on, headerPath);

    expect(header).toContain('<Link to="/messages"');
    expect(header).toContain('t("messages")');
    expect(on.some(({ path }) => path === routePath)).toBe(true);
    expect(off.find(({ path }) => path === headerPath)?.content ?? "").not.toContain(
      'to="/messages"',
    );
    expect(off.some(({ path }) => path === routePath)).toBe(false);
    expectParses(header, headerPath);
    expectParses(source(on, routePath), routePath);
  });

  test("single native messaging is rejected and frontend-only shells stay reachable", () => {
    for (const target of ["mobile", "desktop"] as const) {
      const unsupported = resolveMessagingProject("single", target, true);
      expect(unsupported.ok, target).toBe(false);
      if (unsupported.ok) throw new Error(`single ${target} messaging must remain unreachable`);
      expect(unsupported.reason).toBe("single-native-server-capabilities-unsupported");
      expect(unsupported.unsupportedSelections).toEqual(
        expect.arrayContaining(["auth", "api", "messaging", "storage"]),
      );

      const frontend = generated("single", target, false);
      const basePath = target === "mobile" ? "app/index.tsx" : "src/renderer/routes/index.tsx";
      expect(frontend.some(({ path }) => path === basePath)).toBe(true);
      expect(
        frontend.some(({ path }) =>
          target === "mobile"
            ? path === "app/(app)/messages.tsx"
            : path === "src/renderer/routes/messages.tsx",
        ),
      ).toBe(false);
      expect(frontend.map(({ content }) => content).join("\n")).not.toMatch(
        /(?:href|to)=["'][^"']*messages["']/,
      );
    }
  });

  test("English, French, and Arabic expose navigation and header labels", () => {
    expect(EN_MESSAGES.navigation.messages).toBe("Messages");
    expect(FR_MESSAGES.navigation.messages).toBe("Messages");
    expect(AR_MESSAGES.navigation.messages).toBe("الرسائل");
    expect(EN_MESSAGES.header.messages).toBe("Messages");
    expect(FR_MESSAGES.header.messages).toBe("Messages");
    expect(AR_MESSAGES.header.messages).toBe("الرسائل");
  });
});
