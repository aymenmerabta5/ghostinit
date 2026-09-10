import { describe, expect, test } from "bun:test";
import { adminUsersHook } from "../../src/templates/apps/fragments/admin/hooks.js";
import {
  adminFeatureIndexFile,
  adminUserResultsFile,
} from "../../src/templates/apps/fragments/admin/users-page.js";
import type { AdminTemplateOptions } from "../../src/templates/apps/fragments/admin/model.js";
import { generatedFormHarness, type TestElement } from "../helpers/generated-form-harness.js";
import {
  activate,
  adminUiBindings,
  knownAdminUser,
  nodesOf,
  readStateText,
  translated,
} from "../helpers/admin-read-state-harness.js";

interface ReadResult {
  data: { users: (typeof knownAdminUser)[]; total: number } | null | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: Error | null;
  hasMore: boolean;
  totalIsExact: boolean;
}
interface FilterInput {
  search: string;
  page: number;
  limit: number;
}
interface AdminState {
  total: number | undefined;
  filters: FilterInput;
  applyFilters(input: { search: string }): void;
  clearFilters(): void;
}
function harness(options: AdminTemplateOptions) {
  const query: ReadResult = {
    data: undefined,
    isPending: false,
    isFetching: false,
    error: null,
    hasMore: false,
    totalIsExact: options.database === "postgres",
  };
  const events: unknown[] = [];
  const formattedCounts: number[] = [];
  const reads: { filters: FilterInput; initialData: unknown }[] = [];
  const mutations = {
    error: null as Error | null,
    rolePendingId: null,
    banPendingId: null,
    resetErrors() {
      events.push("dismiss");
      mutations.error = null;
    },
    async updateRole(id: string, role: string) {
      events.push(["role", id, role]);
      return true;
    },
    async updateBanned(id: string, banned: boolean) {
      events.push(["ban", id, banned]);
      return true;
    },
  };
  const source = [
    adminUsersHook(options),
    adminFeatureIndexFile(options),
    adminUserResultsFile(options),
  ]
    .map((file) => file.content)
    .join("\n");
  const ui = generatedFormHarness(source, ["AdminUsersFeature", "AdminUsersResults"], {
    ...adminUiBindings(),
    DEFAULT_ADMIN_USERS_FILTERS: { search: "", page: 1, limit: 20 },
    useAdminUsersTranslations: () => translated,
    resolveAdminUsersError: (error: unknown) => error,
    translateAdminUsersError: (error: Error | null) => error?.message ?? null,
    formatAdminUsersAccountCount: (_translate: unknown, total: number) => {
      if (typeof total !== "number") throw new Error("Unknown account total reached formatter");
      formattedCounts.push(total);
      return `accounts:${total}`;
    },
    useAdminUserFilters: (input: unknown) => input,
    useCreateAdminUser: () => ({}),
    useAdminUsersData(filters: FilterInput, initialData: unknown) {
      reads.push({ filters: { ...filters }, initialData });
      return {
        ...query,
        retry: async () => {
          events.push("retry");
        },
        requestPage: (page: number) => {
          events.push(["page", page]);
        },
      };
    },
    useAdminUserMutations: () => mutations,
  });
  return {
    query,
    mutations,
    events,
    formattedCounts,
    reads,
    render(initialData?: unknown) {
      formattedCounts.length = 0;
      const feature = ui.render("AdminUsersFeature", { initialData });
      const result = (feature as TestElement).children.find(
        (value) =>
          value &&
          typeof value === "object" &&
          "props" in value &&
          (value as TestElement).props.admin,
      ) as TestElement | undefined;
      if (!result) throw new Error("Missing emitted AdminUsersResults boundary");
      return {
        feature,
        admin: result.props.admin as AdminState,
        results: ui.render("AdminUsersResults", result.props),
      };
    },
  };
}

describe("emitted web admin read state", () => {
  for (const mode of ["monorepo", "single"] as const)
    for (const framework of ["next", "tanstack"] as const)
      for (const database of ["postgres", "convex"] as const)
        for (const i18n of [false, true]) {
          const options: AdminTemplateOptions = {
            mode,
            framework,
            database,
            i18n,
            sourceRoot: mode === "monorepo" ? "apps/web/src" : "src",
          };
          const corner = `${mode}/${framework}/${database}/i18n=${i18n}`;

          test(`${corner}: unknown, pending, and failed first reads never claim an empty list`, () => {
            const ui = harness(options);
            for (const data of [undefined, null]) {
              for (const status of ["unknown", "pending", "failed"] as const) {
                Object.assign(ui.query, {
                  data,
                  isPending: status === "pending",
                  error: status === "failed" ? new Error("Read refused") : null,
                });
                const view = ui.render();
                expect(view.admin.total).toBeUndefined();
                expect(ui.formattedCounts).toEqual([]);
                expect(readStateText(view.feature)).not.toContain("accounts:");
                expect(nodesOf(view.results, "Empty")).toHaveLength(0);
                expect(nodesOf(view.results, "UserTable")).toHaveLength(0);
                expect(nodesOf(view.results, "AdminUsersPagination")).toHaveLength(0);
                expect(nodesOf(view.results, "UserTableSkeleton")).toHaveLength(
                  status === "pending" ? 1 : 0,
                );
                if (status === "failed") {
                  expect(readStateText(view.results)).toContain("Read refused");
                  activate(view.results, "list.retry");
                  expect(ui.events.at(-1)).toBe("retry");
                }
              }
            }
          });

          test(`${corner}: a successful empty response owns its zero count and search actions`, () => {
            const ui = harness(options);
            ui.query.data = { users: [], total: 0 };
            let view = ui.render();
            expect(view.admin.total).toBe(0);
            expect(ui.formattedCounts).toEqual([0]);
            expect(readStateText(view.feature)).toContain("accounts:0");
            expect(readStateText(view.results)).toContain("list.emptyTitle");
            expect(nodesOf(view.results, "Empty")).toHaveLength(1);
            expect(nodesOf(view.results, "UserTable")).toHaveLength(0);
            expect(nodesOf(view.results, "AdminUsersPagination")).toHaveLength(0);
            view.admin.applyFilters({ search: "  missing  " });
            view = ui.render();
            expect(view.admin.filters).toMatchObject({ search: "missing", page: 1 });
            expect(readStateText(view.results)).toContain("list.emptySearchTitle");
            activate(view.results, "list.clearSearch");
            expect(ui.render().admin.filters.search).toBe("");
            ui.query.error = new Error("Refresh refused");
            view = ui.render();
            expect(view.admin.total).toBe(0);
            expect(ui.formattedCounts).toEqual([0]);
            expect(nodesOf(view.results, "UserTable")[0]!.props.total).toBe(0);
            expect(readStateText(view.feature)).toContain("accounts:0");
            expect(nodesOf(view.results, "Empty")).toHaveLength(0);
            expect(readStateText(view.results)).not.toContain("list.emptyTitle");
            expect(nodesOf(view.results, "AdminUsersPagination")).toHaveLength(0);
            ui.query.data = undefined;
            ui.query.error = null;
            view = ui.render();
            expect(view.admin.total).toBeUndefined();
            expect(ui.formattedCounts).toEqual([]);
            expect(readStateText(view.feature)).not.toContain("accounts:");
            for (const type of ["UserTable", "Empty", "AdminUsersPagination"])
              expect(nodesOf(view.results, type)).toHaveLength(0);
          });

          test(`${corner}: cached read errors retain known rows and callbacks without showing the pager`, async () => {
            const ui = harness(options);
            ui.query.data = { users: [knownAdminUser], total: 41 };
            ui.query.error = new Error("Refresh refused");
            ui.query.isFetching = true;
            let view = ui.render();
            expect(view.admin.total).toBe(41);
            expect(ui.formattedCounts).toEqual([41]);
            expect(readStateText(view.feature)).toContain("accounts:41");
            expect(readStateText(view.results)).toContain("Refresh refused");
            expect(nodesOf(view.results, "Empty")).toHaveLength(0);
            expect(nodesOf(view.results, "AdminUsersPagination")).toHaveLength(0);
            const table = nodesOf(view.results, "UserTable")[0]!;
            expect(table.props.users).toEqual([knownAdminUser]);
            expect(table.props.total).toBe(41);
            expect(table.props.totalIsExact).toBe(ui.query.totalIsExact);
            await (table.props.onToggleRole as (id: string, role: string) => Promise<boolean>)(
              "identity-a",
              "user",
            );
            await (table.props.onToggleBanned as (id: string, banned: boolean) => Promise<boolean>)(
              "identity-a",
              false,
            );
            expect(ui.events).toEqual([
              ["role", "identity-a", "admin"],
              ["ban", "identity-a", true],
            ]);
            activate(view.results, "list.retry");
            expect(ui.events.at(-1)).toBe("retry");

            ui.query.error = null;
            ui.mutations.error = new Error("Mutation refused");
            view = ui.render();
            expect(nodesOf(view.results, "UserTable")[0]!.props.users).toEqual([knownAdminUser]);
            expect(nodesOf(view.results, "AdminUsersPagination")).toHaveLength(1);
            expect(readStateText(view.results)).toContain("Mutation refused");
            activate(view.results, "list.dismiss");
            expect(ui.events.at(-1)).toBe("dismiss");
            expect(readStateText(ui.render().results)).not.toContain("Mutation refused");
            expect(ui.render().admin.total).toBe(41);
            expect(ui.formattedCounts).toEqual([41]);
          });

          test(`${corner}: known pages preserve pagination, filtering, and initial snapshot ownership`, () => {
            const ui = harness(options);
            ui.query.data = { users: [knownAdminUser], total: 41 };
            const snapshot = { userId: "admin-a", users: [knownAdminUser], total: 41 };
            let view = ui.render(snapshot);
            expect(ui.reads.at(-1)!.initialData).toBe(snapshot);
            let pager = nodesOf(view.results, "AdminUsersPagination")[0]!;
            expect(pager.props.page).toBe(1);
            expect(pager.props.totalPages).toBe(3);
            (pager.props.onNext as () => void)();
            view = ui.render(snapshot);
            expect(ui.reads.at(-1)!.initialData).toBeUndefined();
            expect(ui.events.at(-1)).toEqual(["page", 2]);
            pager = nodesOf(view.results, "AdminUsersPagination")[0]!;
            expect(pager.props.page).toBe(2);
            (pager.props.onPrevious as () => void)();
            view = ui.render(snapshot);
            expect(view.admin.filters.page).toBe(1);
            expect(ui.reads.at(-1)!.initialData).toBe(snapshot);
            view.admin.applyFilters({ search: " Known " });
            view = ui.render(snapshot);
            expect(view.admin.filters).toMatchObject({ page: 1, search: "Known" });
            expect(ui.reads.at(-1)!.initialData).toBeUndefined();
          });
        }
});
