import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Database = "postgres" | "convex";
type NativeApp = "mobile" | "desktop";

function generate(mode: Mode, database: Database, app: NativeApp): TemplateFile[] {
  const apps = mode === "monorepo" ? ["web", app] : [app];
  const config = projectConfigSchema.parse({
    name: "messaging-native-parity",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework: "nextjs",
    database,
    apps,
    preset: "custom",
    cache: "none",
    deploy: "none",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    billing: [],
    features: [],
    messaging: true,
    storage: true,
    notifications: false,
    featureFlags: "none",
    jobs: false,
  } satisfies ProjectConfig);
  return generateProjectFiles(config, { dryRun: true });
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((entry) => entry.path === path);
  expect(found, path).toBeDefined();
  return found?.content ?? "";
}

function paths(mode: Mode, database: Database, app: NativeApp) {
  const prefix = mode === "monorepo" ? `apps/${app === "mobile" ? "mobile/" : "desktop/"}` : "";
  if (app === "mobile") {
    return {
      adapter: `${prefix}src/adapters/messaging/${database}.ts`,
      route: `${prefix}app/(app)/messages.tsx`,
      manifest: mode === "monorepo" ? "apps/mobile/package.json" : "package.json",
    };
  }
  return {
    adapter: `${prefix}src/renderer/adapters/messaging/${database}.ts`,
    route: `${prefix}src/renderer/routes/messages.tsx`,
    manifest: mode === "monorepo" ? "apps/desktop/package.json" : "package.json",
  };
}

describe("hosted native messaging parity", () => {
  for (const mode of ["monorepo"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      for (const app of ["mobile", "desktop"] as const) {
        test(`${mode}/${database}/${app} composes full messaging through an adapter`, () => {
          const files = generate(mode, database, app);
          const expected = paths(mode, database, app);
          const adapter = read(files, expected.adapter);
          const route = read(files, expected.route);
          expect(parseSync(expected.adapter, adapter).errors).toEqual([]);
          expect(parseSync(expected.route, route).errors).toEqual([]);
          expect(route).not.toMatch(
            /@tanstack\/react-query|convex\/react|@\/lib\/orpc|api\.messaging/,
          );
          expect(route).not.toContain("use web for now");
          expect(route).toContain("startConversation");
          expect(route).toContain("sendMessage");
          expect(route).toMatch(/pickNativeAttachment|type="file"/);
          expect(route).toMatch(/downloadNativeAttachment|downloadDesktopAttachment/);
          expect(route).toContain("maxLength={4000}");
          expect(adapter).toContain("getOrCreateConversation");
          expect(adapter).toContain("listConversations");
          expect(adapter).toContain("listMessages");
          expect(adapter).toContain("sendMessage");
          expect(adapter).toContain("sendTyping");
          expect(adapter).toMatch(/uploadNativeAttachment|uploadDesktopAttachment/);
          expect(adapter).toMatch(/downloadNativeAttachment|downloadDesktopAttachment/);

          if (database === "postgres") {
            expect(adapter).toContain('refetchInterval: transport === "polling" ? 5_000 : false');
            expect(adapter).toContain("subscribeRealtime(conversationId");
            expect(adapter).toContain('setTransport("polling")');
            expect(route).toContain("Realtime with polling fallback");
            expect(route).toContain("secure realtime connection is unavailable");
          } else {
            expect(adapter).toContain("api.messaging.listTyping");
            expect(adapter).toContain("api.messaging.sendTyping");
            expect(adapter).not.toContain("refetchInterval");
            expect(route).toContain("Native realtime");
          }

          if (app === "mobile") {
            const manifest = JSON.parse(read(files, expected.manifest)) as {
              dependencies?: Record<string, string>;
            };
            expect(manifest.dependencies?.["expo-file-system"]).toBeDefined();
            expect(manifest.dependencies?.["expo-sharing"]).toBeDefined();
            expect(route).toContain("messaging.messages.length === 0");
            expect(route).toContain("No messages yet. Say hello.");
          } else {
            expect(adapter).toContain(
              `import { desktopBridgeFetch } from "${mode === "monorepo" ? "@/adapters/desktop-fetch" : "@/renderer/adapters/desktop-fetch"}"`,
            );
            expect(adapter).toContain("const configured = window.desktopBridge.apiUrl");
            expect(adapter).toContain(
              'desktopBridgeFetch(desktopMessagingApiUrl("/api/messaging/attachments")',
            );
            expect(adapter).toContain("desktopBridgeFetch(desktopMessagingApiUrl(url)");
            expect(adapter).toContain("url.origin !== base.origin");
            expect(adapter).not.toContain("await fetch(desktopMessagingApiUrl");
          }
        });
      }
    }
  }

  test("web messaging remains on the existing split feature surface", () => {
    const files = generate("monorepo", "postgres", "mobile");
    for (const path of [
      "apps/web/src/app/(app)/messages/page.tsx",
      "apps/web/src/app/(app)/messages/hooks/use-messaging.ts",
      "apps/web/src/app/(app)/messages/_components/message-composer.tsx",
    ]) {
      expect(read(files, path)).not.toBe("");
    }
  });
});
