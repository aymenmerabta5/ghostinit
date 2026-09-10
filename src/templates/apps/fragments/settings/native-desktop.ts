import { file, type TemplateFile } from "../../../shared.js";
import { desktopSourceRoot, type IdentityWorkspaceMode } from "../identity-workspace/model.js";
import { webSettingsFeatureFiles } from "./feature.js";
import { nativeSettingsQueriesContent } from "./native-data.js";
import { settingsFeatureModelContent } from "./feature-data.js";
import { desktopBasicSettingsViewContent } from "./basic-desktop-view.js";

export function desktopSettingsRouteContent(mode: IdentityWorkspaceMode): string {
  const alias = mode === "single" ? "@/renderer" : "@";
  return `import type * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "${alias}/features/settings/settings-screen";
export const Route = createFileRoute("/settings")({ component: SettingsPage });
function SettingsPage(): React.JSX.Element { return <SettingsScreen />; }
`;
}

export function desktopSettingsFeatureFiles(
  mode: IdentityWorkspaceMode,
  hasApi: boolean,
  hasEmail: boolean,
  hasI18n: boolean,
  hasBilling = false,
): TemplateFile[] {
  const root = desktopSourceRoot(mode);
  const feature = `${root}/features/settings`;
  const files = hasApi
    ? webSettingsFeatureFiles(root, "tanstack", true, hasEmail, false)
    : [
        file(`${feature}/model.ts`, settingsFeatureModelContent()),
        file(
          `${feature}/components/basic-settings-view.tsx`,
          desktopBasicSettingsViewContent(hasBilling, hasEmail, hasI18n, mode),
        ),
      ];
  const queries = file(`${feature}/queries.ts`, nativeSettingsQueriesContent(hasApi));
  const withoutQueries = files.filter((entry) => entry.path !== queries.path);
  return [
    ...withoutQueries,
    queries,
    file(
      `${feature}/settings-screen.tsx`,
      `"use client";
import type * as React from "react";
import { useSettingsIdentityQuery } from "./queries";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
${
  hasApi
    ? `import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsController } from "./settings-controller";`
    : 'import { BasicSettingsView } from "./components/basic-settings-view";'
}
export function SettingsScreen(): React.JSX.Element {
  const identity = useSettingsIdentityQuery();
  const errors = useSurfaceTranslations("errors");
  const common = useSurfaceTranslations("common");
  ${hasApi ? 'const t = useSurfaceTranslations("settings");' : ""}
  if (!identity.isPending && identity.error) return <main className="flex flex-col gap-3 p-6" role="alert"><h1>{errors("genericTitle")}</h1><p>{errors("genericDescription")}</p><Button className="self-start" onClick={() => void identity.retry()}>{common("retry")}</Button></main>;
${
  hasApi
    ? `  if (identity.isPending) return <main className="p-6" aria-busy={true}><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></main>;
  if (!identity.user) return <main className="p-6"><h1>{t("native.signInRequired")}</h1><Button render={<Link to="/" />} nativeButton={false}>{t("native.signIn")}</Button></main>;
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6"><div><p className="text-xs font-semibold text-primary">{t("native.kicker")}</p><h1 className="text-3xl font-semibold">{t("title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("description")}</p></div><Button className="self-start" variant="outline" render={<Link to="/workspace" />} nativeButton={false}>{t("native.organizations")}</Button><SettingsController key={identity.user.id} /></main>;`
    : "  return <BasicSettingsView user={identity.user} isPending={identity.isPending} isAuthenticated={Boolean(identity.user)} />;"
}
}
`,
    ),
  ].map((entry) => {
    const content = entry.content.replaceAll("@/lib/auth-client", "@/lib/auth");
    return {
      ...entry,
      content:
        mode === "single"
          ? content
              .replaceAll('"@/lib/', '"@/renderer/lib/')
              .replaceAll('"@/hooks/', '"@/renderer/hooks/')
              .replaceAll('"@/features/', '"@/renderer/features/')
          : content,
    };
  });
}
