import { describe, expect, test } from "bun:test";
import { expoAdminFeatureFiles } from "../../src/templates/apps/fragments/identity-workspace/expo-admin.js";
import {
  flush,
  generatedFormHarness,
  type TestElement,
} from "../helpers/generated-form-harness.js";
import {
  activate,
  adminUiBindings,
  emittedSource,
  knownAdminUser,
  nodesOf,
  readStateText,
  translated,
} from "../helpers/admin-read-state-harness.js";

interface QueryOptions {
  kind: "identity" | "users";
  enabled?: boolean;
  input?: { search?: string; page: number; limit: number };
}
function harness(mode: "monorepo" | "single", i18n: boolean) {
  const files = expoAdminFeatureFiles(mode, i18n);
  const session = {
    isPending: false,
    data: { user: { id: "admin-a" } } as { user: { id: string } } | undefined,
  };
  const application = {
    isPending: false,
    data: { user: { role: "admin" } } as { user: { role: string } } | undefined,
  };
  const query = {
    data: undefined as { users: (typeof knownAdminUser)[]; total: number } | null | undefined,
    isPending: false,
    error: null as Error | null,
  };
  const search = { value: "" };
  const observed: QueryOptions[] = [];
  const events: unknown[] = [];
  const failures = { create: false, role: false, ban: false };
  function mutation(operation: keyof typeof failures) {
    return {
      isPending: false,
      async mutateAsync(value: unknown) {
        events.push([operation, value]);
        if (failures[operation]) throw new Error("Operation refused");
      },
    };
  }
  const mutations = {
    createUser: mutation("create"),
    changeRole: mutation("role"),
    setBanned: mutation("ban"),
  };
  const ui = generatedFormHarness(
    ["/queries.ts", "/use-admin-operations.ts", "/screen.tsx", "/components/admin-view.tsx"]
      .map((suffix) => emittedSource(files, suffix))
      .join("\n"),
    ["AdminScreen", "AdminView"],
    {
      ...adminUiBindings(),
      useTranslations: () => translated,
      authClient: { useSession: () => session },
      orpc: {
        me: {
          queryOptions: (options: Omit<QueryOptions, "kind">) => ({ ...options, kind: "identity" }),
        },
        adminUsers: {
          list: {
            queryOptions: (options: Omit<QueryOptions, "kind">) => ({ ...options, kind: "users" }),
          },
        },
      },
      useQuery(options: QueryOptions) {
        observed.push(options);
        return options.kind === "identity" ? application : query;
      },
      useAdminSearch: () => ({ value: search.value, form: { Field: "SearchField" } }),
      useAdminCreateForm: () => ({}),
      useAdminMutations: () => mutations,
    },
  );
  return {
    query,
    session,
    application,
    search,
    observed,
    events,
    failures,
    mutations,
    render() {
      const screen = ui.render("AdminScreen") as TestElement;
      return ui.render("AdminView", screen.props);
    },
  };
}

describe("emitted Expo admin read state", () => {
  for (const mode of ["monorepo", "single"] as const)
    for (const i18n of [false, true]) {
      const corner = `${mode}/i18n=${i18n}`;
      const emptyTitle = i18n ? "list.emptyTitle" : "No users found";
      test(`${corner}: unknown and pending reads have no zero badge or empty claim`, () => {
        const ui = harness(mode, i18n);
        for (const data of [undefined, null]) {
          for (const pending of [false, true]) {
            Object.assign(ui.query, { data, isPending: pending, error: null });
            const view = ui.render();
            expect(nodesOf(view, "Badge")).toHaveLength(0);
            expect(readStateText(view)).not.toContain(emptyTitle);
            expect(nodesOf(view, "ActivityIndicator")).toHaveLength(pending ? 1 : 0);
            expect(nodesOf(view, "Alert")).toHaveLength(0);
            expect(ui.observed.at(-1)).toMatchObject({ kind: "users", enabled: true });
          }
        }
      });

      test(`${corner}: failed first reads expose an accessible error without claiming zero`, () => {
        const ui = harness(mode, i18n);
        for (const data of [undefined, null]) {
          ui.query.data = data;
          ui.query.error = new Error("Read refused");
          const view = ui.render();
          expect(nodesOf(view, "Badge")).toHaveLength(0);
          expect(readStateText(view)).not.toContain(emptyTitle);
          const alert = nodesOf(view, "Alert")[0]!;
          expect(alert.props.accessibilityRole).toBe("alert");
          expect(nodesOf(alert, "AlertTitle")).toHaveLength(1);
          expect(nodesOf(alert, "AlertDescription")).toHaveLength(1);
          expect(readStateText(alert)).toContain(
            i18n ? "list.loadErrorTitle" : "We couldn't load the users",
          );
          expect(readStateText(alert)).toContain(
            i18n ? "errors.requestFailed" : "The request failed. Try again.",
          );
        }
      });

      test(`${corner}: successful empty data owns the zero badge and explicit empty label`, () => {
        const ui = harness(mode, i18n);
        ui.query.data = { users: [], total: 0 };
        let view = ui.render();
        expect(nodesOf(view, "Badge")).toHaveLength(1);
        expect(readStateText(nodesOf(view, "Badge")[0]!).trim()).toBe("0");
        expect(readStateText(view)).toContain(emptyTitle);
        expect(nodesOf(view, "Alert")).toHaveLength(0);
        ui.query.error = new Error("Refresh refused");
        view = ui.render();
        expect(readStateText(nodesOf(view, "Badge")[0]!).trim()).toBe("0");
        expect(readStateText(view)).not.toContain(emptyTitle);
        expect(nodesOf(view, "Alert")).toHaveLength(1);
      });

      test(`${corner}: cached read and mutation errors retain known rows and callback targets`, async () => {
        const ui = harness(mode, i18n);
        ui.query.data = { users: [knownAdminUser], total: 1 };
        ui.query.error = new Error("Refresh refused");
        let view = ui.render();
        expect(readStateText(nodesOf(view, "Badge")[0]!).trim()).toBe("1");
        expect(readStateText(view)).toContain("Known member");
        expect(readStateText(view)).toContain("known@example.test");
        expect(nodesOf(view, "Alert")).toHaveLength(1);
        activate(view, i18n ? "actions.promote" : "Make admin", "onPress");
        await flush();
        expect(ui.events.at(-1)).toEqual(["role", { userId: "account-a", role: "admin" }]);
        ui.failures.role = true;
        activate(ui.render(), i18n ? "actions.promote" : "Make admin", "onPress");
        await flush();
        view = ui.render();
        expect(nodesOf(view, "Alert")).toHaveLength(2);
        expect(readStateText(view)).toContain(i18n ? "native.operationError" : "Operation refused");
        expect(readStateText(view)).toContain("Known member");
        activate(view, i18n ? "actions.suspend" : "Suspend", "onPress");
        await flush();
        expect(ui.events.at(-1)).toEqual([
          "ban",
          {
            userId: "account-a",
            banned: true,
            reason: i18n ? "native.suspensionReason" : "Suspended by mobile administrator",
          },
        ]);
        expect(nodesOf(ui.render(), "Alert")).toHaveLength(1);
        ui.mutations.setBanned.isPending = true;
        expect(nodesOf(ui.render(), "Button").every((button) => button.props.disabled)).toBe(true);
      });

      test(`${corner}: identity checks hide cached rows and preserve server query admission`, () => {
        const ui = harness(mode, i18n);
        ui.query.data = { users: [knownAdminUser], total: 1 };
        for (const denied of [
          { sessionPending: true, hasSession: false, applicationPending: false, role: undefined },
          { sessionPending: false, hasSession: false, applicationPending: false, role: undefined },
          { sessionPending: false, hasSession: true, applicationPending: true, role: undefined },
          { sessionPending: false, hasSession: true, applicationPending: false, role: "user" },
        ]) {
          Object.assign(ui.session, {
            isPending: denied.sessionPending,
            data: denied.hasSession ? { user: { id: "actor-a" } } : undefined,
          });
          Object.assign(ui.application, {
            isPending: denied.applicationPending,
            data: denied.role ? { user: { role: denied.role } } : undefined,
          });
          const view = ui.render();
          expect(ui.observed.at(-1)).toMatchObject({ kind: "users", enabled: false });
          expect(readStateText(view)).not.toContain("Known member");
          expect(nodesOf(view, "Badge")).toHaveLength(0);
          expect(nodesOf(view, "AdminCreateCard")).toHaveLength(0);
          expect(nodesOf(view, "Button")).toHaveLength(0);
        }
        ui.session.data = { user: { id: "admin-a" } };
        ui.application.data = { user: { role: "superAdmin" } };
        ui.search.value = " Known ";
        expect(readStateText(ui.render())).toContain("Known member");
        expect(ui.observed.at(-1)).toMatchObject({
          kind: "users",
          enabled: true,
          input: { search: "Known", page: 1, limit: 50 },
        });
      });
    }
});
