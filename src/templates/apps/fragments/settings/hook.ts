import { file, type TemplateFile } from "../../../shared.js";

export function settingsHookContent(): string {
  return `"use client";

import { identityClient } from "@/lib/auth-client";

export type UseSettingsReturn = ReturnType<typeof useSettings>;

export function useSettings() {
  const session = identityClient.useSession();
  return {
    session: session.data ?? null,
    isPending: session.isPending,
    user: session.data?.user,
  };
}
`;
}

export function useSettingsHook(): TemplateFile {
  return file("apps/web/src/app/settings/hooks/use-settings.ts", settingsHookContent());
}
