export function polarBenefitsContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { CopyIcon } from "../icons";
import { useSurfaceTranslations } from "@/lib/translations";
import type { LicenseKey, UsageEvent } from "${hookImportPath}";

interface PolarBenefitsProps {
  readonly licenseKey: LicenseKey | null;
  readonly usageEvents: readonly UsageEvent[];
  readonly copyText: (value: string) => Promise<void>;
}

export function PolarBenefits({ licenseKey, usageEvents, copyText }: PolarBenefitsProps): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const totalCredits = usageEvents.reduce((total, event) => total + (event.credits ?? 0), 0);
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <Card><CardHeader><CardTitle>{t("licenseKey")}</CardTitle><CardDescription>{t("licenseDescription")}</CardDescription></CardHeader><CardContent>{licenseKey ? <div className="flex flex-col gap-3"><Field><FieldLabel className="sr-only" htmlFor="polar-license-key">{t("licenseKey")}</FieldLabel><InputGroup><InputGroupInput id="polar-license-key" readOnly value={licenseKey.key} className="font-mono text-xs" /><InputGroupAddon><Button size="sm" variant="outline" onClick={() => void copyText(licenseKey.key)}><CopyIcon data-icon="inline-start" />{t("copy")}</Button></InputGroupAddon></InputGroup></Field><div className="flex gap-2"><Badge variant="secondary" className="capitalize">{licenseKey.status}</Badge><Badge variant="outline">{licenseKey.provider}</Badge></div></div> : <Empty><EmptyHeader><EmptyTitle>{t("noLicenseTitle")}</EmptyTitle><EmptyDescription>{t("noLicenseDescription")}</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card>
    <Card><CardHeader><CardTitle>{t("usageMeter")}</CardTitle><CardDescription>{t("usageDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex items-baseline gap-2"><span className="text-2xl font-semibold">{totalCredits}</span><span className="text-xs text-muted-foreground">{t("creditsTotal")}</span></div>{usageEvents.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noUsageTitle")}</EmptyTitle><EmptyDescription>{t("noUsageDescription")}</EmptyDescription></EmptyHeader></Empty> : <div className="flex flex-wrap gap-1">{usageEvents.slice(0, 12).map((event) => <Badge key={event.id} variant="outline">{event.name}:{event.credits}</Badge>)}</div>}</CardContent></Card>
  </div>;
}
`;
}
