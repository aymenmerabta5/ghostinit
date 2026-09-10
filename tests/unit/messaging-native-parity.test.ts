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
          const root =
            app === "mobile"
              ? "apps/mobile/src/features/messaging"
              : "apps/desktop/src/renderer/features/messaging";
          const queries = read(files, `${root}/queries.ts`);
          const mutations = read(files, `${root}/mutations.ts`);
          const composer = read(files, `${root}/components/message-composer-view.tsx`);
          const view = [
            "messaging-workspace-view",
            "messaging-conversations-view",
            "messaging-thread-view",
          ]
            .map((name) => read(files, `${root}/components/${name}.tsx`))
            .join("\n");
          for (const entry of files.filter(({ path }) => path.startsWith(root))) {
            expect(parseSync(entry.path, entry.content).errors).toEqual([]);
          }
          expect(parseSync(expected.adapter, adapter).errors).toEqual([]);
          expect(parseSync(expected.route, route).errors).toEqual([]);
          expect(route).not.toMatch(
            /@tanstack\/react-query|convex\/react|@\/lib\/orpc|api\.messaging/,
          );
          expect(route).not.toContain("use web for now");
          expect(route).toContain("features/messaging/screen");
          expect(route).not.toMatch(/useState|useEffect|useForm/);
          expect(mutations).toContain("useStartConversationMutation");
          expect(mutations).toContain("useSendMessageMutation");
          expect(composer).toMatch(/pickAttachment|type="file"/);
          expect(mutations).toMatch(/downloadNativeAttachment|downloadDesktopAttachment/);
          expect(composer).toContain("maxLength={4000}");
          expect(mutations).toContain("getOrCreateConversation");
          expect(queries).toContain("listConversations");
          expect(queries).toContain("listMessages");
          expect(mutations).toContain("sendMessage");
          expect(mutations).toContain("sendTyping");
          expect(adapter).toMatch(/uploadNativeAttachment|uploadDesktopAttachment/);
          expect(adapter).toMatch(/downloadNativeAttachment|downloadDesktopAttachment/);

          if (database === "postgres") {
            expect(queries).toContain('refetchInterval: transport === "polling" ? 5_000 : false');
            expect(queries).toContain("subscribeRealtime(conversationId");
            expect(queries).toContain('transport: connected ? "realtime" : "polling"');
            expect(view).toContain("Realtime with polling fallback");
            expect(view).toContain("secure realtime connection is unavailable");
          } else {
            expect(queries).toContain("api.messaging.listTyping");
            expect(mutations).toContain("api.messaging.sendTyping");
            expect(queries).not.toContain("refetchInterval");
            expect(view).toContain("Native realtime");
          }

          if (app === "mobile") {
            const manifest = JSON.parse(read(files, expected.manifest)) as {
              dependencies?: Record<string, string>;
            };
            expect(manifest.dependencies?.["expo-file-system"]).toBeDefined();
            expect(manifest.dependencies?.["expo-sharing"]).toBeDefined();
            expect(view).toContain("messaging.messages.length === 0");
            expect(view).toContain("No messages yet. Say hello.");
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
      "apps/web/src/features/messaging/queries.ts",
      "apps/web/src/features/messaging/mutations.ts",
      "apps/web/src/features/messaging/use-message-composer.ts",
      "apps/web/src/features/messaging/components/message-composer-view.tsx",
    ]) {
      expect(read(files, path)).not.toBe("");
    }
  });
});
