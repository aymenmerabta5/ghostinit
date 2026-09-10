export function architectureCardContent(): string {
  return `"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";

const CATEGORIES = [
  ["architecture.layerUi", "architecture.uiDescription"],
  ["architecture.layerTransport", "architecture.transportDescription"],
  ["architecture.layerApplication", "architecture.applicationDescription"],
  ["architecture.layerDomain", "architecture.domainDescription"],
  ["architecture.layerVendors", "architecture.vendorsDescription"],
  ["architecture.layerSupporting", "architecture.supportingDescription"],
] as const;

export function ArchitectureCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <section className="min-w-0 lg:col-span-7">
    <h3 className="text-base font-semibold tracking-tight">{t("architecture.title")}</h3>
    <dl className="mt-5 grid gap-x-5 gap-y-4 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">{CATEGORIES.map(([name, description]) => <div key={name} className="contents">
      <dt className="font-medium">{t(name)}</dt><dd className="text-muted-foreground">{t(description)}</dd>
    </div>)}</dl>
    <p className="mt-6 text-sm leading-6 text-muted-foreground">{t("architecture.description")}</p>
  </section>;
}
`;
}

export function checksCardContent(hasAdminNavigation: boolean): string {
  return `"use client";
import type * as React from "react";
${hasAdminNavigation ? 'import { Link } from "@tanstack/react-router";\nimport { Button } from "@/components/ui/button";' : ""}
import { useSurfaceTranslations } from "@/lib/translations";
import type { DashboardUser } from "../types";

const CHECKS = [
  ["checks.architecture", "bun run check"],
  ["checks.typecheck", "bun run typecheck"],
  ["checks.lint", "bun run lint:all"],
] as const;

export function ChecksCard(${hasAdminNavigation ? "{ user }" : "_props"}: { user?: DashboardUser | null } = {}): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <section className="min-w-0 lg:col-span-5">
    <h3 className="text-base font-semibold tracking-tight">{t("checks.title")}</h3>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("checks.instructions")}</p>
    <div className="mt-5 space-y-4 rounded-lg border bg-code p-4">{CHECKS.map(([name, command]) => <div key={name}>
      <p className="text-xs text-muted-foreground">{t(name)}</p><code className="mt-1 block break-all font-mono text-xs leading-6 text-code-foreground">$ {command}</code>
    </div>)}</div>
    <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("checks.reviewResults")}</p>
    ${hasAdminNavigation ? '{user?.role === "admin" ? <Button variant="outline" size="sm" className="mt-4" render={<Link to="/admin" />} nativeButton={false}>{t("checks.openAdmin")}</Button> : null}' : ""}
  </section>;
}
`;
}

export function modulesCardContent(hasBilling: boolean): string {
  return `"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
const MODULES = [
  ["@repo/ui", "modules.uiDescription"],
  ["@repo/auth", "modules.authDescription"],
  ["@repo/database", "modules.databaseDescription"],
${hasBilling ? '  ["@repo/billing", "modules.billingDescription"],\n' : ""}  ["apps/web", "modules.webDescription"],
] as const;

export function ModulesCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <section className="min-w-0 border-t pt-7">
    <h3 className="text-base font-semibold tracking-tight">{t("modules.title")}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{t("modules.summary", { count: ${hasBilling ? 5 : 4} })}</p>
    <div className="mt-4 divide-y">{MODULES.map(([name, description]) => <div key={name} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:gap-4">
      <code className="font-mono text-xs leading-6">{name}</code><span className="text-muted-foreground">{t(description)}</span><span className="text-xs leading-6 text-muted-foreground">{t("modules.included")}</span>
    </div>)}</div>
  </section>;
}
`;
}
