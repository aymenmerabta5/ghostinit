import { desktopWorkspaceFeatureFiles } from "../../src/templates/apps/fragments/identity-workspace/native-workspace.js";
import { webIdentityWorkspaceFeatureFiles } from "../../src/templates/apps/fragments/identity-workspace/web-feature.js";
import { elements, generatedFormHarness, type TestForm } from "./generated-form-harness.js";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}
export interface ReadRecovery {
  pending: boolean;
  retry(): void;
}
export interface OrganizationModel {
  form: TestForm;
  organizations: Organization[];
  error: unknown;
  loading: boolean;
  ready: boolean;
  pending: boolean;
  readRecovery: ReadRecovery | null;
}
export function workspaceRecoveryProfiles() {
  return (["single", "monorepo"] as const).flatMap((mode) =>
    [false, true].flatMap((i18n) => [
      { name: "web/" + mode + "/" + i18n, files: webIdentityWorkspaceFeatureFiles(mode, i18n) },
      { name: "desktop/" + mode + "/" + i18n, files: desktopWorkspaceFeatureFiles(mode, i18n) },
    ]),
  );
}
export function moduleSource(
  profile: ReturnType<typeof workspaceRecoveryProfiles>[number],
  suffix: string,
) {
  const file = profile.files.find((entry) => entry.path.endsWith("/" + suffix));
  if (!file) throw new Error("Missing emitted module: " + suffix);
  return file.content;
}
export function organizationRecoveryHarness(source: string) {
  const requests: { cancelRefetch: boolean }[] = [];
  const events: string[] = [];
  let ownsSelection = true;
  let ownsActor = true;
  const read = {
    data: undefined as Organization[] | undefined,
    error: null as Error | null,
    isPending: false,
    isSuccess: false,
    isFetching: false,
    async refetch(options: { cancelRefetch: boolean }) {
      requests.push(options);
      read.isFetching = true;
      return { data: read.data };
    },
  };
  const create = {
    error: null as Error | null,
    isPending: false,
    async run() {
      events.push("create");
      return {
        status: "success",
        isCurrent: () => ownsActor,
        data: { organization: { id: "created" } },
      };
    },
  };
  const activate = {
    error: null as Error | null,
    isPending: false,
    async run() {
      events.push("activate");
    },
  };
  const selection = {
    queries: { organizations: read, organizationId: "organization-a" },
    captureSelection: () => () => ownsSelection,
    selectOrganization() {
      events.push("select");
    },
  };
  const hook = generatedFormHarness(source, ["useWorkspaceOrganizations"], {
    organizationSchema: {},
    useCreateOrganizationMutation: () => create,
    useActivateOrganizationMutation: () => activate,
  });
  return {
    read,
    create,
    activate,
    requests,
    events,
    setOwnership(actor: boolean, scope: boolean) {
      ownsActor = actor;
      ownsSelection = scope;
    },
    render: () => hook.render("useWorkspaceOrganizations", selection) as OrganizationModel,
  };
}
export function workspaceErrorHarness(source: string) {
  return generatedFormHarness(source, ["WorkspaceError"]);
}
export function teamSelectorHarness(source: string) {
  return generatedFormHarness(source, ["TeamsCard"], {
    ToggleGroup: "ToggleGroup",
    ToggleGroupItem: "ToggleGroupItem",
    TeamMembers: "TeamMembers",
  });
}
export function buttonCallback(value: unknown): () => void {
  const button = elements(value).find((item) => item.type === "Button");
  if (!button || typeof button.props.onClick !== "function")
    throw new Error("Missing retry button");
  return button.props.onClick as () => void;
}

export function teamRecoveryHarness(source: string) {
  const read = {
    data: undefined as { id: string; name: string }[] | undefined,
    error: null as Error | null,
    isPending: false,
    isSuccess: false,
    isFetching: false,
  };
  const mutation = {
    isPending: false,
    error: null,
    async run() {
      return { status: "error" };
    },
  };
  const selection = {
    queries: {
      organizationId: "organization-a",
      teamId: null,
      teams: read,
      teamMembers: { data: [], error: null, isSuccess: true },
      members: { isSuccess: true },
      permissions: { currentUser: null },
    },
    access: { canWriteTeams: true, canActivateTeam: false, availableTeamMembers: [] },
    captureSelection: () => () => true,
    selectTeam() {},
  };
  const hook = generatedFormHarness(source, ["useWorkspaceTeams"], {
    teamSchema: {},
    teamMemberSchema: {},
    useCreateTeamMutation: () => mutation,
    useActivateTeamMutation: () => mutation,
    useAddTeamMemberMutation: () => mutation,
    useRemoveTeamMemberMutation: () => mutation,
  });
  return { read, render: () => hook.render("useWorkspaceTeams", selection) };
}
