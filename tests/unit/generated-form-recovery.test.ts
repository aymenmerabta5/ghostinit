import { describe, expect, test } from "bun:test";
import { formsFiles } from "../../src/templates/apps/fragments/web-ui/forms.js";
import { settingsFeatureHarness, settingsSource } from "../helpers/settings-feature-harness.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

function formSource(): string {
  const files = formsFiles();
  return ["form-submit.tsx", "form.tsx"]
    .map((name) => {
      const emitted = files.find(({ path }) => path.endsWith(`/ui/${name}`));
      if (!emitted) throw new Error(`Missing form module: ${name}`);
      return emitted.content;
    })
    .join("\n");
}

describe("generated form rejection recovery", () => {
  test("server-rendered handler forms use POST and cannot submit until the client is ready", async () => {
    const source = formSource();
    let attempts = 0;
    const form = {
      handleSubmit: async () => {
        attempts += 1;
      },
    };
    const ui = generatedFormHarness(source, ["Form"]);
    ui.setHydrated(false);
    const render = () => ui.render("Form", { form, children: "Form fields" });
    const before = elements(render());
    expect(before[0]?.props.method).toBe("post");
    expect(before[0]?.props.noValidate).toBe(true);
    expect(before.find(({ type }) => type === "fieldset")?.props.disabled).toBe(true);
    expect(textContent(render())).toContain("formJavaScriptRequired");
    (before[0]!.props.onSubmit as (event: unknown) => void)({
      preventDefault() {},
      stopPropagation() {},
    });
    await flush();
    expect(attempts).toBe(0);
    ui.setHydrated(true);
    const after = elements(render());
    expect(after.find(({ type }) => type === "fieldset")?.props.disabled).toBe(false);
    (after[0]!.props.onSubmit as (event: unknown) => void)({
      preventDefault() {},
      stopPropagation() {},
    });
    await flush();
    expect(attempts).toBe(1);
  });

  test("unexpected submit rejection stays inline, preserves values, and permits a deliberate retry", async () => {
    const source = formSource();
    if (!source) throw new Error("Missing generated Form");
    const first = deferred<void>();
    const second = deferred<void>();
    let attempts = 0;
    const form = { handleSubmit: () => (++attempts === 1 ? first.promise : second.promise) };
    const ui = generatedFormHarness(source, ["Form"]);
    const input = { type: "input", props: { value: "Keep this draft" }, children: [] };
    const render = () => ui.render("Form", { form, children: input });
    const submit = () => {
      const node = elements(render()).find(({ type }) => type === "form");
      if (!node) throw new Error("Missing native form");
      (node.props.onSubmit as (event: unknown) => void)({
        preventDefault() {},
        stopPropagation() {},
      });
    };
    submit();
    await flush();
    expect(elements(render())[0]?.props["aria-busy"]).toBe(true);
    submit();
    expect(attempts).toBe(1);
    const settled = Promise.allSettled([first.promise]);
    first.reject(new Error("private transport details"));
    await settled;
    await flush();
    const failed = render();
    expect(elements(failed)[0]?.props["aria-busy"]).toBe(false);
    expect(
      elements(failed).some(({ type, props }) => type === "Alert" && props.role === "alert"),
    ).toBe(true);
    expect(textContent(failed)).toContain("retry");
    expect(textContent(failed)).not.toContain("private transport details");
    expect(elements(failed).find(({ type }) => type === "input")?.props.value).toBe(
      "Keep this draft",
    );
    submit();
    await flush();
    expect(attempts).toBe(2);
    second.resolve();
    await flush();
    expect(elements(render()).some(({ type }) => type === "Alert")).toBe(false);
  });

  test("synchronous failures recover without duplicating a feature's handled error", async () => {
    const source = formSource();
    if (!source) throw new Error("Missing generated Form");
    let throws = true;
    const form = {
      handleSubmit: () => {
        if (throws) throw new Error("private details");
      },
    };
    const ui = generatedFormHarness(source, ["Form"]);
    const featureError = { type: "FeatureError", props: {}, children: ["Known operation failure"] };
    const render = () => ui.render("Form", { form, children: featureError });
    const submit = () => {
      const node = elements(render())[0];
      if (!node) throw new Error("Missing form");
      (node.props.onSubmit as (event: unknown) => void)({
        preventDefault() {},
        stopPropagation() {},
      });
    };
    submit();
    await flush();
    expect(elements(render()).some(({ type }) => type === "Alert")).toBe(true);
    throws = false;
    submit();
    await flush();
    expect(elements(render()).some(({ type }) => type === "Alert")).toBe(false);
    expect(textContent(render())).toContain("Known operation failure");
  });

  test("AppFormSubmitButton disabled can only further restrict valid idle submission", () => {
    const source = formSource();
    const ui = generatedFormHarness(source, ["AppFormSubmitButton"], {
      useFormContext: () => ({ Subscribe: "Subscribe" }),
    });
    for (const disabled of [undefined, false, true])
      for (const canSubmit of [false, true])
        for (const isSubmitting of [false, true]) {
          const subscription = elements(
            ui.render("AppFormSubmitButton", {
              disabled,
              children: "Save",
              pendingLabel: "Saving",
              "aria-busy": false,
            }),
          )[0]!;
          const render = subscription.children[0] as (state: readonly boolean[]) => unknown;
          const button = elements(render([canSubmit, isSubmitting]))[0]!;
          expect(button.props.disabled).toBe(Boolean(disabled) || !canSubmit || isSubmitting);
          expect(button.props["aria-busy"]).toBe(isSubmitting);
          expect(textContent(button)).toContain(isSubmitting ? "Saving" : "Save");
        }
  });

  for (const kind of ["profile", "password"] as const) {
    test(kind + ": rejected request preserves input and retry can succeed", async () => {
      let fail = true;
      const successes: string[] = [];
      const operation = async () => {
        if (fail) throw new Error("private transport details");
        return { error: null };
      };
      const name = kind === "profile" ? "useProfileForm" : "usePasswordForm";
      const view = kind === "profile" ? "ProfileView" : "PasswordView";
      const source = settingsSource(
        "single",
        "next",
        "settings/model.ts",
        "settings/mutations.ts",
        "settings/use-" + kind + "-form.ts",
        "settings/components/" + kind + "-view.tsx",
      );
      const ui = settingsFeatureHarness(source, [name, view], {
        identityClient: { updateProfile: operation, changePassword: operation },
        requestQueryAuthScopeRefresh: () => undefined,
        useRouter: () => ({ refresh: () => undefined }),
        toast: {
          success: (_title: string, options: { description: string }) =>
            successes.push(options.description),
        },
      });
      const render = () =>
        ui.render(view, {
          email: "user@example.test",
          role: "user",
          model: ui.render(name, "Original"),
        });
      render();
      const form = ui.forms[0]!;
      form.values =
        kind === "profile"
          ? { name: "Edited name" }
          : { currentPassword: "old-password", newPassword: "new-password" };
      const before = { ...form.values };
      await expect(form.handleSubmit()).resolves.toBeUndefined();
      expect(form.isSubmitting).toBe(false);
      expect(form.values).toEqual(before);
      expect(form.resets).toBe(0);
      expect(textContent(render())).toContain(
        "errors." + (kind === "profile" ? "profileUpdate" : "passwordUpdate"),
      );
      expect(textContent(render())).not.toContain("private transport details");
      expect(successes).toEqual([]);
      fail = false;
      await form.handleSubmit();
      expect(successes).toEqual([kind + ".successMessage"]);
      expect(form.resets).toBe(kind === "password" ? 1 : 0);
    });
  }

  test("TanStack settings adapters settle rejected operations and retain successful challenge payloads", async () => {
    let fail = true;
    const operation = async () => {
      if (fail) throw new Error("private transport details");
      return { error: null, data: { totpURI: "otpauth://reviewed", backupCodes: ["backup"] } };
    };
    const ui = settingsFeatureHarness(
      settingsSource("single", "tanstack", "settings/model.ts", "settings/mutations.ts"),
      ["useUpdateProfileMutation", "useChangePasswordMutation", "useTwoFactorMutation"],
      {
        identityClient: Object.fromEntries(
          [
            "updateProfile",
            "changePassword",
            "enableTwoFactor",
            "verifyTwoFactor",
            "disableTwoFactor",
          ].map((name) => [name, operation]),
        ),
      },
    );
    type Mutation = { run(input: unknown): Promise<unknown> };
    for (const [hook, input] of [
      ["useUpdateProfileMutation", { name: "Updated" }],
      ["useChangePasswordMutation", { currentPassword: "old", newPassword: "new" }],
      ["useTwoFactorMutation", { kind: "enable", password: "password" }],
      ["useTwoFactorMutation", { kind: "verify", code: "123456" }],
      ["useTwoFactorMutation", { kind: "disable", password: "password" }],
    ] as const)
      await expect((ui.render(hook) as Mutation).run(input)).resolves.toMatchObject({
        status: "error",
      });
    const deletion = settingsFeatureHarness(
      settingsSource(
        "single",
        "tanstack",
        "account-deletion/model.ts",
        "account-deletion/mutations.ts",
      ),
      ["useDeleteAccountMutation"],
      { identityClient: { deleteAccount: operation } },
    );
    const deleteHook = deletion.render("useDeleteAccountMutation", () => {
      throw new Error("Refused deletion completed");
    }) as { run(): Promise<void> };
    await expect(deleteHook.run()).resolves.toBeUndefined();
    expect(
      (deletion.render("useDeleteAccountMutation", () => {}) as { error: unknown }).error,
    ).toBeInstanceOf(Error);
    fail = false;
    expect(
      await (ui.render("useTwoFactorMutation") as Mutation).run({
        kind: "enable",
        password: "password",
      }),
    ).toMatchObject({
      status: "success",
      data: { kind: "challenge", totpUri: "otpauth://reviewed", backupCodes: ["backup"] },
    });
  });

  test("profile SSR data is never reused after hydration resolves a different or anonymous owner", () => {
    const initialUser = { id: "user-a", email: "a@example.test", name: "Account A", role: "admin" };
    const current = {
      data: {
        user: { id: "user-b", email: "b@example.test", name: "Account B", role: "user" },
        session: { id: "session-b" },
      } as { user: typeof initialUser; session: { id: string } } | null,
      isPending: false,
    };
    const source = settingsSource(
      "single",
      "next",
      "settings/queries.ts",
      "settings/use-profile-identity.ts",
      "settings/profile-card.tsx",
    );
    const ui = generatedFormHarness(source, ["ProfileCard"], {
      identityClient: { useSession: () => current },
      useQueryAuthSession: () => null,
    });
    const props = () => elements(ui.render("ProfileCard", { initialUser }))[0]?.props;
    ui.setHydrated(false);
    expect(props()?.user).toMatchObject({ name: "Account A" });
    ui.setHydrated(true);
    expect(props()?.user).toMatchObject({ name: "Account B" });
    current.isPending = true;
    expect(
      elements(ui.render("ProfileCard", { initialUser })).some(
        ({ props }) => props["aria-busy"] === true,
      ),
    ).toBe(true);
    current.isPending = false;
    current.data = null;
    expect(
      elements(ui.render("ProfileCard", { initialUser })).some(({ props }) => "user" in props),
    ).toBe(false);
    expect(textContent(ui.render("ProfileCard", { initialUser }))).toContain(
      "unauthorizedDescription",
    );
  });

  test("profile uses the canonical Convex domain role while API-off profiles keep provider identity", () => {
    const provider = { id: "provider-user", email: "operator@example.test", name: "Operator" };
    const domainUser = {
      id: "domain-user",
      email: provider.email,
      name: provider.name,
      role: "admin",
    };
    const canonical = {
      hasCanonicalApi: true,
      currentRequest: { user: domainUser },
      isPending: false,
      error: null,
    };
    const source = settingsSource(
      "single",
      "next",
      "settings/queries.ts",
      "settings/use-profile-identity.ts",
      "settings/profile-card.tsx",
    );
    const ui = generatedFormHarness(source, ["ProfileCard", "ProfileEditor"], {
      useProfileForm: () => ({}),
      ProfileView: "ProfileView",
      identityClient: {
        useSession: () => ({
          data: { user: provider, session: { id: "session" } },
          isPending: false,
        }),
      },
      useQueryAuthSession: () => canonical,
    });
    expect(elements(ui.render("ProfileCard", {}))[0]?.props.user).toMatchObject({
      id: "domain-user",
      role: "admin",
    });
    expect(elements(ui.render("ProfileEditor", { user: domainUser }))[0]?.props.role).toBe("admin");
    canonical.hasCanonicalApi = false;
    expect(elements(ui.render("ProfileCard", {}))[0]?.props.user).toEqual(provider);
    expect(elements(ui.render("ProfileEditor", { user: provider }))[0]?.props.role).toBe("user");
  });
});
