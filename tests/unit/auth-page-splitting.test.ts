import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { formatGenerationText } from "../../src/generation/plan-formatter.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { twoFactorFormContent } from "../../src/templates/apps/fragments/auth/two-factor.js";
import { resetPasswordFormContent } from "../../src/templates/apps/fragments/recovery/reset-password-form.js";
import {
  deferred,
  elements,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

describe("focused authentication route composition", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const i18n of [false, true]) {
        test(`${mode} ${framework} i18n=${i18n} emits bounded routes and complete form components`, async () => {
          const resolution = resolveCreateConfig({
            name: "auth-page-split",
            runtime: "bun",
            mode,
            framework,
            billing: ["stripe"],
            features: i18n ? ["i18n"] : [],
            database: "postgres",
            databaseWasExplicit: true,
            apps: ["web"],
            preset: "saas",
            cache: "none",
            deploy: "none",
          });
          if (!resolution.ok) throw new Error(resolution.message);
          const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
            desiredConfig: resolution.desiredConfig,
          });
          const root = mode === "single" ? "src" : "apps/web/src";
          for (const [route, formName, component] of [
            ["2fa", "two-factor-form", "TwoFactorForm"],
            ["reset-password", "reset-password-form", "ResetPasswordForm"],
          ]) {
            const routePath =
              framework === "nextjs"
                ? `${root}/app/${route}/page.tsx`
                : `${root}/routes/${route}.tsx`;
            const formPath = `${root}/components/auth/${formName}.tsx`;
            const clientPath = routePath.replace(/page\.tsx$/, "page.client.tsx");
            const filePaths = [
              routePath,
              formPath,
              ...(framework === "nextjs" && i18n ? [clientPath] : []),
            ];
            for (const path of filePaths) {
              const file = plan.files.find(({ physicalPath }) => physicalPath === path);
              expect(file, path).toBeDefined();
              const formatted = await formatGenerationText(path, file!.content);
              expect(formatted.split(/\r?\n/).length, path).toBeLessThanOrEqual(150);
              expect(parseSync(path, formatted).errors, path).toEqual([]);
            }
            const routeContent = plan.files.find(
              ({ physicalPath }) =>
                physicalPath === (framework === "nextjs" && i18n ? clientPath : routePath),
            )!.content;
            const form = plan.files.find(({ physicalPath }) => physicalPath === formPath)!;
            expect(routeContent).toContain(`<${component}`);
            expect(routeContent).not.toContain("useAppForm");
            expect(form.content).toContain("useAppForm({");
            expect(form.content).toContain('CardTitle as="h1"');
            expect(form.lifecycle).toBe(
              plan.files.find(
                ({ physicalPath }) => physicalPath === `${root}/components/auth/sign-in-form.tsx`,
              )!.lifecycle,
            );
            if (framework === "nextjs") {
              expect(
                plan.files.find(({ physicalPath }) => physicalPath === routePath)!.lifecycle,
              ).toBe("seed-once");
              if (i18n)
                expect(
                  plan.files.find(({ physicalPath }) => physicalPath === clientPath)!.lifecycle,
                ).toBe("seed-once");
            }
          }
        });
      }
    }
  }
});

describe("extracted authentication form behavior", () => {
  for (const router of ["next", "tanstack"] as const) {
    test(`${router} keeps two-factor method, trust, error, and pending controls together`, async () => {
      const challenge = deferred<{ error: null | object }>();
      const calls: Array<{ method: string; input: unknown }> = [];
      const navigations: string[] = [];
      const states: unknown[] = [];
      let cursor = 0;
      const ui = generatedFormHarness(twoFactorFormContent(router), ["TwoFactorForm"], {
        Badge: "Badge",
        CardFooter: "CardFooter",
        Link: "Link",
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [
            states[index],
            (value: unknown) => {
              states[index] = typeof value === "function" ? value(states[index]) : value;
            },
          ];
        },
        createTwoFactorChallengeSchema: () => ({}),
        useRouter: () => ({ push: (to: string) => navigations.push(to) }),
        useNavigate:
          () =>
          ({ to }: { to: string }) =>
            navigations.push(to),
        identityClient: {
          verifyTwoFactor: (input: unknown) => {
            calls.push({ method: "totp", input });
            return challenge.promise;
          },
          verifyBackupCode: async (input: unknown) => {
            calls.push({ method: "backup", input });
            return { error: null };
          },
        },
      });
      const render = () => {
        cursor = 0;
        return ui.render("TwoFactorForm");
      };
      const switchButton = () => {
        const subscription = elements(render()).find(({ props }) => "selector" in props)!;
        return (
          subscription.children[0] as (pending: boolean) => { props: Record<string, unknown> }
        )(ui.forms[0]!.isSubmitting);
      };
      render();
      const form = ui.forms[0]!;
      expect(form.values.trustDevice).toBe(false);
      Object.assign(form.values, { code: " 123456 ", trustDevice: true });
      const pending = form.handleSubmit();
      expect(calls).toEqual([{ method: "totp", input: { code: "123456", trustDevice: true } }]);
      expect(switchButton().props.disabled).toBe(true);
      challenge.resolve({ error: {} });
      await pending;
      expect(navigations).toEqual([]);
      expect(textContent(render())).toContain("twoFactor.genericError");
      (switchButton().props.onClick as () => void)();
      expect(textContent(render())).toContain("twoFactor.backupCodeDescription");
      expect(textContent(render())).not.toContain("twoFactor.genericError");
      expect(form.resets).toBe(1);
      expect(form.values).toEqual({ code: "", trustDevice: false });
      Object.assign(form.values, { code: " recovery-code " });
      await form.handleSubmit();
      expect(calls[1]).toEqual({
        method: "backup",
        input: { code: "recovery-code", trustDevice: false },
      });
      expect(navigations).toEqual(["/dashboard"]);
    });

    test(`${router} retains reset link errors and successful submission behavior`, async () => {
      const calls: unknown[] = [];
      const navigations: string[] = [];
      let fail = true;
      const ui = generatedFormHarness(resetPasswordFormContent(router), ["ResetPasswordForm"], {
        CardFooter: "CardFooter",
        Link: "Link",
        createResetPasswordSchema: () => ({}),
        useRouter: () => ({ push: (to: string) => navigations.push(to) }),
        useNavigate:
          () =>
          ({ to }: { to: string }) =>
            navigations.push(to),
        identityClient: {
          resetPassword: async (input: unknown) => {
            calls.push(input);
            return { error: fail ? {} : null };
          },
        },
      });
      const render = (token = "token", queryError: string | null = null) =>
        ui.render("ResetPasswordForm", { token, queryError });
      const missing = render("");
      expect(textContent(missing)).toContain("resetPassword.invalidLinkDescription");
      expect(elements(missing).some(({ type }) => type === "Form")).toBe(false);
      expect(textContent(render("token", "INVALID_TOKEN"))).toContain("resetPassword.expiredToken");
      expect(
        elements(render()).some(({ type, props }) => type === "CardTitle" && props.as === "h1"),
      ).toBe(true);
      const form = ui.forms[0]!;
      Object.assign(form.values, {
        newPassword: "correct-horse",
        confirmPassword: "correct-horse",
      });
      await form.handleSubmit();
      expect(textContent(render())).toContain("resetPassword.genericError");
      expect(form.values.newPassword).toBe("correct-horse");
      expect(navigations).toEqual([]);
      fail = false;
      await form.handleSubmit();
      expect(calls).toEqual([
        { newPassword: "correct-horse", token: "token" },
        { newPassword: "correct-horse", token: "token" },
      ]);
      expect(navigations).toEqual([router === "next" ? "/sign-in?reset=success" : "/sign-in"]);
    });
  }
});
