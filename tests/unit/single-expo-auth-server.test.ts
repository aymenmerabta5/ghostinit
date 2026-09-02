import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  serverAuthSingle,
  serverAuthTanstackSingle,
} from "../../src/templates/modes/single/server/auth.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function content(files: TemplateFile[], path: string): string {
  const generated = files.find((candidate) => candidate.path === path);
  expect(generated, `missing generated file: ${path}`).toBeDefined();
  return generated?.content ?? "";
}

describe("single Expo Better Auth server integration", () => {
  test("keeps the Expo server plugin opt-in for web renderers", () => {
    for (const server of [serverAuthSingle(false), serverAuthTanstackSingle(false)]) {
      expect(server).not.toContain("@better-auth/expo");
      expect(server).not.toContain("expo(),");
      expect(server).not.toContain("trustedOrigins: [env.BETTER_AUTH_URL,");
    }
  });

  test("adds the Expo server plugin and matching trusted scheme when requested", () => {
    for (const server of [
      serverAuthSingle(false, { expoScheme: "Demo-Mobile" }),
      serverAuthTanstackSingle(false, { expoScheme: "Demo-Mobile" }),
    ]) {
      expect(server).toContain("import { expo } from '@better-auth/expo';");
      expect(server).toContain("trustedOrigins: [env.BETTER_AUTH_URL, 'demomobile://']");
      expect(server).toContain("    expo(),");
    }
  });

  test("the single Expo composer wires the app scheme and dependency", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "demo-mobile",
        mode: "single",
        framework: "nextjs",
        database: "postgres",
        preset: "custom",
        auth: true,
        api: true,
        email: false,
        analytics: false,
        notifications: false,
        billing: [],
        apps: ["mobile"],
      }),
    );
    const appConfig = JSON.parse(content(files, "app.json")) as {
      expo: { scheme: string };
    };
    const server = content(files, "src/server/auth/index.ts");
    const manifest = JSON.parse(content(files, "package.json")) as {
      dependencies: Record<string, string>;
    };

    expect(appConfig.expo.scheme).toBe("demomobile");
    expect(server).toContain("import { expo } from '@better-auth/expo';");
    expect(server).toContain(
      `trustedOrigins: [env.BETTER_AUTH_URL, '${appConfig.expo.scheme}://']`,
    );
    expect(server).toContain("    expo(),");
    expect(manifest.dependencies["@better-auth/expo"]).toBeDefined();
  });
});
