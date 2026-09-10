import { file, type TemplateFile } from "../../../shared.js";
import {
  settingsFeatureModelContent,
  settingsFeatureMutationsContent,
  settingsFeatureQueriesContent,
} from "./feature-data.js";
import { settingsWorkflowFiles } from "./feature-workflows.js";
import { accountDeletionFeatureFiles } from "./deletion-feature.js";
import { profileViewContent } from "./profile-view.js";
import { passwordViewContent } from "./password-view.js";
import { twoFactorViewContent } from "./two-factor-view.js";
import { sessionsViewContent } from "./sessions-view.js";
import { settingsSessionsListContent } from "./session-list.js";
import { settingsPasskeyFeatureFiles } from "./feature-passkeys.js";

function profileCard(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { useProfileIdentity } from "./use-profile-identity";
import { useProfileForm } from "./use-profile-form";
import { ProfileView } from "./components/profile-view";
import type { SettingsUser } from "./model";

export function ProfileCard({ initialUser }: { initialUser?: SettingsUser }): React.JSX.Element {
  const common = useSurfaceTranslations("common");
  const errors = useSurfaceTranslations("errors");
  const identity = useProfileIdentity(initialUser);
  if (identity.pending) return <Card role="status" aria-busy={true} aria-label={common("loading")}><CardHeader><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-56" /></CardHeader><CardContent className="flex flex-col gap-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-9 w-36" /></CardContent></Card>;
  if (!identity.user) return <Alert role="alert" variant={identity.error ? "destructive" : "default"}><AlertTitle>{errors(identity.error ? "genericTitle" : "unauthorizedTitle")}</AlertTitle><AlertDescription>{errors(identity.error ? "genericDescription" : "unauthorizedDescription")}</AlertDescription></Alert>;
  return <ProfileEditor key={identity.user.id} user={identity.user} />;
}
function ProfileEditor({ user }: { user: SettingsUser }): React.JSX.Element {
  const model = useProfileForm(user.name ?? "");
  return <ProfileView model={model} email={user.email} role={user.role ?? "user"} />;
}
`;
}

function section(component: string, hook: string, view: string, fileName: string): string {
  return `"use client";
import type * as React from "react";
import { ${hook} } from "./${fileName}";
import { ${view} } from "./components/${view.replace(/[A-Z]/g, (letter, index) => `${index ? "-" : ""}${letter.toLowerCase()}`)}";
export function ${component}(): React.JSX.Element {
  const model = ${hook}();
  return <${view} model={model} />;
}
`;
}

export function webSettingsFeatureFiles(
  sourceRoot: string,
  router: "next" | "tanstack",
  hasSessions = true,
  hasEmail = true,
  hasPasskey = true,
  securityContent?: string,
): TemplateFile[] {
  const root = `${sourceRoot}/features/settings`;
  return [
    file(`${root}/model.ts`, settingsFeatureModelContent()),
    ...accountDeletionFeatureFiles(sourceRoot, router, hasEmail),
    file(`${root}/queries.ts`, settingsFeatureQueriesContent(hasSessions, hasPasskey)),
    file(
      `${root}/mutations.ts`,
      settingsFeatureMutationsContent(router, hasSessions, hasEmail, hasPasskey),
    ),
    ...settingsWorkflowFiles(root, router, hasSessions, hasEmail),
    file(`${root}/profile-card.tsx`, profileCard()),
    file(`${root}/components/profile-view.tsx`, profileViewContent()),
    ...(hasEmail
      ? [
          file(
            `${root}/password-card.tsx`,
            section("PasswordCard", "usePasswordForm", "PasswordView", "use-password-form"),
          ),
          file(`${root}/components/password-view.tsx`, passwordViewContent()),
          file(
            `${root}/two-factor-card.tsx`,
            section(
              "TwoFactorCard",
              "useTwoFactorSettings",
              "TwoFactorView",
              "use-two-factor-settings",
            ),
          ),
          file(`${root}/components/two-factor-view.tsx`, twoFactorViewContent()),
        ]
      : []),
    ...(hasSessions
      ? [
          file(
            `${root}/sessions-card.tsx`,
            `"use client";
import type * as React from "react";
import { useIdentitySessions } from "./use-identity-sessions";
import { SessionsView } from "./components/sessions-view";
import type { IdentitySessionsInitialState } from "./model";
export function SessionsCard(initialState: IdentitySessionsInitialState): React.JSX.Element {
  const state = useIdentitySessions(initialState);
  return <SessionsView state={state} />;
}
`,
          ),
          file(`${root}/components/sessions-view.tsx`, sessionsViewContent()),
          file(`${root}/components/session-list.tsx`, settingsSessionsListContent()),
        ]
      : []),
    ...(hasPasskey ? settingsPasskeyFeatureFiles(root) : []),
    ...(securityContent
      ? [file(`${root}/components/security-navigation-section.tsx`, securityContent)]
      : []),
    file(
      `${root}/settings-controller.tsx`,
      `"use client";
import type * as React from "react";
import { ProfileCard } from "./profile-card";
import { DangerZoneCard } from "@/features/account-deletion/account-deletion";
${hasEmail ? 'import { PasswordCard } from "./password-card";\nimport { TwoFactorCard } from "./two-factor-card";' : ""}
${hasSessions ? 'import { SessionsCard } from "./sessions-card";' : ""}
${hasPasskey ? 'import { PasskeyCard } from "./passkey-card";' : ""}
${securityContent ? 'import { SecurityNavigationSection } from "./components/security-navigation-section";' : ""}
export function SettingsController(): React.JSX.Element {
  return <div className="flex min-w-0 flex-col gap-6"><ProfileCard />${hasEmail ? '<div className="grid items-start gap-6 xl:grid-cols-2"><PasswordCard /><TwoFactorCard /></div>' : ""}${hasPasskey ? "<PasskeyCard />" : ""}${hasSessions ? "<SessionsCard />" : ""}${securityContent ? "<SecurityNavigationSection />" : ""}<DangerZoneCard /></div>;
}
`,
    ),
  ];
}
