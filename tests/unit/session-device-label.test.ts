import { describe, expect, test } from "bun:test";
import { settingsSessionsListContent } from "../../src/templates/apps/fragments/settings/sessions-card.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { elements, generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

const source = settingsSessionsListContent();
const chromeWindows =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36";
const { sessionDevice } = generatedFormHarness(source, ["sessionDevice"]).module;

describe("friendly session device labels", () => {
  for (const [agent, browser, platform] of [
    [chromeWindows, "Chrome", "Windows"],
    [`${chromeWindows} Edg/142.0.0.0`, "Edge", "Windows"],
    [`${chromeWindows} OPR/127.0`, "Opera", "Windows"],
    [
      "Mozilla/5.0 (Linux; Android 16) Chrome/142.0 Safari/537.36 SamsungBrowser/29.0",
      "Samsung Internet",
      "Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/143.0 Mobile Safari/605.1",
      "Firefox",
      "iOS",
    ],
    [
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) CriOS/142.0 Mobile Safari/605.1",
      "Chrome",
      "iOS",
    ],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Version/18.0 Safari/605.1", "Safari", "macOS"],
    ["Mozilla/5.0 (X11; CrOS x86_64) Chrome/142.0 Safari/537.36", "Chrome", "ChromeOS"],
    ["Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/142.0 Safari/537.36", "Chrome", "Linux"],
    ["Firefox/143.0", "Firefox", null],
    ["Windows NT 10.0", null, "Windows"],
    ["Custom client", null, null],
    ["", null, null],
    [null, null, null],
    [undefined, null, null],
  ] as const) {
    test(`${browser ?? "unknown browser"}/${platform ?? "unknown platform"}: ${agent ?? "absent"}`, () => {
      expect(sessionDevice!(agent)).toEqual({ browser, platform });
    });
  }

  for (const [locale, messages] of Object.entries({
    en: EN_MESSAGES.settings.sessions,
    fr: FR_MESSAGES.settings.sessions,
    ar: AR_MESSAGES.settings.sessions,
  })) {
    test(`${locale} localizes labels and preserves session data and revocation identity`, () => {
      const sessions = [
        {
          id: "current-private-session-id",
          userAgent: chromeWindows,
          ipAddress: "127.0.0.1",
          expiresAt: "2080-09-14T17:00:00Z",
        },
        {
          id: "pending-private-session-id",
          userAgent: "Firefox/143.0",
          ipAddress: "127.0.0.2",
          expiresAt: "2080-09-14T17:00:00Z",
        },
        {
          id: "revocable-private-session-id",
          userAgent: null,
          ipAddress: null,
          expiresAt: "2080-09-14T17:00:00Z",
        },
      ].map((session) => Object.freeze(session));
      const before = JSON.stringify(sessions);
      const revoked: string[] = [];
      const translate = (key: string, parameters: Record<string, string> = {}) => {
        const message = Reflect.get(messages, key.replace(/^sessions\./, ""));
        if (typeof message !== "string") throw new Error(`Missing ${locale} ${key}`);
        return message.replace(/\{([^}]+)\}/g, (_match, name: string) => parameters[name] ?? "");
      };
      const ui = generatedFormHarness(source, ["SessionList"], {
        React: {
          createElement: (
            type: unknown,
            props: Record<string, unknown> | null,
            ...children: unknown[]
          ) => ({ type, props: props ?? {}, children }),
          useMemo: (factory: () => unknown) => factory(),
        },
        Badge: "Badge",
        useSurfaceLocale: () => locale,
        useSurfaceTranslations: () => translate,
      });
      const tree = ui.render("SessionList", {
        sessions,
        currentSessionId: sessions[0]!.id,
        pendingSessionId: sessions[1]!.id,
        isLoading: false,
        onRevoke: (id: string) => revoked.push(id),
      });
      expect(textContent(tree)).toContain(
        translate("sessions.deviceSummary", { browser: "Chrome", platform: "Windows" }),
      );
      expect(textContent(tree)).toContain(messages.unknownDevice);
      expect(textContent(tree)).toContain("127.0.0.1");
      expect(textContent(tree)).toContain(
        translate("sessions.expiresAt", {
          date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(sessions[0]!.expiresAt),
          ),
        }),
      );
      expect(textContent(tree)).not.toContain("Mozilla");
      expect(textContent(tree)).not.toContain("current-private-session-id");
      const buttons = elements(tree).filter((node) => node.type === "Button");
      expect(buttons.map((node) => node.props.disabled)).toEqual([true, true, false]);
      (buttons[2]!.props.onClick as () => void)();
      expect(revoked).toEqual([sessions[2]!.id]);
      expect(JSON.stringify(sessions)).toBe(before);
    });
  }
});
