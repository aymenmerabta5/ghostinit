import { describe, expect, test } from "bun:test";
import { settingsSource } from "../helpers/settings-feature-harness.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { elements, generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

const passkey = Object.freeze({
  id: "retained-key",
  name: "Personal laptop",
  createdAt: "2026-09-10T12:00:00Z",
  deviceType: "multiDevice",
  backedUp: true,
});
const readError = new Error("private list failure");
const mutationError = new Error("private registration failure");
const recentReadError = new Error("private recent-auth detail", { cause: "recent-auth" });
const localeMessages = {
  en: EN_MESSAGES.settings.passkeys,
  fr: FR_MESSAGES.settings.passkeys,
  ar: AR_MESSAGES.settings.passkeys,
};
const cases = [
  {
    name: "loading",
    count: undefined,
    data: undefined,
    pending: true,
    succeeded: false,
    fetching: true,
    readError: null,
    mutationError: null,
    empty: false,
  },
  {
    name: "read error",
    count: undefined,
    data: undefined,
    pending: false,
    succeeded: false,
    fetching: false,
    readError,
    mutationError: null,
    empty: false,
  },
  {
    name: "unknown read",
    count: undefined,
    data: undefined,
    pending: false,
    succeeded: false,
    fetching: false,
    readError: null,
    mutationError: null,
    empty: false,
  },
  {
    name: "successful empty read",
    count: 0,
    data: [],
    pending: false,
    succeeded: true,
    fetching: false,
    readError: null,
    mutationError: null,
    empty: true,
  },
  {
    name: "refreshing successful empty read",
    count: 0,
    data: [],
    pending: false,
    succeeded: true,
    fetching: true,
    readError: null,
    mutationError: null,
    empty: true,
  },
  {
    name: "mutation failure after successful empty read",
    count: 0,
    data: [],
    pending: false,
    succeeded: true,
    fetching: false,
    readError: null,
    mutationError,
    empty: true,
  },
  {
    name: "populated",
    count: 1,
    data: [passkey],
    pending: false,
    succeeded: true,
    fetching: false,
    readError: null,
    mutationError: null,
    empty: false,
  },
  {
    name: "read failure retains cached rows",
    count: 1,
    data: [passkey],
    pending: false,
    succeeded: false,
    fetching: false,
    readError,
    mutationError: null,
    empty: false,
  },
  {
    name: "mutation failure retains successful rows",
    count: 1,
    data: [passkey],
    pending: false,
    succeeded: true,
    fetching: false,
    readError: null,
    mutationError,
    empty: false,
  },
  {
    name: "read error keeps precedence over mutation error",
    count: undefined,
    data: undefined,
    pending: false,
    succeeded: false,
    fetching: true,
    readError: recentReadError,
    mutationError,
    empty: false,
  },
];

for (const mode of ["monorepo", "single"] as const) {
  for (const router of ["next", "tanstack"] as const) {
    describe(mode + "/" + router + " passkey read presentation", () => {
      for (const scenario of cases) {
        test(scenario.name, () => {
          let retries = 0;
          const source = settingsSource(
            mode,
            router,
            "settings/use-passkey-management.ts",
            "settings/components/passkey-view.tsx",
          );
          const query = {
            data: scenario.data,
            isPending: scenario.pending,
            isSuccess: scenario.succeeded,
            isFetching: scenario.fetching,
            error: scenario.readError,
            refetch: () => {
              retries += 1;
            },
          };
          const ui = generatedFormHarness(source, ["usePasskeyManagement", "PasskeyView"], {
            Badge: "Badge",
            usePasskeyListQuery: () => query,
            usePasskeyMutation: () => ({ error: scenario.mutationError }),
            isIdentityRecentAuthenticationError: (cause: unknown) => cause === "recent-auth",
          });
          const model = ui.render("usePasskeyManagement");
          expect(model).toMatchObject({
            readSucceeded: scenario.succeeded,
            loading: scenario.pending,
            refreshing: scenario.fetching,
          });
          if (!model || typeof model !== "object") throw new Error("Missing passkey model");
          if (scenario.data) expect(Reflect.get(model, "passkeys")).toBe(scenario.data);
          const tree = ui.render("PasskeyView", {
            model,
            children: scenario.data?.length ? "retained passkey row" : null,
          });
          const content = textContent(tree);
          const counts = elements(tree).filter((node) => node.type === "Badge");
          expect(counts.map((node) => node.children)).toEqual(
            scenario.count === undefined ? [] : [[scenario.count]],
          );
          expect(content.includes("passkeys.empty")).toBe(scenario.empty);
          expect(content.includes("retained passkey row")).toBe(Boolean(scenario.data?.length));
          expect(elements(tree).some((node) => node.type === "Skeleton")).toBe(scenario.pending);
          const expectedError = scenario.readError ?? scenario.mutationError;
          expect(content.includes("passkeys.errorTitle")).toBe(Boolean(expectedError));
          if (expectedError) {
            expect(content).toContain(
              expectedError === recentReadError
                ? "passkeys.reauthenticate"
                : "passkeys.genericError",
            );
            const retry = elements(tree).find(
              (node) => node.type === "Button" && textContent(node) === "retry",
            );
            expect(retry?.props.disabled).toBe(scenario.fetching);
            const onClick = retry?.props.onClick;
            if (typeof onClick !== "function") throw new Error("Missing passkey retry callback");
            onClick();
            expect(retries).toBe(1);
          }
          expect(content).not.toContain("private");
          expect(ui.forms[0]?.resets).toBe(0);
          expect(ui.forms[0]?.values.name).toBe("");
        });
      }

      test("creation dates follow locale changes without changing passkey data", () => {
        let locale: keyof typeof localeMessages = "en";
        const removed: string[] = [];
        const ui = generatedFormHarness(
          settingsSource(mode, router, "settings/components/passkey-view.tsx"),
          ["PasskeyRowView"],
          {
            Badge: "Badge",
            useSurfaceLocale: () => locale,
            useSurfaceTranslations:
              () =>
              (key: string, parameters: Record<string, string> = {}) => {
                const message: unknown = Reflect.get(
                  localeMessages[locale],
                  key.replace(/^passkeys\./, ""),
                );
                if (typeof message !== "string")
                  throw new Error("Missing passkey translation: " + key);
                return message.replace(
                  /\{([^}]+)\}/g,
                  (_match, name: string) => parameters[name] ?? "",
                );
              },
          },
        );
        for (const createdAt of [passkey.createdAt, new Date(passkey.createdAt)]) {
          const record = Object.freeze({ ...passkey, createdAt });
          const before = JSON.stringify(record);
          const epoch = new Date(record.createdAt).getTime();
          for (const selectedLocale of ["en", "fr", "ar", "en"] as const) {
            locale = selectedLocale;
            const tree = ui.render("PasskeyRowView", {
              passkey: record,
              model: {
                form: { AppForm: "AppForm", AppField: "AppField", SubmitButton: "SubmitButton" },
                pending: false,
                error: null,
                remove: () => {
                  removed.push(record.id);
                },
              },
            });
            const date = new Intl.DateTimeFormat(locale).format(new Date(epoch));
            expect(textContent(tree)).toContain(
              localeMessages[locale].createdAt.replace("{date}", date),
            );
            expect(textContent(tree)).toContain(record.name);
            expect(JSON.stringify(record)).toBe(before);
            expect(new Date(record.createdAt).getTime()).toBe(epoch);
            const remove = elements(tree).find(
              (node) =>
                node.type === "Button" && textContent(node) === localeMessages[locale].delete,
            );
            const onClick = remove?.props.onClick;
            if (typeof onClick !== "function") throw new Error("Missing passkey delete callback");
            onClick();
          }
        }
        expect(removed).toEqual(Array.from({ length: 8 }, () => passkey.id));
      });
    });
  }
}
