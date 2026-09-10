import { expect, test } from "bun:test";
import { authIntentHookContent } from "../../src/templates/apps/fragments/auth/feature-actions.js";
import { authFeatureHarness } from "../helpers/auth-feature-harness.js";
import { deferred, generatedFormHarness } from "../helpers/generated-form-harness.js";

test("public authentication intent rejects duplicate and retired attempts without releasing a newer latch", () => {
  const generated = generatedFormHarness(authIntentHookContent(), ["createAuthIntent"]);
  type Ticket = { isCurrent(): boolean; finish(): void };
  const intent = generated.module.createAuthIntent!() as {
    mount(): void;
    retire(): void;
    begin(): Ticket | null;
  };
  expect(intent.begin()).toBeNull();
  intent.mount();
  const old = intent.begin()!;
  expect(old.isCurrent()).toBe(true);
  expect(intent.begin()).toBeNull();
  intent.retire();
  intent.mount();
  const fresh = intent.begin()!;
  expect(old.isCurrent()).toBe(false);
  old.finish();
  expect(intent.begin()).toBeNull();
  fresh.finish();
  expect(intent.begin()).not.toBeNull();
});

for (const router of ["next", "tanstack"] as const) {
  test(`${router} serializes password and OAuth attempts and preserves a failed password form`, async () => {
    const request = deferred<{ error: object | null; data: unknown }>();
    const calls: string[] = [];
    const destinations: string[] = [];
    const ui = authFeatureHarness(router, ["useSignInForm"], {
      useRouter: () => ({ push: (path: string) => destinations.push(path) }),
      useNavigate:
        () =>
        ({ to }: { to: string }) =>
          destinations.push(to),
      identityClient: {
        signInWithEmail: () => {
          calls.push("password");
          return request.promise;
        },
        signInWithOAuth: async () => {
          calls.push("oauth");
          return { error: null };
        },
      },
    });
    const state = ui.render("useSignInForm") as {
      methods: { onOAuth(provider: string): Promise<void> };
    };
    const form = ui.forms[0]!;
    form.values = { email: "actor@example.test", password: "retained-password" };
    const pending = form.handleSubmit();
    await state.methods.onOAuth("google");
    expect(calls).toEqual(["password"]);
    request.resolve({ error: { message: "private reason" }, data: null });
    await pending;
    expect(ui.render("useSignInForm")).toMatchObject({ error: "signIn.genericError" });
    expect(form.values.password).toBe("retained-password");
    expect(form.resets).toBe(0);
    expect(destinations).toEqual([]);
  });

  test(`${router} retired sign-in completion cannot navigate or clear fields`, async () => {
    const request = deferred<{ error: null; data: { twoFactorRedirect: boolean } }>();
    const destinations: string[] = [];
    const ui = authFeatureHarness(router, ["useSignInForm"], {
      useRouter: () => ({ push: (path: string) => destinations.push(path) }),
      useNavigate:
        () =>
        ({ to }: { to: string }) =>
          destinations.push(to),
      identityClient: { signInWithEmail: () => request.promise },
    });
    ui.render("useSignInForm");
    const form = ui.forms[0]!;
    form.values = { email: "actor@example.test", password: "retained-password" };
    const pending = form.handleSubmit();
    ui.unmount();
    request.resolve({ error: null, data: { twoFactorRedirect: true } });
    await pending;
    expect(destinations).toEqual([]);
    expect(form.values.password).toBe("retained-password");
    expect(form.resets).toBe(0);
  });
}
