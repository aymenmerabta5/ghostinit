// @allow-long 500: emitted web, desktop and native variants cover read-state truthfulness, field callbacks, selection keys and mutation lifetimes
import { describe, expect, test } from "bun:test";
import {
  desktopWorkspaceFeatureFiles,
  expoWorkspaceFeatureFiles,
} from "../../src/templates/apps/fragments/identity-workspace/native-workspace.js";
import { webIdentityWorkspaceFeatureFiles } from "../../src/templates/apps/fragments/identity-workspace/web-feature.js";
import {
  elements,
  generatedFormHarness,
  flush,
  textContent,
  type TestForm,
} from "../helpers/generated-form-harness.js";

interface Organization {
  id: string;
  name: string;
  slug: string;
}
interface ReadState {
  isPending: boolean;
  isSuccess: boolean;
  data: Organization[] | undefined;
  error: Error | null;
}
interface OrganizationModel {
  form: TestForm;
  organizations: Organization[];
  organizationId: string | null;
  loading: boolean;
  ready: boolean;
  pending: boolean;
  error: Error | null;
  select(id: string): void;
  activate(): void;
}

const organizations = [
  { id: "organization-a", name: "Current workspace", slug: "current-workspace" },
  { id: "organization-b", name: "Other workspace", slug: "other-workspace" },
];
const emptyRead = (): ReadState => ({
  isPending: false,
  isSuccess: true,
  data: [],
  error: null,
});
const primitives = Object.fromEntries(
  [
    "ActivityIndicator",
    "ScrollView",
    "View",
    "Text",
    "Input",
    "Empty",
    "EmptyHeader",
    "EmptyTitle",
    "EmptyDescription",
    "Separator",
  ].map((name) => [name, name]),
);
const sections = [
  "WorkspaceOrganizations",
  "WorkspaceMembers",
  "WorkspaceTeams",
  "WorkspaceInvitations",
];
const scopes = sections.slice(1);

function emitted(
  platform: "web" | "desktop" | "native",
  mode: "monorepo" | "single",
  i18n: boolean,
) {
  const files =
    platform === "native"
      ? expoWorkspaceFeatureFiles(mode, i18n)
      : platform === "desktop"
        ? desktopWorkspaceFeatureFiles(mode, i18n)
        : webIdentityWorkspaceFeatureFiles(mode, i18n);
  return (suffix: string): string => {
    const entry = files.find(({ path }) => path.endsWith("/" + suffix));
    if (!entry) throw new Error("Missing emitted workspace file: " + suffix);
    return entry.content;
  };
}

function workflow(source: string) {
  const events: unknown[] = [];
  let current = true;
  let ownsSelection = true;
  let succeeds = true;
  const create = {
    isPending: false,
    error: null as Error | null,
    async run(input: unknown) {
      events.push(["create", input]);
      return {
        status: succeeds ? "success" : "error",
        isCurrent: () => current,
        data: { organization: { id: "created" } },
      };
    },
  };
  const activate = {
    isPending: false,
    error: null as Error | null,
    async run(input: unknown) {
      events.push(["activate", input]);
    },
  };
  const selection = {
    queries: { organizations: emptyRead(), organizationId: null as string | null },
    selectOrganization(id: string) {
      events.push(["select", id]);
    },
    captureSelection: () => () => ownsSelection,
  };
  const harness = generatedFormHarness(source, ["useWorkspaceOrganizations"], {
    organizationSchema: {},
    useCreateOrganizationMutation: () => create,
    useActivateOrganizationMutation: () => activate,
  });
  return {
    create,
    activate,
    selection,
    events,
    completion(options: { current: boolean; ownsSelection: boolean; succeeds: boolean }) {
      ({ current, ownsSelection, succeeds } = options);
    },
    render(): OrganizationModel {
      const model = harness.render("useWorkspaceOrganizations", selection) as OrganizationModel;
      Object.assign(model.form, { Field: "NativeField", Subscribe: "NativeSubscribe" });
      return model;
    },
  };
}

describe("workspace read-state presentation", () => {
  for (const platform of ["web", "desktop", "native"] as const) {
    for (const mode of ["monorepo", "single"] as const) {
      for (const i18n of [false, true]) {
        const label = `${platform}/${mode}/i18n=${i18n}`;
        const read = emitted(platform, mode, i18n);
        const native = platform === "native";
        const translations = { useTranslations: () => (key: string) => key };

        test(`${label} separates unknown and failed reads from confirmed empty data`, () => {
          const owner = workflow(read("use-workspace-organizations.ts"));
          const card = generatedFormHarness(
            read("components/organizations-card.tsx"),
            ["OrganizationsCard"],
            { ...primitives, ...translations },
          );
          const error = generatedFormHarness(
            read("components/workspace-error.tsx"),
            ["WorkspaceError"],
            translations,
          );
          const failedRead = new Error("private organization read failure");
          const failedWrite = new Error("private organization creation failure");
          const cases = [
            {
              label: "loading",
              read: { ...emptyRead(), isPending: true, isSuccess: false, data: undefined },
              writeError: null,
              empty: false,
            },
            {
              label: "failed",
              read: { ...emptyRead(), isSuccess: false, data: undefined, error: failedRead },
              writeError: null,
              empty: false,
            },
            {
              label: "unknown",
              read: { ...emptyRead(), isSuccess: false, data: undefined },
              writeError: null,
              empty: false,
            },
            { label: "empty", read: emptyRead(), writeError: null, empty: true },
            {
              label: "empty with failed write",
              read: emptyRead(),
              writeError: failedWrite,
              empty: true,
            },
            {
              label: "populated",
              read: { ...emptyRead(), data: organizations },
              writeError: null,
              empty: false,
            },
            {
              label: "retained rows after refetch failure",
              read: { ...emptyRead(), isSuccess: false, data: organizations, error: failedRead },
              writeError: null,
              empty: false,
            },
          ];
          for (const item of cases) {
            owner.selection.queries.organizations = item.read;
            owner.create.error = item.writeError;
            const model = owner.render();
            expect(model.ready, item.label).toBe(item.read.isSuccess);
            expect(model.loading, item.label).toBe(item.read.isPending);
            expect(model.error, item.label).toBe(item.writeError ?? item.read.error);
            const tree = card.render("OrganizationsCard", { model });
            const nodes = elements(tree);
            const copy = textContent(tree);
            expect(
              copy.includes(native && !i18n ? "No organizations yet" : "noOrganizations"),
              item.label,
            ).toBe(item.empty);
            expect(
              nodes.some(({ type }) => type === (native ? "ActivityIndicator" : "Skeleton")),
              item.label,
            ).toBe(item.read.isPending);
            expect(copy.includes("Current workspace"), item.label).toBe(
              Boolean(item.read.data?.length),
            );
            expect(
              nodes
                .filter(({ type }) => type === (native ? "NativeField" : "AppField"))
                .map(({ props }) => props.name),
              item.label,
            ).toEqual(["name", "slug"]);
            const failure = error.render("WorkspaceError", { error: model.error });
            expect(
              elements(failure).some(({ type }) => type === "Alert"),
              item.label,
            ).toBe(Boolean(model.error));
            expect(textContent(failure)).not.toContain("private organization");
          }
        });

        test(`${label} retains organization selection, activation and create controls`, async () => {
          const owner = workflow(read("use-workspace-organizations.ts"));
          owner.selection.queries.organizations.data = organizations;
          owner.selection.queries.organizationId = organizations[0]!.id;
          const card = generatedFormHarness(
            read("components/organizations-card.tsx"),
            ["OrganizationsCard"],
            { ...primitives, ...translations },
          );
          const model = owner.render();
          const nodes = elements(card.render("OrganizationsCard", { model }));
          const choices = nodes.filter(
            ({ type, props }) =>
              type === "Button" && organizations.some(({ id }) => props.key === id),
          );
          expect(choices).toHaveLength(2);
          for (const [index, node] of choices.entries()) {
            expect(
              native
                ? (node.props.accessibilityState as { selected: boolean }).selected
                : node.props["aria-pressed"],
            ).toBe(index === 0);
          }
          (choices[1]!.props[native ? "onPress" : "onClick"] as () => void)();
          const activate = nodes.find(
            ({ props }) => props[native ? "onPress" : "onClick"] === model.activate,
          )!;
          (activate.props[native ? "onPress" : "onClick"] as () => void)();
          expect(owner.events).toEqual([
            ["select", "organization-b"],
            ["activate", { organizationId: "organization-a" }],
          ]);
          model.form.setFieldValue("name", " New organization ");
          model.form.setFieldValue("slug", " new-organization ");
          if (native) {
            const create = nodes.find(
              ({ type, children }) =>
                type === "Button" &&
                textContent(children).includes(i18n ? "createOrganization" : "Create organization"),
            )!;
            (create.props.onPress as () => void)();
            await flush();
          } else {
            expect(nodes.find(({ type }) => type === "Form")!.props.form).toBe(model.form);
            await model.form.handleSubmit();
          }
          expect(owner.events.slice(-2)).toEqual([
            ["create", { name: "New organization", slug: "new-organization" }],
            ["select", "created"],
          ]);
          expect(model.form.resets).toBe(1);
          for (const mutation of [owner.create, owner.activate]) {
            mutation.isPending = true;
            const pending = elements(card.render("OrganizationsCard", { model: owner.render() }));
            const submit = pending.find(({ type, children }) =>
              native
                ? type === "Button" &&
                  textContent(children).includes(
                    i18n ? "createOrganization" : "Create organization",
                  )
                : type === "SubmitButton",
            )!;
            expect(submit.props.disabled).toBe(true);
            mutation.isPending = false;
          }
        });

        test(`${label} mounts scoped sections only for a known organization and preserves error ownership`, () => {
          let retries = 0;
          const selection = {
            queries: {
              organizationId: null as string | null,
              teamId: null as string | null,
              permissions: {
                isPending: false,
                hasError: false,
                retry() {
                  retries++;
                },
              },
            },
          };
          const initialData = { marker: "server result" };
          const screenName = native ? "WorkspaceScreen" : "IdentityWorkspace";
          const screen = generatedFormHarness(
            read(native ? "screen.tsx" : "identity-workspace.tsx"),
            [screenName],
            {
              ...primitives,
              ...translations,
              ...Object.fromEntries(sections.map((name) => [name, name])),
              useWorkspaceSelection(initial: unknown) {
                expect(initial).toBe(native ? undefined : initialData);
                return selection;
              },
            },
          );
          const contexts: readonly [string | null, string | null][] = [
            [null, null],
            [null, "old-team"],
            ["organization-a", "team-a"],
            ["organization-a", "team-b"],
            ["organization-b", null],
            [null, null],
          ];
          const keysBySelection: Record<string, unknown>[] = [];
          for (const [organizationId, teamId] of contexts) {
            selection.queries.organizationId = organizationId;
            selection.queries.teamId = teamId;
            const nodes = elements(screen.render(screenName, { initialData }));
            const active = nodes.filter(({ type }) => sections.includes(type as string));
            expect(active.map(({ type }) => type)).toEqual(
              organizationId ? sections : ["WorkspaceOrganizations"],
            );
            for (const node of active) expect(node.props.selection).toBe(selection);
            const scoped = active.filter(({ type }) => scopes.includes(type as string));
            const keys = Object.fromEntries(
              scoped.map(({ type, props }) => [String(type), props.key]),
            );
            expect(new Set(Object.values(keys)).size).toBe(scoped.length);
            for (const node of scoped) {
              const prefix =
                node.type === "WorkspaceMembers"
                  ? "members:"
                  : node.type === "WorkspaceTeams"
                    ? "teams:"
                    : "invitations:";
              expect(node.props.key).toBe(
                prefix + organizationId + (node.type === "WorkspaceTeams" ? ":" + teamId : ""),
              );
            }
            if (organizationId) keysBySelection.push(keys);
          }
          for (const name of scopes) {
            const first = keysBySelection[0]![name];
            const teamChanged = keysBySelection[1]![name];
            expect(teamChanged === first).toBe(name !== "WorkspaceTeams");
            expect(keysBySelection[2]![name]).not.toBe(teamChanged);
          }
          selection.queries.permissions.hasError = true;
          const failure = elements(screen.render(screenName, { initialData }));
          expect(failure.some(({ type }) => type === "Alert")).toBe(true);
          const retry = failure.find(({ type }) => type === "Button")!;
          (retry.props[native ? "onPress" : "onClick"] as () => void)();
          expect(retries).toBe(1);
          selection.queries.permissions.hasError = false;
          selection.queries.permissions.isPending = true;
          const pending = elements(screen.render(screenName, { initialData }));
          expect(
            pending.some(({ props }) =>
              native ? props.accessibilityLiveRegion === "polite" : props.role === "status",
            ),
          ).toBe(true);
          const model = { error: new Error("owned read error") };
          const section = generatedFormHarness(
            read("workspace-organizations.tsx"),
            ["WorkspaceOrganizations"],
            {
              ...primitives,
              OrganizationsCard: "OrganizationsCard",
              WorkspaceError: "WorkspaceError",
              useWorkspaceOrganizations: (received: unknown) => {
                expect(received).toBe(selection);
                return model;
              },
            },
          );
          const children = elements(section.render("WorkspaceOrganizations", { selection }));
          expect(children.find(({ type }) => type === "OrganizationsCard")!.props.model).toBe(
            model,
          );
          expect(children.find(({ type }) => type === "WorkspaceError")!.props.error).toBe(
            model.error,
          );
        });
      }
    }
  }

  for (const platform of ["web", "native"] as const) {
    test(`${platform} creates only within the current mutation and selection lifetime`, async () => {
      const read = emitted(platform, "monorepo", false);
      for (const outcome of [
        { current: false, ownsSelection: true, succeeds: true },
        { current: true, ownsSelection: false, succeeds: true },
        { current: true, ownsSelection: true, succeeds: false },
      ]) {
        const owner = workflow(read("use-workspace-organizations.ts"));
        owner.completion(outcome);
        const model = owner.render();
        model.form.setFieldValue("name", "Pending name");
        model.form.setFieldValue("slug", "pending-name");
        await model.form.handleSubmit();
        expect(owner.events).toEqual([["create", { name: "Pending name", slug: "pending-name" }]]);
        expect(model.form.resets).toBe(0);
        expect(model.form.values.name).toBe("Pending name");
        model.activate();
        expect(owner.events).toHaveLength(1);
      }
    });
  }
});
