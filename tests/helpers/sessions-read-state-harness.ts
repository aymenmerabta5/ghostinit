import { desktopSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/native-desktop.js";
import { expoSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/native-expo.js";
import { webSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/feature.js";
import type { TemplateFile } from "../../src/templates/shared.js";
import { generatedFormHarness, type TestElement } from "./generated-form-harness.js";

export interface SessionItem {
  id: string;
  revokedAt: string | null;
  userAgent: string;
  ipAddress: string;
  expiresAt: string;
}
export interface SessionsModel {
  sessions: SessionItem[];
  error: unknown;
  readSucceeded: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  currentSessionId?: string;
  pendingSessionId?: string;
  isRevokingOthers: boolean;
  refresh(): void;
  revokeSession(id: string): void;
  revokeOtherSessions(): void;
}
export interface SessionsProfile {
  name: string;
  native: boolean;
  source: string;
}

function profile(name: string, native: boolean, files: TemplateFile[]): SessionsProfile {
  const wanted = [
    "/use-identity-sessions.ts",
    "/components/sessions-view.tsx",
    ...(native ? [] : ["/components/session-list.tsx"]),
  ];
  const source = wanted
    .map((suffix) => {
      const emitted = files.find((entry) => entry.path.endsWith(suffix));
      if (!emitted) throw new Error("Missing sessions module: " + name + suffix);
      return emitted.content;
    })
    .join("\n");
  return { name, native, source };
}

export function sessionsReadProfiles(): SessionsProfile[] {
  const profiles: SessionsProfile[] = [];
  for (const mode of ["single", "monorepo"] as const) {
    for (const router of ["next", "tanstack"] as const) {
      profiles.push(
        profile(
          mode + "/" + router,
          false,
          webSettingsFeatureFiles(
            mode === "single" ? "src" : "apps/web/src",
            router,
            true,
            false,
            false,
          ),
        ),
      );
    }
  }
  profiles.push(
    profile("monorepo/desktop", false, desktopSettingsFeatureFiles("monorepo", true, false, false)),
  );
  profiles.push(profile("monorepo/expo", true, expoSettingsFeatureFiles("monorepo", true, false)));
  return profiles;
}

export function frontendOnlyNativeSettings() {
  return [
    { name: "single/expo", files: expoSettingsFeatureFiles("single", false, false) },
    { name: "single/desktop", files: desktopSettingsFeatureFiles("single", false, false, false) },
  ];
}

export function sessionsReadHarness(profile: SessionsProfile, bindings: Record<string, unknown>) {
  return generatedFormHarness(profile.source, ["useIdentitySessions", "SessionsView"], {
    Badge: "Badge",
    View: "View",
    Text: "Text",
    ActivityIndicator: "ActivityIndicator",
    SettingsFeedback: "SettingsFeedback",
    useSurfaceLocale: () => "en",
    ...bindings,
  });
}

/** Execute emitted child presenters so assertions observe SessionList's actual branch. */
export function expandSessionChildren(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expandSessionChildren);
  if (!value || typeof value !== "object" || !("type" in value)) return value;
  const node = value as TestElement;
  if (typeof node.type === "function")
    return expandSessionChildren(node.type({ ...node.props, children: node.children }));
  return { ...node, children: node.children.map(expandSessionChildren) };
}
