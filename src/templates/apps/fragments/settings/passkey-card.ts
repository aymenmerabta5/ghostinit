import { file, type TemplateFile } from "../../../shared.js";

/** Browser-only WebAuthn management surface. Emitted only for Postgres web clients. */
export function settingsPasskeyManagementContent(
  dataAccess: "direct" | "feature-adapter" = "direct",
): string {
  const dataImport =
    dataAccess === "feature-adapter"
      ? `import { usePasskeyListQuery } from "./queries";
import * as passkeyMutations from "./mutations";`
      : `import { identityPasskeyClient, isIdentityRecentAuthenticationError } from "@/lib/auth-client";
import { usePasskeyListQuery } from "../passkeys";`;
  const recentAuthenticationError =
    dataAccess === "feature-adapter"
      ? "passkeyMutations.isPasskeyRecentAuthenticationError"
      : "isIdentityRecentAuthenticationError";
  const register =
    dataAccess === "feature-adapter"
      ? "passkeyMutations.registerPasskey"
      : "identityPasskeyClient.register";
  const rename =
    dataAccess === "feature-adapter"
      ? "passkeyMutations.renamePasskey"
      : "identityPasskeyClient.rename";
  const remove =
    dataAccess === "feature-adapter"
      ? "passkeyMutations.deletePasskey"
      : "identityPasskeyClient.delete";
  return `"use client";

import { useState } from "react";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
${dataImport}
import { useSurfaceTranslations } from "@/lib/translations";
import type { PasskeySummary } from "./passkey-list";

export function usePasskeyManagement() {
  const t = useSurfaceTranslations("settings");
  const captureOwner = useAuthOwnedEffect();
  const passkeyQuery = usePasskeyListQuery();
  const passkeys: PasskeySummary[] = passkeyQuery.data ?? [];
  const [newName, setNewName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const errorMessage = (cause: unknown): string =>
    ${recentAuthenticationError}(cause)
      ? t("passkeys.reauthenticate")
      : t("passkeys.genericError");

  async function register(): Promise<void> {
    const isCurrent = captureOwner(); if (!isCurrent()) return;
    setPending("register"); setError(null); setSuccess(null);
    try {
      const result = await ${register}({ name: newName.trim() || undefined });
      if (!isCurrent()) return;
      if (result.error) { setError(errorMessage(result.error)); return; }
      setNewName(""); setSuccess(t("passkeys.registered")); await passkeyQuery.refetch();
    } catch (cause) { if (isCurrent()) setError(errorMessage(cause)); }
    finally { if (isCurrent()) setPending(null); }
  }

  async function rename(id: string, fallback: string): Promise<void> {
    const isCurrent = captureOwner(); if (!isCurrent()) return;
    const name = (names[id] ?? fallback).trim();
    if (!name) { setError(t("passkeys.nameRequired")); return; }
    setPending(id + ":rename"); setError(null); setSuccess(null);
    try {
      const result = await ${rename}({ id, name });
      if (!isCurrent()) return;
      if (result.error) { setError(errorMessage(result.error)); return; }
      setSuccess(t("passkeys.renamed")); await passkeyQuery.refetch();
    } catch (cause) { if (isCurrent()) setError(errorMessage(cause)); }
    finally { if (isCurrent()) setPending(null); }
  }

  async function remove(id: string): Promise<void> {
    const isCurrent = captureOwner(); if (!isCurrent()) return;
    setPending(id + ":delete"); setError(null); setSuccess(null);
    try {
      const result = await ${remove}({ id });
      if (!isCurrent()) return;
      if (result.error) { setError(errorMessage(result.error)); return; }
      setSuccess(t("passkeys.deleted")); await passkeyQuery.refetch();
    } catch (cause) { if (isCurrent()) setError(errorMessage(cause)); }
    finally { if (isCurrent()) setPending(null); }
  }

  return { passkeyQuery, passkeys, newName, setNewName, names, setNames, pending, error, success, errorMessage, register, rename, remove };
}
`;
}

export function settingsPasskeyCardContent(): string {
  return `"use client";
import type { JSX } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { PasskeyList } from "./passkey-list";
import { usePasskeyManagement } from "./use-passkey-management";

export function PasskeyCard(): JSX.Element {
  const t = useSurfaceTranslations("settings");
  const common = useSurfaceTranslations("common");
  const { passkeyQuery, passkeys, newName, setNewName, names, setNames, pending, error, success, errorMessage, register, rename, remove } = usePasskeyManagement();
  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
    <CardTitle as="h2">{t("passkeys.title")}</CardTitle>{passkeyQuery.data ? <Badge variant="secondary">{passkeys.length}</Badge> : null}
  </div><CardDescription className="max-w-[65ch]">{t("passkeys.description")}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {error ? <Alert variant="destructive"><AlertTitle>{t("passkeys.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {passkeyQuery.error ? <Alert variant="destructive"><AlertTitle>{t("passkeys.errorTitle")}</AlertTitle><AlertDescription>{errorMessage(passkeyQuery.error)}</AlertDescription><Button variant="outline" disabled={passkeyQuery.isFetching} onClick={() => void passkeyQuery.refetch()}>{common("retry")}</Button></Alert> : null}
      {success ? <Alert><AlertTitle>{t("passkeys.successTitle")}</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
      <Field><FieldLabel htmlFor="passkey-registration-name">{t("passkeys.namePlaceholder")}</FieldLabel><div className="flex flex-col items-start gap-3 sm:flex-row"><Input id="passkey-registration-name" className="sm:max-w-sm" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={t("passkeys.namePlaceholder")} maxLength={64} /><Button className="shrink-0" disabled={pending !== null} onClick={() => void register()}>{pending === "register" ? t("passkeys.registering") : t("passkeys.register")}</Button></div></Field>
      {passkeyQuery.isPending ? <div role="status" aria-label={common("loading")} aria-busy={true}><Skeleton className="h-24 w-full" /></div> : passkeyQuery.data ? <PasskeyList passkeys={passkeys} names={names} pending={pending} onNameChange={(id, name) => setNames((current) => ({ ...current, [id]: name }))} onRename={rename} onDelete={remove} /> : null}
    </CardContent>
  </Card>;
}
`;
}

export function settingsPasskeyListContent(): string {
  return `"use client";

import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";

export interface PasskeySummary {
  readonly id: string;
  readonly name?: string;
  readonly createdAt: Date | string;
  readonly deviceType: string;
  readonly backedUp: boolean;
}

interface PasskeyListProps {
  readonly passkeys: readonly PasskeySummary[];
  readonly names: Readonly<Record<string, string>>;
  readonly pending: string | null;
  readonly onNameChange: (id: string, name: string) => void;
  readonly onRename: (id: string, fallback: string) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<void>;
}

export function PasskeyList(props: PasskeyListProps): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  if (props.passkeys.length === 0) return <p className="text-sm text-muted-foreground">{t("passkeys.empty")}</p>;
  return <div className="divide-y rounded-lg border">{props.passkeys.map((passkey) => {
    const fallback = passkey.name ?? t("passkeys.unnamed");
    const deviceLabel = passkey.backedUp ? t("passkeys.backedUp")
      : passkey.deviceType === "singleDevice" ? t("passkeys.deviceBound")
      : passkey.deviceType === "multiDevice" ? t("passkeys.backupEligible")
      : t("passkeys.unknownDevice");
    return <div key={passkey.id} className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-center"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{fallback}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("passkeys.createdAt", { date: new Date(passkey.createdAt).toLocaleDateString() })}</p></div><Badge variant="outline">{deviceLabel}</Badge></div><div className="flex flex-wrap items-center gap-2"><Input className="min-w-0 flex-[1_1_12rem]" aria-label={t("passkeys.renameLabel")} value={props.names[passkey.id] ?? fallback} onChange={(event) => props.onNameChange(passkey.id, event.target.value)} maxLength={64} /><Button size="sm" variant="outline" disabled={props.pending !== null} onClick={() => void props.onRename(passkey.id, fallback)}>{t("passkeys.rename")}</Button><Button size="sm" variant="destructive" disabled={props.pending !== null} onClick={() => void props.onDelete(passkey.id)}>{t("passkeys.delete")}</Button></div></div>;
  })}</div>;
}
`;
}

export function settingsPasskeyCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/passkey-card.tsx",
    settingsPasskeyCardContent(),
  );
}

export function settingsPasskeyList(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/passkey-list.tsx",
    settingsPasskeyListContent(),
  );
}

export function settingsPasskeyManagement(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/use-passkey-management.ts",
    settingsPasskeyManagementContent(),
  );
}
