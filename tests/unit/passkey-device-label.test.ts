import { describe, expect, test } from "bun:test";
import { settingsSource } from "../helpers/settings-feature-harness.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { elements, generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

describe("passkey backup-state labels", () => {
  for (const [locale, messages] of Object.entries({
    en: EN_MESSAGES.settings.passkeys,
    fr: FR_MESSAGES.settings.passkeys,
    ar: AR_MESSAGES.settings.passkeys,
  })) {
    test(`${locale} distinguishes backup eligibility from an existing backup`, () => {
      const passkeys = [
        { deviceType: "singleDevice", backedUp: false },
        { deviceType: "multiDevice", backedUp: false },
        { deviceType: "multiDevice", backedUp: true },
        { deviceType: "futureDeviceType", backedUp: false },
      ].map((entry, index) =>
        Object.freeze({
          ...entry,
          id: `key-${index}`,
          name: `Key ${index}`,
          createdAt: "2026-01-01T00:00:00Z",
        }),
      );
      const before = JSON.stringify(passkeys);
      const ui = generatedFormHarness(
        settingsSource("single", "next", "settings/components/passkey-view.tsx"),
        ["PasskeyRowView"],
        {
          Badge: "Badge",
          useSurfaceLocale: () => locale,
          Input: "Input",
          useSurfaceTranslations: () => (key: string) => {
            const message: unknown = Reflect.get(messages, key.replace(/^passkeys\./, ""));
            if (typeof message !== "string") throw new Error(`Missing ${locale} ${key}`);
            return message;
          },
        },
      );
      const tree = passkeys.map((passkey) =>
        ui.render("PasskeyRowView", {
          passkey,
          model: {
            form: { AppForm: "AppForm", AppField: "AppField", SubmitButton: "SubmitButton" },
            pending: false,
            error: null,
            remove() {},
          },
        }),
      );
      const labels = elements(tree)
        .filter((node) => node.type === "Badge")
        .map(textContent);
      expect(labels).toEqual([
        messages.deviceBound,
        messages.backupEligible,
        messages.backedUp,
        messages.unknownDevice,
      ]);
      expect(labels[1]).not.toBe(messages.backedUp);
      expect(JSON.stringify(passkeys)).toBe(before);
    });
  }
});
