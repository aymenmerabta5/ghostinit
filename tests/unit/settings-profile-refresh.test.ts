import { describe, expect, test } from "bun:test";
import { settingsProfileCardContent } from "../../src/templates/apps/fragments/settings/profile-card.js";
import { tanstackSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/index.js";
import { settingsProfileCardSingle } from "../../src/templates/modes/single/pages/settings.js";
import { generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

describe("profile feedback and canonical identity refresh", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      test(`${mode}/${framework} refreshes identity after success and keeps failure input intact`, async () => {
        const source =
          framework === "next"
            ? mode === "single"
              ? settingsProfileCardSingle()
              : settingsProfileCardContent()
            : tanstackSettingsFeatureFiles(mode, true).find(({ path }) =>
                path.endsWith("/profile-card.tsx"),
              )?.content;
        if (!source) throw new Error("Missing profile component");
        const component = framework === "next" ? "ProfileEditor" : "ProfileCard";
        const events: string[] = [];
        const toasts: string[] = [];
        const submitted: string[] = [];
        let failure: "throws" | "returns" | null = "throws";
        const updateProfile = async (input: string | { name: string }) => {
          submitted.push(typeof input === "string" ? input : input.name);
          if (failure === "throws") throw new Error("private provider detail");
          return failure
            ? {
                ok: false,
                error: { message: "private provider detail" },
                message: "private provider detail",
              }
            : { ok: true, error: null };
        };
        const queryClient = {};
        const ui = generatedFormHarness(source, [component], {
          identityClient: { updateProfile },
          getQueryClient: () => queryClient,
          requestQueryAuthScopeRefresh: (client: unknown) => {
            expect(client).toBe(queryClient);
            events.push("canonical");
          },
          useRouter: () => ({ refresh: () => events.push("route") }),
          toast: {
            success: (title: string, options: { description: string }) => {
              events.push("toast");
              toasts.push(`${title}:${options.description}`);
            },
          },
        });
        const profile = {
          email: "profile@example.test",
          initialName: "Original name",
          role: "user",
        };
        const render = () => ui.render(component, { ...profile, profile, updateProfile });
        render();
        const form = ui.forms[0];
        if (!form) throw new Error("Missing profile form");
        form.values.name = "Updated name";
        for (const outcome of ["throws", "returns"] as const) {
          failure = outcome;
          await form.handleSubmit();
          expect(textContent(render())).toContain("errors.profileUpdate");
          expect(textContent(render())).not.toContain("private provider detail");
          expect(form.values.name).toBe("Updated name");
          expect(form.resets).toBe(0);
          expect(form.isSubmitting).toBe(false);
          expect(events).toEqual([]);
        }
        failure = null;
        await form.handleSubmit();
        expect(events).toEqual(
          framework === "next" ? ["toast", "canonical", "route"] : ["toast", "canonical"],
        );
        expect(toasts).toEqual(["profile.successTitle:profile.successMessage"]);
        expect(textContent(render())).not.toContain("errors.profileUpdate");
        expect(submitted).toEqual(["Updated name", "Updated name", "Updated name"]);
      });
    }
  }
});
