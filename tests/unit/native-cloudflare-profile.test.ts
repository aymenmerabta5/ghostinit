import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function maximalCloudflareNativeFiles(): TemplateFile[] {
  const config = projectConfigSchema.parse({
    name: "native-cloudflare",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    framework: "nextjs",
    database: "convex",
    apps: ["web", "mobile", "desktop"],
    preset: "custom",
    cache: "redis",
    deploy: "cloudflare",
    auth: true,
    api: true,
    email: true,
    analytics: false,
    eve: false,
    i18n: true,
    pdf: false,
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: ["i18n"],
    messaging: true,
    storage: true,
    notifications: true,
    featureFlags: "posthog",
    jobs: true,
  } satisfies ProjectConfig);
  return generateProjectFiles(config, { dryRun: true });
}

function read(files: readonly TemplateFile[], path: string): string {
  const generated = files.find((candidate) => candidate.path === path);
  expect(generated, `missing generated file: ${path}`).toBeDefined();
  return generated?.content ?? "";
}

function dependencies(files: readonly TemplateFile[], path: string): Record<string, string> {
  const manifest = JSON.parse(read(files, path)) as { dependencies?: Record<string, string> };
  return manifest.dependencies ?? {};
}

describe("maximal Cloudflare native profile", () => {
  test("keeps Convex mobile auth ownership and native clients type-directed", () => {
    const files = maximalCloudflareNativeFiles();
    const parseErrors = files
      .filter(({ path }) => /\.tsx?$/.test(path))
      .flatMap(({ path, content }) =>
        parseSync(path, content).errors.map((error) => `${path}: ${error.message}`),
      );
    expect(parseErrors).toEqual([]);

    const convexAuth = read(files, "convex/auth.ts");
    const authProxy = read(files, "packages/auth/src/server.ts");
    const rootDependencies = dependencies(files, "package.json");
    const databaseDependencies = dependencies(files, "packages/database/package.json");
    const authDependencies = dependencies(files, "packages/auth/package.json");
    const mobileDependencies = dependencies(files, "apps/mobile/package.json");
    expect(convexAuth).toContain('import { expo } from "@better-auth/expo";');
    expect(convexAuth).toContain('trustedOrigins.add("nativecloudflare://")');
    expect(convexAuth).toContain("      expo(),");
    expect(authProxy).not.toContain("@better-auth/expo");
    expect(rootDependencies["@better-auth/expo"]).toBeDefined();
    expect(databaseDependencies["@better-auth/expo"]).toBeUndefined();
    expect(authDependencies["@better-auth/expo"]).toBeUndefined();
    expect(mobileDependencies["@better-auth/expo"]).toBeDefined();
    expect(mobileDependencies.zod).toBeDefined();

    const mobileAdapter = read(files, "apps/mobile/src/adapters/messaging/convex.ts");
    const mobileRoute = read(files, "apps/mobile/app/(app)/messages.tsx");
    const desktopRoute = read(files, "apps/desktop/src/renderer/routes/messages.tsx");
    const desktopProviders = read(files, "apps/desktop/src/renderer/lib/providers.tsx");
    expect(mobileAdapter).toContain("const rawConversations: unknown");
    expect(mobileAdapter).toContain("conversationListSchema.parse(rawConversations)");
    expect(mobileRoute).not.toContain('messaging.transport === "polling"');
    expect(desktopRoute).not.toContain('messaging.transport === "polling"');
    expect(desktopProviders).toContain("ConvexProviderWithAuth");
    expect(desktopProviders).toContain("useAuth={useConvexBetterAuth}");
    expect(desktopProviders).not.toContain("ConvexBetterAuthProvider");
    expect(desktopProviders).not.toMatch(/\bas any\b|as unknown as/);

    for (const path of [
      "apps/mobile/app/admin.tsx",
      "apps/mobile/app/billing.tsx",
      "apps/mobile/app/settings.tsx",
    ]) {
      expect(read(files, path), path).toContain("orpc.me.queryOptions");
    }
    const dashboard = read(files, "apps/mobile/app/dashboard.tsx");
    expect(dashboard).toContain("function authUserRole(value: unknown): string");
    expect(dashboard).toContain('Reflect.get(value, "role")');
    expect(dashboard).not.toContain("user?.role");
  });
});
