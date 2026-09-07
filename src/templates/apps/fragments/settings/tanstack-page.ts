import { file, type TemplateFile } from "../../../shared.js";
import { tanstackSettingsDataFeatureFiles } from "./tanstack-feature.js";

type SettingsMode = "monorepo" | "single";

function requestUserImports(isConvex: boolean, mode: SettingsMode): string {
  const authModule = mode === "monorepo" ? "@repo/auth" : "@/server/auth";
  return isConvex
    ? `import { getRequestUser } from "${authModule}";`
    : `import { getRequestHeaders } from "@tanstack/react-start/server";
import { getRequestUser } from "${authModule}";`;
}

function requestUserServerFn(isConvex: boolean): string {
  return isConvex
    ? `const getRequestUserFn = createServerFn({ method: "GET" }).handler(async () => getRequestUser());`
    : `const getRequestUserFn = createServerFn({ method: "GET" }).handler(async () => getRequestUser(getRequestHeaders()));`;
}

function settingsFeatureRoot(mode: SettingsMode): string {
  return mode === "monorepo" ? "apps/web/src/features/settings" : "src/features/settings";
}

function securitySectionContent(hasEmail = true): string {
  if (!hasEmail) {
    return `"use client";
import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export function SecurityNavigationSection(): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
    return <Card><CardHeader><CardTitle as="h2">{t("security.title")}</CardTitle><CardDescription>{t("security.oauthOnlyDescription")}</CardDescription></CardHeader><CardContent><Button className="w-auto" variant="outline" render={<Link to="/dashboard" />} nativeButton={false}>{t("security.returnDashboard")}</Button></CardContent></Card>;
}
`;
  }
  return `"use client";
import type * as React from "react";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSurfaceTranslations } from "@/lib/translations";

type SettingsAction = "/2fa" | "/dashboard";
const SETTINGS_ACTIONS = [
  { labelKey: "security.twoFactor", value: "/2fa" },
  { labelKey: "security.dashboard", value: "/dashboard" },
] as const satisfies readonly {
  labelKey: "security.twoFactor" | "security.dashboard";
  value: SettingsAction;
}[];

function isSettingsAction(value: unknown): value is SettingsAction {
  return value === "/2fa" || value === "/dashboard";
}

export function SecurityNavigationSection(): React.JSX.Element {
  const navigate = useNavigate();
  const t = useSurfaceTranslations("settings");
  const [action, setAction] = useState<SettingsAction>("/2fa");
  const securityActions = SETTINGS_ACTIONS.map((action) => ({
    label: t(action.labelKey), value: action.value,
  }));
  return <div className="grid items-start gap-6 xl:grid-cols-2">
    <Card><CardHeader><CardTitle as="h2">{t("security.title")}</CardTitle><CardDescription>{t("security.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
      <Field><FieldLabel id="settings-action-label" htmlFor="settings-action">{t("security.actionLabel")}</FieldLabel>
        <Select items={securityActions} value={action} onValueChange={(value) => { if (isSettingsAction(value)) setAction(value); }}>
          <SelectTrigger id="settings-action" aria-labelledby="settings-action-label" aria-describedby="settings-action-description"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{securityActions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        <FieldDescription id="settings-action-description">{t("security.actionDescription")}</FieldDescription>
      </Field>
      <Button className="w-auto self-start" variant="outline" onClick={() => void navigate({ to: action })}>{t("security.openDestination")}</Button>
    </CardContent></Card>
    <Empty className="items-start rounded-lg border bg-card p-5 text-start sm:p-6"><EmptyHeader className="items-start text-start"><EmptyTitle>{t("security.connectedAccountsTitle")}</EmptyTitle><EmptyDescription>{t("security.connectedAccountsDescription")}</EmptyDescription></EmptyHeader><EmptyContent className="items-start">
      <Button variant="outline" render={<Link to="/dashboard" />} nativeButton={false}>{t("security.returnDashboard")}</Button>
    </EmptyContent></Empty>
  </div>;
}
`;
}

export function tanstackSettingsPageContent(
  isConvex = false,
  mode: SettingsMode = "monorepo",
  hasIdentityTransport = true,
  hasBilling = true,
): string {
  const billingAction = hasBilling
    ? '<Button variant="outline" size="sm" render={<Link to="/billing" />} nativeButton={false}>{t("billing")}</Button>'
    : "";
  const workspaceAction = hasIdentityTransport
    ? '<Button variant="outline" size="sm" render={<Link to="/settings/workspace" />} nativeButton={false}>{t("workspace")}</Button>'
    : "";
  return `import type * as React from "react";
import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
${requestUserImports(isConvex, mode)}
import { Button } from "@/components/ui/button";
import { SettingsController } from "@/features/settings/settings-controller";
import { useSurfaceTranslations } from "@/lib/translations";

${requestUserServerFn(isConvex)}

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const user = await getRequestUserFn();
    if (!user) throw redirect({ to: "/sign-in" });
    return { user };
  },
  component: SettingsPage,
});

function SettingsPage(): React.JSX.Element {
  const location = useLocation();
  const t = useSurfaceTranslations("settings");
  if (location.pathname !== "/settings" && location.pathname !== "/settings/") return <Outlet />;
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <div className="flex min-w-0 flex-col gap-7">
      <div className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("description")}</p></div>
      <nav aria-label={t("title")} className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-3">
        <span aria-current="page" className="inline-flex min-h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground">{t("title")}</span>
        <Button variant="outline" size="sm" render={<Link to="/dashboard" />} nativeButton={false}>{t("dashboard")}</Button>
        ${workspaceAction}
        ${billingAction}
      </nav>
      <SettingsController />
    </div>
  </main>;
}
`;
}

export function tanstackSettingsFeatureFiles(
  mode: SettingsMode = "monorepo",
  hasIdentityTransport = true,
  hasEmail = true,
  hasPasskey = true,
): TemplateFile[] {
  return tanstackSettingsDataFeatureFiles(
    settingsFeatureRoot(mode),
    hasIdentityTransport,
    securitySectionContent(hasEmail),
    hasEmail,
    hasPasskey,
  );
}

export function settingsPageContent(
  router: "next" | "tanstack" = "next",
  isConvex = false,
  hasBilling = true,
): string {
  return tanstackSettingsPageContent(
    isConvex,
    router === "tanstack" ? "monorepo" : "monorepo",
    true,
    hasBilling,
  );
}

export function tanstackSettingsPage(
  isConvex = false,
  mode: SettingsMode = "monorepo",
  hasIdentityTransport = true,
  hasBilling = true,
): TemplateFile {
  return file(
    mode === "monorepo" ? "apps/web/src/routes/settings.tsx" : "src/routes/settings.tsx",
    tanstackSettingsPageContent(isConvex, mode, hasIdentityTransport, hasBilling),
  );
}
