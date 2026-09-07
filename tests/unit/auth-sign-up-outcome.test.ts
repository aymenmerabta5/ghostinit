import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { signUpFormContent } from "../../src/templates/apps/fragments/auth/sign-up.js";
import { generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

function formFor(router: "next" | "tanstack", data: unknown, error: unknown = null) {
  const destinations: string[] = [];
  const ui = generatedFormHarness(signUpFormContent(router), ["SignUpForm"], {
    Link: "Link",
    CardFooter: "CardFooter",
    AuthOAuthButtons: "AuthOAuthButtons",
    createSignUpSchema: () => ({}),
    useRouter: () => ({ push: (destination: string) => destinations.push(destination) }),
    useNavigate:
      () =>
      ({ to }: { to: string }) => {
        destinations.push(to);
      },
    identityClient: { signUpWithEmail: async () => ({ data, error }) },
  });
  ui.render("SignUpForm");
  const form = ui.forms[0]!;
  form.values = {
    name: "Test Actor",
    email: "actor@example.test",
    password: "local-proof-password",
  };
  return { ui, form, destinations };
}

describe("generated web signup outcomes", () => {
  test("real pinned Better Auth outcomes choose verification or an authenticated destination", async () => {
    for (const requireEmailVerification of [true, false]) {
      const database = new Database(":memory:");
      const origin = "https://signup.fixture.test";
      const auth = betterAuth({
        database,
        baseURL: origin,
        secret: "local-signup-outcome-proof-secret-at-least-32-characters",
        trustedOrigins: [origin],
        emailAndPassword: { enabled: true, requireEmailVerification },
        logger: { disabled: true },
      });
      try {
        await (await auth.$context).runMigrations();
        const signup = () =>
          auth.handler(
            new Request(`${origin}/api/auth/sign-up/email`, {
              method: "POST",
              headers: { origin, "content-type": "application/json" },
              body: JSON.stringify({
                name: "Test Actor",
                email: "actor@example.test",
                password: "local-proof-password",
              }),
            }),
          );
        const response = await signup();
        expect(response.status).toBe(200);
        const data: unknown = await response.json();
        expect(data).toMatchObject({ token: requireEmailVerification ? null : expect.any(String) });
        for (const router of ["next", "tanstack"] as const) {
          const { form, destinations } = formFor(router, data);
          await form.handleSubmit();
          expect(destinations).toEqual([requireEmailVerification ? "/verify-email" : "/dashboard"]);
          expect(destinations[0]).not.toContain("actor@example.test");
          expect(destinations[0]).not.toContain("local-proof-password");
        }
        if (requireEmailVerification) {
          const duplicate = await signup();
          expect(duplicate.status).toBe(200);
          const duplicateData: unknown = await duplicate.json();
          expect(duplicateData).toMatchObject({ token: null });
          for (const router of ["next", "tanstack"] as const) {
            const { form, destinations } = formFor(router, duplicateData);
            await form.handleSubmit();
            expect(destinations).toEqual(["/verify-email"]);
          }
        }
      } finally {
        database.close();
      }
    }
  });

  for (const router of ["next", "tanstack"] as const) {
    test(`${router} failed signup preserves the form and stays on its current page`, async () => {
      const { ui, form, destinations } = formFor(router, null, { message: "Rejected" });
      await form.handleSubmit();
      expect(destinations).toEqual([]);
      expect(textContent(ui.render("SignUpForm"))).toContain("signUp.genericError");
      expect(form.values).toEqual({
        name: "Test Actor",
        email: "actor@example.test",
        password: "local-proof-password",
      });
      expect(form.resets).toBe(0);
    });
  }
});
