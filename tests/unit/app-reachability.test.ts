import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { notificationClientFiles } from "../../src/templates/apps/capability-clients/notifications.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

function config(
  mode: Mode,
  framework: Framework,
  apps: ProjectConfig["apps"],
  enabled = true,
): ProjectConfig {
  return projectConfigSchema.parse({
    name: "app-reachability",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    apps,
    preset: "custom",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: enabled && framework === "nextjs",
    i18n: true,
    pdf: enabled,
    billing: [],
    features: enabled && framework === "nextjs" ? ["eve"] : [],
    messaging: enabled,
    storage: enabled,
    notifications: enabled,
    featureFlags: enabled ? "posthog" : "none",
    jobs: enabled,
    jobsUserFacingApi: enabled,
    cache: "none",
    deploy: "none",
  });
}

function generate(input: ProjectConfig) {
  return generateProjectFiles(input, { dryRun: true });
}

function read(files: ReturnType<typeof generate>, path: string): string {
  const entry = files.find((candidate) => candidate.path === path);
  expect(entry, path).toBeDefined();
  return entry?.content ?? "";
}

function routePath(root: string, framework: Framework, route: string): string {
  if (framework === "nextjs" && route === "messages") {
    return `${root}src/app/(app)/messages/page.tsx`;
  }
  return framework === "nextjs"
    ? `${root}src/app/${route}/page.tsx`
    : `${root}src/routes/${route}.tsx`;
}

describe("generated application reachability", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} emits authorization fallbacks only with authentication`, () => {
      const base = config("monorepo", framework, ["web"], false);
      const withAuth = generate(base);
      const withoutAuth = generate({ ...base, database: "none", auth: false, api: false });
      const directory = framework === "nextjs" ? "app" : "routes";
      for (const name of ["unauthorized", "forbidden"]) {
        const path = `apps/web/src/${directory}/${name}.tsx`;
        expect(withAuth.some((file) => file.path === path)).toBe(true);
        expect(withoutAuth.some((file) => file.path === path)).toBe(false);
      }
    });
  }
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} gates every web application destination`, () => {
        const root = mode === "monorepo" ? "apps/web/" : "";
        const enabled = generate(config(mode, framework, ["web"]));
        const disabled = generate(config(mode, framework, ["web"], false));
        const enabledNavigation = [
          read(enabled, `${root}src/components/workspace-navigation.tsx`),
          read(enabled, `${root}src/components/header-user-menu.tsx`),
        ].join("\n");
        const disabledNavigation = [
          read(disabled, `${root}src/components/workspace-navigation.tsx`),
          read(disabled, `${root}src/components/header-user-menu.tsx`),
        ].join("\n");

        for (const route of [
          "notifications",
          "storage",
          "feature-flags",
          "jobs",
          "messages",
          "pdf",
        ]) {
          expect(
            enabled.some(({ path }) => path === routePath(root, framework, route)),
            route,
          ).toBe(true);
          expect(enabledNavigation, route).toContain(`/${route}`);
          expect(
            disabled.some(({ path }) => path === routePath(root, framework, route)),
            route,
          ).toBe(false);
          expect(disabledNavigation, route).not.toContain(`/${route}`);
        }

        const agentPath = routePath(root, framework, "agent");
        expect(enabled.some(({ path }) => path === agentPath)).toBe(framework === "nextjs");
        expect(enabledNavigation.includes("/agent")).toBe(framework === "nextjs");
        expect(disabled.some(({ path }) => path === agentPath)).toBe(false);
        expect(disabledNavigation).not.toContain("/agent");
      });
    }
  }

  test("monorepo Expo and Electron expose only emitted capability routes", () => {
    const files = generate(config("monorepo", "nextjs", ["web", "mobile", "desktop"]));
    const off = generate(config("monorepo", "nextjs", ["web", "mobile", "desktop"], false));
    const dashboard = read(files, "apps/mobile/app/dashboard.tsx");
    const desktopRoot = read(files, "apps/desktop/src/renderer/routes/__root.tsx");
    const desktopTree = read(files, "apps/desktop/src/renderer/routeTree.gen.ts");

    for (const route of ["notifications", "storage", "feature-flags", "jobs", "pdf"]) {
      expect(
        files.some(({ path }) => path === `apps/mobile/app/${route}.tsx`),
        route,
      ).toBe(true);
      expect(dashboard, route).toContain(`href="/${route}"`);
      expect(
        files.some(({ path }) => path === `apps/desktop/src/renderer/routes/${route}.tsx`),
        route,
      ).toBe(true);
      expect(desktopRoot, route).toContain(`to="/${route}"`);
      const routeName = route
        .split("-")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join("");
      expect(desktopTree, route).toContain(`${routeName}Route`);
    }

    const offDashboard = read(off, "apps/mobile/app/dashboard.tsx");
    const offDesktopRoot = read(off, "apps/desktop/src/renderer/routes/__root.tsx");
    const offDesktopTree = read(off, "apps/desktop/src/renderer/routeTree.gen.ts");
    for (const route of ["notifications", "storage", "feature-flags", "jobs", "pdf"]) {
      expect(
        off.some(({ path }) => path === `apps/mobile/app/${route}.tsx`),
        route,
      ).toBe(false);
      expect(
        off.some(({ path }) => path === `apps/desktop/src/renderer/routes/${route}.tsx`),
        route,
      ).toBe(false);
      expect(offDashboard, route).not.toContain(`href="/${route}"`);
      expect(offDesktopRoot, route).not.toContain(`to="/${route}"`);
      expect(offDesktopTree, route).not.toContain(`path: "${route}"`);
    }
  });

  test("single native server-backed destinations stay unreachable without a host", () => {
    for (const app of ["mobile", "desktop"] as const) {
      const result = resolveCreateConfig({
        name: `single-${app}-reachability`,
        runtime: "bun",
        mode: "single",
        framework: "nextjs",
        billing: [],
        features: [],
        database: "none",
        databaseWasExplicit: true,
        apps: [app],
        preset: "custom",
        cache: "none",
        deploy: "none",
        withNotifications: true,
        withJobs: true,
      });
      expect(result.ok, app).toBe(false);
      if (result.ok) throw new Error(`single ${app} server capabilities must remain blocked`);
      expect(result.reason).toBe("single-native-server-capabilities-unsupported");
      expect(result.unsupportedSelections).toEqual(
        expect.arrayContaining(["auth", "api", "notifications", "jobs"]),
      );
    }
  });

  test("single native dormant branches omit Family C routes and navigation", () => {
    for (const app of ["mobile", "desktop"] as const) {
      const files = generate(config("single", "nextjs", [app]));
      const source = files.map(({ content }) => content).join("\n");
      for (const route of ["notifications", "storage", "feature-flags", "jobs"]) {
        const routePath =
          app === "mobile" ? `app/${route}.tsx` : `src/renderer/routes/${route}.tsx`;
        expect(
          files.some(({ path }) => path === routePath),
          `${app}/${route}`,
        ).toBe(false);
        expect(source, `${app}/${route}`).not.toContain(`href="/${route}"`);
        expect(source, `${app}/${route}`).not.toContain(`to="/${route}"`);
      }
      if (app === "mobile") {
        expect(files.some(({ path }) => path === "src/hooks/use-push.ts")).toBe(false);
      } else {
        expect(read(files, "src/renderer/routeTree.gen.ts")).not.toMatch(
          /NotificationsRoute|StorageRoute|FeatureFlagsRoute|JobsRoute/,
        );
      }
    }
  });

  test("internal-only jobs preserve workers without exposing an application destination", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const input = config(mode, framework, ["web"]);
        const files = generate(projectConfigSchema.parse({ ...input, jobsUserFacingApi: false }));
        const root = mode === "monorepo" ? "apps/web/" : "";
        const navigation = [
          read(files, `${root}src/components/workspace-navigation.tsx`),
          read(files, `${root}src/components/header-user-menu.tsx`),
        ].join("\n");
        const servicePath =
          mode === "monorepo"
            ? "packages/services/src/jobs/index.ts"
            : "src/server/services/jobs/index.ts";
        const apiPath =
          mode === "monorepo" ? "packages/api/src/jobs/index.ts" : "src/server/api/jobs/index.ts";

        expect(
          files.some(({ path }) => path === servicePath),
          `${mode} worker`,
        ).toBe(true);
        expect(
          files.some(({ path }) => path === apiPath),
          `${mode} API`,
        ).toBe(false);
        expect(
          files.some(({ path }) => path === routePath(root, framework, "jobs")),
          `${mode}/${framework} route`,
        ).toBe(false);
        expect(navigation, `${mode}/${framework} navigation`).not.toContain("/jobs");
      }

      if (mode === "single") continue;
      const mobile = generate(
        projectConfigSchema.parse({
          ...config(mode, "nextjs", ["mobile"]),
          jobsUserFacingApi: false,
        }),
      );
      const desktop = generate(
        projectConfigSchema.parse({
          ...config(mode, "nextjs", ["desktop"]),
          jobsUserFacingApi: false,
        }),
      );
      const mobileRoot = mode === "monorepo" ? "apps/mobile/" : "";
      const desktopRoot = mode === "monorepo" ? "apps/desktop/" : "";
      expect(mobile.some(({ path }) => path === `${mobileRoot}app/jobs.tsx`)).toBe(false);
      expect(read(mobile, `${mobileRoot}app/dashboard.tsx`)).not.toContain('href="/jobs"');
      expect(
        desktop.some(({ path }) => path === `${desktopRoot}src/renderer/routes/jobs.tsx`),
      ).toBe(false);
      expect(read(desktop, `${desktopRoot}src/renderer/routes/__root.tsx`)).not.toContain(
        'to="/jobs"',
      );
      expect(read(desktop, `${desktopRoot}src/renderer/routeTree.gen.ts`)).not.toContain(
        "JobsRoute",
      );
    }
  });

  test("notification destinations are allowlisted before inbox, bell, and push navigation", async () => {
    const files = generate(config("monorepo", "nextjs", ["web", "mobile", "desktop"]));
    const off = generate(config("monorepo", "nextjs", ["web", "mobile", "desktop"], false));
    const navigation = read(files, "apps/web/src/lib/notifications.ts");
    const transpiled = new Bun.Transpiler({ loader: "ts" }).transformSync(navigation);
    const module = (await import(
      `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
    )) as {
      getNotificationHref(type: string, payload: unknown): { href: string } | null;
      resolveNotificationDestination(value: unknown): string | null;
    };

    for (const destination of ["/", "/notifications", "/dashboard", "/settings"]) {
      expect(module.resolveNotificationDestination(destination)).toBe(destination);
    }
    expect(module.resolveNotificationDestination("/notifications/")).toBe("/notifications");
    for (const rejected of [
      "https://evil.example/notifications",
      "//evil.example/notifications",
      "javascript:alert(1)",
      "/notifications?next=https://evil.example",
      "/notifications#unsafe",
      "/unknown",
      "/storage",
      "\\notifications",
      null,
      { href: "/notifications" },
    ]) {
      expect(module.resolveNotificationDestination(rejected), String(rejected)).toBeNull();
    }
    expect(module.getNotificationHref("user.note", {})).toEqual({ href: "/notifications" });
    expect(module.getNotificationHref("user.note", { href: "/dashboard" })).toEqual({
      href: "/dashboard",
    });
    expect(module.getNotificationHref("user.note", { href: "https://evil.example" })).toBeNull();

    const webInbox = read(files, "apps/web/src/features/notifications/page.tsx");
    const bell = read(files, "apps/web/src/components/NotificationBell.tsx");
    const bellAdapter = read(files, "apps/web/src/features/notifications/bell.tsx");
    const headerActions = read(files, "apps/web/src/components/header-actions.tsx");
    const expoInbox = read(files, "apps/mobile/src/features/notifications/page.tsx");
    const push = read(files, "apps/mobile/src/hooks/use-push.ts");
    const mobileRoot = read(files, "apps/mobile/app/_layout.tsx");
    const desktopInbox = read(files, "apps/desktop/src/renderer/features/notifications/page.tsx");
    for (const source of [webInbox, expoInbox, desktopInbox]) {
      expect(source).toMatch(
        /const isCurrent = captureEffect\(\);[\s\S]*?const destination = resolveNotificationDestination\(item\.href\);[\s\S]*?if \(!destination \|\| !isCurrent\(\)\) return;[\s\S]*?if \(item\.readAt === null\) await markNotificationRead\(item\.id\);[\s\S]*?if \(!isCurrent\(\)\) return;[\s\S]*?(?:router\.push\(destination\)|navigate\(\{ to: destination \}\))/,
      );
    }
    expect(bell).toMatch(
      /const destination = getNotificationHref\([\s\S]*?const isCurrent = captureAction\?\.\(\) \?\? \(\(\) => true\);[\s\S]*?await onMarkRead\?\.\(notification\.id\);[\s\S]*?if \(isCurrent\(\) && destination\) onNavigate\?\.\(destination\.href\)/,
    );
    expect(bellAdapter).toContain("captureAction={captureEffect}");
    expect(bellAdapter).toMatch(
      /onNavigate=\{\(destination: NotificationDestination\) => \{ router\.push\(destination\); \}\}/,
    );
    expect(headerActions).toContain(
      'import { NotificationInboxBell } from "@/features/notifications/bell";',
    );
    expect(headerActions).toMatch(/\) : isAuthenticated \? \([\s\S]*?<NotificationInboxBell \/>/);

    expect(push).toContain("addNotificationResponseReceivedListener(navigateResponse)");
    expect(push).toContain('if (Platform.OS === "web") return;');
    expect(push).toContain("getLastNotificationResponse()");
    expect(push).toContain("clearLastNotificationResponse()");
    expect(push).toContain("request.content.data?.href");
    expect(push.indexOf("addNotificationResponseReceivedListener")).toBeLessThan(
      push.indexOf("getLastNotificationResponse()"),
    );
    expect(push).toMatch(
      /const destination = resolveNotificationDestination\([\s\S]*?if \(!destination\) return;\s*router\.push\(destination\)/,
    );
    expect(mobileRoot).toContain('import { PushNotificationObserver } from "@/hooks/use-push";');
    expect(mobileRoot).toContain("<PushNotificationObserver />");

    const offPaths = new Set(off.map(({ path }) => path));
    expect(offPaths.has("apps/web/src/features/notifications/bell.tsx")).toBe(false);
    expect(offPaths.has("apps/mobile/src/hooks/use-push.ts")).toBe(false);
    expect(offPaths.has("apps/mobile/app/notifications.tsx")).toBe(false);
    expect(offPaths.has("apps/desktop/src/renderer/routes/notifications.tsx")).toBe(false);
    const offHeaderActions = read(off, "apps/web/src/components/header-actions.tsx");
    const offMobileRoot = read(off, "apps/mobile/app/_layout.tsx");
    expect(offHeaderActions).not.toContain("NotificationInboxBell");
    expect(offMobileRoot).not.toContain("PushNotificationObserver");
  });

  test("single native notification fragments remain omitted without a backend host", () => {
    const files = notificationClientFiles({
      mode: "single",
      framework: "nextjs",
      apps: ["desktop"],
      notifications: true,
      storage: false,
      featureFlags: false,
      jobs: false,
      i18n: true,
    });
    expect(files).toEqual([]);
  });

  test("English, French, and Arabic include every reachable navigation label", () => {
    for (const messages of [EN_MESSAGES, FR_MESSAGES, AR_MESSAGES]) {
      for (const key of [
        "agent",
        "messages",
        "notifications",
        "storage",
        "featureFlags",
        "jobs",
        "pdf",
      ] as const) {
        expect(messages.header[key], `header.${key}`).toBeTruthy();
        expect(messages.navigation[key], `navigation.${key}`).toBeTruthy();
      }
    }
  });

  test("English, French, and Arabic complete native capability namespaces", () => {
    const required = {
      notifications: [
        "title",
        "description",
        "defaultTitle",
        "defaultBody",
        "titleLabel",
        "bodyLabel",
        "create",
        "createError",
        "unavailable",
        "empty",
        "open",
        "read",
        "markRead",
        "enablePush",
      ],
      featureFlags: ["title", "description", "shortDescription", "keyLabel", "evaluate", "error"],
      storage: [
        "title",
        "description",
        "defaultText",
        "fileName",
        "textContent",
        "uploaded",
        "uploadError",
        "upload",
        "objectId",
        "downloaded",
        "downloadError",
        "download",
        "removed",
        "removeError",
        "remove",
      ],
      jobs: [
        "title",
        "description",
        "defaultMessage",
        "echoPayload",
        "enqueueError",
        "enqueue",
        "runId",
        "lookupError",
        "refresh",
        "cancelError",
        "cancel",
      ],
      pdf: [
        "mobileTitle",
        "mobileDescription",
        "dashboard",
        "template",
        "templateDescription",
        "invoice",
        "certificate",
        "agreement",
        "generating",
        "generateShare",
        "documentWorkspace",
        "secureTitle",
        "desktopDescription",
        "generateDownload",
        "generationError",
      ],
      messaging: [
        "privateChannel",
        "title",
        "mobileDescription",
        "desktopDescription",
        "nativeRealtime",
        "securePolling",
        "pollingDescription",
        "liveDescription",
        "refresh",
        "conversations",
        "peerUserId",
        "start",
        "thread",
        "selectConversation",
        "typing",
        "downloadAttachment",
        "messagePlaceholder",
        "attach",
        "sending",
        "send",
        "operationError",
      ],
    } as const;
    for (const messages of [EN_MESSAGES, FR_MESSAGES, AR_MESSAGES]) {
      for (const [namespace, keys] of Object.entries(required)) {
        const catalog = Reflect.get(messages, namespace);
        expect(catalog, namespace).toBeDefined();
        for (const key of keys) {
          expect(Reflect.get(catalog, key), `${namespace}.${key}`).toBeTruthy();
        }
      }
      for (const role of ["owner", "admin", "member"] as const) {
        expect(messages.workspace.roles[role], `workspace.roles.${role}`).toBeTruthy();
      }
      for (const status of ["pending", "accepted", "rejected", "cancelled"] as const) {
        expect(messages.workspace.statuses[status], `workspace.statuses.${status}`).toBeTruthy();
      }
      expect(messages.settings.native.notSignedIn).toBeTruthy();
      expect(messages.adminUsers.native.operationError).toBeTruthy();
      expect(messages.auth.emailFlow.magicLink.title).toBeTruthy();
      expect(messages.auth.emailFlow.verifyEmail.title).toBeTruthy();
    }
  });
});
