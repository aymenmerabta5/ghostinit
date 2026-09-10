import { describe, expect, test } from "bun:test";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { elements, textContent } from "../helpers/generated-form-harness.js";
import {
  buttonCallback,
  moduleSource,
  organizationRecoveryHarness,
  teamSelectorHarness,
  teamRecoveryHarness,
  workspaceErrorHarness,
  workspaceRecoveryProfiles,
} from "../helpers/workspace-recovery-harness.js";

const retained = [{ id: "organization-a", name: "Retained workspace", slug: "retained-workspace" }];
const readFailure = new Error("Private read details");
const mutationFailure = new Error("Private mutation details");

describe("identity visual recovery semantics", () => {
  test("session empty copy makes no current-device claim in any catalog", () => {
    expect([
      EN_MESSAGES.settings.sessions.empty,
      FR_MESSAGES.settings.sessions.empty,
      AR_MESSAGES.settings.sessions.empty,
    ]).toEqual([
      "No active sessions found.",
      "Aucune session active trouvée.",
      "لم يتم العثور على جلسات نشطة.",
    ]);
    for (const messages of [EN_MESSAGES, FR_MESSAGES, AR_MESSAGES]) {
      expect(messages.workspace.operationErrorDescription).not.toBe(
        messages.workspace.operationError,
      );
      expect(messages.workspace.organizationsReadError).not.toBe(messages.workspace.operationError);
      expect(messages.workspace.organizationsReadErrorDescription.length).toBeGreaterThan(0);
    }
  });

  for (const profile of workspaceRecoveryProfiles()) {
    test(
      profile.name + " retries only the displayed organization read and keeps cached rows",
      () => {
        const owner = organizationRecoveryHarness(
          moduleSource(profile, "use-workspace-organizations.ts"),
        );
        owner.read.error = readFailure;
        owner.read.data = retained;
        let model = owner.render();
        expect(model.error).toBe(readFailure);
        expect(model.organizations).toBe(retained);
        expect(model.readRecovery?.pending).toBe(false);
        model.readRecovery?.retry();
        expect(owner.requests).toEqual([{ cancelRefetch: false }]);
        model = owner.render();
        expect(model.readRecovery?.pending).toBe(true);
        model.readRecovery?.retry();
        expect(owner.requests).toHaveLength(1);
        expect(owner.events).toEqual([]);
        owner.read.error = null;
        owner.read.isFetching = false;
        owner.read.isSuccess = true;
        model = owner.render();
        expect(model.readRecovery).toBeNull();
        expect(model.organizations).toBe(retained);
      },
    );

    test(
      profile.name + " unknown/loading/empty reads have no recovery or false mutation failure",
      () => {
        const owner = organizationRecoveryHarness(
          moduleSource(profile, "use-workspace-organizations.ts"),
        );
        for (const scenario of [
          { isPending: false, isSuccess: false, isFetching: false, data: undefined },
          { isPending: true, isSuccess: false, isFetching: true, data: undefined },
          { isPending: false, isSuccess: true, isFetching: false, data: [] },
        ]) {
          Object.assign(owner.read, scenario);
          const model = owner.render();
          expect(model.readRecovery).toBeNull();
          expect(model.error).toBeNull();
          expect(model.ready).toBe(scenario.isSuccess);
          expect(model.loading).toBe(scenario.isPending);
        }
        expect(owner.requests).toEqual([]);
      },
    );

    test(
      profile.name + " create and activation errors keep precedence and never advertise read retry",
      () => {
        const owner = organizationRecoveryHarness(
          moduleSource(profile, "use-workspace-organizations.ts"),
        );
        owner.read.error = readFailure;
        for (const mutation of [owner.create, owner.activate]) {
          mutation.error = mutationFailure;
          const model = owner.render();
          expect(model.error).toBe(mutationFailure);
          expect(model.readRecovery).toBeNull();
          mutation.error = null;
        }
        expect(owner.render().readRecovery).not.toBeNull();
        expect(owner.requests).toEqual([]);
      },
    );

    test(
      profile.name + " failed-read retry does not reset drafts or alter creation ownership",
      async () => {
        const owner = organizationRecoveryHarness(
          moduleSource(profile, "use-workspace-organizations.ts"),
        );
        owner.read.error = readFailure;
        const model = owner.render();
        model.form.setFieldValue("name", "Draft workspace");
        model.form.setFieldValue("slug", "draft-workspace");
        model.readRecovery?.retry();
        expect(model.form.values).toEqual({ name: "Draft workspace", slug: "draft-workspace" });
        expect(model.form.resets).toBe(0);
        for (const [actor, selection] of [
          [false, true],
          [true, false],
        ]) {
          owner.setOwnership(actor!, selection!);
          await model.form.handleSubmit();
          expect(owner.events).not.toContain("select");
          expect(model.form.resets).toBe(0);
        }
        owner.setOwnership(true, true);
        await model.form.handleSubmit();
        expect(owner.events.at(-1)).toBe("select");
        expect(model.form.resets).toBe(1);
      },
    );

    test(
      profile.name + " shared alert separates read recovery from generic operation failure",
      () => {
        const error = workspaceErrorHarness(
          moduleSource(profile, "components/workspace-error.tsx"),
        );
        expect(error.render("WorkspaceError", { error: null })).toBeNull();
        const generic = error.render("WorkspaceError", { error: mutationFailure });
        expect(textContent(generic)).toContain("operationError");
        expect(textContent(generic)).toContain("operationErrorDescription");
        expect(textContent(generic)).not.toContain("Private");
        expect(elements(generic).filter((item) => item.type === "Button")).toHaveLength(0);
        let calls = 0;
        const recovery = {
          pending: false,
          retry() {
            calls++;
          },
        };
        const failed = error.render("WorkspaceError", { error: readFailure, recovery });
        expect(textContent(failed)).toContain("organizationsReadError");
        expect(textContent(failed)).toContain("organizationsReadErrorDescription");
        expect(textContent(failed)).toContain("retry");
        buttonCallback(failed)();
        expect(calls).toBe(1);
        recovery.pending = true;
        const pending = error.render("WorkspaceError", { error: readFailure, recovery });
        expect(elements(pending).find((item) => item.type === "Button")?.props.disabled).toBe(true);
        expect(textContent(pending)).toContain("loading");
      },
    );

    test(profile.name + " recovery belongs to the organization section only", () => {
      const source = moduleSource(profile, "workspace-organizations.tsx");
      expect(source).toContain("recovery={model.readRecovery}");
      for (const name of ["members", "teams", "invitations"]) {
        expect(moduleSource(profile, "workspace-" + name + ".tsx")).not.toContain("recovery=");
      }
    });

    test(profile.name + " empty team selectors disappear without hiding retained options", () => {
      const view = teamSelectorHarness(moduleSource(profile, "components/teams-card.tsx"));
      const owner = teamRecoveryHarness(moduleSource(profile, "use-workspace-teams.ts"));
      for (const state of [
        { isPending: true, isSuccess: false, isFetching: true, error: null },
        { isPending: false, isSuccess: false, isFetching: false, error: readFailure },
        { isPending: false, isSuccess: true, isFetching: false, error: null },
      ]) {
        Object.assign(owner.read, state, { data: [] });
        const empty = view.render("TeamsCard", { model: owner.render() });
        expect(elements(empty).some((item) => item.type === "ToggleGroup")).toBe(false);
        expect(elements(empty).some((item) => item.type === "Form")).toBe(true);
        expect(textContent(empty)).not.toContain("No teams");
        owner.read.data = [{ id: "team-a", name: "Retained team" }];
        const cached = view.render("TeamsCard", { model: owner.render() });
        expect(elements(cached).filter((item) => item.type === "ToggleGroup")).toHaveLength(1);
        expect(textContent(cached)).toContain("Retained team");
      }
    });
  }
});
