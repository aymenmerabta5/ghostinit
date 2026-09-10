import { settingsFeatureHarness, settingsSource } from "../helpers/settings-feature-harness.js";
import { webSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/feature.js";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { parseSync } from "oxc-parser";
import { authFeatureFiles } from "../../src/templates/apps/fragments/auth/feature.js";
import {
  identityModelContent,
  identityValidationContent,
} from "../../src/templates/apps/fragments/auth/client-validation.js";
import {
  IDENTITY_OAUTH_PROVIDERS,
  identityClientAdapterContent,
  isIdentityOAuthProvider,
} from "../../src/templates/apps/fragments/auth/client-adapter.js";
import {
  signInFormContent,
  signInPageContent,
  signUpFormContent,
  signUpPageContent,
  twoFactorPageContent,
  twoFactorFormContent,
} from "../../src/templates/apps/fragments/auth/index.js";
import {
  forgotPasswordPageContent,
  resetPasswordPageContent,
  resetPasswordFormContent,
} from "../../src/templates/apps/fragments/recovery/index.js";
import { adminDataFiles } from "../../src/templates/apps/fragments/admin/feature-data.js";
import {
  signInFormSingleContent,
  signInPageSingle,
  signUpFormSingleContent,
  signUpPageSingle,
  singleTwoFactorFormContent,
} from "../../src/templates/modes/single/pages/auth.js";
import {
  forgotPasswordPageSingle,
  resetPasswordPageSingle,
  resetPasswordFormSingleContent,
} from "../../src/templates/modes/single/pages/password.js";
import {
  singleForgotPasswordRouteTanstackContent,
  singleResetPasswordRouteTanstackContent,
  singleResetPasswordFormTanstackContent,
  singleSignInFormTanstackContent,
  singleSignInRouteTanstackContent,
  singleSignUpFormTanstackContent,
  singleSignUpRouteTanstackContent,
  singleTwoFactorRouteTanstackContent,
  singleTwoFactorFormTanstackContent,
} from "../../src/templates/modes/single/tanstack/pages/auth.js";

const tempRoot = path.join(process.cwd(), `.identity-ui-schema-${process.pid}`);
const schemaModulePath = path.join(tempRoot, "generated-identity-client.ts");
let schemaModule: Record<string, unknown>;

beforeAll(async () => {
  await mkdir(tempRoot, { recursive: true });
  await writeFile(path.join(tempRoot, "auth-model.ts"), identityModelContent(), "utf8");
  await writeFile(path.join(tempRoot, "auth-validation.ts"), identityValidationContent(), "utf8");
  await writeFile(
    schemaModulePath,
    `import { z } from "zod";\nconst authClient = {};\n${identityClientAdapterContent()}`,
    "utf8",
  );
  schemaModule = await import(`${pathToFileURL(schemaModulePath).href}?run=${Date.now()}`);
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

function callSchema(
  name: string,
  messages: unknown,
): { safeParse(value: unknown): { success: boolean } } {
  const factory = Reflect.get(schemaModule, name);
  if (typeof factory !== "function") throw new Error(`Missing generated schema factory: ${name}`);
  const schema = Reflect.apply(factory, undefined, [messages]);
  if (
    !schema ||
    typeof schema !== "object" ||
    typeof Reflect.get(schema, "safeParse") !== "function"
  ) {
    throw new Error(`Invalid generated schema factory result: ${name}`);
  }
  return schema as { safeParse(value: unknown): { success: boolean } };
}

describe("generated identity client boundary", () => {
  test("allows only the declared OAuth providers", () => {
    expect(IDENTITY_OAUTH_PROVIDERS).toEqual(["google", "github"]);
    expect(isIdentityOAuthProvider("google")).toBe(true);
    expect(isIdentityOAuthProvider("github")).toBe(true);
    expect(isIdentityOAuthProvider("microsoft")).toBe(false);

    const client = identityClientAdapterContent();
    expect(client).toContain('throw new TypeError("Unsupported OAuth provider")');
    expect(client).toContain("Object.freeze({");
    expect(client).not.toContain("authClient.admin");
    for (const operation of [
      "signInWithEmail",
      "signUpWithEmail",
      "signInWithOAuth",
      "requestPasswordReset",
      "resetPassword",
      "updateProfile",
      "changePassword",
      "enableTwoFactor",
      "verifyTwoFactor",
      "disableTwoFactor",
      "deleteAccount",
    ]) {
      expect(client).toContain(`${operation}(`);
    }
  });

  test("generated shared schemas reject invalid structured form values", () => {
    const passwordMessages = {
      invalidEmail: "invalid email",
      passwordRequired: "password required",
      passwordTooShort: "password short",
      passwordTooLong: "password long",
    };
    const signIn = callSchema("createSignInSchema", passwordMessages);
    expect(signIn.safeParse({ email: "not-an-email", password: "password" }).success).toBe(false);
    expect(signIn.safeParse({ email: "user@example.com", password: "short" }).success).toBe(false);
    expect(signIn.safeParse({ email: "user@example.com", password: "correct-horse" }).success).toBe(
      true,
    );

    const reset = callSchema("createResetPasswordSchema", {
      ...passwordMessages,
      passwordMismatch: "password mismatch",
    });
    expect(
      reset.safeParse({ newPassword: "correct-horse", confirmPassword: "different-value" }).success,
    ).toBe(false);
    expect(
      reset.safeParse({ newPassword: "correct-horse", confirmPassword: "correct-horse" }).success,
    ).toBe(true);

    const totp = callSchema("createTotpSchema", "six digits");
    expect(totp.safeParse({ code: "12345" }).success).toBe(false);
    expect(totp.safeParse({ code: "123456" }).success).toBe(true);
  });
});

describe("generated identity forms and queries", () => {
  test("shares one AppForm implementation across package modes and routers", () => {
    const pairs = [
      [
        [signInPageContent("next"), signInFormContent("next")],
        [signInPageSingle(), signInFormSingleContent()],
      ],
      [
        [signUpPageContent("next"), signUpFormContent("next")],
        [signUpPageSingle(), signUpFormSingleContent()],
      ],
      [[forgotPasswordPageContent("next")], [forgotPasswordPageSingle()]],
      [
        [resetPasswordPageContent("next"), resetPasswordFormContent("next")],
        [resetPasswordPageSingle(), resetPasswordFormSingleContent()],
      ],
      [[twoFactorFormContent("next")], [singleTwoFactorFormContent()]],
      [
        [signInPageContent("tanstack"), signInFormContent("tanstack")],
        [singleSignInRouteTanstackContent(), singleSignInFormTanstackContent()],
      ],
      [
        [signUpPageContent("tanstack"), signUpFormContent("tanstack")],
        [singleSignUpRouteTanstackContent(), singleSignUpFormTanstackContent()],
      ],
      [[forgotPasswordPageContent("tanstack")], [singleForgotPasswordRouteTanstackContent()]],
      [
        [resetPasswordPageContent("tanstack"), resetPasswordFormContent("tanstack")],
        [singleResetPasswordRouteTanstackContent(), singleResetPasswordFormTanstackContent()],
      ],
      [
        [twoFactorPageContent("tanstack"), twoFactorFormContent("tanstack")],
        [singleTwoFactorRouteTanstackContent(), singleTwoFactorFormTanstackContent()],
      ],
    ] as const;
    for (const [sharedFiles, singleFiles] of pairs) {
      expect(singleFiles).toEqual(sharedFiles);
      const shared = sharedFiles.join("\n");
      expect(shared).not.toContain("useAppForm({");
      if (sharedFiles.length > 1 || shared.includes("TwoFactorForm")) {
        expect(shared).toContain(".AppField name=");
        expect(shared).toContain(".SubmitButton");
      }
      expect(shared).not.toContain("TanStackField");
      expect(shared).not.toContain("safeParse");
      expect(shared).not.toContain("useEffect");
      for (const [index, source] of sharedFiles.entries()) {
        expect(parseSync(`identity-form-${index}.tsx`, source).errors).toHaveLength(0);
      }
    }
    for (const router of ["next", "tanstack"] as const) {
      const files = authFeatureFiles({ router, hasEmail: true, hasPasskey: true });
      const workflows = files.filter(({ path }) => /\/use-.*-form\.ts$/.test(path));
      expect(workflows).toHaveLength(6);
      for (const workflow of workflows) expect(workflow.content).toContain("useAppForm({");
      for (const entry of files.filter(({ path }) => path.includes("/components/"))) {
        expect(entry.content).not.toContain("identityClient");
        expect(entry.content).not.toContain("useAppForm(");
      }
    }
  });

  test("shares emitted settings views and keeps remote operations behind identityClient", () => {
    const paths = [
      "settings/components/profile-view.tsx",
      "settings/components/password-view.tsx",
      "settings/components/two-factor-view.tsx",
      "settings/components/session-list.tsx",
      "account-deletion/components/danger-zone-view.tsx",
    ];
    for (const path of paths) {
      const shared = settingsSource("monorepo", "next", path);
      expect(settingsSource("single", "next", path)).toBe(shared);
      expect(settingsSource("single", "tanstack", path)).toBe(shared);
      expect(shared).not.toContain("useAppForm(");
      expect(shared).not.toContain("identityClient");
      expect(shared).not.toContain("useEffect");
      expect(shared).not.toContain("safeParse");
    }
    for (const router of ["next", "tanstack"] as const) {
      const files = webSettingsFeatureFiles("src", router, true, true, true);
      const settings = files.map(({ content }) => content).join("\n");
      expect(settings).toContain("useAppForm({");
      expect(settings).toContain(".AppField name=");
      expect(settings).toContain("identityClient.updateProfile");
      expect(settings).not.toMatch(
        /authClient\.(?:updateUser|changePassword|deleteUser|twoFactor)/,
      );
      expect(settings).not.toContain("TanStackField");
      expect(settings).not.toContain("safeParse");
      for (const feature of files)
        expect(parseSync(feature.path, feature.content).errors).toHaveLength(0);
    }
  });

  test("sessions use typed identity queries and invalidate after each revocation", async () => {
    for (const router of ["next", "tanstack"] as const) {
      const source = settingsSource(
        "single",
        router,
        "settings/model.ts",
        "settings/queries.ts",
        "settings/mutations.ts",
      );
      expect(source).toMatch(/orpc\.identity\.sessions\.list\.queryOptions\(\{\s*input: \{\}/);
      expect(source).toContain('orpc.identity.sessions.list.key({ type: "query" })');
      expect(source).not.toContain("authClient.listSessions");
      expect(source).not.toContain("authClient.revoke");
      const calls: unknown[] = [];
      const revoke = async (input: unknown) => {
        calls.push(input);
        return { ok: true };
      };
      const others = async () => {
        calls.push("others");
        return { ok: true };
      };
      const ui = settingsFeatureHarness(source, ["useRevokeSessionMutation"], {
        revokeIdentitySessionAction: revoke,
        revokeOtherIdentitySessionsAction: others,
        orpc: {
          identity: {
            sessions: {
              list: { key: () => ["sessions"] },
              revoke: { call: revoke },
              revokeOthers: { call: others },
            },
          },
        },
        authScopedQueryKey: (scope: { userId: string; sessionId: string }, key: string[]) => [
          scope.userId,
          scope.sessionId,
          ...key,
        ],
      });
      type Mutation = { run(input: unknown): Promise<unknown> };
      await expect(
        (ui.render("useRevokeSessionMutation") as Mutation).run({ sessionId: "other-session" }),
      ).resolves.toMatchObject({ status: "success" });
      await expect(
        (ui.render("useRevokeSessionMutation") as Mutation).run({ others: true }),
      ).resolves.toMatchObject({ status: "success" });
      expect(calls).toEqual([{ sessionId: "other-session" }, "others"]);
      expect(ui.invalidations).toEqual([
        { queryKey: ["owner", "session", "sessions"] },
        { queryKey: ["owner", "session", "sessions"] },
      ]);
    }
  });

  test("admin feature data is database-agnostic across typed query and application boundaries", () => {
    const render = (database: "postgres" | "convex") =>
      adminDataFiles({
        database,
        framework: "next",
        mode: "monorepo",
        sourceRoot: "apps/web/src",
      }).map((entry) => entry.content);
    const postgres = render("postgres");
    const convex = render("convex");
    expect(convex).toEqual(postgres);
    const source = postgres.join("\n");
    expect(source).toContain("orpc.adminUsers.list.queryOptions");
    expect(source).toContain("createAdminUserAction");
    expect(source).toContain("admin.createUser(parsed.data)");
    expect(source).toContain("createRequestApplicationForRequest");
    expect(source).not.toContain("convex/react");
    expect(source).not.toContain("authClient.admin");
    expect(source).not.toContain("api.users");
  });
});
