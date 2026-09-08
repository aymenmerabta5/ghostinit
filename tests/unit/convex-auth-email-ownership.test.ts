import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";

function generate(mode: Mode, framework: Framework, email: boolean): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "convex-email-ownership",
      runtime: "bun",
      mode,
      framework,
      database: "convex",
      preset: "custom",
      auth: true,
      api: true,
      email,
      analytics: false,
      billing: [],
      apps: ["web"],
      features: [],
    }),
    { dryRun: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const match = files.find((file) => file.path === path);
  if (!match) throw new Error(`Missing generated file: ${path}`);
  return match.content;
}

describe("Convex Better Auth email ownership", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework}/email-on verifies ownership and queues generic delivery`, () => {
        const files = generate(mode, framework, true);
        const root = mode === "monorepo" ? "apps/web/" : "";
        const auth = read(files, "convex/auth.ts");
        const delivery = read(files, "convex/authEmail.ts");
        const client = read(
          files,
          mode === "monorepo" ? "packages/auth/src/client.ts" : "src/lib/auth-client.ts",
        );
        const signIn = read(files, `${root}src/components/auth/sign-in-form.tsx`);
        const signUp = read(files, `${root}src/components/auth/sign-up-form.tsx`);

        expect(parseSync("convex/auth.ts", auth).errors).toEqual([]);
        expect(parseSync("convex/authEmail.ts", delivery).errors).toEqual([]);
        expect(auth).toContain("requireEmailVerification: true");
        expect(auth).not.toContain("requireEmailVerification: false");
        expect(auth).toContain("sendOnSignUp: true");
        expect(auth).toContain("sendOnSignIn: true");
        expect(auth).toContain("sendVerificationEmail: async ({ user, url }, request)");
        expect(auth).toContain("sendResetPassword: async ({ user, url }, request)");
        expect(auth).toContain(
          'enqueueAuthEmail("verification", user.email, url, authEmailLocale(request))',
        );
        expect(auth).toContain(
          'enqueueAuthEmail("password-reset", user.email, url, authEmailLocale(request))',
        );
        expect(auth).toContain(
          'enqueueAuthEmail("magic-link", email, url, authEmailLocale(context?.request))',
        );
        expect(auth).toContain("magicLink({");
        expect(client).toContain("magicLinkClient");
        expect(signIn).toContain("identityClient.signInWithEmail");
        expect(signUp).toContain("identityClient.signUpWithEmail");

        expect(auth).toContain("ctx.scheduler");
        expect(auth).toContain("internal.authEmail.send");
        expect(auth).toContain(
          '.catch(() => console.error("[convex/auth] Auth email scheduling failed"))',
        );
        expect(auth).not.toContain("console.error(user");
        expect(auth).not.toContain("console.error(email");
        expect(auth).not.toContain("console.error(url");

        expect(delivery).toContain("export const send = internalAction({");
        expect(delivery).toContain('fetch("https://api.resend.com/emails"');
        expect(delivery).toContain('requireSecret("RESEND_API_KEY")');
        expect(delivery).toContain('requireSecret("EMAIL_FROM")');
        expect(delivery).toContain("kind: v.union(");
        expect(delivery).toContain('v.literal("verification")');
        expect(delivery).toContain('v.literal("password-reset")');
        expect(delivery).toContain('v.literal("magic-link")');
        expect(delivery).toContain('locale: v.literal("en")');
        expect(delivery).toContain("authEmailCopy(args.kind, args.locale, appName)");
        expect(delivery).toContain("{ status: response.status }");
        expect(delivery).not.toContain("console.error(args");
        expect(delivery).not.toContain("console.log(");

        expect(
          files.some(({ path }) => path.includes("forgot-password")),
          "forgot-password UI",
        ).toBe(true);
        expect(
          files.some(({ path }) => path.includes("reset-password")),
          "reset-password UI",
        ).toBe(true);
        expect(
          files.some(({ path }) => path.includes("verify-email")),
          "verification UI",
        ).toBe(true);
        expect(
          files.some(({ path }) => path.includes("magic-link")),
          "magic-link UI",
        ).toBe(true);
      });

      test(`${mode}/${framework}/email-off removes unverifiable password ownership`, () => {
        const files = generate(mode, framework, false);
        const root = mode === "monorepo" ? "apps/web/" : "";
        const auth = read(files, "convex/auth.ts");
        const client = read(
          files,
          mode === "monorepo" ? "packages/auth/src/client.ts" : "src/lib/auth-client.ts",
        );
        const signIn = read(files, `${root}src/components/auth/sign-in-form.tsx`);
        const signInMethods = read(files, `${root}src/components/auth/sign-in-methods.tsx`);
        const signUp = read(files, `${root}src/components/auth/sign-up-form.tsx`);

        expect(parseSync("convex/auth.ts", auth).errors).toEqual([]);
        expect(auth).toContain("emailAndPassword: { enabled: false }");
        expect(auth).not.toContain("requireEmailVerification: false");
        expect(auth).not.toContain("sendVerificationEmail");
        expect(auth).not.toContain("sendResetPassword");
        expect(auth).not.toContain("magicLink({");
        expect(client).not.toContain("magicLinkClient");
        expect(files.some(({ path }) => path === "convex/authEmail.ts")).toBe(false);

        expect(signIn).toContain('t("signIn.emailDisabled")');
        expect(signIn).toContain("<SignInMethods />");
        expect(signIn).not.toContain("identityClient.signInWithOAuth");
        expect(signInMethods).toContain("identityClient.signInWithOAuth");
        expect(signInMethods).not.toContain("identityClient.signInWithEmail");
        expect(signIn).not.toContain("identityClient.signInWithEmail");
        expect(signUp).toContain('t("signUp.emailDisabled")');
        expect(signUp).toContain("identityClient.signInWithOAuth");
        expect(signUp).not.toContain("identityClient.signUpWithEmail");

        for (const segment of ["forgot-password", "reset-password", "verify-email", "magic-link"]) {
          expect(
            files.some(({ path }) => path.includes(segment)),
            `${mode}/${framework}/${segment}`,
          ).toBe(false);
        }

        if (mode === "single") {
          expect(read(files, "README.md")).toContain(
            "Email/password signup, sign-in, verification, magic-link, and reset are disabled",
          );
          expect(read(files, "AGENTS.md")).toContain(
            "Email/password signup, sign-in, verification, magic-link, and reset are disabled",
          );
        }
      });
    }
  }

  test("email-off native clients do not advertise unavailable password credentials", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "convex-native-email-off",
        runtime: "bun",
        mode: "monorepo",
        framework: "tanstack-start",
        database: "convex",
        preset: "custom",
        auth: true,
        api: true,
        email: false,
        billing: [],
        apps: ["web", "mobile", "desktop"],
        features: [],
      }),
      { dryRun: true },
    );
    for (const path of [
      "apps/mobile/app/(auth)/sign-in.tsx",
      "apps/mobile/app/(auth)/sign-up.tsx",
      "apps/desktop/src/renderer/routes/sign-in.tsx",
      "apps/desktop/src/renderer/routes/sign-up.tsx",
    ]) {
      const source = read(files, path);
      expect(parseSync(path, source).errors, path).toEqual([]);
      expect(source, path).toMatch(/(?:Email\/password sign-in|Password signup).*unavailable/);
      expect(source, path).not.toContain("authClient.signIn.email");
      expect(source, path).not.toContain("authClient.signUp.email");
    }
  });
});
