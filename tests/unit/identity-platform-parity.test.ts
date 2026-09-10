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
      const nativeRoots = [
        "apps/mobile/src/features/identity-workspace",
        "apps/desktop/src/renderer/features/identity-workspace",
      ];
      const nativeSources = nativeRoots.map((root, index) => {
        const route = source(generated, expected[index + 4] ?? "");
        expect(route).toContain('from "@/features/identity-workspace/');
        expect(route).not.toMatch(/orpc\.identity|@tanstack\/react-query/);
        const paths = [`${root}/queries.ts`, `${root}/mutations.ts`];
        expectParses(generated, paths);
        return paths.map((path) => source(generated, path)).join("\n");
      });
      for (const [path, content] of [
        [expected[0], webSource],
        [expected[4], nativeSources[0]!],
        [expected[5], nativeSources[1]!],
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
    const adminRoot = "apps/mobile/src/features/admin-users";
    const mobileAdmin = ["queries.ts", "mutations.ts"]
      .map((path) => source(generated, `${adminRoot}/${path}`))
      .join("\n");
    expect(source(generated, "apps/mobile/app/admin.tsx")).toContain(
      'from "@/features/admin-users/screen"',
    );
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
    for (const root of ["apps/mobile/src", "apps/desktop/src/renderer"]) {
      const settings = `${root}/features/settings`;
      const paths = [
        `${settings}/queries.ts`,
        `${settings}/mutations.ts`,
        `${settings}/use-two-factor-settings.ts`,
        `${root}/features/account-deletion/mutations.ts`,
        `${root}/lib/${root.includes("desktop") ? "auth" : "auth-client"}.ts`,
      ];
      expectParses(generated, paths);
      const queries = source(generated, paths[0]!);
      const mutations = source(generated, paths[1]!);
      const workflow = source(generated, paths[2]!);
      const deletion = source(generated, paths[3]!);
      const adapter = source(generated, paths[4]!);
      expect(queries).toContain("orpc.identity.sessions.list");
      expect(mutations).toContain("orpc.identity.sessions.revoke");
      expect(mutations).toContain("identityClient.changePassword");
      expect(deletion).toContain("identityClient.deleteAccount");
      expect(adapter).toContain("authClient.changePassword");
      expect(adapter).toContain("authClient.deleteUser");
      expect(adapter).toContain("authClient.twoFactor.enable");
      expect(mutations).toContain("identityClient.enableTwoFactor");
      expect(mutations).toContain("totpUri: result.data.totpURI");
      expect(mutations).toContain("backupCodes: result.data.backupCodes");
      expect(workflow).toContain('prepare.run({ kind: "enable", password: value.password })');
      expect(workflow).toContain('complete.run({ kind: "verify", code: value.code');
      expect(workflow).toContain("!result.isCurrent()");
    }
    expect(source(generated, "apps/mobile/src/features/settings/settings-screen.tsx")).toContain(
      "<TwoFactorSection />",
    );
    expect(
      source(generated, "apps/desktop/src/renderer/features/settings/settings-controller.tsx"),
    ).toContain("<TwoFactorCard />");
    expect(source(generated, "apps/desktop/src/renderer/routes/2fa.tsx")).toContain(
      "TwoFactorScreen",
    );
    expect(
      source(generated, "apps/desktop/src/renderer/features/auth/use-two-factor-setup.ts"),
    ).toContain("await enableTwoFactor(password)");
  });

  test("native credential sign-in preserves the two-factor continuation", () => {
    const generated = files({});
    const mobileTwoFactor = source(generated, "apps/mobile/app/2fa.tsx");
    expectParses(generated, [
      "apps/mobile/app/(auth)/sign-in.tsx",
      "apps/desktop/src/renderer/routes/sign-in.tsx",
    ]);
    for (const root of ["apps/mobile/src", "apps/desktop/src/renderer"]) {
      const paths = [
        "mutations.ts",
        "use-sign-in-form.ts",
        "use-auth-navigation.ts",
        "components/sign-in-form.tsx",
      ].map((path) => `${root}/features/auth/${path}`);
      expectParses(generated, paths);
      const [mutations, workflow, navigation, view] = paths.map((path) => source(generated, path));
      expect(mutations).toContain("identityClient.signInWithEmail");
      expect(workflow).toContain("const result = await signInWithEmail(value)");
      expect(workflow).toContain(
        'typeof data === "object" && data !== null && "twoFactorRedirect" in data && data.twoFactorRedirect === true',
      );
      expect(workflow).toContain("await navigation.afterSignIn(twoFactor)");
      expect(workflow!.indexOf("if (result.error)")).toBeLessThan(
        workflow!.indexOf("await navigation.afterSignIn(twoFactor)"),
      );
      expect(workflow).toContain("if (!ticket.isCurrent()) return");
      expect(navigation).toContain('twoFactor ? "/2fa" : "/dashboard"');
      expect(view).toContain("maxLength={64}");
    }
    expect(mobileTwoFactor).toContain("params.totpURI");
    expect(source(generated, "apps/mobile/src/features/auth/mutations.ts")).toContain(
      "identityClient.verifyTwoFactor",
    );
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
      expect(content).toMatch(/MagicLinkScreen|VerifyEmailScreen/);
      expect(content).toContain("@/features/auth/");
    }
    for (const root of ["apps/web/src", "apps/mobile/src", "apps/desktop/src/renderer"]) {
      const workflow = source(enabled, `${root}/features/auth/use-email-flow-form.ts`);
      const mutations = source(enabled, `${root}/features/auth/mutations.ts`);
      expect(workflow).toContain("requestMagicLink(value.email)");
      expect(workflow).toContain("requestEmailVerification(value.email)");
      expect(mutations).toContain("identityClient.requestMagicLink");
      expect(mutations).toContain("identityClient.requestEmailVerification");
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
      const generated = files({ mode, apps: ["web", "desktop"] });
      const prefix = mode === "monorepo" ? "apps/desktop/" : "";
      const paths = [
        `${prefix}src/renderer/routes/sign-in.tsx`,
        `${prefix}src/renderer/routes/sign-up.tsx`,
      ];
      expectParses(generated, paths);
      for (const path of paths) {
        const content = source(generated, path);
        expect(content).toContain('from "@/features/auth/');
      }
      const featureRoot = `${prefix}src/renderer/features/auth`;
      const navigation = source(generated, `${featureRoot}/use-auth-navigation.ts`);
      expect(navigation).toContain('import { useNavigate } from "@tanstack/react-router"');
      expect(navigation).toContain("const navigate = useNavigate()");
      expect(navigation).toContain('dashboard: () => navigate({ to: "/dashboard" })');
      expect(navigation).toContain(
        'afterSignIn: (twoFactor: boolean) => navigate({ to: twoFactor ? "/2fa" : "/dashboard" })',
      );
      expect(navigation).toContain(
        'afterSignUp: (hasSession: boolean) => navigate({ to: hasSession ? "/dashboard" : "/verify-email" })',
      );
      expect(source(generated, `${featureRoot}/use-sign-in-form.ts`)).toContain(
        "await navigation.afterSignIn(twoFactor)",
      );
      expect(source(generated, `${featureRoot}/use-sign-up-form.ts`)).toContain(
        "await navigation.afterSignUp(Boolean(result.data?.token))",
      );
      for (const file of generated.filter(({ path }) => path.startsWith(`${featureRoot}/`))) {
        expect(file.content).not.toContain('window.location.href = "/dashboard"');
      }
    }
  });
});
