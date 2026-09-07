import { describe, expect, test } from "bun:test";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { elements, flush, textContent } from "../helpers/generated-form-harness.js";
import { deletionHarness, element, invoke, scenarios } from "../helpers/settings-delete-harness.js";

describe("account deletion confirmation feedback", () => {
  for (const scenario of scenarios()) {
    test(`${scenario.label} keeps failed deletion visible inside the dialog and allows retry`, async () => {
      const requests: string[] = [];
      const failureMessage = "private provider detail";
      let succeeds = false;
      async function deleteAccount(input: string | { password: string }) {
        requests.push(typeof input === "string" ? input : input.password);
        if (scenario.transport === "identity-client") {
          return { error: succeeds ? null : { message: failureMessage } };
        }
        return succeeds
          ? { ok: true }
          : { ok: false, error: failureMessage, message: failureMessage };
      }
      const harness = deletionHarness(scenario, deleteAccount);
      const { destinations, render } = harness;
      let tree = render();
      invoke(element(tree, "Dialog"), "onOpenChange", true);
      tree = render();
      expect(element(tree, "Dialog").props.open).toBe(true);
      const form = harness.forms[0];
      if (!form) throw new Error("Missing deletion form");
      form.values.password = "current-password-value";

      await form.handleSubmit();
      tree = render();
      expect(element(tree, "Dialog").props.open).toBe(true);
      const alert = element(element(tree, "DialogContent"), "Alert");
      expect(alert.props.variant).toBe("destructive");
      expect(textContent(alert)).toContain("danger.errorTitle");
      expect(textContent(alert)).toContain("danger.genericError");
      expect(textContent(alert)).not.toContain(failureMessage);
      expect(elements(tree).filter((node) => node.type === "Alert")).toEqual([alert]);
      expect(form.values.password).toBe("current-password-value");
      expect(form.resets).toBe(0);
      expect(requests).toEqual(["current-password-value"]);
      expect(destinations).toEqual([]);
      expect(harness.events).toEqual([]);

      const cancel = elements(tree).find(
        (node) => node.type === "Button" && textContent(node) === "danger.cancel",
      );
      if (!cancel) throw new Error("Missing cancel button");
      invoke(cancel, "onClick");
      tree = render();
      expect(element(tree, "Dialog").props.open).toBe(false);
      expect(destinations).toEqual([]);
      expect(requests).toHaveLength(1);

      invoke(element(tree, "Dialog"), "onOpenChange", true);
      tree = render();
      expect(element(tree, "Dialog").props.open).toBe(true);
      succeeds = true;
      await form.handleSubmit();
      tree = render();
      expect(element(tree, "Dialog").props.open).toBe(false);
      expect(elements(tree).filter((node) => node.type === "Alert")).toEqual([]);
      expect(requests).toEqual(["current-password-value", "current-password-value"]);
      expect(destinations).toEqual(["/"]);
      expect(harness.events).toEqual(
        scenario.transport === "identity-client"
          ? ["retire", "navigate", "refresh"]
          : ["retire", "navigate"],
      );
    });
  }
});

describe("account deletion retention guidance", () => {
  const locales = {
    en: EN_MESSAGES.settings.danger,
    fr: FR_MESSAGES.settings.danger,
    ar: AR_MESSAGES.settings.danger,
  };
  for (const scenario of scenarios()) {
    for (const [locale, translations] of Object.entries(locales)) {
      test(`${scenario.label}/${locale} localizes only the typed retention refusal`, async () => {
        let code: string | undefined = "ACCOUNT_DELETION_RESTRICTED";
        const message = "This account is referenced by retained records and cannot be deleted.";
        const deleteAccount = async () =>
          scenario.transport === "identity-client"
            ? { error: { code, message } }
            : { ok: false, code, error: message, message };
        const harness = deletionHarness(scenario, deleteAccount, translations);
        invoke(element(harness.render(), "Dialog"), "onOpenChange", true);
        const form = harness.forms[0];
        if (!form) throw new Error("Missing deletion form");
        form.values.password = "preserved-password";
        await form.handleSubmit();
        let tree = harness.render();
        expect(textContent(element(tree, "CardDescription"))).toBe(translations.description);
        expect(textContent(element(tree, "DialogDescription"))).toBe(
          translations.dialogDescription,
        );
        expect(textContent(element(element(tree, "DialogContent"), "Alert"))).toContain(
          translations.retainedRecordError,
        );
        expect(element(tree, "Dialog").props.open).toBe(true);
        expect(form.values.password).toBe("preserved-password");
        expect(form.resets).toBe(0);
        expect(harness.destinations).toEqual([]);
        expect(harness.events).toEqual([]);

        for (const unrelated of [
          undefined,
          "23503",
          "REQUEST_FAILED",
          "ACCOUNT_DELETION_RESTRICTED_EXTRA",
        ]) {
          code = unrelated;
          await form.handleSubmit();
          tree = harness.render();
          const alertText = textContent(element(element(tree, "DialogContent"), "Alert"));
          expect(alertText).toContain(translations.genericError);
          expect(alertText).not.toContain(message);
          expect(alertText).not.toContain(translations.retainedRecordError);
          expect(element(tree, "Dialog").props.open).toBe(true);
          expect(harness.destinations).toEqual([]);
          expect(harness.events).toEqual([]);
        }
      });
    }
  }

  for (const scenario of scenarios(false)) {
    test(`${scenario.label}/oauth distinguishes retention, recent authentication, and generic failures`, async () => {
      let code: string | undefined;
      let succeeds = false;
      const deleteAccount = async () =>
        scenario.transport === "identity-client"
          ? { error: succeeds ? null : { code, message: "Account could not be deleted" } }
          : { ok: succeeds, code, error: "Account could not be deleted" };
      const harness = deletionHarness(scenario, deleteAccount);
      const failures: Array<[string | undefined, string]> = [
        ["ACCOUNT_DELETION_RESTRICTED", "danger.retainedRecordError"],
        ["SESSION_EXPIRED", "danger.reauthenticate"],
        ["SESSION_NOT_FRESH", "danger.reauthenticate"],
        ["REQUEST_FAILED", "danger.genericError"],
        [undefined, "danger.genericError"],
      ];
      for (const [failureCode, expected] of failures) {
        code = failureCode;
        invoke(element(harness.render(), "Button"), "onClick");
        await flush();
        const tree = harness.render();
        expect(textContent(element(tree, "Alert"))).toContain(expected);
        expect(element(tree, "Button").props.disabled).toBe(false);
        expect(harness.destinations).toEqual([]);
        expect(harness.events).toEqual([]);
      }
      succeeds = true;
      invoke(element(harness.render(), "Button"), "onClick");
      await flush();
      expect(harness.destinations).toEqual(["/"]);
      expect(harness.events).toEqual(
        scenario.transport === "identity-client"
          ? ["retire", "navigate", "refresh"]
          : ["retire", "navigate"],
      );
      expect(elements(harness.render()).filter((node) => node.type === "Alert")).toEqual([]);
    });
  }
});

describe("account deletion client recovery", () => {
  for (const scenario of scenarios()) {
    for (const [locale, translations] of Object.entries({
      en: EN_MESSAGES.settings.danger,
      fr: FR_MESSAGES.settings.danger,
      ar: AR_MESSAGES.settings.danger,
    })) {
      test(`${scenario.label}/${locale} preserves input and auth state after typed and thrown failures`, async () => {
        let failure: string | Error = "INVALID_PASSWORD";
        const deleteAccount = async () => {
          if (failure instanceof Error) throw failure;
          return scenario.transport === "identity-client"
            ? { error: { code: failure, message: "private provider detail" } }
            : { ok: false, code: failure };
        };
        const harness = deletionHarness(scenario, deleteAccount, translations);
        invoke(element(harness.render(), "Dialog"), "onOpenChange", true);
        const form = harness.forms[0];
        if (!form) throw new Error("Missing deletion form");
        form.values.password = "preserved-password";
        for (const [cause, message] of [
          ["INVALID_PASSWORD", translations.invalidPassword],
          ["SESSION_EXPIRED", translations.reauthenticate],
          ["SESSION_NOT_FRESH", translations.reauthenticate],
          [new Error("private provider detail"), translations.genericError],
        ] as const) {
          failure = cause;
          await form.handleSubmit();
          const tree = harness.render();
          const alert = element(element(tree, "DialogContent"), "Alert");
          expect(textContent(alert)).toContain(message);
          expect(textContent(alert)).not.toContain("private provider detail");
          expect(form.isSubmitting).toBe(false);
          expect(form.values.password).toBe("preserved-password");
          expect(element(tree, "Dialog").props.open).toBe(true);
          expect(harness.destinations).toEqual([]);
          expect(harness.events).toEqual([]);
        }
      });
    }
  }
});
