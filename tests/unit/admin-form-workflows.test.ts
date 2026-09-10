import { describe, expect, test } from "bun:test";
import { adminFormWorkflowFiles } from "../../src/templates/apps/fragments/admin/form-workflows.js";
import { generatedFormHarness } from "../helpers/generated-form-harness.js";

const files = adminFormWorkflowFiles({
  database: "postgres",
  framework: "next",
  sourceRoot: "src",
  mode: "single",
});
function source(suffix: string): string {
  return files.find(({ path }) => path.endsWith(suffix))?.content ?? "";
}

describe("admin feature workflow behavior", () => {
  test("failed creation retains the form; successful creation resets and navigates once", async () => {
    let accepted = false;
    let navigations = 0;
    const submitted: unknown[] = [];
    const harness = generatedFormHarness(
      source("use-create-admin-user.ts"),
      ["useCreateAdminUser"],
      {
        useAdminUsersTranslations: () => (key: string) => key,
        createAdminUserSchema: () => ({}),
        resolveAdminUsersError: (error: unknown) => error,
        translateAdminUsersError: () => null,
        useAdminUserMutations: () => ({
          createPending: false,
          error: null,
          createUser: async (input: unknown) => {
            submitted.push(input);
            return accepted;
          },
        }),
      },
    );
    harness.render("useCreateAdminUser", () => {
      navigations++;
    });
    const form = harness.forms[0]!;
    form.values = {
      name: "Moderator",
      email: "moderator@example.test",
      password: "long-passphrase",
      role: "user",
    };
    await form.handleSubmit();
    expect(form.resets).toBe(0);
    expect(form.values.name).toBe("Moderator");
    expect(navigations).toBe(0);
    accepted = true;
    await form.handleSubmit();
    expect(form.resets).toBe(1);
    expect(form.values).toMatchObject({ name: "", email: "", password: "", role: "user" });
    expect(navigations).toBe(1);
    expect(submitted).toHaveLength(2);
  });

  test("row actions keep confirmation on rejection and close only after success", async () => {
    let accepted = false;
    const calls: unknown[] = [];
    const harness = generatedFormHarness(source("use-admin-user-action.ts"), [
      "useAdminUserAction",
    ]);
    const options = {
      user: { id: "u", identityId: "i", role: "user", banned: false },
      rolePending: false,
      banPending: false,
      onToggleRole: async (...args: unknown[]) => {
        calls.push(args);
        return accepted;
      },
      onToggleBanned: async () => false,
    };
    type Action = {
      confirmation: string | null;
      chooseRole(): void;
      confirmAction(): Promise<void>;
    };
    const render = () => harness.render("useAdminUserAction", options) as Action;
    render().chooseRole();
    await render().confirmAction();
    expect(render().confirmation).toBe("role");
    expect(calls).toEqual([["i", "user"]]);
    accepted = true;
    await render().confirmAction();
    expect(render().confirmation).toBe(null);
    expect(calls).toHaveLength(2);
  });
});
