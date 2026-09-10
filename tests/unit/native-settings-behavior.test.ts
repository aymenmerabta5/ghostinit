import { describe, expect, test } from "bun:test";
import { desktopSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/native-desktop.js";
import { expoSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/native-expo.js";
import { webSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/feature.js";
import { nativeSettingsQueriesContent } from "../../src/templates/apps/fragments/settings/native-data.js";
import { elements, generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

const nativeElements = {
  ActivityIndicator: "ActivityIndicator",
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Link: "Link",
};
const initialUser = { id: "user-a", name: "Initial name", email: "a@example.test", role: "user" };

describe("native settings identity and draft ownership", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const platform of ["expo", "desktop"] as const) {
      for (const api of [true, false]) {
        test(`${mode}/${platform}/api=${api} offers retry for identity errors instead of claiming sign-out`, () => {
          const files =
            platform === "expo"
              ? expoSettingsFeatureFiles(mode, api, true)
              : desktopSettingsFeatureFiles(mode, api, true, false);
          const screen = files.find(({ path }) => path.endsWith("/settings-screen.tsx"));
          if (!screen) throw new Error("Missing settings screen");
          let retries = 0;
          const ui = generatedFormHarness(screen.content, ["SettingsScreen"], {
            ...nativeElements,
            useSettingsIdentityQuery: () => ({
              user: undefined,
              sessionId: "session-a",
              isPending: false,
              error: new Error("private backend failure"),
              retry: () => {
                retries += 1;
              },
            }),
          });
          const rendered = ui.render("SettingsScreen");
          expect(textContent(rendered)).toContain("genericDescription");
          expect(textContent(rendered)).not.toContain("signInRequired");
          expect(textContent(rendered)).not.toContain("private backend failure");
          const retry = elements(rendered).find(({ type }) => type === "Button");
          const callback = retry?.props[platform === "expo" ? "onPress" : "onClick"];
          if (typeof callback !== "function") throw new Error("Missing native identity retry");
          callback();
          expect(retries).toBe(1);
        });
      }
    }
  }

  test("background profile name changes keep the same editor instance on web and desktop", () => {
    let user = initialUser;
    for (const files of [
      webSettingsFeatureFiles("src", "next"),
      desktopSettingsFeatureFiles("monorepo", true, true, false),
    ]) {
      const source = files.find(({ path }) => path.endsWith("/profile-card.tsx"))!.content;
      const ui = generatedFormHarness(source, ["ProfileCard"], {
        useProfileIdentity: () => ({ user, pending: false, error: null }),
      });
      user = initialUser;
      const before = elements(ui.render("ProfileCard", {}))[0]?.props.key;
      user = { ...initialUser, name: "Changed elsewhere" };
      expect(elements(ui.render("ProfileCard", {}))[0]?.props.key).toBe(before);
      user = { ...user, id: "replacement-user" };
      expect(elements(ui.render("ProfileCard", {}))[0]?.props.key).not.toBe(before);
    }
  });

  test("Expo keeps profile draft identity stable while current-user display data changes", () => {
    const source = expoSettingsFeatureFiles("monorepo", true, true).find(({ path }) =>
      path.endsWith("/settings-screen.tsx"),
    )!.content;
    const ui = generatedFormHarness(source, ["SettingsPanels"], {
      ...nativeElements,
      DangerZoneCard: "DangerZoneCard",
    });
    const profileKey = (user: typeof initialUser) =>
      elements(ui.render("SettingsPanels", { user })).find(({ props }) => "user" in props)?.props
        .key;
    expect(profileKey(initialUser)).toBe("user-a");
    expect(profileKey({ ...initialUser, name: "Changed elsewhere" })).toBe("user-a");
    expect(profileKey({ ...initialUser, id: "replacement" })).toBe("replacement");
  });

  test("native retry refreshes both provider identity and the independent application read", async () => {
    const calls: string[] = [];
    const ui = generatedFormHarness(
      nativeSettingsQueriesContent(true),
      ["useSettingsIdentityQuery"],
      {
        identityClient: {
          useSession: () => ({
            data: { user: initialUser, session: { id: "session-a" } },
            isPending: false,
            error: null,
            refetch: async () => {
              calls.push("session");
            },
          }),
        },
        useQueryClient: () => ({}),
        currentQueryAuthScope: () => ({
          userId: "user-a",
          sessionId: "session-a",
          tenantId: null,
          teamId: null,
        }),
        authScopedQueryKey: (_scope: unknown, key: unknown) => key,
        orpc: { me: { queryOptions: () => ({ queryKey: ["me"] }) } },
        useQuery: () => ({
          data: undefined,
          isPending: false,
          error: new Error("unavailable"),
          refetch: async () => {
            calls.push("application");
          },
        }),
      },
    );
    const state = ui.render("useSettingsIdentityQuery") as { retry(): Promise<void> };
    await state.retry();
    expect(calls).toEqual(["session", "application"]);
  });
});
