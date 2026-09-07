import { describe, expect, test } from "bun:test";
import { APIError, isAPIError } from "better-auth/api";
import { z } from "zod";
import { settingsActionsContent } from "../../src/templates/apps/fragments/settings/actions.js";
import { tanstackSettingsDataFeatureFiles } from "../../src/templates/apps/fragments/settings/tanstack-feature.js";
import { transactionalAccountDeletionContent } from "../../src/templates/auth-deletion.js";
import { generatedFormHarness } from "../helpers/generated-form-harness.js";

describe("account deletion Server Action error boundary", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} returns only approved provider codes and no private error details`, async () => {
      const privateMessage = "private adapter detail: delete from identity_user";
      let failure: unknown;
      const requests: unknown[] = [];
      const revalidated: string[] = [];
      const { authErrorCode } = generatedFormHarness(
        transactionalAccountDeletionContent(),
        ["authErrorCode"],
        { isAPIError },
      ).module;
      if (!authErrorCode) throw new Error("Missing auth error-code boundary");
      const harness = generatedFormHarness(
        settingsActionsContent(mode, false),
        ["deleteAccountAction"],
        {
          auth: {
            api: {
              deleteUser: async (request: unknown) => {
                requests.push(request);
                if (failure) throw failure;
              },
            },
          },
          authErrorCode,
          headers: async () => new Headers(),
          revalidatePath: (path: string) => revalidated.push(path),
          z,
        },
      );
      const action = harness.module.deleteAccountAction;
      if (!action) throw new Error("Missing deletion Server Action");

      for (const code of ["ACCOUNT_DELETION_RESTRICTED", "SESSION_EXPIRED", "SESSION_NOT_FRESH"]) {
        failure = new APIError("CONFLICT", { code, message: privateMessage });
        const result = await action({ password: "fixture-password" });
        expect(result).toEqual({ ok: false, error: "Account could not be deleted", code });
        expect(JSON.stringify(result)).not.toContain(privateMessage);
        expect(revalidated).toEqual([]);
      }

      for (const cause of [
        new APIError("CONFLICT", { code: "23503", message: privateMessage }),
        new APIError("CONFLICT", {
          code: "ACCOUNT_DELETION_RESTRICTED_EXTRA",
          message: privateMessage,
        }),
        new Error("ACCOUNT_DELETION_RESTRICTED"),
        { code: "ACCOUNT_DELETION_RESTRICTED", message: privateMessage },
        { body: { code: "ACCOUNT_DELETION_RESTRICTED", message: privateMessage } },
        { code: "23503", message: privateMessage },
      ]) {
        failure = cause;
        expect(await action({ password: "fixture-password" })).toEqual({
          ok: false,
          error: "Account could not be deleted",
        });
        expect(revalidated).toEqual([]);
      }

      const count = requests.length;
      expect(await action({ password: false })).toEqual({
        ok: false,
        error: "Invalid account deletion input",
      });
      expect(requests).toHaveLength(count);
      failure = undefined;
      expect(await action({ password: "fixture-password" })).toEqual({ ok: true });
      expect(revalidated).toEqual(["/"]);
    });
  }

  test("TanStack deletion adapter preserves the typed code without provider details", async () => {
    const source = tanstackSettingsDataFeatureFiles(
      "src/features/settings",
      false,
      "",
      true,
      false,
    ).find(({ path }) => path.endsWith("/mutations.ts"))?.content;
    if (!source) throw new Error("Missing settings mutation adapter");
    const harness = generatedFormHarness(source, ["useSettingsMutations"], {
      identityClient: {
        deleteAccount: async () => ({
          error: { code: "ACCOUNT_DELETION_RESTRICTED", message: "private provider detail" },
        }),
      },
    });
    const mutations = harness.render("useSettingsMutations");
    if (!mutations || typeof mutations !== "object") throw new Error("Missing settings mutations");
    const deleteAccount = Reflect.get(mutations, "deleteAccount");
    if (typeof deleteAccount !== "function") throw new Error("Missing account deletion mutation");
    expect(await deleteAccount("fixture-password")).toEqual({
      ok: false,
      code: "ACCOUNT_DELETION_RESTRICTED",
    });
  });
});
