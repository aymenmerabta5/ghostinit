import { describe, expect, test } from "bun:test";
import { desktopAdminFeatureFiles } from "../../src/templates/apps/desktop/routes/admin-feature.js";
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
  kind: "session" | "users";
  enabled?: boolean;
  select?(data: { users: (typeof knownAdminUser)[]; total: number }): unknown;
}
function harness(mode: "monorepo" | "single", i18n: boolean) {
  const files = desktopAdminFeatureFiles(mode, i18n);
  const session = {
    isPending: false,
    data: { user: { role: "admin", banned: false } } as
      | { user: { role: string; banned?: boolean } }
      | undefined,
  };
  const query = {
    data: undefined as { users: (typeof knownAdminUser)[]; total: number } | null | undefined,
    isPending: false,
    error: null as Error | null,
  };
  const observed: QueryOptions[] = [];
  const ui = generatedFormHarness(
    emittedSource(files, "/queries.ts") + "\n" + emittedSource(files, "/screen.tsx"),
    ["AdminUsersScreen"],
    {
      ...adminUiBindings(),
      useTranslations: () => translated,
      desktopQueryOptions: { me: () => ({ kind: "session" }) },
      orpc: {
        adminUsers: {
          list: {
            queryOptions: (options: Omit<QueryOptions, "kind">) => ({ ...options, kind: "users" }),
          },
        },
      },
      useQuery(options: QueryOptions) {
        if (options.kind === "session") return session;
        observed.push(options);
        return {
          ...query,
          data: query.data == null ? query.data : options.select?.(query.data),
        };
      },
    },
  );
  return { files, session, query, observed, render: () => ui.render("AdminUsersScreen") };
}

function expectNoUnknownCount(view: unknown): void {
  expect(readStateText(view)).not.toMatch(/Total 0 users\.|counts\.account(?:One|Many):0/);
  for (const description of nodesOf(view, "CardDescription")) {
    expect(readStateText(description).trim()).toBe("");
  }
}

describe("emitted desktop admin read state", () => {
  for (const mode of ["monorepo", "single"] as const)
    for (const i18n of [false, true]) {
      const corner = `${mode}/i18n=${i18n}`;
      test(`${corner}: missing, pending, and failed first reads never announce zero users`, () => {
        const ui = harness(mode, i18n);
        for (const data of [undefined, null]) {
          for (const status of ["unknown", "pending", "failed"] as const) {
            Object.assign(ui.query, {
              data,
              isPending: status === "pending",
              error: status === "failed" ? new Error("Read refused") : null,
            });
            const view = ui.render();
            expect(ui.observed.at(-1)!.enabled).toBe(true);
            expectNoUnknownCount(view);
            expect(nodesOf(view, "Empty")).toHaveLength(0);
            expect(nodesOf(view, "AdminUserActions")).toHaveLength(0);
            expect(nodesOf(view, "Skeleton").length > 0).toBe(status === "pending");
            if (status === "failed") {
              expect(nodesOf(view, "Alert")).toHaveLength(1);
              expect(readStateText(view)).toContain(
                i18n ? "list.loadErrorTitle" : "Failed to load",
              );
            }
          }
        }
      });

      test(`${corner}: a successful empty response displays the known zero and empty state`, () => {
        const ui = harness(mode, i18n);
        ui.query.data = { users: [], total: 0 };
        let view = ui.render();
        expect(readStateText(view)).toContain(i18n ? "counts.accountMany:0" : "Total 0 users.");
        expect(nodesOf(view, "Empty")).toHaveLength(1);
        expect(readStateText(view)).toContain(i18n ? "list.emptyTitle" : "No users found.");
        expect(nodesOf(view, "AdminUserActions")).toHaveLength(0);
        ui.query.error = new Error("Refresh refused");
        view = ui.render();
        expect(readStateText(view)).toContain(i18n ? "counts.accountMany:0" : "Total 0 users.");
        expect(nodesOf(view, "Empty")).toHaveLength(0);
        expect(readStateText(view)).not.toContain(i18n ? "list.emptyTitle" : "No users found.");
      });

      test(`${corner}: failed refreshes retain rows, totals, and their mutation controls`, async () => {
        const ui = harness(mode, i18n);
        ui.query.data = { users: [knownAdminUser], total: 1 };
        ui.query.error = new Error("Read refused");
        const view = ui.render();
        expect(readStateText(view)).toContain(i18n ? "counts.accountOne:1" : "Total 1 users.");
        expect(readStateText(view)).toContain("Known member");
        expect(readStateText(view)).toContain("known@example.test");
        expect(nodesOf(view, "Alert")).toHaveLength(1);
        expect(nodesOf(view, "Empty")).toHaveLength(0);
        const row = nodesOf(view, "AdminUserActions")[0]!;
        expect(row.props.user).toEqual(knownAdminUser);

        const events: unknown[] = [];
        const changeRole = {
          error: new Error("Mutation refused") as Error | null,
          reset() {
            changeRole.error = null;
          },
          async mutateAsync(value: unknown) {
            events.push(["role", value]);
          },
        };
        const changeBan = {
          error: null,
          reset() {},
          async mutateAsync(value: unknown) {
            events.push(["ban", value]);
          },
        };
        const rowHarness = generatedFormHarness(
          ["use-admin-user-actions.ts", "components/user-actions-view.tsx", "user-actions.tsx"]
            .map((suffix) => emittedSource(ui.files, "/" + suffix))
            .join("\n"),
          ["AdminUserActions", "AdminUserActionsView"],
          {
            ...adminUiBindings(),
            useTranslations: () => translated,
            useAdminRowMutations: () => ({
              changeRole,
              changeBan,
              refresh: async () => {
                events.push("refresh");
              },
            }),
          },
        );
        function renderRow() {
          const action = rowHarness.render("AdminUserActions", row.props) as TestElement;
          return rowHarness.render("AdminUserActionsView", action.props);
        }
        expect(nodesOf(renderRow(), "Alert")).toHaveLength(1);
        const action = rowHarness.render("AdminUserActions", row.props) as TestElement;
        const state = action.props.state as { run(operation: "role" | "ban"): Promise<void> };
        await state.run("role");
        expect(events).toEqual([["role", { userId: "account-a", role: "admin" }], "refresh"]);
        expect(nodesOf(renderRow(), "Alert")).toHaveLength(0);
        activate(renderRow(), i18n ? "actions.suspend" : "Ban");
        await flush();
        expect(events).toContainEqual(["ban", { userId: "account-a", banned: true }]);
      });

      test(`${corner}: permission and identity checks hide cached rows before admission`, () => {
        const ui = harness(mode, i18n);
        ui.query.data = { users: [knownAdminUser], total: 1 };
        for (const denied of [
          { isPending: true, data: undefined },
          { isPending: false, data: undefined },
          { isPending: false, data: { user: { role: "user" } } },
          { isPending: false, data: { user: { role: "admin", banned: true } } },
        ]) {
          Object.assign(ui.session, denied);
          const view = ui.render();
          expect(ui.observed.at(-1)!.enabled).toBe(false);
          expect(readStateText(view)).not.toContain("Known member");
          expect(readStateText(view)).not.toContain("counts.account");
          expect(nodesOf(view, "AdminUserActions")).toHaveLength(0);
          expect(nodesOf(view, "Button")).toHaveLength(0);
          if (!denied.isPending) expect(nodesOf(view, "Alert")).toHaveLength(1);
        }
      });
    }
});
