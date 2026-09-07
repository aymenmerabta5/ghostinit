import { describe, expect, test } from "bun:test";
import { formsFiles } from "../../src/templates/apps/fragments/web-ui/forms.js";
import { settingsProfileCardContent } from "../../src/templates/apps/fragments/settings/profile-card.js";
import { settingsPasswordCardContent } from "../../src/templates/apps/fragments/settings/password-card.js";
import { tanstackSettingsDataFeatureFiles } from "../../src/templates/apps/fragments/settings/tanstack-feature.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

describe("generated form rejection recovery", () => {
  test("server-rendered handler forms use POST and cannot submit until the client is ready", async () => {
    const source = formsFiles().find(({ path }) => path.endsWith("/ui/form.tsx"))!.content;
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
    const source = formsFiles().find(({ path }) => path.endsWith("/ui/form.tsx"))?.content;
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
    const source = formsFiles().find(({ path }) => path.endsWith("/ui/form.tsx"))?.content;
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

  for (const kind of ["profile", "password"] as const) {
    test(`${kind}: rejected request preserves input and retry can succeed`, async () => {
      let fail = true;
      const successes: string[] = [];
      const operation = async () => {
        if (fail) throw new Error("private transport details");
        return { error: null };
      };
      const source =
        kind === "profile" ? settingsProfileCardContent() : settingsPasswordCardContent();
      const name = kind === "profile" ? "ProfileEditor" : "PasswordCard";
      const ui = generatedFormHarness(source, [name], {
        identityClient: { updateProfile: operation, changePassword: operation },
        getQueryClient: () => ({}),
        requestQueryAuthScopeRefresh: () => undefined,
        useRouter: () => ({ refresh: () => undefined }),
        toast: {
          success: (_title: string, options: { description: string }) =>
            successes.push(options.description),
        },
      });
      const render = () =>
        ui.render(name, { email: "user@example.test", initialName: "Original", role: "user" });
      render();
      const form = ui.forms[0];
      if (!form) throw new Error("Missing generated app form");
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
        `errors.${kind === "profile" ? "profileUpdate" : "passwordUpdate"}`,
      );
      expect(textContent(render())).not.toContain("private transport details");
      expect(successes).toEqual([]);
      fail = false;
      await form.handleSubmit();
      expect(successes).toEqual([`${kind}.successMessage`]);
      expect(form.resets).toBe(kind === "password" ? 1 : 0);
    });
  }

  test("TanStack settings adapters return failures for rejected requests and retain success payloads", async () => {
    const files = tanstackSettingsDataFeatureFiles("src/features/settings", false, "", true, false);
    const source = files.find(({ path }) => path.endsWith("/mutations.ts"))?.content;
    if (!source) throw new Error("Missing settings mutation adapters");
    let fail = true;
    const operation = async () => {
      if (fail) throw new Error("private transport details");
      return { error: null, data: { totpURI: "otpauth://reviewed", backupCodes: ["backup"] } };
    };
    const ui = generatedFormHarness(source, ["useSettingsMutations"], {
      identityClient: Object.fromEntries(
        [
          "updateProfile",
          "changePassword",
          "enableTwoFactor",
          "verifyTwoFactor",
          "disableTwoFactor",
          "deleteAccount",
        ].map((name) => [name, operation]),
      ),
    });
    const actions = ui.render("useSettingsMutations") as Record<
      string,
      (...args: string[]) => Promise<{ ok: boolean; totpUri?: string }>
    >;
    for (const name of [
      "updateProfile",
      "changePassword",
      "enableTwoFactor",
      "verifyTwoFactor",
      "disableTwoFactor",
      "deleteAccount",
    ]) {
      const action = actions[name];
      if (!action) throw new Error(`Missing action ${name}`);
      await expect(action("value", "other")).resolves.toMatchObject({ ok: false });
    }
    fail = false;
    expect(await actions.enableTwoFactor?.("password")).toMatchObject({
      ok: true,
      totpUri: "otpauth://reviewed",
    });
  });

  test("profile SSR data is never reused after hydration resolves a different or anonymous owner", () => {
    const initialUser = { id: "user-a", email: "a@example.test", name: "Account A", role: "admin" };
    const current = {
      data: {
        user: { id: "user-b", email: "b@example.test", name: "Account B", role: "user" },
      } as { user: typeof initialUser } | null,
      isPending: false,
    };
    const ui = generatedFormHarness(settingsProfileCardContent(), ["ProfileCard"], {
      identityClient: { useSession: () => current },
      useQueryAuthSession: () => null,
    });
    ui.setHydrated(false);
    expect(elements(ui.render("ProfileCard", { initialUser }))[0]?.props.initialName).toBe(
      "Account A",
    );
    ui.setHydrated(true);
    expect(elements(ui.render("ProfileCard", { initialUser }))[0]?.props.initialName).toBe(
      "Account B",
    );
    current.isPending = true;
    expect(
      elements(ui.render("ProfileCard", { initialUser })).some(
        ({ props }) => props["aria-busy"] === true,
      ),
    ).toBe(true);
    current.isPending = false;
    current.data = null;
    expect(
      elements(ui.render("ProfileCard", { initialUser })).some(
        ({ props }) => "initialName" in props,
      ),
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
    const ui = generatedFormHarness(settingsProfileCardContent(), ["ProfileCard"], {
      identityClient: { useSession: () => ({ data: { user: provider }, isPending: false }) },
      useQueryAuthSession: () => canonical,
    });
    expect(elements(ui.render("ProfileCard", {}))[0]?.props.role).toBe("admin");
    canonical.hasCanonicalApi = false;
    expect(elements(ui.render("ProfileCard", {}))[0]?.props.role).toBe("user");
  });
});
