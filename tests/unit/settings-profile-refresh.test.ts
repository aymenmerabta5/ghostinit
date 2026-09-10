import { describe, expect, test } from "bun:test";
import { settingsFeatureHarness, settingsSource } from "../helpers/settings-feature-harness.js";
import { deferred, textContent } from "../helpers/generated-form-harness.js";

describe("profile feedback and canonical identity refresh", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["next", "tanstack"] as const) {
      test(`${mode}/${framework} refreshes identity after success and keeps failure input intact`, async () => {
        const source = settingsSource(
          mode,
          framework,
          "settings/model.ts",
          "settings/mutations.ts",
          "settings/use-profile-form.ts",
          "settings/components/profile-view.tsx",
        );
        const events: string[] = [];
        const toasts: string[] = [];
        const submitted: string[] = [];
        let expectedQueryClient: unknown;
        let failure: "throws" | "returns" | null = "throws";
        const updateProfile = async (input: { name: string }) => {
          submitted.push(input.name);
          if (failure === "throws") throw new Error("private provider detail");
          return { error: failure ? { message: "private provider detail" } : null };
        };
        const ui = settingsFeatureHarness(source, ["useProfileForm", "ProfileView"], {
          identityClient: { updateProfile },
          requestQueryAuthScopeRefresh: (client: unknown) => {
            expect(client).toBe(expectedQueryClient);
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
        expectedQueryClient = ui.queryClient;
        const render = () =>
          ui.render("ProfileView", {
            email: "profile@example.test",
            role: "user",
            model: ui.render("useProfileForm", "Original name"),
          });
        render();
        const form = ui.forms[0]!;
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
      test(`${mode}/${framework} late profile completion cannot notify or refresh another owner`, async () => {
        const pending = deferred<{ error: null }>();
        const events: string[] = [];
        const ui = settingsFeatureHarness(
          settingsSource(
            mode,
            framework,
            "settings/model.ts",
            "settings/mutations.ts",
            "settings/use-profile-form.ts",
          ),
          ["useProfileForm"],
          {
            identityClient: { updateProfile: () => pending.promise },
            requestQueryAuthScopeRefresh: () => events.push("refresh"),
            useRouter: () => ({ refresh: () => events.push("route") }),
            toast: { success: () => events.push("toast") },
          },
        );
        ui.render("useProfileForm", "Original");
        const form = ui.forms[0]!;
        const completion = form.handleSubmit();
        ui.changeOwner();
        pending.resolve({ error: null });
        await completion;
        expect(events).toEqual([]);
        expect(form.resets).toBe(0);
      });
    }
  }
});
