import { describe, expect, test } from "bun:test";
import { elements, textContent } from "../helpers/generated-form-harness.js";
import {
  expandSessionChildren,
  frontendOnlyNativeSettings,
  sessionsReadHarness,
  sessionsReadProfiles,
  type SessionItem,
  type SessionsModel,
} from "../helpers/sessions-read-state-harness.js";

const current = Object.freeze({
  id: "current-session",
  revokedAt: null,
  userAgent: "Chrome/151.0",
  ipAddress: "192.0.2.1",
  expiresAt: "2026-10-10T12:00:00Z",
});
const other = Object.freeze({ ...current, id: "other-session", ipAddress: "192.0.2.2" });
const retired = Object.freeze({
  ...other,
  id: "retired-session",
  revokedAt: "2026-09-10T12:00:00Z",
});
const rows = [current, other, retired];
const readError = new Error("Session read failed");
const mutationError = new Error("Session revocation failed");
interface ReadScenario {
  name: string;
  data?: SessionItem[];
  pending: boolean;
  success: boolean;
  fetching: boolean;
  fetchStatus: "idle" | "fetching" | "paused";
  readError: Error | null;
  mutationError: Error | null;
  mutationPending: boolean;
  variables?: { sessionId: string } | { others: true };
  count: number | null;
  empty: boolean;
  rowIds: string[];
}
const unresolved: ReadScenario = {
  name: "unknown",
  pending: false,
  success: false,
  fetching: false,
  fetchStatus: "idle",
  readError: null,
  mutationError: null,
  mutationPending: false,
  count: null,
  empty: false,
  rowIds: [],
};
const empty: ReadScenario = {
  ...unresolved,
  name: "successful empty",
  data: [],
  success: true,
  count: 0,
  empty: true,
};
const populated: ReadScenario = {
  ...unresolved,
  name: "populated",
  data: rows,
  success: true,
  count: 2,
  rowIds: [current.id, other.id],
};
const scenarios: ReadScenario[] = [
  unresolved,
  { ...unresolved, name: "paused first read", pending: true, fetchStatus: "paused" },
  {
    ...unresolved,
    name: "loading first read",
    pending: true,
    fetching: true,
    fetchStatus: "fetching",
  },
  { ...unresolved, name: "failed first read", readError },
  { ...unresolved, name: "failed read with empty cached data", data: [], readError },
  empty,
  { ...empty, name: "successful empty read plus mutation failure", mutationError },
  { ...empty, name: "refreshing successful empty", fetching: true, fetchStatus: "fetching" },
  { ...empty, name: "successful read filters retired sessions", data: [retired] },
  populated,
  { ...populated, name: "refresh retains verified rows", fetching: true, fetchStatus: "fetching" },
  { ...populated, name: "refetch failure retains verified rows", success: false, readError },
  { ...populated, name: "revocation failure retains verified rows", mutationError },
  { ...populated, name: "read failure keeps precedence", success: false, readError, mutationError },
  {
    ...populated,
    name: "pending individual revoke",
    mutationPending: true,
    variables: { sessionId: other.id },
  },
  {
    ...populated,
    name: "pending revoke others",
    mutationPending: true,
    variables: { others: true },
  },
];

for (const profile of sessionsReadProfiles()) {
  describe(profile.name + " session read presentation", () => {
    for (const scenario of scenarios) {
      test(scenario.name, () => {
        const initial = { initialSessions: scenario.data };
        const inputs: unknown[] = [];
        const mutations: unknown[] = [];
        let refreshes = 0;
        const before = JSON.stringify(scenario.data);
        const ui = sessionsReadHarness(profile, {
          useSettingsIdentityQuery: () => ({ sessionId: current.id }),
          useSettingsSessionsQuery: (received: unknown) => {
            inputs.push(received);
            return {
              data: scenario.data,
              isPending: scenario.pending,
              isSuccess: scenario.success,
              isFetching: scenario.fetching,
              fetchStatus: scenario.fetchStatus,
              error: scenario.readError,
              refetch: () => {
                refreshes += 1;
              },
            };
          },
          useRevokeSessionMutation: () => ({
            error: scenario.mutationError,
            variables: scenario.variables,
            isPending: scenario.mutationPending,
            run: (input: unknown) => {
              mutations.push(input);
            },
          }),
        });
        const state = ui.render("useIdentitySessions", initial) as SessionsModel;
        expect(inputs).toEqual([initial]);
        expect(state.readSucceeded).toBe(scenario.success);
        expect(state.error).toBe(scenario.readError ?? scenario.mutationError);
        expect(state.sessions.map((session) => session.id)).toEqual(scenario.rowIds);
        for (const session of state.sessions) expect(scenario.data).toContain(session);
        const tree = expandSessionChildren(
          ui.render("SessionsView", profile.native ? { model: state } : { state }),
        );
        const nodes = elements(tree);
        const text = textContent(tree);
        expect(text.includes("sessions.empty")).toBe(scenario.empty);
        expect(
          nodes.filter((node) => typeof node.props.key === "string").map((node) => node.props.key),
        ).toEqual(scenario.rowIds);
        const counts = nodes
          .filter((node) => node.type === "Badge" && typeof node.children[0] === "number")
          .map((node) => node.children[0]);
        expect(counts).toEqual(profile.native || scenario.count === null ? [] : [scenario.count]);
        expect(
          nodes.some((node) => node.type === "Skeleton" || node.type === "ActivityIndicator"),
        ).toBe(scenario.pending);
        const hasError = profile.native
          ? nodes.some((node) => node.type === "SettingsFeedback" && node.props.error !== null)
          : nodes.some((node) => node.type === "Alert");
        expect(hasError).toBe(Boolean(scenario.readError ?? scenario.mutationError));
        const callbackKey = profile.native ? "onPress" : "onClick";
        const refresh = nodes.find(
          (node) => node.type === "Button" && node.props[callbackKey] === state.refresh,
        );
        expect(refresh?.props.disabled).toBe(scenario.fetching);
        const refreshCallback = refresh?.props[callbackKey];
        if (typeof refreshCallback !== "function") throw new Error("Missing refresh callback");
        if (!scenario.fetching) refreshCallback();
        expect(refreshes).toBe(scenario.fetching ? 0 : 1);
        const others = nodes.find(
          (node) => node.type === "Button" && node.props[callbackKey] === state.revokeOtherSessions,
        );
        const othersPending =
          scenario.mutationPending && Boolean(scenario.variables && "others" in scenario.variables);
        expect(state.isRevokingOthers).toBe(othersPending);
        expect(others?.props.disabled).toBe(scenario.rowIds.length < 2 || othersPending);
        const othersCallback = others?.props[callbackKey];
        if (typeof othersCallback !== "function") throw new Error("Missing revoke-others callback");
        if (scenario.rowIds.length >= 2 && !othersPending) othersCallback();
        const expectedMutations: unknown[] =
          scenario.rowIds.length >= 2 && !othersPending ? [{ others: true }] : [];
        const pendingId =
          scenario.mutationPending && scenario.variables && "sessionId" in scenario.variables
            ? scenario.variables.sessionId
            : undefined;
        expect(state.pendingSessionId).toBe(pendingId);
        const individualButtons = nodes.filter(
          (node) =>
            node.type === "Button" &&
            ["sessions.revoke", "sessions.revoking"].includes(textContent(node)),
        );
        const expectedButtonIds = profile.native
          ? scenario.rowIds.filter((id) => id !== current.id)
          : scenario.rowIds;
        expect(individualButtons).toHaveLength(expectedButtonIds.length);
        for (const [index, expectedId] of expectedButtonIds.entries()) {
          const button = individualButtons[index];
          if (!button) throw new Error("Missing individual revoke button");
          const disabled = expectedId === current.id || expectedId === pendingId;
          expect(button.props.disabled).toBe(disabled);
          const callback = button.props[callbackKey];
          if (typeof callback !== "function") throw new Error("Missing individual revoke callback");
          if (!disabled) {
            callback();
            expectedMutations.push({ sessionId: expectedId });
          }
        }
        state.revokeSession(current.id);
        expect(mutations).toEqual(expectedMutations);
        expect(JSON.stringify(scenario.data)).toBe(before);
      });
    }
  });
}

for (const profile of frontendOnlyNativeSettings()) {
  test(profile.name + " does not invent a backend sessions feature", () => {
    expect(
      profile.files.some((file) =>
        /\/(?:use-identity-sessions\.ts|components\/sessions-view\.tsx)$/.test(file.path),
      ),
    ).toBe(false);
  });
}
