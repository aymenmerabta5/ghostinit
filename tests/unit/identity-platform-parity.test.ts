import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function config(overrides: Partial<ProjectConfig>): ProjectConfig {
  return projectConfigSchema.parse({
    name: "identity-platform-parity",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    framework: "nextjs",
    database: "postgres",
    apps: ["web", "mobile", "desktop"],
    preset: "saas",
    cache: "none",
    deploy: "none",
    auth: true,
    api: true,
    email: true,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    billing: [],
    features: [],
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
    ...overrides,
  });
}

function files(overrides: Partial<ProjectConfig>): TemplateFile[] {
  return generateProjectFiles(config(overrides), { dryRun: true });
}

function source(generated: readonly TemplateFile[], path: string): string {
  const found = generated.find((entry) => entry.path === path);
  expect(found, path).toBeDefined();
  return found?.content ?? "";
}

function expectParses(generated: readonly TemplateFile[], paths: readonly string[]): void {
  for (const path of paths) {
    expect(parseSync(path, source(generated, path)).errors, path).toEqual([]);
  }
}

describe("identity platform parity", () => {
  test("web, Expo, and Electron emit organization, team, and invitation surfaces", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const generated = files({ framework });
      const webRoute =
        framework === "nextjs"
          ? "apps/web/src/app/settings/workspace/page.tsx"
          : "apps/web/src/routes/settings.workspace.tsx";
      const expected = [
        "apps/web/src/features/identity-workspace/identity-workspace.tsx",
        "apps/web/src/features/identity-workspace/queries.ts",
        "apps/web/src/features/identity-workspace/mutations.ts",
        webRoute,
        "apps/mobile/app/workspace.tsx",
        "apps/desktop/src/renderer/routes/workspace.tsx",
      ];
      if (framework === "nextjs") {
        expected.push("apps/web/src/app/settings/workspace/actions.ts");
      }
      expectParses(generated, expected);

      const webSource = [
        expected[0],
        expected[1],
        expected[2],
        ...(framework === "nextjs" ? [expected[6]] : []),
      ]
        .map((path) => source(generated, path ?? ""))
        .join("\n");
      expect(source(generated, expected[0] ?? "")).not.toMatch(
        /@tanstack\/react-query|@\/lib\/orpc/,
      );
      for (const [path, content] of [
        [expected[0], webSource],
        [expected[4], source(generated, expected[4] ?? "")],
        [expected[5], source(generated, expected[5] ?? "")],
      ] as const) {
        for (const operation of [
          "orpc.identity.organizations.list",
          "orpc.identity.organizations.create",
          "orpc.identity.organizations.listMembers",
          "orpc.identity.teams.list",
          "orpc.identity.teams.create",
          "orpc.identity.teams.addMember",
          "orpc.identity.invitations.list",
          "orpc.identity.invitations.create",
          "orpc.identity.invitations.accept",
        ]) {
          const marker =
            path === expected[0] && framework === "nextjs" ? operation.slice(5) : operation;
          expect(content, `${path}: ${marker}`).toContain(marker);
        }
        expect(content).not.toContain("authClient.admin");
        expect(content).not.toMatch(/from ["'][^"']*(?:database|db\/)/);
      }
    }
  });

  test("mobile admin and full mobile/desktop settings use typed existing boundaries", () => {
    const generated = files({});
    const mobileAdmin = source(generated, "apps/mobile/app/admin.tsx");
    const mobileSettings = source(generated, "apps/mobile/app/settings.tsx");
    const desktopSettings = source(generated, "apps/desktop/src/renderer/routes/settings.tsx");
    const desktopTwoFactor = source(generated, "apps/desktop/src/renderer/routes/2fa.tsx");
    expectParses(generated, [
      "apps/mobile/app/admin.tsx",
      "apps/mobile/app/settings.tsx",
      "apps/desktop/src/renderer/routes/settings.tsx",
      "apps/desktop/src/renderer/routes/2fa.tsx",
    ]);
    for (const operation of [
      "orpc.adminUsers.list",
      "orpc.adminUsers.create",
      "orpc.adminUsers.changeRole",
      "orpc.adminUsers.setBanned",
    ]) {
      expect(mobileAdmin).toContain(operation);
    }
    for (const content of [mobileSettings, desktopSettings]) {
      expect(content).toContain("orpc.identity.sessions.list");
      expect(content).toContain("orpc.identity.sessions.revoke");
      expect(content).toContain("authClient.changePassword");
      expect(content).toContain("authClient.deleteUser");
    }
    expect(mobileSettings).toContain("authClient.twoFactor.enable");
    expect(mobileSettings).toContain('params: { totpURI: result.data?.totpURI ?? "" }');
    expect(desktopSettings).not.toContain("authClient.twoFactor.enable");
    expect(desktopSettings).toContain('navigate({ to: "/2fa" })');
    expect(desktopTwoFactor).toContain("authClient.twoFactor.enable");
  });

  test("native credential sign-in preserves the two-factor continuation", () => {
    const generated = files({});
    const mobileSignIn = source(generated, "apps/mobile/app/(auth)/sign-in.tsx");
    const mobileTwoFactor = source(generated, "apps/mobile/app/2fa.tsx");
    const desktopSignIn = source(generated, "apps/desktop/src/renderer/routes/sign-in.tsx");
    expectParses(generated, [
      "apps/mobile/app/(auth)/sign-in.tsx",
      "apps/desktop/src/renderer/routes/sign-in.tsx",
    ]);
    for (const content of [mobileSignIn, desktopSignIn]) {
      expect(content).toContain("identityClient.signInWithEmail");
      expect(content).toContain("requiresTwoFactor(res.data)");
      expect(content.match(/requiresTwoFactor/g)).toHaveLength(2);
      expect(content.indexOf("function requiresTwoFactor")).toBeLessThan(
        content.indexOf("requiresTwoFactor(res.data)"),
      );
      expect(content).toContain('"/2fa"');
      expect(content).toContain("maxLength={64}");
    }
    expect(mobileTwoFactor).toContain("params.totpURI");
    expect(mobileTwoFactor).toContain("identityClient.verifyTwoFactor");
  });

  test("magic-link and verification flows are capability-gated on every platform", () => {
    const enabled = files({});
    const paths = [
      "apps/web/src/app/magic-link/page.tsx",
      "apps/web/src/app/verify-email/page.tsx",
      "apps/mobile/app/(auth)/magic-link.tsx",
      "apps/mobile/app/(auth)/verify-email.tsx",
      "apps/desktop/src/renderer/routes/magic-link.tsx",
      "apps/desktop/src/renderer/routes/verify-email.tsx",
    ];
    expectParses(enabled, paths);
    for (const path of paths) {
      const content = source(enabled, path);
      expect(content).toMatch(/requestMagicLink|requestEmailVerification/);
    }
    for (const authPath of [
      "apps/web/src/lib/auth-client.ts",
      "apps/mobile/src/lib/auth-client.ts",
      "apps/desktop/src/renderer/lib/auth.ts",
    ]) {
      const content = source(enabled, authPath);
      expect(content).toContain("requestMagicLink");
      expect(content).toContain("requestEmailVerification");
    }
    for (const authPath of [
      "packages/auth/src/client.ts",
      "apps/mobile/src/lib/auth-client.ts",
      "apps/desktop/src/renderer/lib/auth.ts",
    ]) {
      expect(source(enabled, authPath)).toContain("magicLinkClient()");
    }

    const disabled = files({ email: false });
    for (const path of paths)
      expect(
        disabled.some((entry) => entry.path === path),
        path,
      ).toBe(false);
    expect(source(disabled, "packages/auth/src/server.ts")).not.toContain("magicLink(");
  });

  test("Electron auth success stays inside the renderer router", () => {
    for (const mode of ["monorepo"] as const) {
      const generated = files({ mode, apps: ["desktop"] });
      const prefix = mode === "monorepo" ? "apps/desktop/" : "";
      const paths = [
        `${prefix}src/renderer/routes/sign-in.tsx`,
        `${prefix}src/renderer/routes/sign-up.tsx`,
      ];
      expectParses(generated, paths);
      for (const path of paths) {
        const content = source(generated, path);
        expect(content).toContain("Link, useNavigate");
        expect(content).toContain("const navigate = useNavigate()");
        expect(content).toContain('await navigate({ to: "/dashboard" })');
        expect(content).not.toContain('window.location.href = "/dashboard"');
      }
    }
  });
});
