import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { parseSync } from "oxc-parser";
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
import {
  settingsDangerZoneCardContent,
  settingsPasswordCardContent,
  settingsProfileCardContent,
  settingsSessionsCardContent,
  settingsSessionsDataContent,
  settingsSessionsListContent,
  settingsTwoFactorCardContent,
  settingsTwoFactorHookContent,
  tanstackSettingsFeatureFiles,
  tanstackSettingsPageContent,
} from "../../src/templates/apps/fragments/settings/index.js";
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
  settingsDangerZoneCardSingle,
  settingsPasswordCardSingle,
  settingsProfileCardSingle,
  settingsSessionsCardSingle,
  settingsSessionsDataSingle,
  settingsSessionsListSingle,
  settingsTwoFactorCardSingle,
  settingsTwoFactorHookSingle,
} from "../../src/templates/modes/single/pages/settings.js";
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
      expect(shared).toContain("useAppForm({");
      expect(shared).toContain(".AppField name=");
      expect(shared).toContain(".SubmitButton");
      expect(shared).not.toContain("TanStackField");
      expect(shared).not.toContain("safeParse");
      expect(shared).not.toContain("useEffect");
      for (const [index, source] of sharedFiles.entries()) {
        expect(parseSync(`identity-form-${index}.tsx`, source).errors).toHaveLength(0);
      }
    }
  });

  test("shares settings form renderers and keeps remote operations behind identityClient", () => {
    const pairs = [
      [settingsProfileCardContent(), settingsProfileCardSingle()],
      [settingsPasswordCardContent(), settingsPasswordCardSingle()],
      [settingsTwoFactorCardContent(), settingsTwoFactorCardSingle()],
      [settingsTwoFactorHookContent(), settingsTwoFactorHookSingle()],
      [settingsSessionsCardContent(), settingsSessionsCardSingle()],
      [settingsSessionsDataContent(), settingsSessionsDataSingle()],
      [settingsSessionsListContent(), settingsSessionsListSingle()],
      [settingsDangerZoneCardContent(), settingsDangerZoneCardSingle()],
    ] as const;
    for (const [shared, single] of pairs) expect(single).toBe(shared);

    const forms = pairs
      .filter(([source]) => !source.includes("identitySessionsQueryOptions"))
      .map(([source]) => source)
      .join("\n");
    expect(forms).toContain("useAppForm({");
    expect(forms).toContain(".AppField name=");
    expect(forms).not.toContain("TanStackField");
    expect(forms).not.toContain("safeParse");
    expect(forms).not.toContain("useEffect");
    expect(forms).not.toMatch(/authClient\.(?:updateUser|changePassword|deleteUser|twoFactor)/);

    for (const isConvex of [false, true]) {
      const route = tanstackSettingsPageContent(isConvex);
      const featureFiles = tanstackSettingsFeatureFiles("monorepo", true);
      const settings = [route, ...featureFiles.map(({ content }) => content)].join("\n");
      expect(settings).toContain("useAppForm({");
      expect(settings).toContain("identityClient.updateProfile");
      expect(settings).not.toContain("useEffect");
      expect(settings).not.toContain("safeParse");
      expect(parseSync("settings.tsx", route).errors).toHaveLength(0);
      for (const feature of featureFiles) {
        expect(parseSync(feature.path, feature.content).errors).toHaveLength(0);
      }
    }
  });

  test("sessions use typed identity query options and invalidate after every mutation", () => {
    const tanstackSessions = tanstackSettingsFeatureFiles("monorepo", true)
      .filter(({ path }) => path.endsWith("/queries.ts") || path.endsWith("/mutations.ts"))
      .map(({ content }) => content)
      .join("\n");
    for (const source of [settingsSessionsDataContent(), tanstackSessions ?? ""]) {
      expect(source).toMatch(/orpc\.identity\.sessions\.list\.queryOptions\(\{\s*input: \{\}/);
      expect(source).toContain('orpc.identity.sessions.list.key({ type: "query" })');
      expect(source).toContain("orpc.identity.sessions.revoke.mutationOptions");
      expect(source).toContain("orpc.identity.sessions.revokeOthers.mutationOptions");
      expect(
        source.match(/onSuccess: async \(\) => invalidateIdentitySessions\(queryClient\)/g),
      ).toHaveLength(2);
      expect(source).not.toContain("useEffect");
      expect(source).not.toContain("authClient.listSessions");
      expect(source).not.toContain("authClient.revoke");
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
